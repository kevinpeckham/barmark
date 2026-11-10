import * as esm from "verovio/esm";
import { VerovioToolkit } from "verovio/esm";
import { type Download, fetchModule } from "./download.js";
import type {
	LoadStatus,
	Progress,
	Ready,
	Reply,
	Request,
	VerovioSource,
	WorkerMessage,
} from "./engine.js";
import { engraveChart } from "./engrave.js";
import { VEROVIO_MODULE_BYTES } from "./verovio.js";

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

type Report = (status: LoadStatus) => void;

/** A toolkit, and where its Verovio came from (no `verovioUrl`: the package's own). */
export type Loaded<T> = { toolkit: T; from: VerovioSource };

/**
 * A worker's one Verovio toolkit, loaded on first use and reused, and
 * where it came from once loaded, so the engine can give a replacement
 * worker the same. The first load that succeeds wins for the worker's
 * life: later sources are ignored. The first load's `report` hears it.
 */
export function toolkitLoader<T>(
	load: (source: VerovioSource, report: Report) => Promise<Loaded<T>>,
) {
	let loaded: VerovioSource | undefined;
	const once = loadOnce(async ({ source, report }: { source: VerovioSource; report: Report }) => {
		const r = await load(source, report);
		loaded = r.from;
		return r.toolkit;
	});
	return {
		ready: (source: VerovioSource, report: Report) => once({ source, report }),
		loaded: () => loaded,
	};
}

/** What loading Verovio needs, so a test can pass fakes. `M` is a Verovio module, `T` a toolkit. */
export type LoaderDeps<M, T> = {
	/** Downloads `url` with progress, checked against `integrity` when given (download.ts). */
	fetchModule(
		url: string,
		options: { integrity?: string; onProgress: (d: Download) => void },
	): Promise<Blob>;
	/** Imports a downloaded module. */
	importBlob(blob: Blob): Promise<M>;
	/** The package's own Verovio, as the bundler placed it. */
	own(): Promise<M>;
	/** Instantiates the module's WebAssembly: the toolkit. */
	instantiate(m: M): Promise<T>;
	warn(message: string): void;
};

const UNMEASURED: Download = { phase: "download", fraction: null, bytes: null };

/**
 * Loads Verovio from `source`. The package's own copy comes through the
 * bundler, its download unmeasured. A `verovioUrl` is downloaded here,
 * with progress, and imported from a blob; with `verovioIntegrity` its
 * digest is checked first, and a mismatch or any failure falls back to
 * the package's own copy, once, with a warning. Without one, a failure is
 * the failure.
 */
export function verovioLoader<M, T>(deps: LoaderDeps<M, T>) {
	const prepared = async (m: M, report: Report) => {
		report({ phase: "prepare" });
		return deps.instantiate(m);
	};
	const own = async (report: Report): Promise<Loaded<T>> => {
		report(UNMEASURED);
		return { toolkit: await prepared(await deps.own(), report), from: {} };
	};
	const fromUrl = async (verovioUrl: string, integrity: string | undefined, report: Report) => {
		const options =
			integrity === undefined ? { onProgress: report } : { integrity, onProgress: report };
		const blob = await deps.fetchModule(verovioUrl, options);
		return prepared(await deps.importBlob(blob), report);
	};
	return async (source: VerovioSource, report: Report): Promise<Loaded<T>> => {
		const { verovioUrl, verovioIntegrity } = source;
		if (verovioUrl === undefined) return own(report);
		if (verovioIntegrity === undefined)
			return { toolkit: await fromUrl(verovioUrl, undefined, report), from: { verovioUrl } };
		try {
			return { toolkit: await fromUrl(verovioUrl, verovioIntegrity, report), from: source };
		} catch (err) {
			deps.warn(
				`<barmark-score>: Verovio from ${verovioUrl} was not used (${String(err)}); loading the package's own copy instead`,
			);
			return own(report);
		}
	};
}

/** A module from a blob, through an object URL revoked once it is imported. */
async function importBlob(blob: Blob): Promise<VerovioModule> {
	const url = URL.createObjectURL(blob);
	try {
		return await import(/* @vite-ignore */ url);
	} finally {
		URL.revokeObjectURL(url);
	}
}

type VerovioModule = { default: () => Promise<unknown> };

const toolkit = toolkitLoader(
	verovioLoader<VerovioModule, Toolkit>({
		fetchModule: (url, options) =>
			fetchModule(url, { ...options, fetch: (u) => fetch(u), expected: VEROVIO_MODULE_BYTES }),
		importBlob,
		own: () => import("verovio/wasm"),
		instantiate: async (m) => {
			const module = await m.default();
			enableLog(LOG_OFF, module);
			return new VerovioToolkit(module as ConstructorParameters<typeof VerovioToolkit>[0]);
		},
		warn: (message) => console.warn(message),
	}),
);

/** `request`'s Verovio source, without its absent fields. */
const sourceOf = ({ verovioUrl, verovioIntegrity }: Request): VerovioSource => ({
	...(verovioUrl === undefined ? {} : { verovioUrl }),
	...(verovioIntegrity === undefined ? {} : { verovioIntegrity }),
});

/**
 * The toolkit for `request`, posting its load's progress, then saying it
 * is `Ready` (and where it came from) once loaded, before the job is
 * engraved: the engine starts the job's deadline then, so a slow download
 * is not counted against it.
 */
export function withReady<T>(
	loader: ReturnType<typeof toolkitLoader<T>>,
	request: Request,
	post: (message: Ready | Progress) => void,
): () => Promise<T> {
	return async () => {
		const toolkit = await loader.ready(sourceOf(request), (status) =>
			post({ id: request.id, status }),
		);
		post({ id: request.id, loaded: loader.loaded() ?? {} });
		return toolkit;
	};
}

/**
 * Answers one request: a job is engraved (`engrave`, which never throws)
 * and replied to; a preload only loads, posting `Ready`, or a reply with
 * the reason when the load fails.
 */
export async function answer<T>(
	request: Request,
	loader: ReturnType<typeof toolkitLoader<T>>,
	post: (message: WorkerMessage) => void,
	engrave: (request: Request, ready: () => Promise<T>) => Promise<Reply>,
): Promise<void> {
	const ready = withReady(loader, request, post);
	if (!request.preload) return post(await engrave(request, ready));
	try {
		await ready();
	} catch (err) {
		post({ id: request.id, ok: false, reason: String(err) });
	}
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
	postMessage(message: WorkerMessage): void;
};
// Only a worker global answers messages: importing this in a page or a test has no effect.
if (
	typeof scope.WorkerGlobalScope === "function" &&
	globalThis instanceof scope.WorkerGlobalScope
) {
	scope.onmessage = (e) => answer(e.data, toolkit, (m) => scope.postMessage(m), handle);
}
