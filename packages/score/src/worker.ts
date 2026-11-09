import * as esm from "verovio/esm";
import { VerovioToolkit } from "verovio/esm";
import type { Reply, Request } from "./engine.js";
import { engraveChart } from "./engrave.js";

type Toolkit = VerovioToolkit;

// Verovio's typings omit the log switch; it is exported all the same.
const { enableLog, LOG_OFF } = esm as unknown as {
	enableLog(level: number, module: unknown): void;
	LOG_OFF: number;
};

/** Run `load` once and keep its result; a load that fails is forgotten, so the next call tries again. */
export function loadOnce<A, T>(load: (arg: A) => Promise<T>): (arg: A) => Promise<T> {
	let kept: Promise<T> | undefined;
	return (arg) => {
		kept ??= load(arg).catch((err) => {
			kept = undefined;
			throw err;
		});
		return kept;
	};
}

/**
 * A worker's one Verovio toolkit, loaded on first use and reused, and
 * where it came from once loaded (no `verovioUrl`: the package's own), so
 * the engine can give a replacement worker the same. The first load that
 * succeeds wins for the worker's life: later URLs are ignored.
 */
export function toolkitLoader<T>(load: (verovioUrl: string | undefined) => Promise<T>) {
	let loaded: { verovioUrl?: string } | undefined;
	const ready = loadOnce(async (verovioUrl: string | undefined) => {
		const toolkit = await load(verovioUrl);
		loaded = verovioUrl === undefined ? {} : { verovioUrl };
		return toolkit;
	});
	return { ready, loaded: () => loaded };
}

/**
 * By default the package's own `verovio/wasm`; when a request carries
 * `verovioUrl` that module is imported instead.
 */
const toolkit = toolkitLoader(async (verovioUrl: string | undefined): Promise<Toolkit> => {
	const m: { default: () => Promise<unknown> } = verovioUrl
		? await import(/* @vite-ignore */ verovioUrl)
		: await import("verovio/wasm");
	const module = await m.default();
	enableLog(LOG_OFF, module);
	return new VerovioToolkit(module as ConstructorParameters<typeof VerovioToolkit>[0]);
});

/** Answer one request. Never throws: a failure is a reply with its reason. */
export async function handle(request: Request, loaded: () => Promise<Toolkit>): Promise<Reply> {
	const { id, text, width } = request;
	try {
		const r = engraveChart(await loaded(), text, { width });
		return r.ok
			? { id, ok: true, svg: r.svg, pages: r.pages }
			: { id, ok: false, reason: r.reason };
	} catch (err) {
		return { id, ok: false, reason: String(err) };
	}
}

const scope = globalThis as unknown as {
	WorkerGlobalScope?: new () => unknown;
	onmessage: ((e: { data: Request }) => void) | null;
	postMessage(reply: Reply): void;
};
// Only a worker global answers messages: importing this in a page or a test has no effect.
if (
	typeof scope.WorkerGlobalScope === "function" &&
	globalThis instanceof scope.WorkerGlobalScope
) {
	scope.onmessage = async (e) => {
		const { verovioUrl } = e.data;
		const reply = await handle(e.data, () => toolkit.ready(verovioUrl));
		const loaded = toolkit.loaded();
		scope.postMessage(loaded ? { ...reply, loaded } : reply);
	};
}
