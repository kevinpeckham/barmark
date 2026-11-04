/** Durations as fractions of a quarter note, and how MusicXML writes them. */
import { beatsOf, type Meter, type Slot } from "barmark";

/** A positive fraction, always in lowest terms. */
export type Frac = { n: number; d: number };

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

export function frac(n: number, d = 1): Frac {
	const g = gcd(Math.abs(n), Math.abs(d)) || 1;
	return { n: n / g, d: d / g };
}
export const times = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
export const plus = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const minus = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const atMost = (a: Frac, b: Frac) => a.n * b.d <= b.n * a.d;
const before = (a: Frac, b: Frac) => !atMost(b, a);

/** A bar's length in quarter notes. */
export const barLength = (meter: Meter) => frac(4 * meter.n, meter.d);

/** One beat's length: compound meters (6/8, 9/8, 12/8) beat in dotted quarters. */
export const beatLength = (meter: Meter) => times(barLength(meter), frac(1, beatsOf(meter)));

/** Each slot's length: the bar shared equally (grammar 2.1). */
export const slotLengths = (slots: Slot[], meter: Meter): Frac[] =>
	slots.map(() => times(barLength(meter), frac(1, slots.length)));

/** Each member of a group shares its slot equally (grammar 2.2). */
export const memberLength = (slot: Frac, members: number) => times(slot, frac(1, members));

/** Divisions per quarter note that make every length whole. */
export const divisionsFor = (lengths: Frac[]) => lengths.reduce((d, f) => lcm(d, f.d), 1);

/** A written note value: its type, its dots, and the tuplet it sits in. */
export type NoteValue = {
	length: Frac;
	type: string;
	dots: 0 | 1 | 2;
	tuplet: { actual: number; normal: number } | null;
};

const TYPES: [number, string][] = [
	[16, "long"],
	[8, "breve"],
	[4, "whole"],
	[2, "half"],
	[1, "quarter"],
	[1 / 2, "eighth"],
	[1 / 4, "16th"],
	[1 / 8, "32nd"],
	[1 / 16, "64th"],
	[1 / 32, "128th"],
];

/** The plain values (a type, dotted once or twice or not) from longest to shortest, in quarters. */
const PLAIN = TYPES.flatMap(([q, type]) => [
	{ q: frac(q * 32 * 7, 32 * 4), type, dots: 2 as const },
	{ q: frac(q * 32 * 3, 32 * 2), type, dots: 1 as const },
	{ q: frac(q * 32, 32), type, dots: 0 as const },
]).filter((v) => Number.isInteger(v.q.n) && Number.isInteger(v.q.d));

const oddPart = (n: number) => {
	let o = n;
	while (o % 2 === 0) o /= 2;
	return o;
};

/** Tied plain values summing to `length`, longest first. */
function plainValues(length: Frac, tuplet: NoteValue["tuplet"], scale: Frac): NoteValue[] {
	const out: NoteValue[] = [];
	let left = length;
	while (left.n > 0) {
		const v = PLAIN.find((p) => atMost(p.q, left)) ?? PLAIN[PLAIN.length - 1];
		if (!v) break;
		out.push({ length: times(v.q, scale), type: v.type, dots: v.dots, tuplet });
		left = minus(left, v.q);
	}
	return out;
}

/**
 * How a length is written: one value, or tied values. A length whose
 * denominator has an odd factor is a tuplet: `actual` notes in the time of
 * `normal`, the largest power of two below it.
 */
export function noteValues(length: Frac): NoteValue[] {
	const actual = oddPart(length.d);
	if (actual === 1) return plainValues(length, null, frac(1));
	let normal = 1;
	while (normal * 2 < actual) normal *= 2;
	const shown = times(length, frac(actual, normal));
	return plainValues(shown, { actual, normal }, frac(normal, actual));
}

/**
 * A slash's length cut at the beats it crosses, `start` into the bar, so
 * each beat shows its own slash. A slot off the beat grid, a triplet's
 * share, stays whole: cutting it would write tuplets it doesn't need.
 */
export function beatPieces(start: Frac, length: Frac, beat: Frac): Frac[] {
	const inBeats = (f: Frac) => frac(f.n * beat.d, f.d * beat.n);
	const from = inBeats(start);
	const to = inBeats(plus(start, length));
	if (oddPart(from.d) !== 1 || oddPart(to.d) !== 1) return [length];
	const pieces: Frac[] = [];
	for (let at = from; before(at, to); ) {
		const boundary = frac(Math.floor(at.n / at.d) + 1);
		const next = atMost(boundary, to) ? boundary : to;
		pieces.push(times(minus(next, at), beat));
		at = next;
	}
	return pieces;
}

/** Whether a length is plain: no tuplet in it. */
export const dyadic = (f: Frac) => oddPart(f.d) === 1;
const same = (a: Frac, b: Frac) => a.n === b.n && a.d === b.d;
const inBeats = (f: Frac, beat: Frac) => frac(f.n * beat.d, f.d * beat.n);
/** Whether `f` falls on the beat grid. */
export const onBeat = (f: Frac, beat: Frac) => inBeats(f, beat).d === 1;
/** 4/4, 2/2 and 12/8 show their middle: no value hides it. */
export const halved = (m: Meter) =>
	(m.n === 4 && m.d === 4) || (m.n === 2 && m.d === 2) || (m.n === 12 && m.d === 8);

/** A compound meter beats in dotted values (6/8, 9/8, 12/8). */
const compound = (m: Meter) => beatLength(m).n === 3;

/**
 * A halved meter cuts at the middle, unless a note starts the bar and fills
 * whole beats in a simple meter (a rest, or any note in 12/8: the whole bar).
 */
function middleCut(start: Frac, length: Frac, meter: Meter, rest: boolean): Frac | null {
	const middle = times(barLength(meter), frac(1, 2));
	if (!before(start, middle) || !before(middle, plus(start, length))) return null;
	if (start.n !== 0) return middle;
	const whole = rest || compound(meter);
	const kept = whole ? same(length, barLength(meter)) : onBeat(length, beatLength(meter));
	return kept ? null : middle;
}

/** In a compound meter a note from a beat shows its whole beats, then the rest: a dotted quarter tied to an eighth. */
function wholeBeatsCut(start: Frac, length: Frac, meter: Meter): Frac | null {
	const beat = beatLength(meter);
	if (!compound(meter) || !onBeat(start, beat)) return null;
	const beats = inBeats(length, beat);
	const whole = Math.floor(beats.n / beats.d);
	return whole >= 1 && beats.d !== 1 ? plus(start, times(frac(whole), beat)) : null;
}

/** Elsewhere a value off the beat is cut at the next beat. */
function beatCut(start: Frac, length: Frac, meter: Meter): Frac | null {
	const beat = beatLength(meter);
	if (onBeat(start, beat)) return null;
	const at = inBeats(start, beat);
	const next = times(frac(Math.ceil(at.n / at.d)), beat);
	return before(next, plus(start, length)) ? next : null;
}

/** Where a sound is cut so its values show the meter (a rest off the beat at the next beat, in any meter); a tuplet's value never is. */
function meterCut(start: Frac, length: Frac, meter: Meter, rest: boolean): Frac | null {
	if (!dyadic(start) || !dyadic(length)) return null;
	const offBeat = rest ? beatCut(start, length, meter) : null;
	if (offBeat) return offBeat;
	const cut = halved(meter) ? middleCut(start, length, meter, rest) : beatCut(start, length, meter);
	return cut ?? wholeBeatsCut(start, length, meter);
}

/** How a sound `start` into its bar is written in its meter: tied values, cut where the meter shows. */
export function meterValues(start: Frac, length: Frac, meter: Meter, rest = false): NoteValue[] {
	const cut = meterCut(start, length, meter, rest);
	if (!cut) return noteValues(length);
	const first = minus(cut, start);
	return [...noteValues(first), ...meterValues(cut, minus(length, first), meter, rest)];
}
