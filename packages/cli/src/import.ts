/** barmark import: a MusicXML score (.musicxml, .xml or .mxl) as a chart. */
import { decodeXmlBytes, type ImportDiagnostic, importMusicXml, readMxl } from "@barmark/musicxml";
import { parseFlags } from "./args.js";
import { readBytes } from "./inputs.js";
import { type Io, UsageError } from "./io.js";
import { writeOutput } from "./output.js";

/** Control characters shown as U+FFFD: nothing from a file reaches the terminal as an escape sequence. */
const printable = (text: string) => text.replace(/\p{Cc}/gu, "\uFFFD");

/** Whether the message already says where it is: "in measure N" for its own measure, or "N measures: …". */
function namesMeasures(d: ImportDiagnostic): boolean {
	if (/\d+ measures: /.test(d.message)) return true;
	// The measure number is the file's text: matched as it is, never as a pattern.
	const own = `measure ${d.measure}`;
	for (let at = d.message.indexOf(own); at >= 0; at = d.message.indexOf(own, at + 1)) {
		const next = d.message[at + own.length] ?? "";
		if (!/[\w.]/.test(next) && (at === 0 || !/\w/.test(d.message[at - 1] ?? ""))) return true;
	}
	return false;
}

/**
 * `file: measure N (Part): severity: message`, as `check` prints its
 * `file:line: severity: message`; each piece of the place left out when the
 * diagnostic has none, or when the message names its measures itself.
 */
export function importLine(path: string, d: ImportDiagnostic): string {
	const where = [
		d.measure === undefined || namesMeasures(d) ? "" : `measure ${d.measure}`,
		d.part === undefined ? "" : `(${d.part})`,
	].filter(Boolean);
	const place = where.length ? `${where.join(" ")}: ` : "";
	return printable(`${path}: ${place}${d.severity}: ${d.message}`);
}

/** The score's XML text: a .mxl is unpacked. Rejects with a message naming the problem. */
async function scoreText(bytes: Buffer, path: string): Promise<string> {
	return /\.mxl$/i.test(path) ? readMxl(bytes) : decodeXmlBytes(bytes);
}

export async function importCommand(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, {
		out: { type: "string" },
		part: { type: "string" },
	});
	const [path, ...rest] = positionals;
	if (path === undefined) throw new UsageError("no file given");
	if (rest.length) throw new UsageError("import takes one file");
	const bytes = readBytes(path, io);
	let xml: string;
	try {
		xml = await scoreText(bytes, path);
	} catch (error) {
		io.stderr(
			`${printable(`${path}: ${error instanceof Error ? error.message : String(error)}`)}\n`,
		);
		return 1;
	}
	const result = importMusicXml(xml, values.part === undefined ? {} : { part: values.part });
	for (const d of result.diagnostics) io.stderr(`${importLine(path, d)}\n`);
	// As export does: no file written from an import that gave nothing.
	if (result.text === "") return 1;
	writeOutput(result.text, values.out, io);
	return 0;
}
