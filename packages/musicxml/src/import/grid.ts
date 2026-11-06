/** Placing timed attacks on barmark's slot grid (grammar 2.1 to 2.3). */
import { beatsOf, type Meter, parseMeter } from "barmark";
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

/** Only a bare chord symbol moves to fit a grid; note sets, voicings (a chord with `{...}`) and rests never do. */
const movable = (symbol: string) => !symbol.includes("{") && symbol !== "--";

/** A slot's onsets, as positions in [0, 1) of that slot, with their symbols. */
type Hit = { p: Frac; symbol: string };

/** The smallest division of the slot that holds every onset, if any. */
const divisionFor = (hits: Hit[]) =>
	DIVISIONS.find((c) => hits.every((h) => whole(times(h.p, frac(c)))));

/** A member dotted: the dot goes after a note set's brace, before its syllable (grammar 4.3: `{C4}.:maz-`). */
function dotted(symbol: string): string {
	const brace = symbol.indexOf("}:");
	return brace < 0 ? `${symbol}.` : `${symbol.slice(0, brace + 1)}.${symbol.slice(brace + 1)}`;
}

/** A dotted figure (grammar 2.2): the first member dotted (3/4, 1/4) or the second (1/4, 3/4). */
function dottedPair(hits: Hit[]): string | null {
	const [first, second] = hits;
	if (hits.length !== 2 || !first || !second || first.p.n !== 0) return null;
	if (cmp(second.p, frac(3, 4)) === 0) return `${dotted(first.symbol)}_${second.symbol}`;
	return cmp(second.p, frac(1, 4)) === 0 ? `${first.symbol}_${dotted(second.symbol)}` : null;
}

/** The members of a k-way group, `/` where no onset falls. */
function groupOf(hits: Hit[], k: number): string {
	const members = Array.from({ length: k }, () => "/");
	for (const h of hits) members[times(h.p, frac(k)).n] = h.symbol;
	return members.join("_");
}

/** One slot as text: a symbol, or a group when its onsets need one. */
function writeSlot(hits: Hit[], dots: boolean): string | null {
	const [only] = hits;
	if (!only) return "/";
	if (hits.length === 1 && only.p.n === 0) return only.symbol;
	const k = divisionFor(hits);
	const pair = dots && (k === undefined || k >= 4) ? dottedPair(hits) : null;
	if (pair) return pair;
	return k === undefined ? null : groupOf(hits, k);
}

/** The slots for `n` slots over the bar, or null when some onset has no place. */
function layOut(
	events: Event[],
	length: Frac,
	n: number,
	groups: boolean,
	dots = true,
): string | null {
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
		const text = writeSlot(hits, dots);
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
function fit(events: Event[], length: Frac, beats: number, dots = true): string | null {
	const counts = slotCounts(beats);
	for (const n of counts) {
		const cell = layOut(events, length, n, false);
		if (cell !== null) return cell;
	}
	let best: string | null = null;
	for (const n of [...counts].reverse()) {
		const cell = layOut(events, length, n, true, dots);
		if (cell !== null && (best === null || grouped(cell) < grouped(best))) best = cell;
	}
	return best;
}

/** The nearest beat, a tie going to the earlier one; never past the bar's last beat. */
function nearestBeat(at: Frac, beat: Frac, beats: number): Frac {
	const beatsIn = ratio(at, beat);
	const base = floor(beatsIn);
	const up = cmp(minus(beatsIn, frac(base)), frac(1, 2)) > 0;
	return times(frac(Math.max(0, Math.min(up ? base + 1 : base, beats - 1))), beat);
}

/**
 * The bar's slots as text: `events` (any order, in quarters from the bar's
 * start, symbols already slot symbols) placed on the coarsest grid that
 * holds them, every slot without an onset a hold `/`. `meter` is the bar's
 * own meter, so its beats are the slot counts the grammar allows.
 *
 * Only chord symbols snap, to the nearest beat (`moved`), and only when
 * `exact` is false (one placed outside the bar moves to its nearest beat
 * inside it), a chord landing on an occupied beat being dropped
 * (still `moved`); null when an event can't be placed or the
 * meter is one barmark can't write (so `beats` is small and bounded).
 * Without `dots`, no dotted pair is written: a lyric row has none.
 */
export function placeBar(
	events: Event[],
	length: Frac,
	meter: Meter,
	exact: boolean,
	dots = true,
): { cell: string; moved: boolean } | null {
	if (!parseMeter(`${meter.n}/${meter.d}`)) return null;
	const beats = beatsOf(meter);
	const sorted = [...events].sort((a, b) => cmp(a.at, b.at));
	const outside = sorted.filter((e) => cmp(e.at, ZERO) < 0 || cmp(e.at, length) >= 0);
	// A chord symbol outside the bar moves into it; anything else there can't be placed.
	if (outside.some((e) => exact || !movable(e.symbol))) return null;
	const cell = outside.length === 0 ? fit(sorted, length, beats, dots) : null;
	if (cell !== null) return { cell, moved: false };
	if (exact) return null;
	const snapped = snapChords(sorted, length, beats, new Set(outside));
	return snapped ? { cell: snapped, moved: true } : null;
}

type Candidate = Event & { snapped: boolean };

/** Snap `chosen` chords to their nearest beat; on a shared beat the unmoved (or earlier) attack stays. */
function snapSome(events: Event[], chosen: Set<Event>, length: Frac, beats: number): Event[] {
	const beat = times(length, frac(1, beats));
	const all: Candidate[] = events.map((e) =>
		chosen.has(e)
			? { ...e, at: nearestBeat(e.at, beat, beats), snapped: true }
			: { ...e, snapped: false },
	);
	const kept: Candidate[] = [];
	// Each onset's place in `kept` (fractions are in lowest terms, so equal onsets share a key).
	const where = new Map<string, number>();
	for (const e of all) {
		const key = `${e.at.n}/${e.at.d}`;
		const i = where.get(key);
		const other = i === undefined ? undefined : kept[i];
		if (i === undefined || !other) {
			where.set(key, kept.length);
			kept.push(e);
		} else if (other.snapped && !e.snapped) kept[i] = e;
	}
	return kept.map(({ at, symbol }) => ({ at, symbol }));
}

/**
 * The cell once chords have snapped, or null when it can't be done. Chords
 * that fit no grid alone go first, latest first, then the rest, until the
 * set fits; the last resort has every chord snapped.
 */
function snapChords(
	events: Event[],
	length: Frac,
	beats: number,
	outside: Set<Event>,
): string | null {
	const chords = events.filter((e) => movable(e.symbol)).reverse();
	const off = new Set(chords.filter((e) => outside.has(e) || fit([e], length, beats) === null));
	const order = [...chords.filter((e) => off.has(e)), ...chords.filter((e) => !off.has(e))];
	for (const count of counts(Math.max(1, outside.size), order.length)) {
		const cell = fit(
			snapSome(events, new Set(order.slice(0, count)), length, beats),
			length,
			beats,
		);
		if (cell !== null) return cell;
	}
	return null;
}

/** The most chords snapped one more at a time; past it, every chord snaps at once. */
const MOST_SNAPPED = 16;

/** How many chords to snap, in the order tried: one more each time, then all of them. */
function counts(from: number, all: number): number[] {
	const out: number[] = [];
	for (let c = from; c <= Math.min(all, from + MOST_SNAPPED - 1); c++) out.push(c);
	if (all > (out[out.length - 1] ?? 0)) out.push(all);
	return out;
}
