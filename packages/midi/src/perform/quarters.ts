/** Exact times in quarter notes, and a bar's slots timed in them. */
import { type Meter, memberShares, type SimpleSlot, type Slot } from "barmark";
import type { Quarters } from "./types.js";

/** The greatest common divisor of two whole numbers, by Euclid's loop; gcd(0, 0) is 1. */
function gcd(a: number, b: number): number {
	let [x, y] = [Math.abs(a), Math.abs(b)];
	while (y !== 0) [x, y] = [y, x % y];
	return x || 1;
}

/** `n/d` quarters, in lowest terms with a positive denominator. */
export function q(n: number, d = 1): Quarters {
	const g = gcd(n, d) * Math.sign(d);
	// `+ 0` turns -0 (from 0 over a negative denominator) into 0, so equal times compare equal.
	return { n: n / g + 0, d: d / g };
}
export const ZERO: Quarters = { n: 0, d: 1 };
export const add = (a: Quarters, b: Quarters) => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Quarters, b: Quarters) => q(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Quarters, b: Quarters) => q(a.n * b.n, a.d * b.d);
/** -1, 0 or 1 as `a` is less than, equal to or greater than `b`. */
export const cmp = (a: Quarters, b: Quarters): -1 | 0 | 1 =>
	Math.sign(a.n * b.d - b.n * a.d) as -1 | 0 | 1;
export const toNumber = (a: Quarters) => a.n / a.d;

/** A bar's length in quarter notes. */
export const barQuarters = (meter: Meter) => q(4 * meter.n, meter.d);

/** A simple slot with its onset from the bar's start and its length, in quarters. */
export type SlotQuarters = { slot: SimpleSlot; at: Quarters; length: Quarters };

/**
 * barmark's `slotTimes`, exactly, in quarters: the bar shared evenly among
 * its slots (grammar 2.1), and a group's slot among its members by
 * `memberShares` (2.2). A share is 1/k of k members or a quarter's
 * multiple, so it is whole over lcm(k, 4).
 */
export function slotQuarters(slots: Slot[], meter: Meter): SlotQuarters[] {
	const each = mul(barQuarters(meter), q(1, slots.length));
	const out: SlotQuarters[] = [];
	let at = ZERO;
	for (const s of slots) {
		const members = s.kind === "group" ? s.members : [s];
		const over = (members.length * 4) / gcd(members.length, 4);
		memberShares(members).forEach((share, i) => {
			const length = mul(each, q(Math.round(share * over), over));
			out.push({ slot: members[i] as SimpleSlot, at, length });
			at = add(at, length);
		});
	}
	return out;
}

/**
 * A float time back as an exact fraction: the first continued-fraction
 * convergent within 1e-9. Onsets are sums of small fractions of a bar, so
 * this finds the fraction they were computed from.
 */
export function nearest(x: number): Quarters {
	let [h, hPrev, k, kPrev] = [Math.floor(x), 1, 1, 0];
	let rest = x - h;
	while (Math.abs(x - h / k) >= 1e-9 && rest > 0) {
		const r = 1 / rest;
		const a = Math.floor(r);
		[h, hPrev] = [a * h + hPrev, h];
		[k, kPrev] = [a * k + kPrev, k];
		rest = r - a;
	}
	return q(h, k);
}
