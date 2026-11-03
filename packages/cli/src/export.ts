/** barmark export: a chart in another format; MusicXML for now. */
import { basename } from "node:path";
import { exportMusicXml } from "@barmark/musicxml";
import { parseFlags } from "./args.js";
import { readCharts, STDIN } from "./inputs.js";
import { type Io, UsageError } from "./io.js";
import { onlyChart, writeOutput } from "./output.js";
import { textLine } from "./report.js";

export async function exportCommand(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, {
		musicxml: { type: "boolean" },
		out: { type: "string" },
		part: { type: "string" },
	});
	if (!values.musicxml) throw new UsageError("give a format: --musicxml");
	const { path, text } = onlyChart(await readCharts(positionals, io, { folders: false }), "export");
	const result = exportMusicXml(text, {
		...(values.part === undefined ? {} : { part: values.part }),
		...(path === STDIN ? {} : { title: basename(path) }),
	});
	// As transpose does: problems to stderr, and no file written from a chart with errors.
	for (const d of result.diagnostics)
		io.stderr(`${d.line ? textLine(path, d) : `${path}: ${d.message}`}\n`);
	if (result.ok) writeOutput(result.xml, values.out, io);
	else if (values.out !== undefined) io.stderr(`${values.out} not written: the chart has errors\n`);
	return result.ok ? 0 : 1;
}
