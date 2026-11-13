/**
 * The builder call both pipelines share: `@barmark/sync`'s
 * `chartFromDetections`, its error turned into a refusal, and the marks a
 * caller gives copied onto the detections as given.
 */
import {
	type BuildDiagnostic,
	type BuildOptions,
	type Change,
	type ConfidenceRecord,
	chartFromDetections,
	type Detected,
	type Detections,
	type TimingMap,
} from "@barmark/sync";
import { invalid } from "./input.js";
import { type Refusal, refusal } from "./result.js";

/** What the builder made: the chart, its map and confidence, and its own diagnostics. */
export type Built = {
	chart: string;
	timing: TimingMap;
	confidence: ConfidenceRecord;
	diagnostics: BuildDiagnostic[];
};

/** The title, key, sections and changes a caller gave, copied onto the detections as given. */
export function withMarks(d: Detections, given: Record<string, unknown>): Detections {
	if (given.title !== undefined) d.title = given.title as string;
	if (given.key !== undefined) d.key = given.key as Detected<string> | null;
	if (given.sections !== undefined)
		d.sections = given.sections as NonNullable<Detections["sections"]>;
	if (given.changes !== undefined) d.changes = given.changes as Change[];
	return d;
}

/** The builder on the detections: its chart, map and confidence, or its error (or a throw) as `invalid-input`. */
export function buildChart(d: Detections, options: BuildOptions | undefined): Built | Refusal {
	try {
		const built = chartFromDetections(d, options);
		const error = built.diagnostics.find((x) => x.severity === "error");
		if (error || built.timing === null || built.confidence === null) {
			const message = error?.message ?? "The builder made no chart.";
			const detail = { field: "grid", code: error?.code ?? "none" };
			return refusal("invalid-input", message, detail);
		}
		return {
			chart: built.chart,
			timing: built.timing,
			confidence: built.confidence,
			diagnostics: built.diagnostics,
		};
	} catch {
		return invalid("input", "The builder could not read the detections.");
	}
}
