/** Quarters to ticks (spec 3.2): the division, and every time as a whole tick. */
import { cmp, toNumber } from "../perform/quarters.js";
import type { Performance, Quarters } from "../perform/types.js";

/** The largest delta time, and so the latest tick, an SMF variable-length quantity holds. */
export const MAX_TICK = 0x0fffffff;
/** The largest multiple of 480 under SMF's 15-bit division. */
const MAX_DIVISION = 32_640;
const BASE = 480;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** Every time point of a performance: its bars, tempo map, keys, markers, and every track's notes (both ends), pedal, lyrics and words. */
function* timesOf(p: Performance): Generator<Quarters> {
	for (const list of [p.bars, p.tempos, p.keys, p.markers]) for (const e of list) yield e.at;
	for (const t of p.tracks) {
		for (const n of t.notes) {
			yield n.at;
			yield n.length;
		}
		for (const list of [t.pedal, t.lyrics, t.words]) for (const e of list) yield e.at;
	}
	yield p.end;
}

/**
 * The division (ticks a quarter, spec 3.2): the smallest multiple of 480
 * that makes every time whole, up to 32,640 and to what keeps the chart's
 * end within SMF's latest tick; beyond that, 480 and rounded.
 */
export function divisionFor(p: Performance): { ppq: number; rounded: boolean } {
	const end = toNumber(p.end);
	const fits = end > 0 ? Math.floor(MAX_TICK / end / BASE) * BASE : MAX_DIVISION;
	const limit = Math.min(MAX_DIVISION, fits);
	let ppq = BASE;
	for (const at of timesOf(p)) {
		ppq = lcm(ppq, at.d);
		if (ppq > limit) return { ppq: BASE, rounded: true };
	}
	return { ppq, rounded: false };
}

/** A converter from quarters to ticks at a division, which remembers the first time it had to round. */
export function ticker(ppq: number) {
	let firstRounded: Quarters | null = null;
	const tick = (at: Quarters): number => {
		const exact = (at.n * ppq) / at.d;
		const whole = Math.round(exact);
		if (whole !== exact && (firstRounded === null || cmp(at, firstRounded) < 0)) firstRounded = at;
		return whole;
	};
	return {
		tick,
		/** A note's on and off ticks: rounded, but never to zero length. */
		span: (at: Quarters, end: Quarters): [number, number] => {
			const on = tick(at);
			return [on, Math.max(on + 1, tick(end))];
		},
		firstRounded: () => firstRounded,
	};
}
