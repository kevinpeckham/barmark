/** barmark transpose: a chart in another key, by key name or by semitones. */
import { type TransposeBy, transposeChart } from "barmark";
import { joinNegative, parseFlags } from "./args.js";
import { readCharts } from "./inputs.js";
import { type Io, UsageError } from "./io.js";
import { onlyChart, writeOutput } from "./output.js";
import { textLine } from "./report.js";

function moveOf(to: string | undefined, semitones: string | undefined): TransposeBy {
	if (to !== undefined && semitones !== undefined)
		throw new UsageError("give --to or --semitones, not both");
	if (to !== undefined) return { to };
	if (semitones === undefined) throw new UsageError("give --to <key> or --semitones <n>");
	if (!/^[+-]?\d+$/.test(semitones))
		throw new UsageError(`--semitones must be a whole number, not "${semitones}"`);
	return { semitones: Number(semitones) };
}

export async function transpose(args: string[], io: Io): Promise<number> {
	const { values, positionals } = parseFlags(joinNegative(args, "--semitones"), {
		to: { type: "string" },
		semitones: { type: "string" },
		out: { type: "string" },
	});
	const by = moveOf(values.to, values.semitones);
	const { path, text } = onlyChart(
		await readCharts(positionals, io, { folders: false }),
		"transpose",
	);
	const result = transposeChart(text, by);
	for (const d of result.diagnostics) io.stderr(`${textLine(path, d)}\n`);
	const failed = result.diagnostics.some((d) => d.severity === "error");
	if (failed && values.out !== undefined)
		io.stderr(`${values.out} not written: the chart has errors\n`);
	else writeOutput(result.text, values.out, io);
	return failed ? 1 : 0;
}
