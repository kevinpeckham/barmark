// The types of @barmark/engraver's module, self-contained (the package has no
// runtime dependency on verovio). VerovioModule is copied from Verovio 6.4.1's
// dist/types/VerovioModule.d.ts; VerovioModuleOptions adds instantiateWasm,
// which this build's INCOMING_MODULE_JS_API reads and stock's does not.

/**
 * The emscripten module object passed to VerovioToolkit, and exported as `verovio.module`.
 *
 * The wasm exports are not meant to be called directly - use VerovioToolkit, which
 * wraps them with cwrap(). The `FS_*` helpers write to the module's own in-memory
 * filesystem, so a file created with them is visible to the toolkit.
 */
export interface VerovioModule {
	/**
	 * Called when the runtime is fully initialized and the compiled code is safe to run.
	 */
	onRuntimeInitialized: () => void;

	/**
	 * View of the module memory as unsigned bytes. Replaced when the memory grows, so it must be re-read after any allocation.
	 */
	HEAPU8: Uint8Array;

	/**
	 * Wraps an exported function in a JavaScript function that takes and returns JavaScript values rather than pointers. Pass null as the return type for a void function.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: copied verbatim from Verovio's VerovioModule.d.ts
	cwrap: <T extends (...args: any[]) => any = (...args: any[]) => any>(
		ident: string,
		returnType?: "number" | "string" | "boolean" | "array" | null,
		argTypes?: ("number" | "string" | "array")[] | null,
		opts?: { async?: boolean },
	) => T;

	/**
	 * Creates a file in the in-memory filesystem with the given contents.
	 */
	FS_createDataFile: (
		parent: string,
		name: string,
		data: string | ArrayLike<number>,
		canRead: boolean,
		canWrite: boolean,
		canOwn: boolean,
	) => void;

	/**
	 * Deletes a file or directory from the in-memory filesystem.
	 */
	FS_unlink: (path: string) => void;

	/**
	 * Releases memory previously allocated with _malloc.
	 */
	_free: (ptr: number) => void;

	/**
	 * Allocates the given number of bytes and returns a pointer to them.
	 */
	_malloc: (size: number) => number;
}

/**
 * Attributes read from the module argument passed to createVerovioModule().
 *
 * This is the build's -s INCOMING_MODULE_JS_API list, so attributes absent from it
 * have no effect when passed.
 */
export interface VerovioModuleOptions {
	/**
	 * Called when the runtime is fully initialized and the compiled code is safe to run.
	 */
	onRuntimeInitialized?: () => void;

	/**
	 * Instantiates the module's WebAssembly in place of Emscripten's own fetch:
	 * call `receive` with the instance (and its module) and return `{}` to say it
	 * will arrive asynchronously, or return the instance's exports at once.
	 */
	instantiateWasm?(
		imports: WebAssembly.Imports,
		receive: (instance: WebAssembly.Instance, module?: WebAssembly.Module) => void,
	): WebAssembly.Exports | Record<string, never>;
}

/** Signature of the module factory @barmark/engraver exports, the same as verovio/wasm's. */
export type VerovioModuleFactory = (options?: VerovioModuleOptions) => Promise<VerovioModule>;

declare const createVerovioModule: VerovioModuleFactory;
export default createVerovioModule;
