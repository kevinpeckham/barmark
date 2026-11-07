import { expect, test } from "bun:test";
import { chartFromDetections } from "../src/build/build.js";

const LABELS = ["C:maj", "G:maj", "A:min", "F:maj"];

/** `bars` bars of 2 s with `frames` frame-based runs spread over them. */
function detections(bars: number, frames: number) {
	const frameSec = (bars * 2) / frames;
	return {
		grid: { bars: Array.from({ length: bars + 1 }, (_, i) => i * 2) },
		meter: "4/4",
		chords: {
			frameSec,
			runs: Array.from({ length: frames }, (_, i) => ({
				start: i,
				end: i + 1,
				label: LABELS[Math.floor(i / 7) % LABELS.length] as string,
			})),
		},
	};
}

/** An array whose numeric-index reads are added to `count.reads`. */
function counted<T>(items: T[], count: { reads: number }): T[] {
	return new Proxy(items, {
		get(target, key, receiver) {
			if (typeof key === "string" && /^\d+$/.test(key)) count.reads++;
			return Reflect.get(target, key, receiver);
		},
	});
}

/**
 * The work of one build: reads of the input arrays, plus calls to `Math.min`
 * and `Math.max`, which every pass over the runs makes per run it looks at.
 * Counting work rather than time makes a quadratic rescan fail by orders of
 * magnitude and never because the machine was busy.
 */
function workOf(bars: number, frames: number): { input: number; math: number } {
	const d = detections(bars, frames);
	const count = { reads: 0 };
	d.grid.bars = counted(d.grid.bars, count);
	d.chords.runs = counted(d.chords.runs, count);
	const { min, max } = Math;
	let math = 0;
	Math.min = (...xs: number[]) => {
		math++;
		return min(...xs);
	};
	Math.max = (...xs: number[]) => {
		math++;
		return max(...xs);
	};
	try {
		const r = chartFromDetections(d);
		expect(r.chart).not.toBe("");
	} finally {
		Math.min = min;
		Math.max = max;
	}
	return { input: count.reads, math };
}

test("the build does work linear in the runs and bars", () => {
	const small = workOf(100, 5000);
	const large = workOf(1000, 50_000);
	// Per run, the large build may do at most 1.5 times the small one's work (a rescan from the start does ~100 times).
	expect(large.input / 50_000).toBeLessThan((small.input / 5000) * 1.5);
	expect(large.math / 50_000).toBeLessThan((small.math / 5000) * 1.5);
});
