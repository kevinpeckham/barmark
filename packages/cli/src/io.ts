/** What a command touches outside itself, injected so tests run commands in-process. */

/** What `verovio/wasm` exports by default: the call that makes Verovio's module. */
export type VerovioFactory = typeof import("verovio/wasm").default;

/** The versions `--version` reports: this package and the libraries it runs. */
export type Versions = {
	cli: string;
	barmark: string;
	render: string;
	musicxml: string;
	score: string;
	midi: string;
	verovio: string;
};

export type Io = {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	readStdin: () => Promise<string>;
	/** The folder relative paths resolve against. */
	cwd: string;
	/** Edwin-Roman.otf, for `render` to embed. */
	font: () => Uint8Array;
	/**
	 * Verovio's module factory (`verovio/wasm`'s default), for `render
	 * --score`: loaded only when a score is drawn, so no other command pays
	 * for its 7 MB.
	 */
	verovio: () => Promise<VerovioFactory>;
	versions: Versions;
};

/** A mistake in how the command was called: printed as one line, exit 2. */
export class UsageError extends Error {}
