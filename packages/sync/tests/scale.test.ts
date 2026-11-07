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
 * The work of one build, as two counts: reads of the input's `bars` and
 * `runs` array elements, and calls to `Math.min` and `Math.max`, which the
 * overlap arithmetic over the builder's own runs makes once per run it looks
 * at. A rescan from the start whose overlap is written without
 * `Math.min`/`Math.max` (ternaries, say) is NOT seen: the builder's runs are
 * its own copies, out of any Proxy's reach. Counting work rather than time
 * makes a rescan that is seen fail by orders of magnitude and never because
 * the machine was busy.
 *
 * `Math.min` and `Math.max` are replaced globally for the length of the
 * build and restored in `finally`, so the tests in this file must not run
 * concurrently.
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

/** Per run, the large build may do at most 1.5 times the small one's work; a count of none stays none. */
const perRun = (large: number, small: number) =>
	expect(large / 50_000).toBeLessThanOrEqual((small / 5000) * 1.5);

test("the build does work linear in the runs and bars", () => {
	const small = workOf(100, 5000);
	const large = workOf(1000, 50_000);
	// A rescan from the start does about 100 times the work per run.
	perRun(large.input, small.input);
	perRun(large.math, small.math);
});

test("10,000 hostile section names build in linear time", () => {
	const n = 10_000;
	const sections = Array.from({ length: n }, (_, i) => ({
		name: i % 2 ? "Verse x9999 (x2)" : `Chorus ${i} x9999 2x`,
		start: i * 2,
	}));
	const grid = { bars: Array.from({ length: n + 1 }, (_, i) => i * 2) };
	const t0 = performance.now();
	const r = chartFromDetections({ grid, meter: "4/4", sections, chords: { runs: [] } });
	// The same 10,000 bars with no sections take about 0.8 s; the section checks are bounded by a budget (before it, 300 such sections took 6 s).
	expect(performance.now() - t0).toBeLessThan(4000);
	// No name was left with a repeat: the chart is a bar a section, not 9,999 of them.
	expect(r.chart.length).toBeLessThan(n * 40);
	expect(r.timing?.chart.bars).toBe(n);
}, 30_000);

test("a huge note set resumed across thousands of bars stays within a linear factor of the input", () => {
	const bars = 2000;
	const grid = { bars: Array.from({ length: bars + 1 }, (_, i) => i * 2) };
	const huge = `{${Array(2000).fill("C4").join(" ")}}`;
	const runs = [{ start: 0, end: bars * 2, symbol: huge }];
	for (let i = 0; i < bars; i++)
		runs.push({ start: i * 2 + 1, end: i * 2 + 1.5, symbol: i % 2 ? "G" : "D" });
	const input = JSON.stringify({ grid, chords: { runs } }).length;
	const r = chartFromDetections({ grid, meter: "4/4", chords: { runs } });
	expect(r.chart.length).toBeLessThan(input * 3);
	expect(r.diagnostics.map((d) => d.code)).toContain("label-unknown");
});
