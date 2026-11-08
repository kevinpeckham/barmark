import type { VerovioToolkit as Toolkit } from "verovio/esm";
import * as esm from "verovio/esm";
import type { Reply, Request } from "./engine.js";
import { engraveChart } from "./engrave.js";

// Verovio's typings omit the log switch; it is exported all the same.
const { VerovioToolkit, enableLog, LOG_OFF } = esm as unknown as {
	VerovioToolkit: new (module: unknown) => Toolkit;
	enableLog(level: number, module: unknown): void;
	LOG_OFF: number;
};

let toolkit: Promise<Toolkit> | undefined;

/**
 * The page's one Verovio toolkit, loaded on first use and reused. By
 * default the package's own `verovio/wasm`; when a request carries
 * `verovioUrl` that module is imported instead. The first request's URL
 * wins for the worker's life: later ones are ignored.
 */
function ready(verovioUrl?: string): Promise<Toolkit> {
	toolkit ??= import(/* @vite-ignore */ verovioUrl ?? "verovio/wasm")
		.then((m: { default: () => Promise<unknown> }) => m.default())
		.then((module) => {
			enableLog(LOG_OFF, module);
			return new VerovioToolkit(module);
		});
	return toolkit;
}

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
		scope.postMessage(await handle(e.data, () => ready(verovioUrl)));
	};
}
