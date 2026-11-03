/** barmark part: one part of a chart of several, as a chart of its own. */
import { extractPart, printPart } from "barmark";
import { parseFlags } from "./args.js";
import { readCharts } from "./inputs.js";
import { type Io, UsageError } from "./io.js";
import { onlyChart, writeOutput } from "./output.js";
import { textLine } from "./report.js";

export async function part(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, { out: { type: "string" } });
	const [label, ...paths] = positionals;
	if (label === undefined) throw new UsageError("give a part's label, then a chart");
	const { path, text } = onlyChart(await readCharts(paths, io, { folders: false }), "part");
	const parse = extractPart(text, label);
	const printed = printPart(text, label);
	if (parse === null || printed === null) {
		io.stderr(`${path}: no part labelled ${label}\n`);
		return 1;
	}
	// As transpose does: the part's problems to stderr, and no file written from a chart with errors.
	for (const d of parse.diagnostics) io.stderr(`${textLine(path, d)}\n`);
	const failed = parse.diagnostics.some((d) => d.severity === "error");
	if (failed && values.out !== undefined)
		io.stderr(`${values.out} not written: the chart has errors\n`);
	else writeOutput(printed, values.out, io);
	return failed ? 1 : 0;
}
