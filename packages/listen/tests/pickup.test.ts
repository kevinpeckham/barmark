/** Placing bar one with a pickup (design §7, Rulings 1, 5 and 6), and `barStartsFrom`. */
import { describe, expect, test } from "bun:test";
import { beatsOf, parseMeter } from "barmark";
import { barStartsFrom, placeAtStart, placeBarOne } from "../src/grid/place.js";
import { DEFAULTS, resolveOptions, type Settings } from "../src/options.js";
import { seeded } from "./helpers/seeded.js";

const s = DEFAULTS;

/** `options` merged over the defaults, as a stage receives them. */
function settings(options: Record<string, unknown>): Settings {
	const r = resolveOptions(options, "listen");
	if (!r.ok) throw new Error(r.refusals.map((p) => p.message).join(" "));
	return r.value.settings;
}

/** 4/4 at 120: beat 0.5 s, bar 2 s, anchor 1.0. */
const lattice = { anchor: 1, beat: 0.5, period: 2, beatsPerBar: 4 };
const DURATION = 20;
const codes = (p: { warnings: { code: string }[] } | null) => p?.warnings.map((w) => w.code);

describe("barStartsFrom (the app's)", () => {
	test("bar starts every period from a, then the end; a first start before zero is clamped", () => {
		expect(barStartsFrom(1, 2, 6, 2000)).toEqual({ bars: [1, 3, 5, 6], truncated: false });
		expect(barStartsFrom(-0.5, 2, 4, 2000)).toEqual({ bars: [0, 1.5, 3.5, 4], truncated: false });
		expect(barStartsFrom(6, 2, 6, 2000)).toBeNull();
		expect(barStartsFrom(Number.NaN, 2, 6, 2000)).toBeNull();
	});

	test("max bars, then the next start: truncated only when the recording goes on", () => {
		expect(barStartsFrom(0, 1, 10, 3)).toEqual({ bars: [0, 1, 2, 3], truncated: true });
		expect(barStartsFrom(0, 1, 3, 3)).toEqual({ bars: [0, 1, 2, 3], truncated: false });
		expect(barStartsFrom(0, 1, 2.5, 3)).toEqual({ bars: [0, 1, 2, 2.5], truncated: false });
	});
});

describe("placeBarOne: pickups (design §7)", () => {
	test("the first sound in bar one's first beat: bars from it, no pickup", () => {
		const p = placeBarOne(lattice, 0, 1.1, DURATION, s);
		expect(p?.bars[0]).toBe(1);
		expect(p?.pickup).toBeNull();
		expect(p?.warnings).toEqual([]);
	});

	test("one beat before a downbeat: a one-beat pickup, bar one at that downbeat", () => {
		const p = placeBarOne(lattice, 0, 2.55, DURATION, s);
		expect(p?.bars.slice(0, 2)).toEqual([3, 5]);
		expect(p?.pickup).toEqual({ start: 2.5, beats: 1 });
		expect(p?.warnings).toEqual([
			expect.objectContaining({ code: "pickup", detail: { start: 2.5, beats: 1 } }),
		]);
	});

	test("two beats before, half a bar: a two-beat pickup", () => {
		const p = placeBarOne(lattice, 0, 2.05, DURATION, s);
		expect(p?.bars[0]).toBe(3);
		expect(p?.pickup).toEqual({ start: 2, beats: 2 });
	});

	test("three beats before, more than half a bar: no pickup, bar one opens with a rest", () => {
		const p = placeBarOne(lattice, 0, 1.55, DURATION, s);
		expect(p?.bars[0]).toBe(1);
		expect(p?.pickup).toBeNull();
		expect(p?.warnings).toEqual([]);
	});

	test("PICKUP_MAX_BAR_FRACTION: 1 makes the three-beat lead-in a pickup", () => {
		const p = placeBarOne(lattice, 0, 1.55, DURATION, settings({ PICKUP_MAX_BAR_FRACTION: 1 }));
		expect(p?.bars[0]).toBe(3);
		expect(p?.pickup).toEqual({ start: 1.5, beats: 3 });
	});

	test("6/8 at 40: one eighth before a downbeat is a one-eighth pickup (Ruling 1: no guard)", () => {
		const meter = parseMeter("6/8");
		if (!meter) throw new Error("6/8");
		const period = (beatsOf(meter) * 60) / 40;
		expect(period).toBe(3);
		const eighths = { anchor: 1, beat: period / meter.n, period, beatsPerBar: meter.n };
		const p = placeBarOne(eighths, 0, 3.5, DURATION, s);
		expect(p?.bars[0]).toBe(4);
		expect(p?.pickup).toEqual({ start: 3.5, beats: 1 });
	});

	test("a bar one before 0:00 is clamped to it, with bar-one-clamped", () => {
		const p = placeBarOne({ ...lattice, anchor: -0.3 }, 0, 0.05, DURATION, s);
		expect(p?.bars.slice(0, 2)).toEqual([0, 1.7]);
		expect(p?.pickup).toBeNull();
		expect(codes(p)).toEqual(["bar-one-clamped"]);
		expect(p?.warnings[0]?.detail).toEqual({ start: -0.3 });
	});

	test("a pickup whose start falls before 0:00 is clamped to it", () => {
		// Bar 0 from a = 0.9 − 2 = −1.1; the sound at 0.05 is j = ⌊1.15 / 0.5 + 0.25⌋ = 2 beats in,
		// so the pickup starts at max(0, −1.1 + 2 × 0.5) = 0 and lasts the other 2 beats.
		const p = placeBarOne({ ...lattice, anchor: 0.9 }, 0, 0.05, DURATION, s);
		expect(p?.bars[0]).toBeCloseTo(0.9, 12);
		expect(p?.bars[1]).toBeCloseTo(2.9, 12);
		expect(p?.pickup).toEqual({ start: 0, beats: 2 });
		expect(codes(p)).toEqual(["pickup"]);
	});

	test("a pickup whose bar one would be at or past the end is not reported (Ruling 5)", () => {
		const p = placeBarOne(lattice, 0, 2.55, 3, s);
		expect(p?.bars).toEqual([1, 3]);
		expect(p?.pickup).toBeNull();
		expect(p?.warnings).toEqual([]);
	});

	test("bar one at or past the end: null", () => {
		expect(placeBarOne(lattice, 0, 30, DURATION, s)).toBeNull();
	});

	test("a pickup cut by MAX_GRID_BARS warns grid-truncated beside it", () => {
		const p = placeBarOne(lattice, 0, 2.55, DURATION, settings({ MAX_GRID_BARS: 3 }));
		expect(p?.bars).toEqual([3, 5, 7, 9]);
		expect(codes(p)).toEqual(["pickup", "grid-truncated"]);
	});

	test("property: bar one holds the first sound, or a pickup of at most half a bar leads into it", () => {
		const rand = seeded(11);
		for (let k = 0; k < 500; k++) {
			const fs = 6 * rand();
			const cls = Math.floor(4 * rand());
			const p = placeBarOne(lattice, cls, fs, DURATION, s);
			if (!p) throw new Error("null");
			const heard = fs + s.PLACEMENT_FIRST_SOUND_SLACK_BEATS * lattice.beat;
			const [first, second] = p.bars as [number, number];
			if (p.pickup === null) {
				expect(first).toBeLessThanOrEqual(heard);
				expect(heard).toBeLessThan(second);
			} else {
				expect(p.pickup.start).toBeLessThanOrEqual(heard);
				expect(heard).toBeLessThan(first);
				expect(first - p.pickup.start).toBeLessThanOrEqual(0.5 * lattice.period + 1e-9);
				expect(p.pickup.beats).toBeGreaterThanOrEqual(1);
			}
			const clamped = codes(p)?.includes("bar-one-clamped") ?? false;
			for (let i = 1; i < p.bars.length - 1; i++) {
				const step = (p.bars[i] as number) - (p.bars[i - 1] as number);
				expect(step).toBeGreaterThan(0);
				if (i > 1 || !clamped) expect(Math.abs(step - lattice.period)).toBeLessThan(1e-9);
			}
			expect(p.bars.at(-1)).toBeGreaterThan(p.bars.at(-2) as number);
		}
	});
});

describe("placeAtStart: a person's bar one (Ruling 6)", () => {
	test("bar one at the lattice beat nearest the start, whatever its class", () => {
		const p = placeAtStart(lattice, 4.1, 4.0, DURATION, s);
		expect(p?.bars.slice(0, 2)).toEqual([4, 6]);
		expect(p?.pickup).toBeNull();
		expect(p?.warnings).toEqual([]);
		expect(placeAtStart(lattice, 2.6, 2.5, DURATION, s)?.bars.slice(0, 2)).toEqual([2.5, 4.5]);
	});

	test("sound a beat before the start: a one-beat pickup", () => {
		const p = placeAtStart(lattice, 4, 3.4, DURATION, s);
		expect(p?.bars[0]).toBe(4);
		expect(p?.pickup).toEqual({ start: 3.5, beats: 1 });
		expect(codes(p)).toEqual(["pickup"]);
	});

	test("unbounded: three beats before is a three-beat pickup", () => {
		const p = placeAtStart(lattice, 4, 2.45, DURATION, s);
		expect(p?.pickup).toEqual({ start: 2.5, beats: 3 });
	});

	test("sound a bar or more before the start: sound-before-start, no pickup", () => {
		const p = placeAtStart(lattice, 4, 1.5, DURATION, s);
		expect(p?.bars[0]).toBe(4);
		expect(p?.pickup).toBeNull();
		expect(codes(p)).toEqual(["sound-before-start"]);
		expect(p?.warnings[0]?.detail).toEqual({ start: 4, firstSound: 1.5 });
	});

	test("a beat count of 0 (just under a bar before) is sound-before-start too", () => {
		const p = placeAtStart(lattice, 4, 2.1, DURATION, s);
		expect(p?.pickup).toBeNull();
		expect(codes(p)).toEqual(["sound-before-start"]);
	});

	test("sound within the slack before the start, or after it: nothing", () => {
		expect(placeAtStart(lattice, 4, 3.95, DURATION, s)?.warnings).toEqual([]);
		expect(placeAtStart(lattice, 4, 3.95, DURATION, s)?.pickup).toBeNull();
		expect(placeAtStart(lattice, 4, 5, DURATION, s)?.warnings).toEqual([]);
	});

	test("a start before the first lattice beat is clamped; past the end is null", () => {
		const p = placeAtStart({ ...lattice, anchor: 0.3 }, 0, 0, DURATION, s);
		expect(p?.bars.slice(0, 2)).toEqual([0, 1.8]);
		expect(codes(p)).toEqual(["bar-one-clamped"]);
		expect(placeAtStart(lattice, 25, 0, DURATION, s)).toBeNull();
	});

	test("a pickup clamped at 0:00 starts at 0", () => {
		const p = placeAtStart({ ...lattice, anchor: 0.2 }, 0.2, 0, DURATION, s);
		expect(p?.bars[0]).toBe(0.2);
		expect(p?.pickup).toEqual({ start: 0, beats: 1 });
	});
});
