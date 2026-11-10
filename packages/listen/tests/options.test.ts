import { describe, expect, test } from "bun:test";
import { DEFAULTS, resolveOptions } from "../src/options.js";
import { ok, refusal, refused } from "../src/result.js";

const NUMERIC: [key: string, scope: "listen" | "features", inside: number[], outside: unknown[]][] =
	[
		["ALIGNMENT_SAME_PIECE_RATIO", "listen", [1, 5], [0.999, 0]],
		["ALIGNMENT_SAME_PIECE_LOCAL_COST", "listen", [1, 0.001], [0, 1.001]],
		["ALIGNMENT_SOUND_FLOOR", "features", [1, 0.001], [0, 1.001]],
		["ALIGNMENT_SOUND_WINDOW_SEC", "features", [1, 0.001], [0, 1.001]],
		["REPAIR_TRUST_FRACTION", "listen", [1, 0.001], [0, 1.001]],
		["REPAIR_SLIDE_FRACTION", "listen", [1, 0.001], [0, 1.001]],
		["REPHASE_FENCE_BEATS", "listen", [0.001, 4], [0, -1]],
		["ONSET_ENVELOPE_LEAD_SEC", "listen", [0, 1], [-0.001, 1.001]],
		["REPAIR_SLIDE_STEP_SEC", "listen", [1, 0.001], [0, 1.001]],
		["REPAIR_MIN_TRUSTED_SHARE", "listen", [1, 0.001], [0, 1.001]],
		["COMB_RANGE_FRACTION", "listen", [0.5, 0.0003], [1, 0]],
		["COMB_COARSE_STEP_FRACTION", "listen", [0.0003, 0.1], [0, 0.1001]],
		["COMB_FINE_STEP_FRACTION", "listen", [0.0001, 0.002], [0, 0.0021]],
		["COMB_PHASE_STEP_SEC", "listen", [1, 0.001], [0, 1.001]],
		["TIME_ZERO_SNAP_BEATS", "listen", [0.001, 3], [0, -1]],
		["DOWNBEAT_MIN_SCORE", "listen", [0, 9], [-0.001]],
		["DOWNBEAT_OFF_COMB_MARGIN", "listen", [0, 9], [-0.001]],
		["HARMONIC_MIN_RATIO", "listen", [1, 3], [0.999]],
		["PLACEMENT_FIRST_SOUND_SLACK_BEATS", "listen", [0, 0.999], [1, -0.001]],
		["FIT_BAR_TOLERANCE", "listen", [1, 0.001], [0, 1.001]],
		["FIT_MIN_RATIO", "listen", [1, 3], [0.999]],
		["SECTION_START_SNAP_SEC", "listen", [0, 3], [-0.001]],
		["HEDGE_LOCAL_COST_FACTOR", "listen", [1, 3], [0.999]],
		["DTW_MAX_CELLS", "listen", [1, 150_000_000], [0, 1.5]],
		["MAX_GRID_BARS", "listen", [1, 2000], [0, 1.5]],
		["PICKUP_MAX_BAR_FRACTION", "listen", [1, 0.001], [0, 1.001]],
	];

const NOT_NUMBERS = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "1", null];

function option(r: ReturnType<typeof resolveOptions>): string | number | boolean | undefined {
	return r.ok ? undefined : r.refusals[0]?.detail?.option;
}

describe("result", () => {
	test("ok, refusal and refused build the shapes of section 4", () => {
		expect(ok(1)).toEqual({ ok: true, value: 1, warnings: [] });
		const r = refusal("no-bars", "The chart plays no bars.", { n: 0 });
		expect(r).toEqual({ reason: "no-bars", message: "The chart plays no bars.", detail: { n: 0 } });
		expect(refusal("no-bars", "m")).toEqual({ reason: "no-bars", message: "m" });
		expect(refused([r], [], { reading: 3 })).toEqual({
			ok: false,
			refusals: [r],
			warnings: [],
			reading: 3,
		});
	});
});

describe("DEFAULTS", () => {
	test("hold the 28 keys with the spec's values, deep-frozen", () => {
		expect(Object.keys(DEFAULTS)).toHaveLength(28);
		expect(DEFAULTS.ALIGNMENT_SAME_PIECE_RATIO).toBe(1.6);
		expect(DEFAULTS.ALIGNMENT_SOUND_FLOOR).toBe(0.02);
		expect(DEFAULTS.COMB_FINE_STEP_FRACTION).toBe(0.0002);
		expect(DEFAULTS.DOWNBEAT_WEIGHTS).toEqual({ timeZero: 2, harmonicRhythm: 2, sections: 1 });
		expect(DEFAULTS.SECTION_NOVELTY_SPANS).toEqual([8, 16]);
		expect(DEFAULTS.DTW_MAX_CELLS).toBe(150_000_000);
		expect(DEFAULTS.MAX_GRID_BARS).toBe(2000);
		expect(DEFAULTS.PICKUP_MAX_BAR_FRACTION).toBe(0.5);
		expect(Object.isFrozen(DEFAULTS)).toBe(true);
		expect(Object.isFrozen(DEFAULTS.DOWNBEAT_WEIGHTS)).toBe(true);
		expect(Object.isFrozen(DEFAULTS.SECTION_NOVELTY_SPANS)).toBe(true);
	});

	test("every default is inside its own range", () => {
		for (const [key, scope] of NUMERIC) {
			const r = resolveOptions({ [key]: (DEFAULTS as Record<string, unknown>)[key] }, scope);
			expect(r.ok).toBe(true);
		}
	});
});

describe("resolveOptions", () => {
	test("merges a value over the defaults without touching them", () => {
		const r = resolveOptions({ COMB_RANGE_FRACTION: 0.05 }, "listen");
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.settings.COMB_RANGE_FRACTION).toBe(0.05);
		expect(r.value.settings.FIT_MIN_RATIO).toBe(DEFAULTS.FIT_MIN_RATIO);
		expect(Object.isFrozen(r.value.settings)).toBe(true);
		expect(r.value.settings).not.toBe(DEFAULTS);
		expect(DEFAULTS.COMB_RANGE_FRACTION).toBe(0.1);
	});

	test("undefined is no options", () => {
		const r = resolveOptions(undefined, "listen");
		expect(r.ok && r.value.settings).toEqual(DEFAULTS);
	});

	test("an unknown key is refused by name", () => {
		const r = resolveOptions({ COMB_RANGE_FRACTON: 0.05 }, "listen");
		expect(r.ok).toBe(false);
		expect(r.ok ? "" : r.refusals[0]?.reason).toBe("invalid-option");
		expect(option(r)).toBe("COMB_RANGE_FRACTON");
	});

	test("scopes: sound keys are features only, the rest are not", () => {
		expect(resolveOptions({ ALIGNMENT_SOUND_FLOOR: 0.1 }, "listen").ok).toBe(false);
		expect(resolveOptions({ COMB_RANGE_FRACTION: 0.1 }, "features").ok).toBe(false);
		expect(resolveOptions({ ALIGNMENT_SOUND_FLOOR: 0.1 }, "features").ok).toBe(true);
		expect(
			resolveOptions({ ALIGNMENT_SOUND_FLOOR: 0.1, COMB_RANGE_FRACTION: 0.2 }, "pipeline").ok,
		).toBe(true);
	});

	test("build is accepted in the pipeline scope only and passed through", () => {
		const build = { anything: 1 };
		const r = resolveOptions({ build }, "pipeline");
		expect(r.ok && r.value.build).toBe(build as never);
		expect(option(resolveOptions({ build }, "listen"))).toBe("build");
		expect(option(resolveOptions({ build }, "features"))).toBe("build");
	});

	describe.each(NUMERIC)("%s", (key, scope, inside, outside) => {
		test.each(inside)("accepts %p", (v) => {
			const r = resolveOptions({ [key]: v }, scope);
			// A comb key may fail its joint check against a neighbour; it must not fail its own range.
			if (!r.ok) expect(r.refusals[0]?.detail?.option).not.toBe(key);
			else expect((r.value.settings as Record<string, unknown>)[key]).toBe(v);
		});
		test.each(outside)("refuses %p", (v) => {
			expect(option(resolveOptions({ [key]: v }, scope))).toBeDefined();
		});
		test.each(NOT_NUMBERS)("refuses %p", (v) => {
			expect(option(resolveOptions({ [key]: v }, scope))).toBe(key);
		});
	});

	test("the comb steps are checked together", () => {
		const r = resolveOptions({ COMB_FINE_STEP_FRACTION: 0.01 }, "listen");
		expect(r.ok).toBe(false);
		expect(option(r)).toBe("COMB_FINE_STEP_FRACTION");
		expect(
			resolveOptions(
				{
					COMB_RANGE_FRACTION: 0.05,
					COMB_COARSE_STEP_FRACTION: 0.05,
					COMB_FINE_STEP_FRACTION: 0.05,
				},
				"listen",
			).ok,
		).toBe(true);
		expect(resolveOptions({ COMB_RANGE_FRACTION: 0.001 }, "listen").ok).toBe(false);
	});

	test("DOWNBEAT_WEIGHTS merges a partial object and refuses strangers", () => {
		const r = resolveOptions({ DOWNBEAT_WEIGHTS: { timeZero: 0 } }, "listen");
		expect(r.ok && r.value.settings.DOWNBEAT_WEIGHTS).toEqual({
			timeZero: 0,
			harmonicRhythm: 2,
			sections: 1,
		});
		expect(r.ok && Object.isFrozen(r.value.settings.DOWNBEAT_WEIGHTS)).toBe(true);
		expect(option(resolveOptions({ DOWNBEAT_WEIGHTS: { tz: 1 } }, "listen"))).toBe(
			"DOWNBEAT_WEIGHTS",
		);
		expect(option(resolveOptions({ DOWNBEAT_WEIGHTS: { timeZero: -1 } }, "listen"))).toBe(
			"DOWNBEAT_WEIGHTS",
		);
		expect(option(resolveOptions({ DOWNBEAT_WEIGHTS: { timeZero: Number.NaN } }, "listen"))).toBe(
			"DOWNBEAT_WEIGHTS",
		);
		expect(option(resolveOptions({ DOWNBEAT_WEIGHTS: [] }, "listen"))).toBe("DOWNBEAT_WEIGHTS");
		expect(option(resolveOptions({ DOWNBEAT_WEIGHTS: null }, "listen"))).toBe("DOWNBEAT_WEIGHTS");
	});

	test("SECTION_NOVELTY_SPANS is a non-empty list of whole numbers from 1", () => {
		const r = resolveOptions({ SECTION_NOVELTY_SPANS: [4, 32] }, "listen");
		expect(r.ok && r.value.settings.SECTION_NOVELTY_SPANS).toEqual([4, 32]);
		expect(r.ok && Object.isFrozen(r.value.settings.SECTION_NOVELTY_SPANS)).toBe(true);
		for (const bad of [[], [8.5], [0], ["8"], 8, null, [Number.NaN]]) {
			expect(option(resolveOptions({ SECTION_NOVELTY_SPANS: bad }, "listen"))).toBe(
				"SECTION_NOVELTY_SPANS",
			);
		}
	});

	test("options that are not a plain object are refused with an empty option", () => {
		for (const bad of [null, [], "x", 3, true]) {
			const r = resolveOptions(bad, "listen");
			expect(r.ok).toBe(false);
			if (r.ok) continue;
			expect(r.refusals.length).toBeGreaterThanOrEqual(1);
			expect(r.refusals[0]?.reason).toBe("invalid-option");
			expect(r.refusals[0]?.detail?.option).toBe("");
		}
	});
});
