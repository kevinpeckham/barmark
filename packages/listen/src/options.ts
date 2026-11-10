import type { BuildOptions } from "@barmark/sync";
import { type Ok, ok, type Refusal, type Refused, refusal, refused } from "./result.js";

/** The chartless downbeat vote's weights. */
export type DownbeatWeights = { timeZero: number; harmonicRhythm: number; sections: number };

/** Every constant of design 5.1 and 5.2 but the two sound ones; each is optional and merged over `DEFAULTS`. */
export type ListenOptions = Partial<{
	ALIGNMENT_SAME_PIECE_RATIO: number;
	ALIGNMENT_SAME_PIECE_LOCAL_COST: number;
	REPAIR_TRUST_FRACTION: number;
	REPAIR_SLIDE_FRACTION: number;
	REPHASE_FENCE_BEATS: number;
	ONSET_ENVELOPE_LEAD_SEC: number;
	REPAIR_SLIDE_STEP_SEC: number;
	REPAIR_MIN_TRUSTED_SHARE: number;
	COMB_RANGE_FRACTION: number;
	COMB_COARSE_STEP_FRACTION: number;
	COMB_FINE_STEP_FRACTION: number;
	COMB_PHASE_STEP_SEC: number;
	TIME_ZERO_SNAP_BEATS: number;
	DOWNBEAT_WEIGHTS: Partial<DownbeatWeights>;
	DOWNBEAT_MIN_SCORE: number;
	DOWNBEAT_OFF_COMB_MARGIN: number;
	HARMONIC_MIN_RATIO: number;
	SECTION_NOVELTY_SPANS: readonly number[];
	PLACEMENT_FIRST_SOUND_SLACK_BEATS: number;
	FIT_BAR_TOLERANCE: number;
	FIT_MIN_RATIO: number;
	SECTION_START_SNAP_SEC: number;
	HEDGE_LOCAL_COST_FACTOR: number;
	DTW_MAX_CELLS: number;
	MAX_GRID_BARS: number;
	PICKUP_MAX_BAR_FRACTION: number;
}>;

/** The two options that change `firstSound` and `lastSound`, so only the features accept them. */
export type FeatureOptions = Partial<{
	ALIGNMENT_SOUND_FLOOR: number;
	ALIGNMENT_SOUND_WINDOW_SEC: number;
}>;

/** Every option, resolved. */
export type Settings = Readonly<
	Required<Omit<ListenOptions, "DOWNBEAT_WEIGHTS">> & Required<FeatureOptions>
> & {
	readonly DOWNBEAT_WEIGHTS: Readonly<DownbeatWeights>;
};

const DOWNBEAT_WEIGHTS_DEFAULT: Readonly<DownbeatWeights> = Object.freeze({
	timeZero: 2,
	harmonicRhythm: 2,
	sections: 1,
});
const SPANS_DEFAULT: readonly number[] = Object.freeze([8, 16]);

/** Every option with its default, deep-frozen. Each key carries the doc comment of its origin. */
export const DEFAULTS: Settings = Object.freeze({
	/**
	 * How many times the tritone control's path cost must exceed the chart's
	 * for the chart to count as this recording (utils/alignedPlacements.ts).
	 * stem-bench Study 14 measured it on real recordings: the band's own,
	 * correct charts scored 2.04 and 2.53, another song's chart 1.17 and 1.24,
	 * and 1.6 sits at the midpoint of that gap. The first value, 3, came from
	 * synthetic renders (ratios of 24 to 49), where the chart and the audio
	 * are the same pads; real playing is never that close, and at 3 every
	 * correct chart read as "not this recording". The caveat: two songs of
	 * one band, two charts a class. The ratio alone is not enough: see
	 * `ALIGNMENT_SAME_PIECE_LOCAL_COST`.
	 */
	ALIGNMENT_SAME_PIECE_RATIO: 1.6,
	/**
	 * The most the median of the path's per-bar local cost may be for the
	 * chart to count as this recording; both this and the ratio must hold
	 * (utils/alignedPlacements.ts). stem-bench Study 15 proposed it and
	 * Study 16 (2026-11-01) made it necessary: one real wrong pairing, the
	 * Eat All the Clocks recording against the Mop Heart chart, scores a
	 * ratio of 1.74, over the 1.6 gate, and only its median local cost of
	 * 0.323 tells it apart; the band's correct charts sit well under 0.30.
	 */
	ALIGNMENT_SAME_PIECE_LOCAL_COST: 0.3,
	/**
	 * The share of the recording's loudest window's RMS that counts as
	 * audible (audio/chartAlignment.ts `audibleSpan`): 0.02 is 34 dB under
	 * the peak, above a quiet room's noise and a lossy encoder's hiss, below
	 * a soft pick-up note. The first and last audible windows anchor the
	 * first and last sections (stem-bench Study 14's FIRST-ONSET and
	 * LAST-SOUND rules).
	 */
	ALIGNMENT_SOUND_FLOOR: 0.02,
	/** The RMS window for `ALIGNMENT_SOUND_FLOOR`, in seconds: short enough to place an onset within it. */
	ALIGNMENT_SOUND_WINDOW_SEC: 0.05,
	/**
	 * How far from the middle's lattice a bar start may sit and still be
	 * trusted, as a share of the bar (audio/alignmentRepair.ts
	 * `trustedSpan`; stem-bench Study 26c): a quarter bar, the tolerance the
	 * bench scored the ends at, wide enough for a played bar's wobble and
	 * narrow enough that the warping's compressed intro bars (half-length on
	 * Letter Lands) fall outside it.
	 */
	REPAIR_TRUST_FRACTION: 0.25,
	/**
	 * How far an extrapolated end may slide onto the recording's onsets, as a
	 * share of the bar (stem-bench Study 26c, the v3 fence): ±0.25 bar. Study
	 * 26b's ±0.5 reaches the half-bar backbeat, which can outscore the
	 * downbeat, and moved Peaceful Dreams' intro 0.60 s off; the quarter-bar
	 * fence fixed it and kept Letter Lands at 0.05/0.02 s.
	 */
	REPAIR_SLIDE_FRACTION: 0.25,
	/**
	 * How far the whole grid may slide onto the recording's onsets, in beats
	 * (audio/alignmentRepair.ts `rephaseGrid`; stem-bench Study 27, recipe
	 * v5): ±0.5 beat, the bar divided by the meter's beats. At fast tempos the
	 * warping's middle sits a coherent sub-beat off the notes (Mop Heart, 224
	 * bpm in 3/4: 0.42 s); half a beat reaches that and never the neighboring
	 * beat, which could outscore the downbeat. Gates passed on all four bench
	 * songs; the refusal is unchanged.
	 */
	REPHASE_FENCE_BEATS: 0.5,
	/**
	 * How early the onset envelope (audio/analysis.ts `onsetEnvelope`) reads an
	 * onset, in seconds: each frame is stamped at its window's start, and the
	 * spectral flux peaks as the onset enters the 2048-sample window (93 ms at
	 * 22 050 Hz), so a hard onset peaks about 70 ms before it sounds and an
	 * 80 ms attack about 50 ms before (measured 2026-11-08 on synthetic hits
	 * with 0, 10, 30 and 80 ms attacks: 75, 68, 60 and 54 ms early). The
	 * drums carry the lattice the grid re-phase slides onto, so the lead is the
	 * hard-onset figure; `repairAlignment` adds it to the re-phased starts.
	 * Recipe v3 kept the warping's own starts through the middle and did not
	 * show it; v5 puts every bar on the envelope's lattice and would inherit
	 * it. The bench measured Study 27 through the same envelope: its 50–70 ms
	 * residuals on the real songs are this lead.
	 */
	ONSET_ENVELOPE_LEAD_SEC: 0.07,
	/** The end slide's step in seconds (Study 26c): 10 ms, finer than the onset envelope's frames matter for. */
	REPAIR_SLIDE_STEP_SEC: 0.01,
	/**
	 * The least share of the bar starts the trusted span must cover, or the
	 * repair refuses (Study 26c): under half means the chart does not line up
	 * with the recording's middle, which on the bench marked the one wrong
	 * pairing (Eat All the Clocks against its fixture chart) and no right one.
	 */
	REPAIR_MIN_TRUSTED_SHARE: 0.5,
	/**
	 * The onset comb's search around the declared bar (stem-bench Study 24,
	 * as Study 26c uses it): ±10 %, which keeps out the half- and
	 * double-bar lattices the objective would prefer by degeneracy; a 0.2 %
	 * coarse step, then 0.02 % around the coarse best; the phase in 10 ms
	 * steps.
	 */
	COMB_RANGE_FRACTION: 0.1,
	/**
	 * The onset comb's search around the declared bar (stem-bench Study 24,
	 * as Study 26c uses it): ±10 %, which keeps out the half- and
	 * double-bar lattices the objective would prefer by degeneracy; a 0.2 %
	 * coarse step, then 0.02 % around the coarse best; the phase in 10 ms
	 * steps.
	 */
	COMB_COARSE_STEP_FRACTION: 0.002,
	/**
	 * The onset comb's search around the declared bar (stem-bench Study 24,
	 * as Study 26c uses it): ±10 %, which keeps out the half- and
	 * double-bar lattices the objective would prefer by degeneracy; a 0.2 %
	 * coarse step, then 0.02 % around the coarse best; the phase in 10 ms
	 * steps.
	 */
	COMB_FINE_STEP_FRACTION: 0.0002,
	/**
	 * The onset comb's search around the declared bar (stem-bench Study 24,
	 * as Study 26c uses it): ±10 %, which keeps out the half- and
	 * double-bar lattices the objective would prefer by degeneracy; a 0.2 %
	 * coarse step, then 0.02 % around the coarse best; the phase in 10 ms
	 * steps.
	 */
	COMB_PHASE_STEP_SEC: 0.01,
	/**
	 * How near time zero a lattice beat must sit for the recording's start to
	 * vote it bar one, in beats (audio/chartlessGrid.ts `timeZeroWitness`;
	 * stem-bench Study 31): a quarter beat. A DAW export starts on a bar line,
	 * and on all four bench songs the nearest lead-corrected beat sat 0.058 to
	 * 0.079 s from zero, which was the envelope's lead; a song that starts
	 * mid-bar sits further off and the witness abstains.
	 */
	TIME_ZERO_SNAP_BEATS: 0.25,
	/**
	 * The chartless downbeat vote's weights (audio/chartlessGrid.ts
	 * `downbeatVote`; stem-bench Study 31, registered before it ran): the
	 * recording's start 2, the chord changes 2, the section changes 1. Each
	 * witness found bar one on the bench songs it voted on (the start on all
	 * four, the chord changes four of four, the sections four of four).
	 */
	DOWNBEAT_WEIGHTS: DOWNBEAT_WEIGHTS_DEFAULT,
	/**
	 * The least score a class needs to win the vote (Study 31's rule): 2, one
	 * full witness, so the section witness alone never places the bars.
	 */
	DOWNBEAT_MIN_SCORE: 2,
	/**
	 * How far a class must outscore the comb's own bar phase (class 0) to move
	 * bar one off it (Study 31's rule): by 2, a full witness's weight. The
	 * comb's phase is a lattice point already, so a move needs a clear case,
	 * not the section witness breaking a tie.
	 */
	DOWNBEAT_OFF_COMB_MARGIN: 2,
	/**
	 * The chord-change witness abstains unless its top beat class holds at
	 * least 1.2 times the changes of the runner-up. The thinnest margin the
	 * bench saw right was 1.27 (Study 31, 33 changes against 26); a flatter
	 * histogram is a song whose harmony moves on every beat, or a recording cut
	 * off the beat (Study 32: a 0.3-beat pad thinned the histogram and put time
	 * zero off the lattice at once, and the one witness left could not decide).
	 * The bench's validated run of the vote applied the rule this way, to the
	 * witness rather than to the winner alone (Study 32, 2026-11-08).
	 */
	HARMONIC_MIN_RATIO: 1.2,
	/**
	 * The checkerboard kernels' half widths in beats (audio/chartlessGrid.ts
	 * `sectionWitness`; stem-bench Study 31): 8 and 16, two and four bars of 4/4, the
	 * scales a phrase and a section change at; peaks from both are pooled.
	 */
	SECTION_NOVELTY_SPANS: SPANS_DEFAULT,
	/**
	 * How far past the first sound a placed bar one may begin, in beats
	 * (audio/chartlessGrid.ts `placeChartlessGrid`; Study 31c): a quarter
	 * beat, the envelope's slop, so a song that starts on its downbeat keeps
	 * that downbeat as bar one instead of a bar of silence before it.
	 */
	PLACEMENT_FIRST_SOUND_SLACK_BEATS: 0.25,
	/** How far the median aligned bar may be from the declared bar, as a share of it, before the fit refuses (`utils/alignmentFit.ts` `BAR_TOLERANCE`). Set in the app, not by a study. */
	FIT_BAR_TOLERANCE: 0.15,
	/** The least control-to-chart path cost ratio the fit accepts (`utils/alignmentFit.ts` `MIN_RATIO`). Set in the app, not by a study. */
	FIT_MIN_RATIO: 1.5,
	/** How near a section start may sit to a bar start to snap onto it, in seconds (`utils/alignedPlacements.ts` `START_SNAP`). Set in the app, not by a study. */
	SECTION_START_SNAP_SEC: 0.25,
	/** A placement is hedged when its local cost exceeds this many times the median local cost (`utils/alignedPlacements.ts`, `2 * localMedian`). Set in the app, not by a study. */
	HEDGE_LOCAL_COST_FACTOR: 2,
	/** The most cells the warping may fill, chart frames times recording frames (`audio/chartAlignment.ts` `MAX_CELLS`). Set in the app, not by a study. */
	DTW_MAX_CELLS: 150_000_000,
	/** The most bars a chartless grid may hold (`audio/chartlessGrid.ts` `MAX_BARS`, the app's `ChartDraftSchema` limit). Set in the app, not by a study. */
	MAX_GRID_BARS: 2000,
	/** The longest pickup the grid reports, as a share of the bar (design §7). Set in the design, not by a study; Study 34's pickup slot is to confirm or move it. */
	PICKUP_MAX_BAR_FRACTION: 0.5,
});

/** Which options a call accepts: the feature functions, the grid and alignment stages, or the pipeline (both, plus `build`). */
export type OptionScope = "features" | "listen" | "pipeline";

const FEATURE_KEYS = ["ALIGNMENT_SOUND_FLOOR", "ALIGNMENT_SOUND_WINDOW_SEC"];

type Check = (v: number) => boolean;
const atLeast =
	(min: number): Check =>
	(v) =>
		v >= min;
const upTo1: Check = (v) => v > 0 && v <= 1;
const positive: Check = (v) => v > 0;
const whole: Check = (v) => Number.isInteger(v) && v >= 1;

/** The numeric options and the range each accepts (design 5.1 and 5.2). */
const RANGES: Record<string, Check> = {
	ALIGNMENT_SAME_PIECE_RATIO: atLeast(1),
	ALIGNMENT_SAME_PIECE_LOCAL_COST: upTo1,
	ALIGNMENT_SOUND_FLOOR: upTo1,
	ALIGNMENT_SOUND_WINDOW_SEC: upTo1,
	REPAIR_TRUST_FRACTION: upTo1,
	REPAIR_SLIDE_FRACTION: upTo1,
	REPHASE_FENCE_BEATS: positive,
	ONSET_ENVELOPE_LEAD_SEC: (v) => v >= 0 && v <= 1,
	REPAIR_SLIDE_STEP_SEC: upTo1,
	REPAIR_MIN_TRUSTED_SHARE: upTo1,
	COMB_RANGE_FRACTION: (v) => v > 0 && v < 1,
	COMB_COARSE_STEP_FRACTION: positive,
	COMB_FINE_STEP_FRACTION: positive,
	COMB_PHASE_STEP_SEC: upTo1,
	TIME_ZERO_SNAP_BEATS: positive,
	DOWNBEAT_MIN_SCORE: atLeast(0),
	DOWNBEAT_OFF_COMB_MARGIN: atLeast(0),
	HARMONIC_MIN_RATIO: atLeast(1),
	PLACEMENT_FIRST_SOUND_SLACK_BEATS: (v) => v >= 0 && v < 1,
	FIT_BAR_TOLERANCE: upTo1,
	FIT_MIN_RATIO: atLeast(1),
	SECTION_START_SNAP_SEC: atLeast(0),
	HEDGE_LOCAL_COST_FACTOR: atLeast(1),
	DTW_MAX_CELLS: whole,
	MAX_GRID_BARS: whole,
	PICKUP_MAX_BAR_FRACTION: upTo1,
};

const bad = (option: string, message: string): Refusal =>
	refusal("invalid-option", message, { option });

function isPlainObject(v: unknown): v is Record<string, unknown> {
	if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
	const proto = Object.getPrototypeOf(v);
	return proto === Object.prototype || proto === null;
}

function checkNumber(key: string, value: unknown): Refusal | null {
	const check = Object.hasOwn(RANGES, key) ? RANGES[key] : undefined;
	if (typeof value !== "number" || !Number.isFinite(value) || !check?.(value)) {
		return bad(
			key,
			`Option ${key} is out of its range: ${typeof value === "number" ? value : typeof value}.`,
		);
	}
	return null;
}

function mergeWeights(value: unknown): Readonly<DownbeatWeights> | Refusal {
	const fail = (why: string) => bad("DOWNBEAT_WEIGHTS", `Option DOWNBEAT_WEIGHTS ${why}.`);
	if (!isPlainObject(value))
		return fail("must be an object with timeZero, harmonicRhythm and sections");
	const merged: Record<string, number> = { ...DOWNBEAT_WEIGHTS_DEFAULT };
	for (const [k, w] of Object.entries(value)) {
		if (!Object.hasOwn(merged, k)) return fail(`has an unknown weight "${k}"`);
		if (typeof w !== "number" || !Number.isFinite(w) || w < 0)
			return fail(`needs ${k} to be a number from 0`);
		merged[k] = w;
	}
	return Object.freeze(merged) as Readonly<DownbeatWeights>;
}

function checkSpans(value: unknown): readonly number[] | Refusal {
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		!Array.from(value).every((s) => typeof s === "number" && whole(s))
	) {
		return bad(
			"SECTION_NOVELTY_SPANS",
			"Option SECTION_NOVELTY_SPANS must be a non-empty list of whole numbers from 1.",
		);
	}
	return Object.freeze([...value]) as readonly number[];
}

function checkCombSteps(s: Record<string, unknown>): Refusal | null {
	const range = s.COMB_RANGE_FRACTION as number;
	const coarse = s.COMB_COARSE_STEP_FRACTION as number;
	const fine = s.COMB_FINE_STEP_FRACTION as number;
	if (coarse > range) {
		return bad(
			"COMB_COARSE_STEP_FRACTION",
			"The coarse comb step must not exceed COMB_RANGE_FRACTION.",
		);
	}
	if (fine > coarse) {
		return bad(
			"COMB_FINE_STEP_FRACTION",
			"The fine comb step must not exceed COMB_COARSE_STEP_FRACTION.",
		);
	}
	return null;
}

function acceptedKeys(scope: OptionScope): (key: string) => boolean {
	const isFeature = (k: string) => FEATURE_KEYS.includes(k);
	const isListen = (k: string) => Object.hasOwn(DEFAULTS, k) && !isFeature(k);
	if (scope === "features") return isFeature;
	if (scope === "listen") return isListen;
	return (k) => k === "build" || Object.hasOwn(DEFAULTS, k);
}

/** Check one option and merge it into `merged`; a refusal when it is out of range. `build` is passed through. */
function mergeOption(merged: Record<string, unknown>, key: string, value: unknown): Refusal | null {
	if (key === "build") return null;
	if (key === "DOWNBEAT_WEIGHTS" || key === "SECTION_NOVELTY_SPANS") {
		const r = key === "DOWNBEAT_WEIGHTS" ? mergeWeights(value) : checkSpans(value);
		if ("reason" in r) return r;
		merged[key] = r;
		return null;
	}
	const p = checkNumber(key, value);
	if (!p) merged[key] = value;
	return p;
}

/**
 * Merge `options` over `DEFAULTS` for a scope, refusing an unknown key, a key
 * the scope does not take and a value outside its range. Never throws.
 * `build` (pipeline scope only) is passed through for sync to validate.
 */
export function resolveOptions(
	options: unknown,
	scope: OptionScope,
): Ok<{ settings: Settings; build?: BuildOptions }> | Refused {
	const given = options === undefined ? {} : options;
	if (!isPlainObject(given)) {
		return refused([bad("", "Options must be an object of option names and values.")]);
	}
	const accepts = acceptedKeys(scope);
	const merged: Record<string, unknown> = { ...DEFAULTS };
	const problems: Refusal[] = [];
	for (const [key, value] of Object.entries(given)) {
		const p = accepts(key)
			? mergeOption(merged, key, value)
			: bad(key, `Option ${key} is not an option of this call.`);
		if (p) problems.push(p);
	}
	const build = given.build as BuildOptions | undefined;
	if (problems.length === 0 && scope !== "features") {
		const p = checkCombSteps(merged);
		if (p) problems.push(p);
	}
	if (problems.length > 0) return refused(problems);
	const settings = Object.freeze(merged) as unknown as Settings;
	return ok(build === undefined ? { settings } : { settings, build });
}
