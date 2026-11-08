/** barmark export: a chart in another format: MusicXML, or a MIDI file. */
import { basename } from "node:path";
import { exportMidi, type MidiLoss } from "@barmark/midi";
import { exportMusicXml } from "@barmark/musicxml";
import type { ChartDiagnostic } from "barmark";
import { parseFlags } from "./args.js";
import { readCharts, STDIN } from "./inputs.js";
import { type Io, UsageError } from "./io.js";
import { onlyChart, writeFile, writeOutput } from "./output.js";
import { textLine } from "./report.js";

/** `file: bar N: warning: message`, as `check` prints its findings; a loss with no bar has no place. */
export function lossLine(path: string, loss: MidiLoss): string {
	return `${path}: ${loss.bar === undefined ? "" : `bar ${loss.bar}: `}warning: ${loss.message}`;
}

const diagnosticLine = (path: string, d: ChartDiagnostic) =>
	d.line ? textLine(path, d) : `${path}: ${d.message}`;

/** The format the flags name: exactly one; --midi writes bytes, so it needs --out. */
function formatOf(values: {
	musicxml?: boolean;
	midi?: boolean;
	out?: string;
}): "musicxml" | "midi" {
	if (values.musicxml && values.midi) throw new UsageError("give one format: --musicxml or --midi");
	if (values.midi) {
		if (values.out === undefined)
			throw new UsageError("--midi writes a file: give --out <file.mid>");
		return "midi";
	}
	if (values.musicxml) return "musicxml";
	throw new UsageError("give a format: --musicxml or --midi");
}

export async function exportCommand(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, {
		musicxml: { type: "boolean" },
		midi: { type: "boolean" },
		out: { type: "string" },
		part: { type: "string" },
	});
	const format = formatOf(values);
	const { path, text } = onlyChart(await readCharts(positionals, io, { folders: false }), "export");
	const options = {
		...(values.part === undefined ? {} : { part: values.part }),
		...(path === STDIN ? {} : { title: basename(path).replace(/(\.chart)?\.[^.]*$/, "") }),
	};
	const result = format === "midi" ? exportMidi(text, options) : exportMusicXml(text, options);
	// As transpose does: problems to stderr, and no file written from a chart with errors.
	for (const d of result.diagnostics) io.stderr(`${diagnosticLine(path, d)}\n`);
	if (!result.ok) {
		if (values.out !== undefined) io.stderr(`${values.out} not written: the chart has errors\n`);
		return 1;
	}
	if ("bytes" in result) {
		for (const loss of result.losses) io.stderr(`${lossLine(path, loss)}\n`);
		// formatOf made --out required for --midi.
		writeFile(values.out as string, result.bytes, io);
	} else writeOutput(result.xml, values.out, io);
	return 0;
}
