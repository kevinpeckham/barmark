/**
 * Where a note ends (spec 5, rulings 3, 4 and 9): a note rings to the
 * next attack unless a beat or more is silent. One state per point of
 * every beat: an attack, a hold, or a rest. One walk over the struck
 * points; a note-off's beat is found by a binary search on the file's
 * ticks, and every silence is measured on the chart's clock, in twelfths
 * of a tick: every division divides 12, so the measure is exact.
 */
import type { Attack } from "./attacks.js";
import type { Grid } from "./grid.js";
import type { Beat, Quantized, Struck } from "./quantize.js";

/** A point's state; `first` when a rest starts on it. */
export type State<A extends Attack = Attack> =
	| { kind: "attack"; struck: Struck<A> }
	| { kind: "hold" }
	| { kind: "rest"; first: boolean };

/** A point of a beat, never `parts[beat]` (that is the next beat's 0); beat `beats.length` is the chart's end. */
type Pos = { beat: number; point: number };

const HOLD: State<never> = { kind: "hold" };

/** The point after `pos`. */
function after(q: Quantized, { beat, point }: Pos): Pos {
	return point + 1 >= (q.parts[beat] ?? 1)
		? { beat: beat + 1, point: 0 }
		: { beat, point: point + 1 };
}

const earlier = (a: Pos, b: Pos): boolean =>
	a.beat < b.beat || (a.beat === b.beat && a.point < b.point);

/**
 * A point's time on the chart's clock in twelfths of a tick, exact where
 * `pointTick`'s division by 3 or 6 is not; the chart's end is the last
 * beat's `at + length`.
 */
function twelfths(q: Quantized, pos: Pos): number {
	const b = q.beats[pos.beat];
	if (b !== undefined) return 12 * b.at + pos.point * b.length * (12 / (q.parts[pos.beat] ?? 1));
	const last = q.beats.at(-1);
	return last === undefined ? 0 : 12 * (last.at + last.length);
}

/** The last beat starting at or before `tick` in the file (0 when none does). */
function beatAt(beats: Beat[], tick: number): number {
	let [lo, hi] = [0, beats.length - 1];
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if ((beats[mid]?.start ?? 0) <= tick) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/**
 * A raw end moved to the nearest point of the beat it falls in (its end a
 * point), a tie to the later; at or past the grid's end, the chart's end.
 */
function endPoint(q: Quantized, raw: number, grid: Grid): Pos {
	if (raw >= grid.end) return { beat: q.beats.length, point: 0 };
	const e = beatAt(q.beats, raw);
	const beat = q.beats[e] as Beat;
	const n = q.parts[e] ?? 1;
	const k = Math.min(n, Math.max(0, Math.floor(((raw - beat.start) * n) / beat.length + 0.5)));
	return k === n ? { beat: e + 1, point: 0 } : { beat: e, point: k };
}

/** A struck point's end: its latest note-off, at least the point after it, at most `next`. */
function endOf<A extends Attack>(q: Quantized<A>, s: Struck<A>, next: Pos, grid: Grid): Pos {
	const raw = s.attacks.reduce((latest, a) => Math.max(latest, a.end), Number.NEGATIVE_INFINITY);
	const least = after(q, s);
	const end = endPoint(q, raw, grid);
	if (earlier(end, least)) return least;
	return earlier(next, end) ? next : end;
}

/** Writes a state on every point from `from` up to `to`; `make` is told whether the point is the first. */
function fill<A extends Attack>(
	states: State<A>[][],
	q: Quantized<A>,
	from: Pos,
	to: Pos,
	make: (first: boolean) => State<A>,
): void {
	let [pos, first] = [from, true];
	while (earlier(pos, to)) {
		const points = states[pos.beat];
		if (points !== undefined) points[pos.point] = make(first);
		[pos, first] = [after(q, pos), false];
	}
}

const rest = <A extends Attack>(first: boolean): State<A> => ({ kind: "rest", first });
const hold = <A extends Attack>(): State<A> => HOLD;

/** One struck point and what follows it up to `next`: held through a silence under a beat, else held to its end and rested. */
function sound<A extends Attack>(
	states: State<A>[][],
	q: Quantized<A>,
	s: Struck<A>,
	next: Pos,
	grid: Grid,
): void {
	const row = states[s.beat];
	if (row !== undefined) row[s.point] = { kind: "attack", struck: s };
	const end = endOf(q, s, next, grid);
	const measure = end.point > 0 ? end.beat : end.beat - 1;
	const silence = twelfths(q, next) - twelfths(q, end);
	if (silence < 12 * (q.beats[measure]?.length ?? 0)) {
		fill(states, q, after(q, s), next, hold);
		return;
	}
	fill(states, q, after(q, s), end, hold);
	fill(states, q, end, next, rest);
}

/**
 * One state per point of every beat, `states[beat][point]`: rest before
 * the first attack, then each attack held to the next, or to its end and
 * rested when a beat or more is silent.
 */
export function statesOf<A extends Attack>(q: Quantized<A>, grid: Grid): State<A>[][] {
	const states = q.beats.map((_, b) => new Array<State<A>>(q.parts[b] ?? 1));
	const chartEnd: Pos = { beat: q.beats.length, point: 0 };
	const first = q.struck[0];
	fill(states, q, { beat: 0, point: 0 }, first ?? chartEnd, rest);
	q.struck.forEach((s, i) => {
		sound(states, q, s, q.struck[i + 1] ?? chartEnd, grid);
	});
	return states;
}
