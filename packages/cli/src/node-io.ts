/** The Io a Node install runs with: real streams, the installed font and the installed versions. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Io, Versions } from "./io.js";

/** The version in the package.json two folders above a package's entry (`dist/index.js`). */
function versionAt(entry: string): string {
	const manifest = fileURLToPath(new URL("../package.json", import.meta.resolve(entry)));
	return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
}

function versions(): Versions {
	const own = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
		version: string;
	};
	return {
		cli: own.version,
		barmark: versionAt("barmark"),
		render: versionAt("@barmark/render"),
		musicxml: versionAt("@barmark/musicxml"),
		score: versionAt("@barmark/score"),
		midi: versionAt("@barmark/midi"),
		verovio: versionAt("verovio"),
	};
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks).toString("utf8");
}

/** A reader that stops early (`barmark render x | head`) is not an error: stop quietly. */
function quietOnClosedPipe(stream: NodeJS.WriteStream): void {
	stream.on("error", (error: NodeJS.ErrnoException) => {
		if (error.code !== "EPIPE") throw error;
		process.exit(process.exitCode ?? 0);
	});
}

/** The process's streams and folder: the part of an Io every runtime shares. */
export function processIo(): Pick<Io, "stdout" | "stderr" | "readStdin" | "cwd"> {
	quietOnClosedPipe(process.stdout);
	quietOnClosedPipe(process.stderr);
	return {
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
		readStdin,
		cwd: process.cwd(),
	};
}

export function nodeIo(): Io {
	return {
		...processIo(),
		verovio: async () => (await import("verovio/wasm")).default,
		font: () =>
			readFileSync(fileURLToPath(import.meta.resolve("@barmark/render/fonts/Edwin-Roman.otf"))),
		versions: versions(),
	};
}
