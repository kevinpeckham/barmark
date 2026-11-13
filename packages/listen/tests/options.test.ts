import { describe, expect, test } from "bun:test";
import { gridFromBeats } from "../src/beats/grid.js";
import { chartFromBeats } from "../src/beats/pipeline.js";
import { findGrid } from "../src/grid/grid.js";
import { DEFAULTS, resolveOptions } from "../src/options.js";
import { ok, refusal, refused } from "../src/result.js";
import { reading } from "./helpers/beats.js";

const NUMERIC: [key: string, scope: "listen" | "features", inside: number[], outside: unknown[]][] =
	[
		["ALIGNMENT_SAME_PIECE_RATIO", "listen", [1, 5], [0.999, 0]],
		["ALIGNMENT_SAME_PIECE_LOCAL_COST", "listen", [1, 0.001], [0, 1.001]],
		["ALIGNMENT_SOUND_FLOOR", "features", [1, 0.001], [0, 1.001]],
		["ALIGNMENT_SOUND_WINDOW_SEC", "features", [1, 0.001], [0, 1.001]],
		["REPAIR_TRUST_FRACTION", "listen", [1, 0.001], [0, 1.001]],
		["REPAIR_SLIDE_FRACTION", "listen", [1, 0.001], [0, 1.001]],
		["REPHASE_FENCE_BEATS", "listen", [0.001, 4, 16], [0, -1, 16.001, 2e6, 1e9]],
		["ONSET_ENVELOPE_LEAD_SEC", "listen", [0, 1], [-0.001, 1.001]],
		["REPAIR_SLIDE_STEP_SEC", "listen", [1, 0.001, 0.0001], [0, 1.001, 0.000099, 1e-12]],
		["REPAIR_MIN_TRUSTED_SHARE", "listen", [1, 0.001], [0, 1.001]],
		["COMB_RANGE_FRACTION", "listen", [0.5, 0.0003], [1, 0]],
		["COMB_COARSE_STEP_FRACTION", "listen", [0.0003, 0.1, 0.00002], [0, 0.1001, 0.0000199, 1e-12]],
		[
			"COMB_FINE_STEP_FRACTION",
			"listen",
			[0.0001, 0.002, 0.000002],
			[0, 0.0021, 0.00000199, 1e-12],
		],
		["COMB_PHASE_STEP_SEC", "listen", [1, 0.001, 0.0001], [0, 1.001, 0.000099, 1e-12]],
		["TIME_ZERO_SNAP_BEATS", "listen", [0.001, 3], [0, -1]],
		["DOWNBEAT_MIN_SCORE", "listen", [0, 9], [-0.001]],
		["DOWNBEAT_OFF_COMB_MARGIN", "listen", [0, 9], [-0.001]],
		["HARMONIC_MIN_RATIO", "listen", [1, 3], [0.999]],
		["PLACEMENT_FIRST_SOUND_SLACK_BEATS", "listen", [0, 0.999], [1, -0.001]],
		["FIT_BAR_TOLERANCE", "listen", [1, 0.001], [0, 1.001]],
		["FIT_MIN_RATIO", "listen", [1, 3], [0.999]],
		["SECTION_START_SNAP_SEC", "listen", [0, 3], [-0.001]],
		["HEDGE_LOCAL_COST_FACTOR", "listen", [1, 3], [0.999]],
		["DTW_MAX_CELLS", "listen", [1, 150_000_000, 2 ** 31], [0, 1.5, 2 ** 31 + 1, 2 ** 40]],
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
		expect(Object.keys(DEFAULTS)).toHaveLength(31);
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

	test("the step floors bound each scan at 100 times the default's steps, refused by name", () => {
		const refusedAs = (o: Record<string, number>) => {
			const r = resolveOptions(o, "listen");
			return r.ok ? null : { reason: r.refusals[0]?.reason, option: option(r) };
		};
		// The seconds steps: 0.1 ms, a hundredth of the defaults' 10 ms.
		for (const key of ["COMB_PHASE_STEP_SEC", "REPAIR_SLIDE_STEP_SEC"]) {
			expect(refusedAs({ [key]: 0.0001 })).toBeNull();
			expect(refusedAs({ [key]: 0.0000999 })).toEqual({ reason: "invalid-option", option: key });
		}
		// The coarse ladder: at most 10,001 periods (COMB_RANGE_FRACTION / 5000), the default's 101 times 100.
		expect(
			refusedAs({
				COMB_RANGE_FRACTION: 0.5,
				COMB_COARSE_STEP_FRACTION: 0.0001,
				COMB_FINE_STEP_FRACTION: 0.0001,
			}),
		).toBeNull();
		expect(
			refusedAs({
				COMB_RANGE_FRACTION: 0.5,
				COMB_COARSE_STEP_FRACTION: 0.0000999,
				COMB_FINE_STEP_FRACTION: 0.0000999,
			}),
		).toEqual({ reason: "invalid-option", option: "COMB_COARSE_STEP_FRACTION" });
		// The fine ladder: at most 2,001 periods (COMB_COARSE_STEP_FRACTION / 1000), the default's 21 times 100.
		expect(
			refusedAs({ COMB_COARSE_STEP_FRACTION: 0.01, COMB_FINE_STEP_FRACTION: 0.00001 }),
		).toBeNull();
		expect(
			refusedAs({ COMB_COARSE_STEP_FRACTION: 0.01, COMB_FINE_STEP_FRACTION: 0.00000999 }),
		).toEqual({ reason: "invalid-option", option: "COMB_FINE_STEP_FRACTION" });
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

	test("prototype keys are unknown options, never thrown on or accepted", () => {
		const cases = [
			JSON.parse('{"__proto__":1}'),
			{ constructor: 1 },
			{ hasOwnProperty: 1 },
			{ toString: 1 },
		];
		for (const scope of ["listen", "features", "pipeline"] as const) {
			for (const c of cases) {
				const r = resolveOptions(c, scope);
				expect(r.ok).toBe(false);
				expect(r.ok ? "" : r.refusals[0]?.reason).toBe("invalid-option");
			}
		}
		for (const w of [JSON.parse('{"__proto__":1}'), { constructor: 1 }, { hasOwnProperty: 1 }]) {
			const r = resolveOptions({ DOWNBEAT_WEIGHTS: w }, "listen");
			expect(r.ok).toBe(false);
			expect(option(r)).toBe("DOWNBEAT_WEIGHTS");
		}
	});

	test("a sparse span list is refused", () => {
		// biome-ignore lint/suspicious/noSparseArray: the hole is the point
		expect(option(resolveOptions({ SECTION_NOVELTY_SPANS: [8, , 16] }, "listen"))).toBe(
			"SECTION_NOVELTY_SPANS",
		);
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

test("the tracker options: defaults and ranges", () => {
	expect(DEFAULTS.TRACKER_MIN_BARS).toBe(4);
	expect(DEFAULTS.TRACKER_MIN_STEADY_SHARE).toBe(0.4);
	expect(DEFAULTS.TRACKER_MIN_CLOSING_SHARE).toBe(0.5);
	const refuses = (o: object) => {
		const r = resolveOptions(o, "listen");
		return !r.ok && r.refusals[0]?.reason === "invalid-option";
	};
	expect(refuses({ TRACKER_MIN_BARS: 0 })).toBe(true);
	expect(refuses({ TRACKER_MIN_BARS: 2.5 })).toBe(true);
	expect(refuses({ TRACKER_MIN_STEADY_SHARE: -0.1 })).toBe(true);
	expect(refuses({ TRACKER_MIN_STEADY_SHARE: 1.1 })).toBe(true);
	expect(refuses({ TRACKER_MIN_CLOSING_SHARE: 0 })).toBe(true);
	expect(resolveOptions({ TRACKER_MIN_STEADY_SHARE: 0 }, "listen").ok).toBe(true);
	expect(resolveOptions({ TRACKER_MIN_CLOSING_SHARE: 1 }, "listen").ok).toBe(true);
});

test('the "beats" scope: the grid and alignment options and build, not the sound options', () => {
	expect(resolveOptions({ TRACKER_MIN_BARS: 8, build: {} }, "beats").ok).toBe(true);
	const sound = resolveOptions({ ALIGNMENT_SOUND_FLOOR: 0.1 }, "beats");
	expect(sound.ok).toBe(false);
	expect(resolveOptions({ build: {} }, "listen").ok).toBe(false);
});

describe("options that cannot be read", () => {
	const thrower = (): never => {
		throw new Error("boom");
	};
	const hostile = () => [
		Object.defineProperty({}, "COMB_RANGE_FRACTION", { get: thrower, enumerable: true }),
		new Proxy(
			{},
			{
				get: thrower,
				ownKeys: thrower,
				getPrototypeOf: thrower,
				has: thrower,
				getOwnPropertyDescriptor: thrower,
			},
		),
	];

	test.each(["features", "listen", "beats", "pipeline"] as const)(
		"resolveOptions in the %s scope refuses",
		(scope) => {
			for (const options of hostile()) {
				const r = resolveOptions(options, scope);
				expect(r.ok).toBe(false);
				if (r.ok) return;
				expect(r.refusals).toEqual([
					{
						reason: "invalid-option",
						message: "The options could not be read.",
						detail: { option: "" },
					},
				]);
			}
		},
	);

	test("gridFromBeats, chartFromBeats and findGrid refuse", () => {
		const r = reading([4, 4, 4, 4]);
		for (const options of hostile()) {
			const calls = [
				gridFromBeats(r, options as never),
				chartFromBeats({ ...r, chords: { runs: [] } }, options as never),
				findGrid(
					{ features: {} as never, chords: null, declared: { meter: "4/4", tempo: 120 } },
					options as never,
				),
			];
			for (const c of calls) expect(!c.ok && c.refusals[0]?.reason).toBe("invalid-option");
		}
	});
});
