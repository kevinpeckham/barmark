/** barmark import: a MusicXML score (.musicxml, .xml or .mxl) or a MIDI file (.mid or .midi) as a chart. */
import { importMidi, type MidiImportDiagnostic } from "@barmark/midi";
import { decodeXmlBytes, type ImportDiagnostic, importMusicXml, readMxl } from "@barmark/musicxml";
import { joinNegative, parseFlags } from "./args.js";
import { readBytes } from "./inputs.js";
import { type Io, UsageError } from "./io.js";
import { writeOutput } from "./output.js";

/** Control characters shown as U+FFFD: nothing from a file reaches the terminal as an escape sequence. */
const printable = (text: string) => text.replace(/\p{Cc}/gu, "�");

/** `path: place: severity: message`, the place left out when there is none. */
const line = (path: string, where: string[], d: { severity: string; message: string }) => {
	const place = where.filter(Boolean).join(" ");
	return printable(`${path}: ${place ? `${place}: ` : ""}${d.severity}: ${d.message}`);
};

/**
 * `file: measure N (Part): severity: message`, as `check` prints its
 * `file:line: severity: message`; each piece of the place left out when the
 * diagnostic has none, or when the message names its measures itself.
 */
export function importLine(path: string, d: ImportDiagnostic): string {
	return line(
		path,
		[
			// A diagnostic with `measures` names them in its message; the message is never searched.
			d.measure === undefined || d.measures !== undefined ? "" : `measure ${d.measure}`,
			d.part === undefined ? "" : `(${d.part})`,
		],
		d,
	);
}

/** `file: bar N (track T): severity: message`; N is a written number, a pickup 0, as `importLine` prints a score's. */
export function midiLine(path: string, d: MidiImportDiagnostic): string {
	return line(
		path,
		[d.bar === undefined ? "" : `bar ${d.bar}`, d.track === undefined ? "" : `(track ${d.track})`],
		d,
	);
}

/** A `--tracks` entry that looks like a number: a track number, 1-based. */
function trackNumber(entry: string): number {
	const n = Number(entry);
	if (!Number.isSafeInteger(n) || n < 1)
		throw new UsageError(`--tracks: "${entry}" is not a track number (they start at 1)`);
	return n;
}

/** `--tracks 2,Piano`: each entry a 1-based track number, or else a track's name. */
export function tracksOf(list: string): (number | string)[] {
	const entries = list.split(",").map((entry) => entry.trim());
	if (entries.some((entry) => entry === ""))
		throw new UsageError("--tracks takes track numbers or names, separated by commas");
	return entries.map((entry) => (/^[+-]?\d+$/.test(entry) ? trackNumber(entry) : entry));
}

/** The score's XML text: a .mxl is unpacked. Rejects with a message naming the problem. */
async function scoreText(bytes: Buffer, path: string): Promise<string> {
	return /\.mxl$/i.test(path) ? readMxl(bytes) : decodeXmlBytes(bytes);
}

type Imported = { text: string; lines: string[] };

function midiImport(
	bytes: Buffer,
	path: string,
	tracks: (number | string)[] | undefined,
): Imported {
	const result = importMidi(new Uint8Array(bytes), tracks === undefined ? {} : { tracks });
	return { text: result.text, lines: result.diagnostics.map((d) => midiLine(path, d)) };
}

async function scoreImport(
	bytes: Buffer,
	path: string,
	part: string | undefined,
): Promise<Imported> {
	let xml: string;
	try {
		xml = await scoreText(bytes, path);
	} catch (error) {
		return {
			text: "",
			lines: [printable(`${path}: ${error instanceof Error ? error.message : String(error)}`)],
		};
	}
	const result = importMusicXml(xml, part === undefined ? {} : { part });
	return { text: result.text, lines: result.diagnostics.map((d) => importLine(path, d)) };
}

export async function importCommand(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(joinNegative(args, "--tracks"), {
		out: { type: "string" },
		part: { type: "string" },
		tracks: { type: "string" },
	});
	const [path, ...rest] = positionals;
	if (path === undefined) throw new UsageError("no file given");
	if (rest.length) throw new UsageError("import takes one file");
	const midi = /\.midi?$/i.test(path);
	if (midi && values.part !== undefined)
		throw new UsageError("--part is for MusicXML; a MIDI file takes --tracks");
	if (!midi && values.tracks !== undefined)
		throw new UsageError("--tracks is for MIDI; a MusicXML score takes --part");
	const tracks = values.tracks === undefined ? undefined : tracksOf(values.tracks);
	const bytes = readBytes(path, io);
	const { text, lines } = midi
		? midiImport(bytes, path, tracks)
		: await scoreImport(bytes, path, values.part);
	for (const l of lines) io.stderr(`${l}\n`);
	// As export does: no file written from an import that gave nothing.
	if (text === "") return 1;
	writeOutput(text, values.out, io);
	return 0;
}
