/** barmark export: a chart in another format: MusicXML, a MIDI file or a lyric sheet. */
import { basename } from "node:path";
import { exportLyricsheet } from "@barmark/lyricsheet";
import { exportMidi } from "@barmark/midi";
import { exportMusicXml } from "@barmark/musicxml";
import type { ChartDiagnostic } from "barmark";
import { oneOf, parseFlags } from "./args.js";
import { readCharts, STDIN } from "./inputs.js";
import { type Io, UsageError } from "./io.js";
import { onlyChart, writeFile, writeOutput } from "./output.js";
import { DIAGRAMS } from "./render.js";
import { textLine } from "./report.js";

/**
 * `file: bar N: warning: message`, as `check` prints its findings; N is the
 * bar's written number (a pickup is 0), not its play position. A loss with no
 * bar has no place.
 */
export function lossLine(
	path: string,
	loss: { message: string; bar?: number; written?: number },
): string {
	const bar = loss.written ?? loss.bar;
	return `${path}: ${bar === undefined ? "" : `bar ${bar}: `}warning: ${loss.message}`;
}

const diagnosticLine = (path: string, d: ChartDiagnostic) =>
	d.line ? textLine(path, d) : `${path}: ${d.message}`;

type Format = "musicxml" | "midi" | "lyricsheet";

/** The format the flags name: exactly one; --midi writes bytes, so it needs --out. */
function formatOf(values: {
	musicxml?: boolean;
	midi?: boolean;
	lyricsheet?: boolean;
	out?: string;
	diagrams?: string;
}): Format {
	const named = (["musicxml", "midi", "lyricsheet"] as const).filter((f) => values[f]);
	if (named.length > 1) throw new UsageError("give one format: --musicxml, --midi or --lyricsheet");
	const format = named[0];
	if (format === undefined)
		throw new UsageError("give a format: --musicxml, --midi or --lyricsheet");
	if (format === "midi" && values.out === undefined)
		throw new UsageError("--midi writes a file: give --out <file.mid>");
	if (values.diagrams !== undefined && format !== "lyricsheet")
		throw new UsageError("--diagrams goes with --lyricsheet");
	return format;
}

export async function exportCommand(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, {
		musicxml: { type: "boolean" },
		midi: { type: "boolean" },
		lyricsheet: { type: "boolean" },
		out: { type: "string" },
		part: { type: "string" },
		diagrams: { type: "string" },
	});
	const format = formatOf(values);
	const diagrams =
		values.diagrams === undefined ? undefined : oneOf("diagrams", values.diagrams, DIAGRAMS);
	const { path, text } = onlyChart(await readCharts(positionals, io, { folders: false }), "export");
	const options = {
		...(values.part === undefined ? {} : { part: values.part }),
		...(path === STDIN ? {} : { title: basename(path).replace(/(\.chart)?\.[^.]*$/, "") }),
	};
	const result = convert(format, text, options, diagrams);
	// As transpose does: problems to stderr, and no file written from a chart with errors.
	for (const d of result.diagnostics) io.stderr(`${diagnosticLine(path, d)}\n`);
	if (!result.ok) {
		if (values.out !== undefined) io.stderr(`${values.out} not written: the chart has errors\n`);
		return 1;
	}
	writeResult(result, path, values.out, io);
	return 0;
}

type Options = { part?: string; title?: string };

function convert(format: Format, text: string, options: Options, diagrams?: "guitar") {
	if (format === "midi") return exportMidi(text, options);
	if (format === "lyricsheet")
		return exportLyricsheet(text, { ...options, ...(diagrams ? { diagrams } : {}) });
	return exportMusicXml(text, options);
}

/** A good result's losses to stderr, then its file or its text. */
function writeResult(
	result: Exclude<ReturnType<typeof convert>, { ok: false }>,
	path: string,
	out: string | undefined,
	io: Io,
): void {
	if ("bytes" in result) {
		for (const loss of result.losses) io.stderr(`${lossLine(path, loss)}\n`);
		// formatOf made --out required for --midi.
		writeFile(out as string, result.bytes, io);
	} else if ("text" in result) {
		// The sheet's messages name their bars already: no second naming.
		for (const loss of result.losses) io.stderr(`${lossLine(path, { message: loss.message })}\n`);
		writeOutput(result.text, out, io);
	} else writeOutput(result.xml, out, io);
}
