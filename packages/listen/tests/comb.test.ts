/** The onset comb, the trusted span, the slide, the grid re-phase and the v3 end repair: the app's `alignmentRepair.test.ts`, ported, and more. */
import { describe, expect, test } from "bun:test";
import { flatEnvelope, jointOnsetComb } from "../src/comb/comb.js";
import { repairEnds } from "../src/comb/ends.js";
import { rephaseGrid } from "../src/comb/rephase.js";
import { combSlide } from "../src/comb/slide.js";
import { phaseLine, trustedSpan } from "../src/comb/span.js";
import { DEFAULTS, resolveOptions, type Settings } from "../src/options.js";
import {
	barsAndBeats,
	barsAndBeatsOf,
	dtwShape,
	envelope,
	FPS,
	N,
	P,
	rng,
	T0,
	truth,
} from "./helpers/onsets.js";
import { seeded } from "./helpers/seeded.js";

const s = DEFAULTS;

/** `options` merged over the defaults, as a stage receives them. */
function settings(options: Record<string, unknown>): Settings {
	const r = resolveOptions(options, "listen");
	if (!r.ok) throw new Error(r.refusals.map((p) => p.message).join(" "));
	return r.value.settings;
}

describe("jointOnsetComb", () => {
	test("finds the bar within 0.05 % from a declared bar 3 % off", () => {
		const comb = jointOnsetComb(barsAndBeats, FPS, P * 1.03, s);
		expect(Math.abs(comb.period - P) / P).toBeLessThan(0.0005);
		const slow = jointOnsetComb(barsAndBeats, FPS, P * 0.97, s);
		expect(Math.abs(slow.period - P) / P).toBeLessThan(0.0005);
	});

	test("30 seeded lattices: the period within 0.05 % from a declared bar 5 % off", () => {
		const rand = seeded(2026);
		for (let k = 0; k < 30; k++) {
			const period = 1.2 + 2.8 * rand();
			const phase = period * rand();
			const seconds = 60 + 180 * rand();
			const bars: number[] = [];
			for (let t = phase; t < seconds - period; t += period) bars.push(t + 0.04 * (rand() - 0.5));
			const onset = envelope(barsAndBeatsOf(bars, period), seconds, rng(k + 1));
			const declared = period * (k % 2 ? 1.05 : 0.95);
			const comb = jointOnsetComb(onset, FPS, declared, s);
			expect([k, Math.abs(comb.period - period) / period < 0.0005]).toEqual([k, true]);
		}
	});
});

describe("flatEnvelope", () => {
	test("empty, all-zero and constant envelopes are flat; one click is not", () => {
		expect(flatEnvelope(new Float32Array(0), FPS)).toBe(true);
		expect(flatEnvelope(new Float32Array(1000), FPS)).toBe(true);
		expect(flatEnvelope(new Float32Array(1000).fill(0.3), FPS)).toBe(true);
		const click = new Float32Array(1000);
		click[500] = 1;
		expect(flatEnvelope(click, FPS)).toBe(false);
	});
});

describe("repairEnds", () => {
	test("puts every start within 0.05 s of the truth and marks the rebuilt ends extrapolated", () => {
		const { period } = jointOnsetComb(barsAndBeats, FPS, P * 1.03, s);
		const repaired = repairEnds(dtwShape(), barsAndBeats, FPS, period, s);
		if (!repaired) throw new Error("refused");
		expect(repaired.barStarts).toHaveLength(N);
		for (const [i, t] of repaired.barStarts.entries())
			expect(Math.abs(t - (truth[i] as number))).toBeLessThanOrEqual(0.05);
		expect(repaired.iFirst).toBe(7);
		expect(repaired.iLast).toBe(N - 7);
		expect(repaired.confidence.slice(0, 7).every((c) => c === "extrapolated")).toBe(true);
		expect(repaired.confidence.slice(-6).every((c) => c === "extrapolated")).toBe(true);
		expect(repaired.confidence.slice(7, -6).every((c) => c === "aligned")).toBe(true);
	});

	test("refuses a middle that sits 0.4 bar off the lattice everywhere", () => {
		const ts = truth.map((t, i) => t + (i % 2 ? 0.4 : -0.4) * P);
		expect(repairEnds(ts, barsAndBeats, FPS, P, s)).toBeNull();
	});

	test("fences an end's slide at a quarter bar even when the onsets sit 0.4 bar later", () => {
		const hits = truth.map((t, i) => [i < 7 ? t + 0.4 * P : t, 1] as [number, number]);
		const onset = envelope(hits);
		const ts = dtwShape();
		const repaired = repairEnds(ts, onset, FPS, P, s);
		if (!repaired) throw new Error("refused");
		expect(Math.abs(repaired.slides.intro)).toBeLessThanOrEqual(0.25 * P + 1e-9);
		for (let k = 0; k < 7; k++) {
			const extrapolated = (ts[7] as number) - (7 - k) * P;
			expect(Math.abs((repaired.barStarts[k] as number) - extrapolated)).toBeLessThanOrEqual(
				0.25 * P + 1e-9,
			);
		}
	});
});

describe("trustedSpan and combSlide", () => {
	test("the span opens and closes on runs of four; none is null", () => {
		const ts = truth.slice(0, 10).map((t, i) => (i === 0 || i === 9 ? t + 1 : t));
		expect(trustedSpan(ts, P, (i) => T0 + i * P, s)).toEqual({ iFirst: 1, iLast: 8 });
		const scattered = truth.slice(0, 10).map((t, i) => (i % 3 === 0 ? t + 1 : t));
		expect(trustedSpan(scattered, P, (i) => T0 + i * P, s)).toBeNull();
	});

	test("slides a set of times onto the onsets", () => {
		const shifted = truth.slice(0, 5).map((t) => t - 0.2);
		expect(combSlide(barsAndBeats, FPS, shifted, 0.3, s)).toBeCloseTo(0.2, 5);
	});

	test("the phase line is the middle's median residual, with its trusted span", () => {
		const line = phaseLine(dtwShape(), P, s);
		if (!line) throw new Error("refused");
		expect(Math.abs(line.phase - T0)).toBeLessThanOrEqual(0.03);
		expect([line.iFirst, line.iLast]).toEqual([7, N - 7]);
	});
});

describe("rephaseGrid (stem-bench Study 27, recipe v5)", () => {
	const BP = 0.8;
	const BEATS = 3;
	const RFPS = 125;
	const n = 60;
	const anchor = 0.3;
	/** A single-frame impulse at each of `times`. */
	function impulses(times: number[]): Float32Array {
		const env = new Float32Array(Math.ceil((anchor + n * BP + 2) * RFPS));
		for (const t of times) {
			const f = Math.round(t * RFPS);
			if (f >= 0 && f < env.length) env[f] = 1;
		}
		return env;
	}
	const bars = Array.from({ length: n }, (_, i) => anchor + i * BP);
	const beats = Array.from({ length: n * BEATS }, (_, k) => anchor + (k * BP) / BEATS);

	test("moves a coherently offset grid onto the onset lattice", () => {
		const ts = bars.map((t) => t + 0.11);
		const out = rephaseGrid(ts, impulses(bars), RFPS, BP, BEATS, s);
		if (!out) throw new Error("refused");
		for (const i of [0, 1, 30, 58, 59])
			expect(Math.abs((out.barStarts[i] as number) - (bars[i] as number))).toBeLessThanOrEqual(
				0.02,
			);
		expect(Math.abs(out.delta + 0.11)).toBeLessThanOrEqual(0.02);
	});

	test("the half-beat fence cannot hop to the neighboring beat", () => {
		const beat = BP / BEATS;
		const ts = bars.map((t) => t + 0.9 * beat);
		const out = rephaseGrid(ts, impulses(beats), RFPS, BP, BEATS, s);
		if (!out) throw new Error("refused");
		expect(Math.abs(out.delta)).toBeLessThanOrEqual(0.5 * beat + 1e-9);
	});

	test("still refuses an untrusted interior", () => {
		const ts = Array.from({ length: n }, (_, i) => ((i * 7919) % 97) + (i % 2) * 40);
		expect(rephaseGrid(ts, new Float32Array(1000), RFPS, BP, BEATS, s)).toBeNull();
	});

	test("the lattice at every beat with the grid already on a downbeat leaves delta at 0", () => {
		const out = rephaseGrid(bars, impulses(beats), RFPS, BP, BEATS, s);
		if (!out) throw new Error("refused");
		expect(Math.abs(out.delta)).toBeLessThanOrEqual(0.01);
		expect(out.confidence.every((c) => c === "aligned")).toBe(true);
	});

	test("REPHASE_FENCE_BEATS 0.25 fences a 0.4-beat offset that the default slides", () => {
		const beat = BP / BEATS;
		const ts = bars.map((t) => t + 0.4 * beat);
		const slid = rephaseGrid(ts, impulses(bars), RFPS, BP, BEATS, s);
		if (!slid) throw new Error("refused");
		expect(Math.abs(slid.delta + 0.4 * beat)).toBeLessThanOrEqual(0.01);
		const fenced = rephaseGrid(
			ts,
			impulses(bars),
			RFPS,
			BP,
			BEATS,
			settings({ REPHASE_FENCE_BEATS: 0.25 }),
		);
		if (!fenced) throw new Error("refused");
		expect(Math.abs(fenced.delta)).toBeLessThanOrEqual(0.25 * beat + 1e-9);
		expect(Math.abs(fenced.delta + 0.4 * beat)).toBeGreaterThan(0.1 * beat);
	});
});
