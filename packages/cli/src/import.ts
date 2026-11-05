/** barmark import: a MusicXML score (.musicxml, .xml or .mxl) as a chart. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type ImportDiagnostic, importMusicXml, readMxl } from "@barmark/musicxml";
import { parseFlags } from "./args.js";
import { type Io, UsageError } from "./io.js";
import { writeOutput } from "./output.js";

/** `file: measure N (Part): message`, each piece left out when the diagnostic has none. */
export function importLine(path: string, d: ImportDiagnostic): string {
	const where = [
		d.measure === undefined ? "" : `measure ${d.measure}`,
		d.part === undefined ? "" : `(${d.part})`,
	].filter(Boolean);
	return `${path}: ${where.length ? `${where.join(" ")}: ` : ""}${d.message}`;
}

/** The score's XML text: a .mxl is read as bytes and unpacked. Rejects with a message naming the problem. */
async function scoreText(path: string, io: Io): Promise<string> {
	let bytes: Buffer;
	try {
		bytes = readFileSync(resolve(io.cwd, path));
	} catch {
		throw new Error("cannot read the file");
	}
	return /\.mxl$/i.test(path) ? readMxl(bytes) : bytes.toString("utf8");
}

export async function importCommand(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, {
		out: { type: "string" },
		part: { type: "string" },
	});
	const [path, ...rest] = positionals;
	if (path === undefined) throw new UsageError("no file given");
	if (rest.length) throw new UsageError("import takes one file");
	let xml: string;
	try {
		xml = await scoreText(path, io);
	} catch (error) {
		io.stderr(`${path}: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
	const result = importMusicXml(xml, values.part === undefined ? {} : { part: values.part });
	for (const d of result.diagnostics) io.stderr(`${importLine(path, d)}\n`);
	// As export does: no file written from an import that gave nothing.
	if (result.text === "") return 1;
	writeOutput(result.text, values.out, io);
	return 0;
}
