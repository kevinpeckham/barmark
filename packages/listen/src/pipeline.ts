/**
 * The whole pipeline (design §6.4): a recording's features, its grid, then
 * `@barmark/sync`'s builder on that grid, as one call that refuses in
 * plain words and never throws. The app runs these steps itself
 * (`chartlessGridInBrowser`, then `server/chartBuild.ts`'s
 * `buildChartFromDetections`); one call is all a public tool or the bench
 * needs.
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
import { beatsOf, type Meter } from "barmark";
import { type Features, readFeatures, recordingFeatures } from "./features/features.js";
import type { ListenChordRuns } from "./grid/beats.js";
import { type Declared, type GridReading, gridWith, type PlacedGrid } from "./grid/grid.js";
import { barStartsFrom } from "./grid/place.js";
import { invalid, isRefusal, readDeclared, readRecording, readStart } from "./input.js";
import {
	type FeatureOptions,
	type ListenOptions,
	resolveOptions,
	type Settings,
} from "./options.js";
import {
	type ListenWarning,
	type Ok,
	ok,
	type Refusal,
	type Refused,
	refusal,
	refused,
} from "./result.js";

/** The grid refusals the declared grid may stand in for. */
export type Unplaced = "no-period" | "downbeat-undecided" | "nothing-fits";

/** What `chartFromRecording` reads. */
export type RecordingInput = {
	/** Mono PCM and its rate, or features computed earlier (for instance from a cache). */
	samples?: Float32Array;
	sampleRate?: number;
	features?: Features;
	chords: ListenChordRuns;
	declared: Declared;
	startAt?: number | null;
	/** Passed to chartFromDetections as given. */
	title?: string;
	key?: Detected<string> | null;
	sections?: { name: string; start: number; confidence?: number }[];
	changes?: Change[];
	recording?: { id?: string };
	/** When the grid cannot be placed (an `Unplaced` refusal): refuse (default), or build on the declared grid with a warning. */
	onUnplaced?: "refuse" | "declared";
};

/** A recording's chart, its map and confidence, how its grid was read, and the features used. */
export type RecordingChart = {
	chart: string;
	timing: TimingMap;
	confidence: ConfidenceRecord;
	/** The builder's own diagnostics, unchanged. */
	diagnostics: BuildDiagnostic[];
	/** Null when built on the declared grid. */
	grid: PlacedGrid | null;
	/** The comb, the witnesses and the scores, whether or not the grid was placed (null only for no-period). */
	reading: GridReading | null;
	/** The features used, so a caller can cache them. */
	features: Features;
};

type PipelineOptions = ListenOptions & FeatureOptions & { build?: BuildOptions };
type PipelineResult =
	| Ok<RecordingChart>
	| Refused<{ reading: GridReading | null; features: Features | null }>;

/** The input, checked; the recording not yet read. */
type Checked = {
	given: Record<string, unknown>;
	source: { features: unknown } | { samples: unknown; sampleRate: unknown };
	meter: Meter;
	tempo: number;
	startAt: number | null;
	onUnplaced: "refuse" | "declared";
	id: string | undefined;
};

/** The bars a grid gives the builder, its pickup and the grid and reading to return. */
type Bars = {
	bars: number[];
	pickup: number | null;
	grid: PlacedGrid | null;
	reading: GridReading | null;
};

const UNPLACED: ReadonlySet<string> = new Set<Unplaced>([
	"no-period",
	"downbeat-undecided",
	"nothing-fits",
]);

/** Refused with the reading and the features so far. */
const refusedWith = (
	r: Refused,
	reading: GridReading | null,
	features: Features | null,
	warnings: ListenWarning[] = [],
): PipelineResult => ({ ...r, warnings: [...warnings, ...r.warnings], reading, features });

/**
 * The declared grid: bar starts every `bar` seconds from `start` while
 * under `duration`, at most `max` of them, then the end; `truncated` when
 * `max` cut it before the end; null when `start` is not before the end.
 * `barStartsFrom`, the app's, under the pipeline's name.
 */
export function declaredGrid(
	start: number,
	bar: number,
	duration: number,
	max: number,
): { bars: number[]; truncated: boolean } | null {
	return barStartsFrom(start, bar, duration, max);
}

/** Exactly one recording: the features, or the samples and their rate (Ruling 7). */
function readSource(given: Record<string, unknown>): Checked["source"] | Refusal {
	const hasFeatures = given.features !== undefined;
	const hasSamples = given.samples !== undefined || given.sampleRate !== undefined;
	if (hasFeatures && hasSamples)
		return invalid("features", "Give the recording's samples or its features, not both.");
	if (hasFeatures) return { features: given.features };
	if (!hasSamples)
		return invalid("samples", "Give the recording's samples and sample rate, or its features.");
	return { samples: given.samples, sampleRate: given.sampleRate };
}

/** The chords: the builder needs runs, so null (which the grid alone accepts) is refused here. */
function readChordsGiven(chords: unknown): Refusal | null {
	if (typeof chords === "object" && chords !== null) return null;
	return invalid("chords", "The chords must be an object with a runs list.");
}

/** `onUnplaced` ("refuse" when not given), or why it cannot be read. */
function readUnplaced(v: unknown): { onUnplaced: "refuse" | "declared" } | Refusal {
	if (v === undefined) return { onUnplaced: "refuse" };
	if (v === "refuse" || v === "declared") return { onUnplaced: v };
	return invalid("onUnplaced", 'onUnplaced must be "refuse" or "declared".');
}

/** The input checked in the design's order, the first problem refused; the recording is read after. */
function readInput(input: unknown): Checked | Refusal {
	if (typeof input !== "object" || input === null)
		return invalid("input", "The pipeline's input must be an object.");
	const given = input as Record<string, unknown>;
	const source = readSource(given);
	if (isRefusal(source)) return source;
	const chords = readChordsGiven(given.chords);
	if (chords) return chords;
	const declared = readDeclared(given.declared);
	if (isRefusal(declared)) return declared;
	const start = readStart(given.startAt);
	if (isRefusal(start)) return start;
	const unplaced = readUnplaced(given.onUnplaced);
	if (isRefusal(unplaced)) return unplaced;
	const recording = readRecording(given.recording);
	if (isRefusal(recording)) return recording;
	return { given, source, ...declared, ...start, ...unplaced, id: recording.id };
}

/** A sound option given beside features that were read with another value: refused, never ignored. */
function soundMismatch(f: Features, options: unknown): Refusal | null {
	const given = (options ?? {}) as FeatureOptions;
	const pairs = [
		["ALIGNMENT_SOUND_FLOOR", given.ALIGNMENT_SOUND_FLOOR, f.sound.floor],
		["ALIGNMENT_SOUND_WINDOW_SEC", given.ALIGNMENT_SOUND_WINDOW_SEC, f.sound.windowSec],
	] as const;
	for (const [option, value, own] of pairs)
		if (value !== undefined && value !== own)
			return refusal(
				"invalid-option",
				`Option ${option} is ${value}, but the features given were read with ${own}.`,
				{ option },
			);
	return null;
}

/** The recording's features: read back when given, else computed from the samples with the sound options. */
function featuresOf(c: Checked, s: Settings, options: unknown): Ok<Features> | Refused {
	if ("features" in c.source) {
		const read = readFeatures(c.source.features);
		if (!read.ok) return read;
		const mismatch = soundMismatch(read.value, options);
		return mismatch ? refused([mismatch]) : read;
	}
	const sound = {
		ALIGNMENT_SOUND_FLOOR: s.ALIGNMENT_SOUND_FLOOR,
		ALIGNMENT_SOUND_WINDOW_SEC: s.ALIGNMENT_SOUND_WINDOW_SEC,
	};
	return recordingFeatures(c.source.samples as Float32Array, c.source.sampleRate as number, sound);
}

/** The bars on the declared grid in place of an unplaced one, or the refusal plus `nothing-fits`. */
function onDeclared(
	c: Checked,
	f: Features,
	s: Settings,
	r: Refused<{ reading: GridReading | null }>,
): Ok<Bars> | Refused {
	const start = c.startAt ?? 0;
	const from = declaredGrid(start, (beatsOf(c.meter) * 60) / c.tempo, f.duration, s.MAX_GRID_BARS);
	if (!from) {
		const message = `The declared grid's bar one, at ${start.toFixed(2)} s, is at or after the recording's end.`;
		return refused([...r.refusals, refusal("nothing-fits", message)], r.warnings);
	}
	const reason = r.refusals[0]?.reason as Unplaced;
	const warnings: ListenWarning[] = [
		...r.warnings,
		{
			code: "bar-one-unplaced",
			message: `The bars could not be placed (${reason}); the chart is built on the declared grid from ${start.toFixed(2)} s.`,
			detail: { reason },
		},
	];
	if (from.truncated)
		warnings.push({
			code: "grid-truncated",
			message: `The grid stops at ${s.MAX_GRID_BARS} bars, before the recording's end.`,
			detail: { bars: s.MAX_GRID_BARS },
		});
	return ok({ bars: from.bars, pickup: null, grid: null, reading: r.reading }, warnings);
}

/** The bars to build on: the placed grid, or the declared one when allowed; else the grid's refusal. */
function barsOf(
	c: Checked,
	f: Features,
	s: Settings,
): Ok<Bars> | Refused<{ reading: GridReading | null }> {
	const { given } = c;
	const input = { features: f, chords: given.chords, declared: given.declared, startAt: c.startAt };
	const grid = gridWith(input, s);
	if (grid.ok) {
		const { value } = grid;
		const bars = {
			bars: value.grid.bars,
			pickup: value.pickup?.start ?? null,
			grid: value,
			reading: value.reading,
		};
		return ok(bars, grid.warnings);
	}
	const unplaced = grid.refusals.every((x) => UNPLACED.has(x.reason));
	if (!unplaced || c.onUnplaced !== "declared") return grid;
	const declared = onDeclared(c, f, s, grid);
	return declared.ok ? declared : { ...declared, reading: grid.reading };
}

/** What the builder reads: the grid, the pickup, the chords, the declared meter and what is passed as given. */
function detectionsOf(c: Checked, b: Bars, f: Features): Detections {
	const { given } = c;
	const meter = (given.declared as Declared).meter;
	const d: Detections = {
		grid: { bars: b.bars },
		chords: given.chords as ListenChordRuns,
		meter,
		recording: c.id === undefined ? { duration: f.duration } : { id: c.id, duration: f.duration },
	};
	if (b.pickup !== null) d.pickup = { start: b.pickup };
	if (given.title !== undefined) d.title = given.title as string;
	if (given.key !== undefined) d.key = given.key as Detected<string> | null;
	if (given.sections !== undefined)
		d.sections = given.sections as NonNullable<Detections["sections"]>;
	if (given.changes !== undefined) d.changes = given.changes as Change[];
	return d;
}

/** The builder on the bars: its chart, map and confidence, or its error as `invalid-input`. */
function build(c: Checked, b: Bars, f: Features, options: BuildOptions | undefined) {
	const built = chartFromDetections(detectionsOf(c, b, f), options);
	const error = built.diagnostics.find((d) => d.severity === "error");
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
}

/** The pipeline on a checked input and resolved options. */
function run(
	c: Checked,
	s: Settings,
	build_: BuildOptions | undefined,
	options: unknown,
): PipelineResult {
	const features = featuresOf(c, s, options);
	if (!features.ok) return refusedWith(features, null, null);
	const f = features.value;
	const bars = barsOf(c, f, s);
	if (!bars.ok) return refusedWith(bars, bars.reading, f);
	const { value: b, warnings } = bars;
	let built: ReturnType<typeof build>;
	try {
		built = build(c, b, f, build_);
	} catch {
		built = invalid("input", "The builder could not read the detections.");
	}
	if (isRefusal(built)) return refusedWith(refused([built]), b.reading, f, warnings);
	return ok({ ...built, grid: b.grid, reading: b.reading, features: f }, warnings);
}

/**
 * A chart, its timing map and its confidence record from a recording
 * (design §6.4). In order: the options (`invalid-option`: those of
 * `findGrid` and the features, and `build`, an object passed to the
 * builder); the input (`invalid-input` with `detail.field`): exactly one
 * recording, `features` or `samples` with `sampleRate` (Ruling 7), the
 * chords an object, `declared`, `startAt`, `onUnplaced` and
 * `recording.id`; the features, read back (`features-invalid`,
 * `features-version`, and `invalid-option` when a sound option disagrees
 * with the record's own) or computed from the samples; then `findGrid`.
 *
 * When the grid cannot be placed (`no-period`, `downbeat-undecided`,
 * `nothing-fits`), the pipeline refuses with the reading and the features,
 * unless `onUnplaced` is `"declared"`: then bar one is at `startAt ?? 0`
 * on the declared bar to the recording's end (`declaredGrid`), with
 * `bar-one-unplaced` naming the refusal it replaced and the reading kept;
 * a declared grid that fits nothing is the original refusal plus
 * `nothing-fits`. Input and option refusals are never replaced.
 *
 * Then `chartFromDetections` with the grid, the pickup's start when there
 * is one, the chords, the declared meter, the title, key, sections and
 * changes as given, and `recording: { id, duration }`, the duration the
 * recording's length (the app passes the grid's end). No tempo: the
 * builder derives it from the grid. A builder error (only
 * `grid-unusable`, which cannot follow a placed grid) is `invalid-input`
 * with the builder's message.
 */
export function chartFromRecording(
	input: RecordingInput,
	options?: PipelineOptions,
): PipelineResult {
	const resolved = resolveOptions(options, "pipeline");
	if (!resolved.ok) return refusedWith(resolved, null, null);
	const { settings, build: buildOptions } = resolved.value;
	let checked: Checked | Refusal;
	try {
		checked = readInput(input);
	} catch {
		checked = invalid("input", "The pipeline's input could not be read.");
	}
	if (isRefusal(checked)) return refusedWith(refused([checked]), null, null);
	try {
		return run(checked, settings, buildOptions, options);
	} catch {
		return refusedWith(
			refused([invalid("input", "The pipeline's input could not be read.")]),
			null,
			null,
		);
	}
}
