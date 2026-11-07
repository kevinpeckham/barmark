import { parseChart, printChart } from "barmark";
import { confidenceOf } from "./confidence.js";
import { readInput } from "./input.js";
import { createReport } from "./report.js";
import { cutRuns } from "./runs.js";
import { timingOf } from "./timing.js";
import type { BuildOptions, BuildResult, Detections } from "./types.js";
import { voteSlots } from "./vote.js";
import { writeChart } from "./write.js";

const DEFAULT_BARS_PER_LINE = 4;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Not a finite number of at least 1 is 4; otherwise floored. No diagnostic. */
function barsPerLineOf(v: unknown): number {
	return typeof v === "number" && Number.isFinite(v) && v >= 1
		? Math.floor(v)
		: DEFAULT_BARS_PER_LINE;
}

/**
 * A chord chart, and the timing map that places it in the recording, from a
 * detector's bar grid and chord runs. Every field is read defensively, so a
 * malformed input gives diagnostics and, for an unusable grid, an empty chart.
 */
export function chartFromDetections(d: Detections, o?: BuildOptions): BuildResult {
	const options = isRecord(o) ? o : {};
	const report = createReport();
	const input = readInput(d, report);
	if (!input) return { chart: "", timing: null, confidence: null, diagnostics: report.list };
	// The one place runs are cut to the bars; a pickup (Task 5) joins `bars` first.
	const runs = cutRuns(input.runs, input.bars, report);
	const symbols = voteSlots(input.bars, runs, report);
	const text = writeChart(input, symbols, {
		simile: options.simile !== false,
		barsPerLine: barsPerLineOf(options.barsPerLine),
	});
	const chart = printChart(text);
	const parse = parseChart(chart);
	const timing = timingOf(parse, input, chart, (d as Detections).recording);
	return { chart, timing, confidence: confidenceOf(parse, input), diagnostics: report.list };
}
