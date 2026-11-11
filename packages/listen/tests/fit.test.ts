/**
 * The fit (design §6.3): the app's `alignmentFit.test.ts`, ported onto
 * refusal reasons. Every reason that holds is listed, in the order
 * bar-one-far, bar-length-off, weak-fit, no-period or bars-off-middle,
 * not-same-piece.
 */
import { describe, expect, test } from "bun:test";
import { alignmentFit } from "../src/align/fit.js";
import type { Alignment } from "../src/align/path.js";
import { DEFAULTS, resolveOptions } from "../src/options.js";
import { alignmentOf } from "./helpers/alignment.js";

/** Bar starts from `first`, each bar `spans[i]` long (the last span repeats). */
function starts(first: number, spans: number[], n: number): number[] {
	const out = [first];
	for (let i = 1; i < n; i++)
		out.push((out[i - 1] as number) + (spans[Math.min(i - 1, spans.length - 1)] as number));
	return out;
}

/** 132 bpm in 4/4: a declared bar of 1.82 s. */
const DECLARED = { startAt: 0, barSeconds: (60 / 132) * 4 };

/** An alignment of `barStarts` whose local costs are low (the same-piece gate passes on them). */
const aligned = (over: Partial<Alignment>) =>
	alignmentOf({ localCost: Array(40).fill(0.05), ...over });

const reasonsOf = (a: Alignment, declared = DECLARED, flat = false) =>
	alignmentFit(a, declared, flat, DEFAULTS).refusals.map((r) => r.reason);

describe("alignmentFit: the app's alignmentFit", () => {
	test("fails Letter Lands' alignment on bar 1 and the bar length", () => {
		// Bar 1 at 8.06 s, the first seven bars 0.9 s, then 1.5 s bars.
		const barStarts = starts(8.06, [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.5], 70);
		const a = aligned({ barStarts, cost: 0.1, controlCost: 0.5, firstSound: 0 });
		const { fit, refusals } = alignmentFit(a, DECLARED, false, DEFAULTS);
		expect(fit.bar1).toBe(8.06);
		expect(fit.medianBar).toBeCloseTo(1.5);
		expect(fit.declaredBar).toBe(DECLARED.barSeconds);
		expect(refusals.map((r) => r.reason)).toEqual(["bar-one-far", "bar-length-off"]);
		expect(refusals[0]?.message).toBe("Bar 1 is at 8.1 s where the music starts at 0.0 s.");
		expect(refusals[0]?.detail).toEqual({ bar1: 8.06, music: 0, declaredBar: DECLARED.barSeconds });
		expect(refusals[1]?.message).toBe(
			"The aligned bars are 1.50 s where the declared bar is 1.82 s.",
		);
	});

	test("passes a clean alignment", () => {
		const barStarts = starts(0.1, [1.8, 1.84, 1.82, 1.83, 1.81], 40);
		const { fit, refusals } = alignmentFit(
			aligned({ barStarts, cost: 0.05, controlCost: 0.45, firstSound: 0 }),
			DECLARED,
			false,
			DEFAULTS,
		);
		expect(refusals).toEqual([]);
		expect(fit.ratio).toBeCloseTo(9);
	});

	test("fails a chart that barely beats a wrong one: weak-fit, and the same-piece gate", () => {
		const barStarts = starts(0.1, [1.82], 40);
		expect(reasonsOf(aligned({ barStarts, cost: 0.1, controlCost: 0.12 }))).toEqual([
			"weak-fit",
			"not-same-piece",
		]);
	});

	test("measures bar 1 from the first sound when it comes after the start", () => {
		const barStarts = starts(6, [1.82], 40);
		const cost = { cost: 0.05, controlCost: 0.45 };
		expect(reasonsOf(aligned({ barStarts, ...cost, firstSound: 5.5 }))).toEqual([]);
		expect(reasonsOf(aligned({ barStarts, ...cost, firstSound: 0 }))).toEqual(["bar-one-far"]);
		expect(
			reasonsOf(aligned({ barStarts, ...cost, firstSound: 0 }), { ...DECLARED, startAt: 5 }),
		).toEqual([]);
	});

	test("a refused re-phase is bars-off-middle; a flat envelope is no-period instead; a re-phase adds nothing", () => {
		const base = { barStarts: starts(0.1, [1.82], 40), cost: 0.05, controlCost: 0.45 };
		expect(reasonsOf(aligned({ ...base, repair: null }))).toEqual(["bars-off-middle"]);
		expect(reasonsOf(aligned({ ...base, repair: null }), DECLARED, true)).toEqual(["no-period"]);
		expect(reasonsOf(aligned(base))).toEqual([]);
	});

	test("needs two bar starts, and keeps the ratio's edges: cost 0 is Infinity", () => {
		const one = alignmentFit(aligned({ barStarts: [0] }), DECLARED, false, DEFAULTS);
		expect(one.refusals.map((r) => r.reason)).toEqual(["no-bars"]);
		expect(one.fit.medianBar).toBeNaN();
		const zero = alignmentFit(
			aligned({ barStarts: [0, 1.82], cost: 0, controlCost: 0.5 }),
			DECLARED,
			false,
			DEFAULTS,
		);
		expect(zero.fit.ratio).toBe(Number.POSITIVE_INFINITY);
		expect(zero.refusals).toEqual([]);
		const none = alignmentFit(
			aligned({ barStarts: [0, 1.82], cost: 0.1, controlCost: 0 }),
			DECLARED,
			false,
			DEFAULTS,
		);
		expect(none.fit.ratio).toBe(0);
		expect(none.refusals.map((r) => r.reason)).toEqual(["weak-fit", "not-same-piece"]);
	});
});

describe("alignmentFit: options and the alignment", () => {
	test("FIT_BAR_TOLERANCE and FIT_MIN_RATIO come from the settings", () => {
		const barStarts = starts(0, [2], 20); // 2 s bars: 10 % off 1.82 s
		const a = aligned({ barStarts, cost: 0.1, controlCost: 0.18 });
		expect(reasonsOf(a)).toEqual([]);
		const r = resolveOptions({ FIT_BAR_TOLERANCE: 0.05, FIT_MIN_RATIO: 2 }, "listen");
		if (!r.ok) throw new Error("options");
		expect(
			alignmentFit(a, DECLARED, false, r.value.settings).refusals.map((x) => x.reason),
		).toEqual(["bar-length-off", "weak-fit"]);
	});

	test("the alignment is read, never written", () => {
		const a = aligned({ barStarts: starts(8, [0.9], 30), repair: null });
		const before = structuredClone(a);
		alignmentFit(a, DECLARED, false, DEFAULTS);
		expect(a).toEqual(before);
	});
});
