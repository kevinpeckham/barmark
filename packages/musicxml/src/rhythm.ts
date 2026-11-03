/** Durations as fractions of a quarter note, and how MusicXML writes them. */
import type { Meter, Slot } from "barmark";

/** A positive fraction, always in lowest terms. */
export type Frac = { n: number; d: number };

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

function frac(n: number, d = 1): Frac {
	const g = gcd(Math.abs(n), Math.abs(d)) || 1;
	return { n: n / g, d: d / g };
}
const times = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
const minus = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const atMost = (a: Frac, b: Frac) => a.n * b.d <= b.n * a.d;

/** A bar's length in quarter notes. */
export const barLength = (meter: Meter) => frac(4 * meter.n, meter.d);

/** Each slot's length: the bar shared equally (grammar 2.1). */
export const slotLengths = (slots: Slot[], meter: Meter): Frac[] =>
	slots.map(() => times(barLength(meter), frac(1, slots.length)));

/** Each member of a group shares its slot equally (grammar 2.2). */
export const memberLength = (slot: Frac, members: number) => times(slot, frac(1, members));

/** Every length a measure writes, so divisions can make them all whole. */
export function lengthsOf(slots: Slot[], meter: Meter): Frac[] {
	return slotLengths(slots, meter).flatMap((len, i) => {
		const s = slots[i];
		return s?.kind === "group" ? s.members.map(() => memberLength(len, s.members.length)) : [len];
	});
}

/** Divisions per quarter note that make every length whole. */
export const divisionsFor = (lengths: Frac[]) => lengths.reduce((d, f) => lcm(d, f.d), 1);

/** A written note value: its type, a dot, and the tuplet it sits in. */
export type NoteValue = {
	length: Frac;
	type: string;
	dot: boolean;
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

/** The plain values (a type, or a dotted type) from longest to shortest, in quarters. */
const PLAIN = TYPES.flatMap(([q, type]) => [
	{ q: frac(q * 4 * 3, 2 * 4), type, dot: true },
	{ q: frac(q * 32, 32), type, dot: false },
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
		out.push({ length: times(v.q, scale), type: v.type, dot: v.dot, tuplet });
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
