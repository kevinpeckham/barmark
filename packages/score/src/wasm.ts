/**
 * Loading a Verovio whose `.wasm` is a separate file (`@barmark/engraver`):
 * Emscripten's `instantiateWasm` hook, which downloads the `.wasm` itself
 * and checks its own digest, and the race that keeps a failed download
 * from hanging the factory. Verovio-free, like download.ts.
 */
import type { Download } from "./download.js";
import { knownSize } from "./verovio.js";

/** The `.wasm`'s name: it always sits beside the module. */
export const WASM_FILE = "verovio-module.wasm";

export const WASM_INTEGRITY_NEEDED =
	"verovio-wasm-integrity is needed for a Verovio that loads a separate .wasm";

/**
 * Where the `.wasm` comes from: beside `moduleUrl` (the `verovio-url`, never
 * the blob the module is imported from), checked against `integrity`, which
 * is `required` when the module itself was given a digest.
 */
export type WasmSource = { moduleUrl: string; integrity?: string; required: boolean };

/** What the hook needs, so a test can pass fakes. */
export type WasmDeps = {
	fetchBytes(
		url: string,
		o: {
			integrity?: string | undefined;
			expected?: number | undefined;
			onProgress: (d: Download) => void;
		},
	): Promise<Uint8Array<ArrayBuffer>>;
	instantiate(
		bytes: Uint8Array<ArrayBuffer>,
		imports: WebAssembly.Imports,
	): Promise<{ instance: WebAssembly.Instance; module: WebAssembly.Module }>;
	onProgress: (d: Download) => void;
};

/** Emscripten's hook: `{}` says `receive` will be called later. */
export type InstantiateWasm = (
	imports: WebAssembly.Imports,
	receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
) => Record<string, never>;

/**
 * The hook for `source`, and `failed`, which rejects with the reason if the
 * hook's download, digest check or instantiation fails (then `receive` is
 * never called). `failed` never resolves, and an unused one is never an
 * unhandled rejection.
 */
export function wasmHook(
	source: WasmSource,
	deps: WasmDeps,
): { instantiateWasm: InstantiateWasm; failed: Promise<never> } {
	let fail!: (err: unknown) => void;
	const failed = new Promise<never>((_, reject) => {
		fail = reject;
	});
	failed.catch(() => {});
	const instantiateWasm: InstantiateWasm = (imports, receive) => {
		const { integrity, required } = source;
		if (required && integrity === undefined) throw new Error(WASM_INTEGRITY_NEEDED);
		// A URL resolved against the module's drops its query and hash.
		const url = new URL(WASM_FILE, source.moduleUrl).href;
		const options = { integrity, expected: knownSize(integrity), onProgress: deps.onProgress };
		deps
			.fetchBytes(url, options)
			.then((bytes) => deps.instantiate(bytes, imports))
			.then(({ instance, module }) => receive(instance, module))
			.catch(fail);
		return {};
	};
	return { instantiateWasm, failed };
}

/**
 * Runs Emscripten's `factory` with the hook, settling as soon as the hook
 * fails; a synchronous throw (the hook's, or the factory's) rejects too.
 */
export function createWith<M>(
	factory: (arg: { instantiateWasm: InstantiateWasm }) => Promise<M>,
	hook: ReturnType<typeof wasmHook>,
): Promise<M> {
	const created = new Promise<M>((resolve) =>
		resolve(factory({ instantiateWasm: hook.instantiateWasm })),
	);
	return Promise.race([created, hook.failed]);
}

/** Whether a module reporting `moduleVersion` is the toolkit's Verovio: the same, or it then a dash (a build's commit). */
export const sameVerovio = (moduleVersion: string, toolkitVersion: string) =>
	moduleVersion === toolkitVersion || moduleVersion.startsWith(`${toolkitVersion}-`);
