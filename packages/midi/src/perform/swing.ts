/** Swing (spec 3.6): the second eighth of each quarter, or sixteenth of each eighth, played late. */
import type { Feel, Meter } from "barmark";
import type { TimedSlot } from "./line.js";
import { add, type BarAt, barQuarters, cmp, mul, q, sub } from "./quarters.js";
import type { MidiLoss, Quarters } from "./types.js";

/** Where the swung note lands in its pair: ⅔ for the bare word, else the amount (58% is 0.58). */
const amountOf = (percent: number | undefined) =>
	percent === undefined ? q(2, 3) : q(Math.round(percent * 100), 10000);

/**
 * A time point swung: at k + ½ of a unit (a quarter, or an eighth for
 * `swing 16`) it moves to k + p; every other point, triplets' thirds
 * included, stays. `at` counts from a point on the beat grid, the bar's
 * start.
 */
export function swingPoint(at: Quarters, feel: Feel, percent: number | undefined): Quarters {
	if (feel === "straight") return at;
	const unit = feel === "swing 16" ? q(1, 2) : q(1);
	const units = mul(at, q(unit.d, unit.n));
	const k = Math.floor(units.n / units.d);
	if (cmp(sub(units, q(k)), q(1, 2)) !== 0) return at;
	return mul(add(q(k), amountOf(percent)), unit);
}

/** 6/8, 9/8 and 12/8: their beats already divide in three. */
const compound = (meter: Meter) => meter.d === 8 && [6, 9, 12].includes(meter.n);

/**
 * The chart's swing as a map of time points, each through its own bar's
 * feel (a point on a bar line is its next bar's downbeat, which never
 * moves). A swung compound bar isn't swung, with one `swing-compound`
 * loss for the chart. A beat (a quarter from the bar's start) where a
 * point of `line` falls off the binary grid, as sextuplets do, isn't
 * swung either, nor is one where swing would move a point onto or past
 * the next (sixteenths under swing 75%), so swing never runs one written
 * note into the next (controller's rulings, 2026-11-08).
 */
export function swingMap(
	bars: BarAt[],
	line: TimedSlot[] = [],
): { swing: (at: Quarters) => Quarters; losses: MidiLoss[] } {
	const unswung = bars.find(({ bar }) => bar.feel !== "straight" && compound(bar.meter));
	const losses: MidiLoss[] = unswung
		? [
				{
					code: "swing-compound",
					message: `swing in ${unswung.bar.meter.n}/${unswung.bar.meter.d} is not applied: its beats already divide in three`,
					bar: unswung.bar.index,
				},
			]
		: [];
	const straight = offGridBeats(bars, line);
	const swing = (at: Quarters) => {
		const found = barOf(bars, at);
		if (!found || compound(found.bar.meter) || straight.has(beatOf(found, at))) return at;
		const { bar, at: start } = found;
		return add(start, swingPoint(sub(at, start), bar.feel, bar.swingPercent));
	};
	for (const beat of meetingBeats(bars, line, swing)) straight.add(beat);
	return { swing, losses };
}

/** Whether a denominator is a power of two: the point lies on the binary grid. */
function binary(d: number): boolean {
	let rest = d;
	while (rest % 2 === 0) rest /= 2;
	return rest === 1;
}

/** The beat a point falls in: its bar's onset and the whole quarters from it. */
function beatOf(found: BarAt, at: Quarters): string {
	const from = sub(at, found.at);
	return `${found.at.n}/${found.at.d}:${Math.floor(from.n / from.d)}`;
}

/** The beats holding an attack or an end off the binary grid. */
function offGridBeats(bars: BarAt[], line: TimedSlot[]): Set<string> {
	const beats = new Set<string>();
	for (const { at, length } of line)
		for (const point of [at, add(at, length)]) {
			const found = binary(point.d) ? undefined : barOf(bars, point);
			if (found) beats.add(beatOf(found, point));
		}
	return beats;
}

/**
 * The beats where swing would leave a slot of the line no length: its
 * attack swung onto or past its end. Swing moves a point only within its
 * own half unit, so leaving these beats straight leaves every other as it was.
 */
function meetingBeats(
	bars: BarAt[],
	line: TimedSlot[],
	swing: (at: Quarters) => Quarters,
): string[] {
	return line.flatMap(({ at, length }) => {
		const end = add(at, length);
		if (cmp(swing(end), swing(at)) > 0) return [];
		return [at, end].flatMap((point) => {
			const found = barOf(bars, point);
			return found ? [beatOf(found, point)] : [];
		});
	});
}

/** The bar a point falls in (start ≤ at < end), by binary search; undefined past the end. */
function barOf(bars: BarAt[], at: Quarters): BarAt | undefined {
	let [lo, hi] = [0, bars.length - 1];
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (cmp((bars[mid] as BarAt).at, at) <= 0) lo = mid;
		else hi = mid - 1;
	}
	const found = bars[lo];
	if (!found || cmp(at, found.at) < 0) return undefined;
	return cmp(at, add(found.at, barQuarters(found.bar.meter))) < 0 ? found : undefined;
}

/**
 * A line with every time point, attacks and ends alike, swung once, so
 * lengths stay whole. `swingMap` leaves straight any beat where a slot
 * would lose its length, so every slot keeps some.
 */
export function swingLine(line: TimedSlot[], swing: (at: Quarters) => Quarters): TimedSlot[] {
	return line.map((timed) => {
		const at = swing(timed.at);
		return { ...timed, at, length: sub(swing(add(timed.at, timed.length)), at) };
	});
}
