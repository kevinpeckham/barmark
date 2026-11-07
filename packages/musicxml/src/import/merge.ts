/**
 * A keyboard's two staves read back as the one line the export split at
 * middle C (`staves.ts`): the lower staff's notes sound with an upper note
 * of the same span, or inside an upper rest (the export joins the upper
 * staff's rests, so one rest can cover several low notes).
 */
import { cmp, type Frac, minus, plus, ZERO } from "../rhythm.js";
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

/** A line of rhythm alone: slashes and rests, at least one slash, no words. */
const rhythmOnly = (line: Line) =>
	line.some((bar) => bar.some((a) => a.kind === "slash")) &&
	line.every((bar) => bar.every((a) => a.kind !== "notes" && a.lyrics.length === 0));

const byOnset = (bar: Attack[]) => [...bar].sort((x, y) => cmp(x.at, y.at));

/** The latest end of `ends` so far and `a`'s, or as it was when `a` sounds for no time. */
const later = (ends: Frac | null, a: Attack) =>
	cmp(a.length, ZERO) <= 0 || (ends !== null && cmp(ends, end(a)) >= 0) ? ends : end(a);

/** Whether `a` starts while something already started still sounds (`ends`, the latest end so far). */
const sounding = (ends: Frac | null, a: Attack) =>
	cmp(a.length, ZERO) > 0 && ends !== null && cmp(ends, a.at) > 0;

/**
 * Two voices' sounds (notes and slashes, each sorted by onset) merged by
 * onset, the first voice's first on a tie, or null when one of each sounds
 * at once. One sweep: `<backup>` can reorder or overlap a voice's own
 * attacks, so each side keeps the latest end it has reached.
 */
function sweep(xs: Attack[], ys: Attack[]): Attack[] | null {
	const out: Attack[] = [];
	let xEnds: Frac | null = null;
	let yEnds: Frac | null = null;
	let i = 0;
	let j = 0;
	while (i < xs.length || j < ys.length) {
		const x = xs[i];
		const y = ys[j];
		const takeX = y === undefined || (x !== undefined && cmp(x.at, y.at) <= 0);
		const a = (takeX ? x : y) as Attack;
		if (sounding(takeX ? yEnds : xEnds, a)) return null;
		if (takeX) {
			xEnds = later(xEnds, a);
			i++;
		} else {
			yEnds = later(yEnds, a);
			j++;
		}
		out.push(a);
	}
	return out;
}

/** Sounds sorted by onset, and the latest end among each prefix, to ask in log time whether a span has sound. */
type Sounds = { sorted: Attack[]; ends: (Frac | null)[] };

function soundsOf(sorted: Attack[]): Sounds {
	const ends: (Frac | null)[] = [];
	let latest: Frac | null = null;
	for (const a of sorted) {
		latest = later(latest, a);
		ends.push(latest);
	}
	return { sorted, ends };
}

/** Whether a rest has a sound of `other` in it: one starting before the rest ends that ends after it starts. */
function covered(rest: Attack, other: Sounds): boolean {
	if (cmp(rest.length, ZERO) <= 0) return false;
	let lo = 0;
	let hi = other.sorted.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (cmp((other.sorted[mid] as Attack).at, end(rest)) < 0) lo = mid + 1;
		else hi = mid;
	}
	const latest = other.ends[lo - 1];
	return latest !== undefined && latest !== null && cmp(latest, rest.at) > 0;
}

/** Sounds and rests merged by onset (sounds first on a tie), rests over the same silence as one. */
function withRests(sounds: Attack[], rests: Attack[]): Attack[] {
	const out: Attack[] = [];
	let j = 0;
	const push = (a: Attack) => {
		const last = out.at(-1);
		if (a.kind === "rest" && last?.kind === "rest" && cmp(end(last), a.at) > 0) {
			if (cmp(end(a), end(last)) > 0)
				out[out.length - 1] = { ...last, length: minus(end(a), last.at) };
		} else out.push(a);
	};
	for (const a of sounds) {
		while (j < rests.length && cmp((rests[j] as Attack).at, a.at) < 0) push(rests[j++] as Attack);
		push(a);
	}
	while (j < rests.length) push(rests[j++] as Attack);
	return out;
}

/**
 * Two voices' bars as one, or null when their sounds overlap. A rest with
 * the other voice's sound in it is a gap, not silence, and is dropped.
 */
function foldBar(line: Attack[], rhythm: Attack[]): Attack[] | null {
	const xs = byOnset(line);
	const ys = byOnset(rhythm);
	const xSounds = xs.filter((a) => a.kind !== "rest");
	const ySounds = ys.filter((a) => a.kind !== "rest");
	const sounds = sweep(xSounds, ySounds);
	if (sounds === null) return null;
	const xOver = soundsOf(xSounds);
	const yOver = soundsOf(ySounds);
	const rests = [
		...xs.filter((a) => a.kind === "rest" && !covered(a, yOver)),
		...ys.filter((a) => a.kind === "rest" && !covered(a, xOver)),
	];
	return withRests(sounds, byOnset(rests));
}

/** `rhythm`'s attacks in `line`'s gaps, or null when a slash sounds with a note or slash of the other. */
function fold(line: Line, rhythm: Line): Line | null {
	const out: Line = [];
	for (let i = 0; i < line.length; i++) {
		const bar = foldBar(line[i] ?? [], rhythm[i] ?? []);
		if (bar === null) return null;
		out.push(bar);
	}
	return out;
}

/**
 * Two voices that are one line: one of slashes and rests alone, its
 * slashes where the other voice is silent (a `<forward>` or a rest), as
 * Dorico and MuseScore write a comping part's slashes in one voice and a
 * voiced bar in another. The two as one line, or null when either is more
 * than that.
 */
export function foldRhythm(first: Line, second: Line): Line | null {
	if (rhythmOnly(second)) return fold(first, second);
	if (rhythmOnly(first)) return fold(second, first);
	return null;
}
