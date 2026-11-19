/**
 * The grid inside a beat (spec 4.2): each beat is divided into 1, 2, 3, 4
 * or 6 parts, the smallest that holds its attacks within a 128th note; a
 * beat no division holds is rounded, its attacks moved to the nearest
 * point (the beat's end among them), and then reduced (ruling 1). One
 * walk over the attacks, in order, beside the beats.
 */
import { beatsOf } from "barmark";
import type { Attack } from "./attacks.js";
import type { Grid } from "./grid.js";

/** The tolerance is a quarter over this (a 128th note). */
export const TOLERANCE = 32;
/** A part is never shorter than a quarter over this (a 32nd note). */
const FINEST = 8;
/** The divisions a beat may take, coarsest first. */
const DIVISIONS = [1, 2, 3, 4, 6];
/** A rounded beat's parts: a plain beat's, and a dotted beat's. */
const ROUND_PLAIN = 4;
const ROUND_DOTTED = 6;

/**
 * A beat in ticks; `bar` is its index in `grid.bars`; `dotted` when the
 * meter's beat is three of its units. A beat has two clocks: `start` is
 * where it begins in the file (where its attacks are read), `at` where it
 * begins in the chart, the meters of the bars before it summed (as
 * `perform` plays them). They differ after a bar cut at a time signature
 * whose meter, rounded to sixteenths, is not its span in the file.
 */
export type Beat = { bar: number; start: number; at: number; length: number; dotted: boolean };

/** Every input attack that landed on one point of one beat, in input order. */
export type Struck<A extends Attack = Attack> = { beat: number; point: number; attacks: A[] };

/**
 * The attacks on the grid: `parts[b]` is beat `b`'s division; `struck` in
 * time order, one per point; `rounded` the bars with a rounded beat,
 * ascending, each once; `joined` the attacks that landed on a point
 * another already held.
 */
export type Quantized<A extends Attack = Attack> = {
	beats: Beat[];
	parts: number[];
	struck: Struck<A>[];
	rounded: number[];
	joined: number;
};

/** Each bar's length over `beatsOf(meter)`, in order, from the bar's start in the file and on the chart's clock. */
export function beatsOfGrid(grid: Grid): Beat[] {
	const beats: Beat[] = [];
	let clock = 0;
	grid.bars.forEach(({ start, meter }, bar) => {
		const count = beatsOf(meter);
		const length = (meter.n * 4 * grid.ppq) / meter.d / count;
		const dotted = count !== meter.n;
		for (let i = 0; i < count; i++)
			beats.push({ bar, start: start + i * length, at: clock + i * length, length, dotted });
		clock += count * length;
	});
	return beats;
}

/** The divisions whose parts are no shorter than a 32nd note; always at least `[1]`. */
export function divisionsFor(length: number, ppq: number): number[] {
	const fine = DIVISIONS.filter((n) => length / n >= ppq / FINEST);
	return fine.length > 0 ? fine : [1];
}

/**
 * A point's tick on the chart's clock: `at + point * length / parts`. A
 * later stage finds the beat a time in the file falls in by `start`, and
 * measures by this.
 */
export const pointTick = (
	q: Pick<Quantized, "beats" | "parts">,
	beat: number,
	point: number,
): number => {
	const b = q.beats[beat];
	if (b === undefined) return 0;
	return b.at + (point * b.length) / (q.parts[beat] ?? 1);
};

/** Attacks at one time in a beat: a carried group sits at the beat's start. */
type Item<A> = { tick: number; attacks: A[] };
/** Attacks on one point of a beat's division. */
type Placed<A> = { point: number; attacks: A[] };
/** A beat's reading: its division, its points, and what moves on to the next beat. */
type Reading<A> = { parts: number; placed: Placed<A>[]; carry: A[]; rounded: boolean };

/** A beat's items: the carried group at its start, joined by an attack within the tolerance of it. */
function itemsOf<A extends Attack>(carry: A[], own: A[], beat: Beat, tolerance: number): Item<A>[] {
	const items: Item<A>[] = own.map((a) => ({ tick: a.tick, attacks: [a] }));
	if (carry.length === 0) return items;
	const first = items[0];
	if (first !== undefined && Math.abs(first.tick - beat.start) <= tolerance) {
		items[0] = { tick: beat.start, attacks: [...carry, ...first.attacks] };
		return items;
	}
	return [{ tick: beat.start, attacks: carry }, ...items];
}

/** The points of `n` parts the items fit, one each, or null. */
function fitOn<A>(items: Item<A>[], beat: Beat, n: number, tolerance: number): number[] | null {
	const step = beat.length / n;
	const points: number[] = [];
	for (const { tick } of items) {
		const k = Math.max(0, Math.round((tick - beat.start) / step));
		const near = Math.abs(tick - (beat.start + k * step)) <= tolerance;
		if (k >= n || !near || points.at(-1) === k) return null;
		points.push(k);
	}
	return points;
}

/** The smallest division the items fit, or null. */
function fitBeat<A>(
	items: Item<A>[],
	beat: Beat,
	divisions: number[],
	tolerance: number,
): Reading<A> | null {
	for (const n of divisions) {
		const points = fitOn(items, beat, n, tolerance);
		if (points === null) continue;
		const placed = items.map((item, i) => ({ point: points[i] ?? 0, attacks: item.attacks }));
		return { parts: n, placed, carry: [], rounded: false };
	}
	return null;
}

/** A rounded beat's parts: 4, or 6 when dotted, or the finest allowed when that is coarser. */
function roundingParts(beat: Beat, divisions: number[]): number {
	const finest = divisions[divisions.length - 1] ?? 1;
	return Math.min(beat.dotted ? ROUND_DOTTED : ROUND_PLAIN, finest);
}

/** The nearest of the points `0..last` to a tick, a tie to the earlier. */
function nearestPoint(tick: number, beat: Beat, n: number, last: number): number {
	const k = Math.ceil(((tick - beat.start) * n) / beat.length - 0.5);
	return Math.min(last, Math.max(0, k));
}

/** The smallest division with a point at every placed point of `n` parts, and the points renumbered. */
function reduce<A>(
	placed: Placed<A>[],
	n: number,
	divisions: number[],
): { parts: number; placed: Placed<A>[] } {
	const parts = divisions.find((d) => placed.every(({ point }) => (point * d) % n === 0)) ?? n;
	return {
		parts,
		placed: placed.map(({ point, attacks }) => ({ point: (point * parts) / n, attacks })),
	};
}

/** Each item moved to its nearest point (the beat's end, unless `final`); those on the end are carried. */
function roundBeat<A>(
	items: Item<A>[],
	beat: Beat,
	divisions: number[],
	final: boolean,
): Reading<A> {
	const n = roundingParts(beat, divisions);
	const last = final ? n - 1 : n;
	const placed: Placed<A>[] = [];
	const carry: A[] = [];
	for (const { tick, attacks } of items) {
		const point = nearestPoint(tick, beat, n, last);
		const held = placed.at(-1);
		if (point === n) carry.push(...attacks);
		else if (held?.point === point) held.attacks.push(...attacks);
		else placed.push({ point, attacks: [...attacks] });
	}
	return { ...reduce(placed, n, divisions), carry, rounded: true };
}

/** One beat's reading: the smallest division that fits, else rounded. */
function readBeat<A>(items: Item<A>[], beat: Beat, ppq: number, final: boolean): Reading<A> {
	if (items.length === 0) return { parts: 1, placed: [], carry: [], rounded: false };
	const divisions = divisionsFor(beat.length, ppq);
	return (
		fitBeat(items, beat, divisions, ppq / TOLERANCE) ?? roundBeat(items, beat, divisions, final)
	);
}

/** Puts a beat's reading into the result. */
function record<A extends Attack>(
	q: Quantized<A>,
	b: number,
	reading: Reading<A>,
	bar: number,
): void {
	q.parts.push(reading.parts);
	for (const { point, attacks } of reading.placed) {
		q.struck.push({ beat: b, point, attacks });
		q.joined += attacks.length - 1;
	}
	if (reading.rounded && q.rounded.at(-1) !== bar) q.rounded.push(bar);
}

/**
 * The attacks (in tick order) on the grid's beats. An attack belongs to a
 * beat from a 128th before its start to a 128th before the next beat's;
 * the last beat takes everything from its own bound on.
 */
export function quantize<A extends Attack>(attacks: A[], grid: Grid): Quantized<A> {
	const beats = beatsOfGrid(grid);
	const q: Quantized<A> = { beats, parts: [], struck: [], rounded: [], joined: 0 };
	const tolerance = grid.ppq / TOLERANCE;
	let next = 0;
	let carry: A[] = [];
	beats.forEach((beat, b) => {
		const final = b === beats.length - 1;
		const bound = final ? Number.POSITIVE_INFINITY : (beats[b + 1]?.start ?? 0) - tolerance;
		const own: A[] = [];
		while (next < attacks.length && (attacks[next]?.tick ?? 0) < bound)
			own.push(attacks[next++] as A);
		const reading = readBeat(itemsOf(carry, own, beat, tolerance), beat, grid.ppq, final);
		record(q, b, reading, beat.bar);
		carry = reading.carry;
	});
	return q;
}
