/**
 * The warping (design §10): the app's `dtwAlign` test, a property over
 * seeded pairs, the control on the reused step table, the tritone and the
 * bar costs.
 */
import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { chartPadBars } from "../src/align/bars.js";
import { barCosts, dtwAlign, dtwTable, mapSeconds, tritone } from "../src/align/dtw.js";
import { renderWhole } from "../src/align/render.js";
import { chromagram } from "../src/features/chroma.js";
import { seeded } from "./helpers/seeded.js";

const RATE = 22050;

/** A flattened chromagram as one view per frame. */
const framesOf = (chroma: Float32Array, frames: number) =>
	Array.from({ length: frames }, (_, i) => chroma.subarray(i * 12, i * 12 + 12));

/** `count` seeded unit chroma frames, about one in six all zero. */
function randomFrames(rand: () => number, count: number): Float32Array[] {
	return Array.from({ length: count }, () => {
		const f = new Float32Array(12);
		if (rand() < 0.16) return f;
		let norm = 0;
		for (let k = 0; k < 12; k++) {
			f[k] = rand();
			norm += (f[k] as number) ** 2;
		}
		const scale = Math.sqrt(norm);
		for (let k = 0; k < 12; k++) f[k] = (f[k] as number) / scale;
		return f;
	});
}

describe("dtwAlign: the app's warping", () => {
	test("a sequence against itself costs nothing and maps every second to itself, within a hop", () => {
		const r = chartPadBars(parseChart("time: 4/4, tempo: 120\n| D | A | Bm | G |"), undefined);
		if (!r.ok) throw new Error(r.reason);
		const { chroma, frames: count, hopSec } = chromagram(renderWhole(r.bars, RATE).samples, RATE);
		const frames = framesOf(chroma, count);
		const result = dtwAlign(frames, frames, dtwTable(count, count), false);
		expect(result.normalizedCost).toBeCloseTo(0, 6);
		expect(result.path[0]).toEqual([0, 0]);
		expect(result.path.at(-1)).toEqual([count - 1, count - 1]);
		const map = mapSeconds(result.path, hopSec);
		for (const t of [2, 4, 6]) expect(Math.abs(map(t) - t)).toBeLessThanOrEqual(hopSec);
		expect(result.frameCost.length).toBe(count);
	});
});

/** The three steps a path may take, as `shape` writes them. */
const STEPS = ["1,1", "1,2", "2,1"];

/**
 * A path's start and end (the reference frame alone with subsequence,
 * where the recording's are free) and the steps it takes, each once.
 */
function shape(path: [number, number][], subsequence: boolean) {
	const [first = [-1, -1], last = [-1, -1]] = [path[0], path.at(-1)];
	const steps = path.slice(1).map(([r, c], p) => {
		const [r0, c0] = path[p] as [number, number];
		return `${r - r0},${c - c0}`;
	});
	return {
		first: subsequence ? first[0] : first,
		last: subsequence ? last[0] : last,
		steps: [...new Set(steps)],
	};
}

/** Where a finite path may start: reference frame 0, or 1 when the first step is a (2,1) from the start row; the recording's likewise. */
const STARTS = {
	free: [0, 1],
	fixed: [
		[0, 0],
		[0, 1],
		[1, 0],
	],
};

/** One seeded pair warped: what the test tallies, with every expectation on the way. */
function warpPair(ref: Float32Array[], rec: Float32Array[], subsequence: boolean, where: string) {
	const [n, m] = [ref.length, rec.length];
	const { path, normalizedCost, frameCost } = dtwAlign(ref, rec, dtwTable(n, m), subsequence);
	expect([where, frameCost.length]).toEqual([where, n]);
	if (n > 2 * m) {
		expect([where, normalizedCost]).toEqual([where, Number.POSITIVE_INFINITY]);
		return "impossible";
	}
	if (!Number.isFinite(normalizedCost)) return "unfit";
	const { first, last, steps } = shape(path, subsequence);
	expect([where, last]).toEqual([where, subsequence ? n - 1 : [n - 1, m - 1]]);
	// The app's fill allows the start on frame 1: at row 2 `older` is row 0.
	expect(subsequence ? STARTS.free : STARTS.fixed).toContainEqual(first);
	expect(STEPS).toEqual(expect.arrayContaining(steps));
	return path[0]?.[0] === 1 ? "skips frame 0" : "finite";
}

describe("dtwAlign: the warping's paths", () => {
	test("on 50 seeded pairs the path runs from the reference's start to its end, by the three steps", () => {
		const rand = seeded(1111);
		const seen: string[] = [];
		for (let k = 0; k < 50; k++) {
			const n = 1 + Math.floor(rand() * 120);
			const m = 1 + Math.floor(rand() * 120);
			const [ref, rec] = [randomFrames(rand, n), randomFrames(rand, m)];
			for (const subsequence of [true, false])
				seen.push(
					warpPair(ref, rec, subsequence, `pair ${k} (${n} × ${m}), subsequence ${subsequence}`),
				);
		}
		const count = (what: string) => seen.filter((s) => s === what).length;
		expect(count("finite") + count("skips frame 0")).toBeGreaterThan(40);
		expect(count("impossible")).toBeGreaterThan(5);
		// The app's own paths skip frame 0 this way (Task 11's bit-identity check counts them).
		expect(count("skips frame 0")).toBeGreaterThan(0);
	});
});

describe("dtwAlign: the reused table", () => {
	test("the control on the reused table costs what it costs on a fresh one", () => {
		const rand = seeded(7);
		for (let k = 0; k < 10; k++) {
			const n = 5 + Math.floor(rand() * 80);
			const m = 5 + Math.floor(rand() * 80);
			const [ref, rec] = [randomFrames(rand, n), randomFrames(rand, m)];
			const table = dtwTable(n, m);
			dtwAlign(ref, rec, table, true);
			const reused = dtwAlign(tritone(ref), rec, table, true);
			const fresh = dtwAlign(tritone(ref), rec, dtwTable(n, m), true);
			expect(Object.is(reused.normalizedCost, fresh.normalizedCost)).toBe(true);
			expect(reused.path).toEqual(fresh.path);
		}
	});

	test("the step table is a byte a cell, (n + 1) × (m + 1)", () => {
		const table = dtwTable(3, 5);
		expect(table).toBeInstanceOf(Uint8Array);
		expect(table.length).toBe(24);
	});
});

describe("the control and the bar costs", () => {
	test("tritone moves every pitch class six semitones", () => {
		const f = Float32Array.from({ length: 12 }, (_, i) => i);
		const [t] = tritone([f]);
		expect([...(t as Float32Array)]).toEqual([6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]);
	});

	test("a bar's cost is the mean frame cost over its frames; a bar within one frame takes the nearest", () => {
		const frameCost = Float32Array.from([0.5, 0.25, 0.75, 1]);
		// Hop 1 s: bar one covers frames 0 and 1, bar two 2 and 3, bar three (3.2 to 3.4 s) no whole frame.
		expect(barCosts([0, 2, 3.2, 3.4], frameCost, 1)).toEqual([0.375, 0.875, 1]);
	});
});
