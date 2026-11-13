/**
 * Placing bar one on the lattice, ported from the app's
 * `audio/chartlessGrid.ts` (stem-bench Study 31c), arithmetic in the app's
 * order, with the pickups of design §7 (Rulings 1, 5 and 6), which are new.
 */
import type { Settings } from "../options.js";
import type { ListenWarning } from "../result.js";
import type { Lattice } from "./lattice.js";

/** Bar one's start and the bars after it with the end, the pickup before it, and what was noticed. */
export type Placement = {
	bars: number[];
	pickup: { start: number; beats: number } | null;
	warnings: ListenWarning[];
};

/**
 * Bar starts every `period` from bar `skip` of a grid whose bar 0 starts
 * at `a`, each `a + i × period` as the app computes it, while under
 * `duration` and at most `max` of them, then the end (the next start, or
 * the duration). A first start before zero is clamped to it. Null when
 * the first start is not before `duration`.
 */
function barsFrom(a: number, skip: number, period: number, duration: number, max: number) {
	if (!(a + skip * period < duration)) return null;
	const bars = [Math.max(0, a + skip * period)];
	for (let i = skip + 1; a + i * period < duration && bars.length < max; i++)
		bars.push(a + i * period);
	const truncated = bars.length === max && a + (skip + max) * period < duration;
	bars.push(Math.min(duration, a + (skip + bars.length) * period));
	return { bars, truncated };
}

/**
 * Bar starts every `period` from `a` while under `duration`, at most `max`
 * of them (`MAX_GRID_BARS`), then the end (the next start, or the
 * duration): the shape `barStartsOf` returns. A first start before zero is
 * clamped to it (the grid takes no negative time); null when nothing fits.
 * `truncated` when it stopped at `max` before the recording's end. The
 * app's `barStartsFrom`; `truncated` is new (the app cut silently).
 */
export function barStartsFrom(
	a: number,
	period: number,
	duration: number,
	max: number,
): { bars: number[]; truncated: boolean } | null {
	return barsFrom(a, 0, period, duration, max);
}

/** The placement of bars from bar `skip` of the grid from `a`, warned when clamped or cut; null when nothing fits. */
function placed(
	a: number,
	skip: number,
	lattice: Lattice,
	duration: number,
	s: Settings,
	pickup: Placement["pickup"],
): Placement | null {
	const from = barsFrom(a, skip, lattice.period, duration, s.MAX_GRID_BARS);
	if (!from) return null;
	const start = a + skip * lattice.period;
	const warnings: ListenWarning[] = [];
	if (pickup) warnings.push(pickupWarning(pickup));
	if (start < 0)
		warnings.push({
			code: "bar-one-clamped",
			message: `Bar one fell ${(-start).toFixed(2)} s before the recording's start and starts at 0:00.`,
			detail: { start },
		});
	if (from.truncated)
		warnings.push({
			code: "grid-truncated",
			message: `The grid stops at ${s.MAX_GRID_BARS} bars, before the recording's end.`,
			detail: { bars: s.MAX_GRID_BARS },
		});
	return { bars: from.bars, pickup, warnings };
}

export function pickupWarning(pickup: { start: number; beats: number }): ListenWarning {
	const beats = pickup.beats === 1 ? "1 beat" : `${pickup.beats} beats`;
	return {
		code: "pickup",
		message: `A pickup of ${beats} starts at ${pickup.start.toFixed(2)} s, before bar one.`,
		detail: { start: pickup.start, beats: pickup.beats },
	};
}

/** The lattice beats from `a` the first sound (with the slack) comes on: design §7's `j`. */
function beatsInto(a: number, firstSound: number, lattice: Lattice, s: Settings): number {
	return Math.floor((firstSound - a) / lattice.beat + s.PLACEMENT_FIRST_SOUND_SLACK_BEATS);
}

/** A pickup `j` beats into the bar from `a`: it starts at that beat (0:00 at the earliest) and lasts the bar's other beats. */
function pickupAt(a: number, j: number, lattice: Lattice) {
	return { start: Math.max(0, a + j * lattice.beat), beats: lattice.beatsPerBar - j };
}

/**
 * Bar one for a voted class (Study 31c): the class names a lattice point
 * modulo one bar, so the representative `a` is the latest of the class's
 * points at or before the first sound plus `PLACEMENT_FIRST_SOUND_SLACK_BEATS`,
 * and the bar from `a` holds the first sound. The app's
 * `placeChartlessGrid`, which places bars from `a`.
 *
 * New (design §7): when the first sound comes `j ≥ 1` beats into that bar
 * and at most `PICKUP_MAX_BAR_FRACTION` of a bar before the next
 * downbeat, that is a pickup: bars from `a + period`, the pickup from the
 * first sound's beat, with a `pickup` warning. Not when `a + period` is at
 * or past the end (Ruling 5). Otherwise bars from `a`, `bar-one-clamped`
 * when `a` is before 0:00. Null when `a` is at or past the end.
 */
export function placeBarOne(
	lattice: Lattice,
	cls: number,
	firstSound: number,
	duration: number,
	s: Settings,
): Placement | null {
	const { anchor, beat, period, beatsPerBar } = lattice;
	const base = anchor + cls * beat;
	// The latest of the class's points at or before the first sound plus the slack.
	const a =
		base +
		Math.floor((firstSound + s.PLACEMENT_FIRST_SOUND_SLACK_BEATS * beat - base) / period) * period;
	const j = beatsInto(a, firstSound, lattice, s);
	const short = beatsPerBar - j <= s.PICKUP_MAX_BAR_FRACTION * beatsPerBar;
	if (j >= 1 && j < beatsPerBar && short && a + period < duration)
		return placed(a, 1, lattice, duration, s, pickupAt(a, j, lattice));
	return placed(a, 0, lattice, duration, s, null);
}

/**
 * The song's own start wins: bar one at the lattice beat nearest
 * `startAt`, whatever its class, at the comb's period (the app's
 * `placedAtStart`), `bar-one-clamped` when that beat is before 0:00 and
 * null when it is at or past the end.
 *
 * New (Ruling 6): a person has said where bar one is, so sound before it
 * is a pickup however long, found as `placeBarOne` finds one from the
 * bar before (`a = barOne − period`); nothing when the sound begins within
 * the slack of bar one or after it; `sound-before-start` and no pickup
 * when it begins a bar or more before, or less than the slack after that
 * bar's downbeat (`j = 0`).
 */
export function placeAtStart(
	lattice: Lattice,
	startAt: number,
	firstSound: number,
	duration: number,
	s: Settings,
): Placement | null {
	const { anchor, beat, period } = lattice;
	const barOne = anchor + Math.round((startAt - anchor) / beat) * beat;
	const lead = barOne - firstSound;
	if (lead <= s.PLACEMENT_FIRST_SOUND_SLACK_BEATS * beat)
		return placed(barOne, 0, lattice, duration, s, null);
	const a = barOne - period;
	const j = beatsInto(a, firstSound, lattice, s);
	// `lead < period` follows from `j ≥ 1` while the slack is under 1; kept as Ruling 6 states it.
	if (lead < period && j >= 1)
		return placed(barOne, 0, lattice, duration, s, pickupAt(a, j, lattice));
	const p = placed(barOne, 0, lattice, duration, s, null);
	p?.warnings.unshift({
		code: "sound-before-start",
		message: `Sound begins at ${firstSound.toFixed(2)} s, about a bar or more before bar one at ${barOne.toFixed(2)} s; those bars are outside the grid.`,
		detail: { start: barOne, firstSound },
	});
	return p;
}
