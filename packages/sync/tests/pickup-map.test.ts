import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { chartFromDetections } from "../src/build/build.js";
import { barAt, chartHash, checkTimingMap, secondsAtBar } from "../src/timing/index.js";

// A pickup is written bar 0 now, but a timing map keys on the play position
// (`PlayedBar.index`), so a map saved when the pickup was bar 1 must keep
// meaning what it did. Every literal here was captured from the 0.21 parser.
const CHART = "time: 4/4\n| [1/4] G | C | D | G |\n";
const SAVED = {
	format: "barmark-timing",
	version: 1,
	chart: { bars: 4, hash: "6e581d9b9ba366fa" },
	recording: {},
	end: 7,
	bars: [
		{ bar: 1, start: 0.5 },
		{ bar: 2, start: 1 },
		{ bar: 3, start: 3 },
		{ bar: 4, start: 5 },
	],
} as const;

describe("a map saved before the pickup was numbered 0", () => {
	test("its hash is the one it was saved with", () => {
		expect(chartHash(CHART, parseChart(CHART))).toBe(SAVED.chart.hash);
		expect(chartHash(CHART)).toBe(SAVED.chart.hash);
	});

	test("it still checks clean against the chart", () => {
		const r = checkTimingMap(structuredClone(SAVED), { text: CHART });
		expect(r.diagnostics).toEqual([]);
		expect(r.map).toEqual(SAVED as never);
	});

	test("barAt and secondsAtBar answer as they did", () => {
		const map = checkTimingMap(structuredClone(SAVED)).map as never;
		expect(barAt(map, 0)).toBeNull();
		expect(barAt(map, 0.7)).toEqual({ entry: 0, bar: 1, fraction: 0.3999999999999999 });
		expect(barAt(map, 1)).toEqual({ entry: 1, bar: 2, fraction: 0 });
		expect(barAt(map, 2.9)).toEqual({ entry: 1, bar: 2, fraction: 0.95 });
		expect(barAt(map, 3)).toEqual({ entry: 2, bar: 3, fraction: 0 });
		expect(barAt(map, 6.9)).toEqual({ entry: 3, bar: 4, fraction: 0.9500000000000002 });
		expect(barAt(map, 7)).toBeNull();
		expect([1, 2, 3, 4, 5].map((n) => secondsAtBar(map, n))).toEqual([0.5, 1, 3, 5, null]);
	});
});

describe("builder diagnostics say the written number", () => {
	test("a section collision after a pickup is at written bar 1, no +1", () => {
		const r = chartFromDetections({
			grid: { bars: [1, 3, 5, 7] },
			meter: "4/4",
			pickup: { start: 0.5 },
			chords: { runs: [{ start: 0.5, end: 7, symbol: "C:maj" }] },
			sections: [
				{ name: "A", start: 1.1 },
				{ name: "B", start: 0.9 },
			],
		} as never);
		const d = r.diagnostics.find((x) => x.code === "section-collision");
		expect(d?.bar).toBe(1);
		// the map is untouched: the pickup is still map bar 1
		expect(r.timing?.bars.map((b) => b.bar)).toEqual([1, 2, 3, 4]);
	});

	test("a gap in the pickup itself is at bar 0", () => {
		const r = chartFromDetections({
			grid: { bars: [1, 3, 5] },
			meter: "4/4",
			pickup: { start: 0.5 },
			chords: { runs: [{ start: 3, end: 5, symbol: "C:maj" }] },
		} as never);
		const gaps = r.diagnostics.filter((x) => x.code === "no-chord-detected");
		expect(gaps.map((g) => g.bar)).toEqual([0]);
	});
});

describe("map messages say map bar", () => {
	test("a beat-count problem names the map bar", () => {
		const bad = structuredClone(SAVED) as unknown as { bars: { beats?: number[] }[] };
		(bad.bars[2] as { beats?: number[] }).beats = [3.5];
		const msgs = checkTimingMap(bad, { text: CHART }).diagnostics.map((d) => d.message);
		expect(msgs).toEqual([expect.stringContaining("map bar 3 is 4/4")]);
	});

	test("an unnamed bar is called a map bar", () => {
		const few = structuredClone(SAVED) as unknown as { bars: unknown[] };
		few.bars.pop();
		const msgs = checkTimingMap(few, { text: CHART }).diagnostics.map((d) => d.message);
		expect(msgs.join("\n")).toContain("map bar 4");
	});
});
