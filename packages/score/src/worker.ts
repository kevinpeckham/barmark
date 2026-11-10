import * as esm from "verovio/esm";
import { VerovioToolkit } from "verovio/esm";
import { type Download, fetchBytes, fetchModule } from "./download.js";
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
import { knownSize, VEROVIO_VERSION } from "./verovio.js";
import { createWith, sameVerovio, type WasmSource, wasmHook } from "./wasm.js";

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
		options: {
			integrity?: string;
			expected?: number | undefined;
			onProgress: (d: Download) => void;
		},
	): Promise<Blob>;
	/** Imports a downloaded module. */
	importBlob(blob: Blob): Promise<M>;
	/** The package's own Verovio, as the bundler placed it. */
	own(): Promise<M>;
	/**
	 * Instantiates the module's WebAssembly, reporting `prepare`: the
	 * toolkit. `wasm`, for a module from a URL, says where a separate
	 * `.wasm` comes from, should the module load one.
	 */
	instantiate(m: M, wasm: WasmSource | undefined, report: Report): Promise<T>;
	/** The Verovio version a toolkit reports. */
	versionOf(t: T): string;
	/** The version of the Verovio this package's toolkit is written for. */
	toolkitVersion: string;
	warn(message: string): void;
};

const UNMEASURED: Download = { phase: "download", fraction: null, bytes: null };

/** The `.wasm` source for a module from `verovioUrl`: its digest is required when the module's is given. */
const wasmSource = ({ verovioUrl, verovioIntegrity, verovioWasmIntegrity }: VerovioSource) => ({
	moduleUrl: verovioUrl as string,
	...(verovioWasmIntegrity === undefined ? {} : { integrity: verovioWasmIntegrity }),
	required: verovioIntegrity !== undefined,
});

/**
 * How a module's own download reports: measured, or, when a separate
 * `.wasm` will be measured, once as unmeasured, so the bar never runs to
 * 100% twice.
 */
const glueProgress = (source: VerovioSource, report: Report) => {
	if (source.verovioWasmIntegrity === undefined) return report;
	report(UNMEASURED);
	return () => {};
};

/**
 * Loads Verovio from `source`. The package's own copy comes through the
 * bundler, its download unmeasured. A `verovioUrl` is downloaded here,
 * with progress, and imported from a blob; with `verovioIntegrity` its
 * digest is checked first, and a mismatch, a Verovio other than the
 * toolkit's, or any failure falls back to the package's own copy, once,
 * with a warning. Without one, a failure is the failure.
 */
export function verovioLoader<M, T>(deps: LoaderDeps<M, T>) {
	const own = async (report: Report): Promise<Loaded<T>> => {
		report(UNMEASURED);
		return { toolkit: await deps.instantiate(await deps.own(), undefined, report), from: {} };
	};
	const checked = (t: T) => {
		const got = deps.versionOf(t);
		if (!sameVerovio(got, deps.toolkitVersion))
			throw new Error(
				`Verovio ${got} does not match this package's toolkit (${deps.toolkitVersion})`,
			);
		return t;
	};
	const fromUrl = async (source: VerovioSource, report: Report) => {
		const { verovioUrl, verovioIntegrity } = source;
		const blob = await deps.fetchModule(verovioUrl as string, {
			...(verovioIntegrity === undefined ? {} : { integrity: verovioIntegrity }),
			expected: knownSize(verovioIntegrity),
			onProgress: glueProgress(source, report),
		});
		return checked(await deps.instantiate(await deps.importBlob(blob), wasmSource(source), report));
	};
	return async (source: VerovioSource, report: Report): Promise<Loaded<T>> => {
		const { verovioUrl, verovioIntegrity } = source;
		if (verovioUrl === undefined) return own(report);
		if (verovioIntegrity === undefined)
			return { toolkit: await fromUrl(source, report), from: { verovioUrl } };
		try {
			return { toolkit: await fromUrl(source, report), from: source };
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

// A method taking any object, so Verovio's own factory (its options typed without the hook) fits.
type VerovioModule = { default(arg?: object): Promise<unknown> };

/**
 * Runs the module's factory, reporting `prepare`: for a module from a URL,
 * with a hook for its `.wasm`. With the `.wasm`'s digest given, its
 * download is the measured one, so `prepare` waits for it to arrive;
 * otherwise (the package's own copy, or a module that ignores the hook)
 * Verovio is preparing from the start.
 */
function createModule(m: VerovioModule, wasm: WasmSource | undefined, report: Report) {
	const prepare = () => report({ phase: "prepare" });
	if (wasm?.integrity === undefined) prepare();
	if (wasm === undefined) return m.default();
	const hook = wasmHook(wasm, {
		fetchBytes: (u, o) => fetchBytes(u, { ...o, fetch: (x) => fetch(x) }),
		instantiate: (bytes, imports) => {
			if (wasm.integrity !== undefined) prepare();
			return WebAssembly.instantiate(bytes, imports);
		},
		onProgress: report,
	});
	return createWith(m.default, hook);
}

const toolkit = toolkitLoader(
	verovioLoader<VerovioModule, Toolkit>({
		fetchModule: (url, options) => fetchModule(url, { ...options, fetch: (u) => fetch(u) }),
		importBlob,
		own: () => import("verovio/wasm"),
		instantiate: async (m, wasm, report) => {
			const module = await createModule(m, wasm, report);
			enableLog(LOG_OFF, module);
			return new VerovioToolkit(module as ConstructorParameters<typeof VerovioToolkit>[0]);
		},
		versionOf: (t) => t.getVersion(),
		toolkitVersion: VEROVIO_VERSION,
		warn: (message) => console.warn(message),
	}),
);

/** `request`'s Verovio source, without its absent fields. */
const sourceOf = ({
	verovioUrl,
	verovioIntegrity,
	verovioWasmIntegrity,
}: Request): VerovioSource => ({
	...(verovioUrl === undefined ? {} : { verovioUrl }),
	...(verovioIntegrity === undefined ? {} : { verovioIntegrity }),
	...(verovioWasmIntegrity === undefined ? {} : { verovioWasmIntegrity }),
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
