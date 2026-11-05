/** Placing timed attacks on barmark's slot grid (grammar 2.1 to 2.3). */
import { beatsOf, type Meter } from "barmark";
import { cmp, type Frac, frac, minus, times, ZERO } from "../rhythm.js";

/** One attack: where it starts in the bar (quarters) and the slot symbol it is. */
export type Event = { at: Frac; symbol: string };

/** Subdivisions a group can hold evenly (grammar 2.2). */
const DIVISIONS = [2, 3, 4, 6];

const whole = (f: Frac) => f.d === 1;
const floor = (f: Frac) => Math.floor(f.n / f.d);
const ratio = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);

/** The slot counts that divide the beats evenly: one, two and one per beat. */
function slotCounts(beats: number): number[] {
	return [1, 2, beats].filter((n, i, all) => beats % n === 0 && all.indexOf(n) === i);
}

/** Only a chord symbol moves to fit a grid; notes, voicings and rests never do. */
const movable = (symbol: string) => !symbol.startsWith("{") && symbol !== "--";

/** A slot's onsets, as positions in [0, 1) of that slot, with their symbols. */
type Hit = { p: Frac; symbol: string };

/** The smallest division of the slot that holds every onset, if any. */
const divisionFor = (hits: Hit[], from: number) =>
	DIVISIONS.find((c) => c >= from && hits.every((h) => whole(times(h.p, frac(c)))));

/** A dotted figure (a pair): an onset at the start and one at three quarters of the slot. */
function dottedPair(hits: Hit[]): string | null {
	const [first, second] = hits;
	if (hits.length !== 2 || !first || !second) return null;
	return first.p.n === 0 && cmp(second.p, frac(3, 4)) === 0
		? `${first.symbol}._${second.symbol}`
		: null;
}

/** The members of a k-way group, `/` where no onset falls. */
function groupOf(hits: Hit[], k: number): string {
	const members = Array.from({ length: k }, () => "/");
	for (const h of hits) members[times(h.p, frac(k)).n] = h.symbol;
	return members.join("_");
}

/** One slot as text: a symbol, or a group when its onsets need one. */
function writeSlot(hits: Hit[]): string | null {
	const [only] = hits;
	if (!only) return "/";
	if (hits.length === 1 && only.p.n === 0) return only.symbol;
	const k = divisionFor(hits, 2);
	const dotted = k === undefined || k >= 4 ? dottedPair(hits) : null;
	if (dotted) return dotted;
	return k === undefined ? null : groupOf(hits, k);
}

/** The slots for `n` slots over the bar, or null when some onset has no place. */
function layOut(events: Event[], length: Frac, n: number, groups: boolean): string | null {
	const slot = times(length, frac(1, n));
	const slots: Hit[][] = Array.from({ length: n }, () => []);
	for (const e of events) {
		const at = ratio(e.at, slot);
		const index = floor(at);
		const hits = slots[index];
		if (!hits) return null;
		hits.push({ p: minus(at, frac(index)), symbol: e.symbol });
	}
	if (!groups && slots.some((hits) => hits.some((h) => h.p.n !== 0))) return null;
	const out: string[] = [];
	for (const hits of slots) {
		const text = writeSlot(hits);
		if (text === null) return null;
		out.push(text);
	}
	return out.join(" ");
}

/** How many members the cell's groups hold: the simpler spelling has fewer. */
const grouped = (cell: string) =>
	cell
		.split(" ")
		.filter((slot) => slot.includes("_"))
		.reduce((sum, slot) => sum + slot.split("_").length, 0);

/** The cell for these onsets: the fewest slots that start every onset, else groups inside slots, preferring the fewest group members (finer slots win a tie). */
function fit(events: Event[], length: Frac, beats: number): string | null {
	const counts = slotCounts(beats);
	for (const n of counts) {
		const cell = layOut(events, length, n, false);
		if (cell !== null) return cell;
	}
	let best: string | null = null;
	for (const n of [...counts].reverse()) {
		const cell = layOut(events, length, n, true);
		if (cell !== null && (best === null || grouped(cell) < grouped(best))) best = cell;
	}
	return best;
}

/** The nearest beat, a tie going to the earlier one; never past the bar's last beat. */
function nearestBeat(at: Frac, beat: Frac, beats: number): Frac {
	const beatsIn = ratio(at, beat);
	const base = floor(beatsIn);
	const up = cmp(minus(beatsIn, frac(base)), frac(1, 2)) > 0;
	return times(frac(Math.min(up ? base + 1 : base, beats - 1)), beat);
}

/**
 * The bar's slots as text: `events` (any order, in quarters from the bar's
 * start, symbols already slot symbols) placed on the coarsest grid that
 * holds them, every slot without an onset a hold `/`. `meter` is the bar's
 * own meter, so its beats are the slot counts the grammar allows.
 *
 * Only chord symbols snap, to the nearest beat (`moved`), and only when
 * `exact` is false; null when an event can't be placed.
 */
export function placeBar(
	events: Event[],
	length: Frac,
	meter: Meter,
	exact: boolean,
): { cell: string; moved: boolean } | null {
	const beats = beatsOf(meter);
	const sorted = [...events].sort((a, b) => cmp(a.at, b.at));
	if (sorted.some((e) => cmp(e.at, ZERO) < 0 || cmp(e.at, length) >= 0)) return null;
	const cell = fit(sorted, length, beats);
	if (cell !== null) return { cell, moved: false };
	if (exact) return null;
	const beat = times(length, frac(1, beats));
	let moved = false;
	const snapped = sorted.map((e) => {
		if (!movable(e.symbol) || fit([e], length, beats) !== null) return e;
		moved = true;
		return { ...e, at: nearestBeat(e.at, beat, beats) };
	});
	const again = moved ? fit(dropRepeats(snapped), length, beats) : null;
	return again === null ? null : { cell: again, moved: true };
}

/** Two attacks snapped onto one beat: the later one stands. */
function dropRepeats(events: Event[]): Event[] {
	const sorted = [...events].sort((a, b) => cmp(a.at, b.at));
	return sorted.filter((e, i) => {
		const next = sorted[i + 1];
		return !next || cmp(e.at, next.at) !== 0;
	});
}
