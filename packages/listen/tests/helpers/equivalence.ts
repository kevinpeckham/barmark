/**
 * The equivalence with the app (design §11.2 item 4, Task 16), shared by
 * `scripts/listen-equivalence.ts`, which runs the app's own modules and
 * writes the goldens, and `tests/equivalence.test.ts`, which checks the
 * package against them: the seeded synthetic cases, the chart each song
 * is aligned with, the golden's JSON (exact numbers, `-0` and the
 * non-finite ones included), and the named adapters of §11.3, each a pure
 * function from the app's value to the package's.
 */
import { beatsOf, parseChart, parseMeter } from "barmark";
import type { alignChart } from "../../src/align/align.js";
import { alignmentFit } from "../../src/align/fit.js";
import type { Alignment } from "../../src/align/path.js";
import { alignedTimingMap } from "../../src/align/timing.js";
import type { Features } from "../../src/features/index.js";
import { DEFAULTS } from "../../src/options.js";
import { fnv1a64Bytes } from "./hash.js";
import type { SynthSong, SynthSpec } from "./synthetic.js";

/** A seeded synthetic song and the tempo the app's song stores (its bottom note's bpm). */
export type EquivalenceCase = { name: string; spec: SynthSpec; appTempo: number };

const base = { downbeat: 0, harmony: "changing" as const };

/** The fourteen cases (Task 16): tempos, meters, pickups, a lead-in, a mid-bar start, flat harmony. */
export const EQUIVALENCE_CASES: EquivalenceCase[] = [
	{
		name: "4-4-at-60",
		spec: { ...base, meter: "4/4", tempo: 60, bars: 10, seed: 1601 },
		appTempo: 60,
	},
	{
		name: "4-4-at-96",
		spec: { ...base, meter: "4/4", tempo: 96, bars: 14, seed: 1602 },
		appTempo: 96,
	},
	{
		name: "4-4-at-120",
		spec: { ...base, meter: "4/4", tempo: 120, bars: 16, seed: 1603 },
		appTempo: 120,
	},
	{
		name: "4-4-at-160",
		spec: { ...base, meter: "4/4", tempo: 160, bars: 20, seed: 1604 },
		appTempo: 160,
	},
	{
		name: "4-4-at-224",
		spec: { ...base, meter: "4/4", tempo: 224, bars: 28, seed: 1605 },
		appTempo: 224,
	},
	{
		name: "3-4-at-90",
		spec: { ...base, meter: "3/4", tempo: 90, bars: 16, seed: 1606 },
		appTempo: 90,
	},
	{
		name: "3-4-at-180",
		spec: { ...base, meter: "3/4", tempo: 180, bars: 24, seed: 1607 },
		appTempo: 180,
	},
	// 6/8: grammar 2.1's beat is the dotted quarter; the app's song counts eighths.
	{
		name: "6-8-at-40",
		spec: { ...base, meter: "6/8", tempo: 40, bars: 12, seed: 1608 },
		appTempo: 120,
	},
	{
		name: "6-8-at-60",
		spec: { ...base, meter: "6/8", tempo: 60, bars: 16, seed: 1609 },
		appTempo: 180,
	},
	{
		name: "pickup-one-beat",
		spec: { ...base, meter: "4/4", tempo: 120, bars: 16, downbeat: 2, pickupBeats: 1, seed: 1610 },
		appTempo: 120,
	},
	{
		name: "pickup-two-beats",
		spec: { ...base, meter: "4/4", tempo: 120, bars: 16, downbeat: 2, pickupBeats: 2, seed: 1611 },
		appTempo: 120,
	},
	// Three beats before bar one is more than half a bar: a lead-in, no pickup (§7).
	{
		name: "lead-in-three-beats",
		spec: { ...base, meter: "4/4", tempo: 120, bars: 16, downbeat: 2, pickupBeats: 3, seed: 1612 },
		appTempo: 120,
	},
	// The recording starts on beat 2 of bar one.
	{
		name: "mid-bar-start",
		spec: { ...base, meter: "4/4", tempo: 120, bars: 16, downbeat: -0.5, seed: 1613 },
		appTempo: 120,
	},
	// Flat harmony, bar one a quarter second in: no chord changes, time zero off the lattice; undecided (Task 14).
	{
		name: "flat-harmony",
		spec: {
			...base,
			meter: "4/4",
			tempo: 120,
			bars: 16,
			downbeat: 0.25,
			harmony: "flat",
			seed: 1614,
		},
		appTempo: 120,
	},
];

/** The synthetic songs' Harte labels in barmark's spelling. */
const SPELLED: Record<string, string> = {
	C: "C",
	F: "F",
	G: "G",
	"A:min": "Am",
	"D:min": "Dm",
	"E:min": "Em",
	Bb: "Bb",
	D: "D",
};

/** The song's own chart: its `time:` and `tempo:`, the pickup (or lead-in) as a one-bar meter, four bars a line. */
export function songChart(spec: SynthSpec, song: SynthSong): string {
	const meter = parseMeter(spec.meter);
	if (!meter) throw new Error(`songChart: no meter ${spec.meter}`);
	const cells = song.truth.labels.map((label) => {
		const symbol = SPELLED[label];
		if (symbol === undefined) throw new Error(`songChart: no spelling for ${label}`);
		return symbol;
	});
	if (spec.pickupBeats) cells.unshift(`[${spec.pickupBeats}/${meter.d}] ${cells[0]}`);
	const lines: string[] = [];
	for (let i = 0; i < cells.length; i += 4) lines.push(`| ${cells.slice(i, i + 4).join(" | ")} |`);
	return `time: ${spec.meter}, tempo: ${spec.tempo}\n${lines.join("\n")}\n`;
}

/** The app's song-unit tempo in grammar 2.1's beat (§12.3): `value × beatsOf(meter) / meter.n`. */
export function grammarTempo(meter: string, appTempo: number): number {
	const m = parseMeter(meter);
	if (!m) throw new Error(`grammarTempo: no meter ${meter}`);
	return (appTempo * beatsOf(m)) / m.n;
}

// ── The golden's JSON: every number exact, `-0`, `NaN` and the infinities tagged.

const TAG = "$number";

/** JSON with every number exact: `-0`, `NaN` and ±`Infinity` as `{ "$number": "…" }`. */
export function toGoldenJson(value: unknown): string {
	return `${JSON.stringify(
		value,
		(_, v) =>
			typeof v === "number" && (!Number.isFinite(v) || Object.is(v, -0))
				? { [TAG]: Object.is(v, -0) ? "-0" : String(v) }
				: v,
		"\t",
	)}\n`;
}

/** The golden's JSON read back, the tagged numbers restored. */
export function fromGoldenJson(text: string): unknown {
	return JSON.parse(text, (_, v) =>
		v !== null &&
		typeof v === "object" &&
		!Array.isArray(v) &&
		Object.keys(v).length === 1 &&
		TAG in v
			? Number((v as Record<string, string>)[TAG])
			: v,
	);
}

// ── The goldens: the app's outputs, numbers and labels only.

export type AppWitness = {
	name: string;
	cls: number | null;
	weight: number;
	detail: Record<string, unknown>;
};

export type Golden = {
	app: { commit: string; date: string };
	case: EquivalenceCase & { chart: string };
	features: {
		chromaHash: string;
		onsetHash: string;
		frames: number;
		hopSec: number;
		fps: number;
		firstSound: number;
		lastSound: number;
	};
	/** `chartlessGrid` on the app's declared bar (`barSecondsAt`) and the song's runs; `cls`/`decided` from its vote. */
	grid: {
		ok: boolean;
		reason?: string;
		barStarts?: number[];
		period?: number;
		cls: number;
		decided: boolean;
		witnesses: AppWitness[];
	};
	alignment: {
		barStarts: number[];
		rawBarStarts: number[];
		repair: unknown;
		cost: number;
		controlCost: number;
		localCost: number[];
		firstSound: number;
		lastSound: number;
	};
	fit: { bar1: number; medianBar: number; declaredBar: number; ratio: number; reasons: string[] };
	placements: {
		ratio: number;
		samePiece: boolean;
		sections: unknown[];
		keyChanges: unknown[];
		tempoChanges: { at: number; bpm: number; hedged: boolean }[];
	};
	timing: unknown;
	/** `buildChartFromDetections` on the placed grid, or on `barStartsFrom(0, declared bar, duration)` when it refused. */
	build: {
		on: "placed" | "declared";
		grid: number[];
		chart: string;
		timing: { recording: { duration: number }; bars: { bar: number; start: number }[] } & Record<
			string,
			unknown
		>;
		confidence: { bars: unknown[] } & Record<string, unknown>;
		diagnostics: { level: string; message: string }[];
	};
};

// ── The named adapters (§11.3, §12.8), each the app's value as the package gives it.

/** §12.8: the app's grid refusals by the package's names. */
export const GRID_REASONS: Record<string, string> = {
	"no-input": "invalid-input",
	undecided: "downbeat-undecided",
	"no-fit": "nothing-fits",
};

/** The fit's reasons: the app's sentences (`utils/alignmentFit.ts`) by the package's names. */
const FIT_REASONS: [string, string][] = [
	["bar 1 at ", "bar-one-far"],
	[" where the tempo says ", "bar-length-off"],
	["little better than a wrong one", "weak-fit"],
	["do not line up with the recording through its middle", "bars-off-middle"],
	["too few bars", "no-bars"],
];

/** An app sentence's name; a sentence no row names throws, so a new reason is never silently passed. */
export function fitReasonName(sentence: string): string {
	const row = FIT_REASONS.find(([text]) => sentence.includes(text));
	if (!row) throw new Error(`no name for the app's fit reason "${sentence}"`);
	return row[1];
}

/** §11.3: a tempo change's bpm from the app's bottom-note unit to grammar 2.1's beat. */
export function tempoChangeAsListen(
	change: { at: number; bpm: number; hedged: boolean },
	meter: string,
) {
	return { ...change, bpm: grammarTempo(meter, change.bpm) };
}

/**
 * §7: a pickup's grid. The app places bars from `a` (its
 * `placeChartlessGrid`, the formula copied here), clamping the first at
 * 0:00; the package makes the bar from `a` the pickup, starting at the
 * first sound's beat `max(0, a + j × beat)`, and the written bar 1 is the
 * app's bar 2, so the bar starts shift by one bar. `a` is returned so the
 * caller can check it against the app's own starts (`max(0, a)`, `a + period`).
 */
export function pickupAsListen(
	appBarStarts: number[],
	lattice: { anchor: number; beat: number; period: number; beatsPerBar: number },
	cls: number,
	firstSound: number,
	slackBeats: number,
	pickupBeats: number,
) {
	const { anchor, beat, period, beatsPerBar } = lattice;
	const base = anchor + cls * beat;
	const a = base + Math.floor((firstSound + slackBeats * beat - base) / period) * period;
	const j = beatsPerBar - pickupBeats;
	return {
		a,
		bars: appBarStarts.slice(1),
		pickup: { start: Math.max(0, a + j * beat), beats: pickupBeats },
	};
}

/** The app's aligned map, as far as the adapter reads it. */
type AppMap = {
	recording: { duration: number };
	bars: { bar: number; start: number }[];
	end: number;
} & Record<string, unknown>;

/**
 * §11.3 (0.1.1): the package clamps its aligned map to the recording,
 * [0, `recording.duration`]; the app keeps the re-phased lines a few
 * milliseconds before 0:00 or past the end. The app's map with every start
 * and the end clamped; null (no map) when the clamp leaves a bar no length,
 * a bar wholly outside the recording, which the package refuses
 * (`map-invalid`). The app's null map stays null.
 */
export function timingAsListen(app: unknown): unknown {
	if (app === null) return null;
	const map = app as AppMap;
	const d = map.recording.duration;
	const clamp = (t: number) => Math.min(d, Math.max(0, t));
	const bars = map.bars.map((b) => ({ ...b, start: clamp(b.start) }));
	const end = clamp(map.end);
	const lines = [...bars.map((b) => b.start), end];
	if (lines.some((t, i) => i > 0 && t <= (lines[i - 1] as number))) return null;
	return { ...map, bars, end };
}

/** The title both sides give the built chart. */
export const songTitle = (name: string) => `Equivalence ${name}`;

/**
 * Task 10's three hand-written charts with an unreadable chord (§11.3): the
 * app's barmark 0.22 drops the line, the package keeps its bars (PR #250).
 * Excluded by name from every comparison, and compared on their own.
 */
export const UNREADABLE_CHARTS = ["| F |\n| CM7 |\n| G |", "| C |\n| C(7)sus4 |", "| riff | D |"];

/** The app's played bars for each (`barmarkChartBars` at tempo 120 in 4/4; 0 when it reads none). */
export type UnreadableGolden = {
	app: { commit: string; date: string };
	charts: { chart: string; appBars: number }[];
};

// ── Each side's values in the golden's shape.

/** The features as the golden records them; the app's chroma and envelope come from two calls, laid together. */
export function featuresSummary(f: {
	chroma: Float32Array;
	onset: Float32Array;
	frames: number;
	hopSec: number;
	fps: number;
	firstSound: number;
	lastSound: number;
}): Golden["features"] {
	return {
		chromaHash: fnv1a64Bytes(f.chroma),
		onsetHash: fnv1a64Bytes(f.onset),
		frames: f.frames,
		hopSec: f.hopSec,
		fps: f.fps,
		firstSound: f.firstSound,
		lastSound: f.lastSound,
	};
}

/** The alignment as the golden records it (the app's `Alignment` fields). */
export function alignmentSummary(a: Golden["alignment"]): Golden["alignment"] {
	return {
		barStarts: a.barStarts,
		rawBarStarts: a.rawBarStarts,
		repair: a.repair,
		cost: a.cost,
		controlCost: a.controlCost,
		localCost: a.localCost,
		firstSound: a.firstSound,
		lastSound: a.lastSound,
	};
}

/** The builder's diagnostics in the app's shape (`server/chartBuild.ts`): errors and warnings, no info. */
export function diagnosticsAsApp(diagnostics: { severity: string; message: string }[]) {
	return diagnostics.flatMap((d) =>
		d.severity === "info" ? [] : [{ level: d.severity, message: d.message }],
	);
}

type Aligned = ReturnType<typeof alignChart>;

/**
 * `alignChart`'s alignment, placements and fit whether it kept the map or
 * refused it (the fit then from the stage, on the declared bar), with the
 * refusals' names.
 */
export function alignedParts(aligned: Aligned, declared: { meter: string; tempo: number }) {
	if (aligned.ok) return { ...aligned.value, refusals: [] as string[] };
	const { alignment, placements } = aligned;
	const meter = parseMeter(declared.meter);
	if (!alignment || !placements || !meter)
		throw new Error(`refused before the warping: ${aligned.refusals.map((x) => x.reason)}`);
	const refusals: string[] = aligned.refusals.map((x) => x.reason);
	const barSeconds = (beatsOf(meter) * 60) / declared.tempo;
	const flat = refusals.includes("no-period");
	const { fit } = alignmentFit(alignment, { startAt: 0, barSeconds }, flat, DEFAULTS);
	return { alignment: alignment as Alignment, placements, fit, refusals };
}

/**
 * The map on the alignment's bar starts: the app makes it, then keeps it
 * only when the fit is ok (`state/songCheck.svelte.ts`'s `#keepTiming`);
 * the package refuses with the fit's reasons, so its map on the same starts
 * comes from the stage.
 */
export function mapOf(aligned: Aligned, chart: string, features: Features, barStarts: number[]) {
	if (aligned.ok) return aligned.value.timing;
	return alignedTimingMap(chart, parseChart(chart), barStarts, features.duration, undefined);
}
