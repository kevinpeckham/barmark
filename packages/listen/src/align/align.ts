/**
 * Aligning a chart to a recording (design §6.3): the chart's bars, the
 * warping, the re-phase, the fit and the same-piece gate, the placements,
 * then the timing map. The app runs these stages in
 * `state/songCheck.svelte.ts` (`alignChart`, `#keepTiming`); here they are
 * one call that refuses in plain words and never throws.
 */
import type { TimingMap } from "@barmark/sync";
import { beatsOf, type ChartParse, type Meter, parseChart } from "barmark";
import { type Features, readFeatures } from "../features/features.js";
import type { Declared } from "../grid/grid.js";
import { invalid, isRefusal, isTempo, readDeclared, readRecording, readStart } from "../input.js";
import { type ListenOptions, resolveOptions, type Settings } from "../options.js";
import { type ListenWarning, type Ok, ok, type Refused, refusal, refused } from "../result.js";
import { chartPadBars, type PadBar } from "./bars.js";
import { alignmentFit, type Fit } from "./fit.js";
import { type Alignment, alignPath } from "./path.js";
import { alignedPlacements, type Placements } from "./placements.js";
import { rephaseAlignment } from "./rephase.js";
import { alignedTimingMap } from "./timing.js";

/** What `alignChart` reads. */
export type AlignInput = {
	/** barmark text. */
	chart: string;
	features: Features;
	/** Grammar 2.1 bpm for bars the chart gives no tempo; the app passes the song's. */
	tempo?: number;
	/**
	 * The song's declared meter and tempo at `startAt`: the fit's declared bar.
	 * Omitted: the chart's own median bar.
	 */
	declared?: Declared;
	/** The song's start of bar one; the fit measures bar one from max(startAt, firstSound). Default 0. */
	startAt?: number;
	/** Copied into the map. */
	recording?: { id?: string };
};

/** An aligned chart: its map, the alignment, the fit and what it places. */
export type AlignedChart = {
	timing: TimingMap;
	alignment: Alignment;
	fit: Fit;
	placements: Placements;
};

type AlignResult =
	| Ok<AlignedChart>
	| Refused<{ alignment: Alignment | null; placements: Placements | null }>;

/** The input, checked. */
type Checked = {
	chart: string;
	features: Features;
	tempo: number | undefined;
	declared: { meter: Meter; tempo: number } | null;
	startAt: number;
	id: string | undefined;
};

/** Refused before the warping ran: nothing aligned, nothing placed. */
const before = (r: Refused, warnings: ListenWarning[] = []): AlignResult => ({
	...r,
	warnings: [...warnings, ...r.warnings],
	alignment: null,
	placements: null,
});

/** `tempo`, the fallback (absent: none), or why it cannot be read. */
function readTempo(tempo: unknown) {
	if (tempo === undefined) return { tempo: undefined };
	if (isTempo(tempo)) return { tempo };
	return invalid("tempo", "The fallback tempo must be a number from 1 to 999.");
}

/** What the alignment is measured by, after the chart and the features: the first problem refused. */
function readMeasures(
	given: Record<string, unknown>,
): Omit<Checked, "chart" | "features"> | Refused {
	const tempo = readTempo(given.tempo);
	if (isRefusal(tempo)) return refused([tempo]);
	const declared = given.declared === undefined ? null : readDeclared(given.declared);
	if (declared !== null && isRefusal(declared)) return refused([declared]);
	const start = readStart(given.startAt);
	if (isRefusal(start)) return refused([start]);
	const recording = readRecording(given.recording);
	if (isRefusal(recording)) return refused([recording]);
	return { tempo: tempo.tempo, declared, startAt: start.startAt ?? 0, id: recording.id };
}

/** The input checked in the design's order (§6.3), the first problem refused. */
function readInput(input: unknown): Ok<Checked> | Refused {
	if (typeof input !== "object" || input === null)
		return refused([invalid("input", "The alignment's input must be an object.")]);
	const given = input as Record<string, unknown>;
	if (typeof given.chart !== "string")
		return refused([invalid("chart", "The chart must be barmark text, a string.")]);
	const features = readFeatures(given.features);
	if (!features.ok) return features;
	const measures = readMeasures(given);
	if ("ok" in measures) return measures;
	return ok({ chart: given.chart, features: features.value, ...measures });
}

/** `chart-diagnostics` when the parse has any, with their count. */
function diagnosticsOf(parse: ChartParse): ListenWarning[] {
	const count = parse.diagnostics.length;
	if (count === 0) return [];
	const message = `The chart has ${count} parse ${count === 1 ? "diagnostic" : "diagnostics"}; it was aligned as barmark reads it.`;
	return [{ code: "chart-diagnostics", message, detail: { count } }];
}

/** The chart's pad bars, or `no-bars` / `no-tempo`. */
function padBarsOf(parse: ChartParse, tempo: number | undefined): PadBar[] | Refused {
	const r = chartPadBars(parse, tempo);
	if (r.ok) return r.bars;
	if (r.reason === "no-bars") return refused([refusal("no-bars", "The chart plays no bars.")]);
	const bar = r.index ?? 0;
	const message = `Bar ${bar} has no tempo, and no fallback tempo was given.`;
	return refused([refusal("no-tempo", message, { bar })]);
}

/** The alignment on a checked input. */
function alignChecked(c: Checked, s: Settings): AlignResult {
	const parse = parseChart(c.chart);
	const warnings = diagnosticsOf(parse);
	const bars = padBarsOf(parse, c.tempo);
	if (!Array.isArray(bars)) return before(bars, warnings);
	const path = alignPath(bars, c.features, s);
	if (!path.ok) return before(path, warnings);
	const { alignment, flat } = rephaseAlignment(path.value, c.features, s);
	const declaredBar = c.declared
		? (beatsOf(c.declared.meter) * 60) / c.declared.tempo
		: path.value.chartBar;
	const declared = { startAt: c.startAt, barSeconds: declaredBar };
	const { fit, refusals } = alignmentFit(alignment, declared, flat, s);
	const placements = alignedPlacements(bars, alignment, s);
	if (refusals.length > 0) return refused(refusals, warnings, { alignment, placements });
	const timing = alignedTimingMap(c.chart, parse, alignment.barStarts, c.features.duration, c.id);
	if (timing === null) {
		const message = "The aligned map does not check against the chart.";
		return refused([refusal("map-invalid", message)], warnings, { alignment, placements });
	}
	return ok({ timing, alignment, fit, placements }, warnings);
}

/**
 * A chart aligned to a recording's features (design §6.3). In order: the
 * options; the input (`invalid-input` with `detail.field`: `chart` a
 * string, the features as `readFeatures` reads them, `tempo` absent or 1
 * to 999, `declared` as `findGrid` reads it, `startAt` absent or a finite
 * number ≥ 0, `recording.id` a string); the chart read by barmark
 * (`chart-diagnostics` warned when it has any diagnostic) into its played
 * bars (`no-bars`, `no-tempo`); the warping (`alignPath`: `too-short`,
 * `too-long`, `chart-too-long`); the re-phase; the fit against the
 * declared bar, `beatsOf(meter) × 60 / tempo` when `declared` is given,
 * else the chart's median bar, with the same-piece gate (every reason that
 * holds, listed); the placements; then the timing map, checked by
 * `checkTimingMap` (`map-invalid`, unreachable). A refusal after the
 * warping carries the alignment and the placements, as the app places a
 * chart's sections even when it keeps no map; one before it carries
 * neither. Never throws: anything thrown past the input check is
 * `invalid-input` (`detail.field: "input"`), as `chartFromRecording` does.
 */
export function alignChart(input: AlignInput, options?: ListenOptions): AlignResult {
	const resolved = resolveOptions(options, "listen");
	if (!resolved.ok) return before(resolved);
	let checked: Ok<Checked> | Refused;
	try {
		checked = readInput(input);
	} catch {
		checked = refused([invalid("input", "The alignment's input could not be read.")]);
	}
	if (!checked.ok) return before(checked);
	try {
		return alignChecked(checked.value, resolved.value.settings);
	} catch {
		return before(refused([invalid("input", "The alignment's input could not be read.")]));
	}
}
