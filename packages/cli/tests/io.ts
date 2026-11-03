/** An in-memory Io for running commands in-process: collected output, a fixed stdin, fixed versions. */
import type { Io } from "../src/io.js";

export function fakeIo(
	overrides: Partial<Io> & { stdin?: string } = {},
): Io & { out: () => string; err: () => string } {
	let out = "";
	let err = "";
	const { stdin = "", ...rest } = overrides;
	return {
		stdout: (text) => {
			out += text;
		},
		stderr: (text) => {
			err += text;
		},
		readStdin: async () => stdin,
		cwd: process.cwd(),
		font: () => new Uint8Array([1, 2, 3, 4]),
		versions: { cli: "0.1.0", barmark: "9.9.9", render: "8.8.8", musicxml: "7.7.7" },
		...rest,
		out: () => out,
		err: () => err,
	};
}
