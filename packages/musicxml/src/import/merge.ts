/**
 * A keyboard's two staves read back as the one line the export split at
 * middle C (`staves.ts`): the lower staff's notes sound with an upper note
 * of the same span, or inside an upper rest (the export joins the upper
 * staff's rests, so one rest can cover several low notes).
 */
import { cmp, minus, plus } from "../rhythm.js";
import type { Attack } from "./read.js";

/** A line's attacks, measure by measure. */
export type Line = Attack[][];

const end = (a: Attack) => plus(a.at, a.length);
const within = (b: Attack, a: Attack) => cmp(a.at, b.at) <= 0 && cmp(end(b), end(a)) <= 0;

const spanKey = (a: Attack) => `${a.at.n}/${a.at.d}+${a.length.n}/${a.length.d}`;

/** A bar's attacks, found by span (a note) or by the rest around an onset, without searching the bar each time. */
type BarIndex = { notes: Map<string, Attack>; rests: Attack[] };

function indexOf(bar: Attack[]): BarIndex {
	const notes = new Map<string, Attack>();
	for (const a of bar) if (a.kind === "notes" && !notes.has(spanKey(a))) notes.set(spanKey(a), a);
	const rests = bar.filter((a) => a.kind === "rest").sort((x, y) => cmp(x.at, y.at));
	return { notes, rests };
}

/** The first of `sorted` (by onset) starting after `at`, or at it when `from` is set. */
function firstAfter(sorted: Attack[], at: Attack["at"], from = false): number {
	let lo = 0;
	let hi = sorted.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (cmp((sorted[mid] as Attack).at, at) < (from ? 0 : 1)) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** Whether a low note has its place in the upper staff: a note of its span, or a rest around it. */
function placed(b: Attack, upper: BarIndex): boolean {
	if (upper.notes.has(spanKey(b))) return true;
	// The rests of one voice don't overlap: only the last to start at or before the note can hold it.
	const rest = upper.rests[firstAfter(upper.rests, b.at) - 1];
	return rest !== undefined && within(b, rest);
}

/** An upper note with the low notes of its span under it. */
function unite(upper: Attack, lower: Attack | undefined): Attack {
	if (!lower) return upper;
	return {
		...upper,
		pitches: [...lower.pitches, ...upper.pitches],
		tieIn: upper.tieIn && lower.tieIn,
		tieOut: upper.tieOut && lower.tieOut,
	};
}

/** An upper rest with the low notes inside it, the rest kept where none sounds. */
function fillRest(rest: Attack, inside: Attack[]): Attack[] {
	const out: Attack[] = [];
	let at = rest.at;
	for (const b of inside) {
		if (cmp(b.at, at) > 0) out.push({ ...rest, at, length: minus(b.at, at) });
		out.push(b);
		at = end(b);
	}
	if (cmp(at, end(rest)) < 0) out.push({ ...rest, at, length: minus(end(rest), at) });
	return out;
}

/** The low notes inside a rest: those starting from its onset that end within it. */
function inside(rest: Attack, notes: Attack[]): Attack[] {
	const out: Attack[] = [];
	for (let k = firstAfter(notes, rest.at, true); k < notes.length; k++) {
		const b = notes[k] as Attack;
		if (cmp(b.at, end(rest)) >= 0) break;
		if (within(b, rest)) out.push(b);
	}
	return out;
}

/** One upper attack with the low notes that sound in its place. */
function withLow(a: Attack, notes: Attack[], lower: BarIndex): Attack[] {
	if (a.kind === "rest") return fillRest(a, inside(a, notes));
	if (a.kind === "slash") return [a];
	return [unite(a, lower.notes.get(spanKey(a)))];
}

function mergeBar(upper: Attack[], lower: Attack[]): Attack[] {
	const notes = lower.filter((b) => b.kind === "notes").sort((x, y) => cmp(x.at, y.at));
	const index = indexOf(lower);
	return upper.flatMap((a) => withLow(a, notes, index));
}

/** The two staves as one line, or null when the lower staff's rhythm is its own. */
export function mergeStaves(upper: Line, lower: Line): Line | null {
	const fits = lower.every((bar, i) => {
		const index = indexOf(upper[i] ?? []);
		return bar.every((b) => b.kind !== "notes" || placed(b, index));
	});
	return fits ? upper.map((bar, i) => mergeBar(bar, lower[i] ?? [])) : null;
}
