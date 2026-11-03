/** barmark part: one part of a chart of several, as a chart of its own. */
import { printPart } from "barmark";
import { parseFlags } from "./args.js";
import { readCharts } from "./inputs.js";
import { type Io, UsageError } from "./io.js";
import { onlyChart, writeOutput } from "./output.js";

export async function part(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(args, { out: { type: "string" } });
	const [label, ...paths] = positionals;
	if (label === undefined) throw new UsageError("give a part's label, then a chart");
	const { path, text } = onlyChart(await readCharts(paths, io, { folders: false }), "part");
	const printed = printPart(text, label);
	if (printed === null) {
		io.stderr(`${path}: no part labelled ${label}\n`);
		return 1;
	}
	writeOutput(printed, values.out, io);
	return 0;
}
