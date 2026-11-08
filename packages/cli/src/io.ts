/** What a command touches outside itself, injected so tests run commands in-process. */

/** The versions `--version` reports: this package and the libraries it runs. */
export type Versions = {
	cli: string;
	barmark: string;
	render: string;
	musicxml: string;
	score: string;
	midi: string;
};

export type Io = {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	readStdin: () => Promise<string>;
	/** The folder relative paths resolve against. */
	cwd: string;
	/** Edwin-Roman.otf, for `render` to embed. */
	font: () => Uint8Array;
	versions: Versions;
};

/** A mistake in how the command was called: printed as one line, exit 2. */
export class UsageError extends Error {}
