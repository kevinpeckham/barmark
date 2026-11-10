import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import {
	barAt,
	chartHash,
	checkTimingMap,
	secondsAtBar,
	type TimingMap,
} from "../src/timing/index.js";

const hash = chartHash("| C | D | E |");
const ok = {
	format: "barmark-timing",
	version: 1,
	chart: { bars: 3, hash },
	bars: [
		{ bar: 1, start: 0 },
		{ bar: 2, start: 2, end: 3.5 },
		{ bar: 3, start: 4, beats: [4.5, 5, 5.5] },
	],
	end: 6,
} as const;
/** A timing map to break: every field can be set to anything. */
type LooseBar = { bar: unknown; start: unknown; end?: unknown; beats?: unknown };
type Loose = {
	format: unknown;
	version: unknown;
	chart: { bars: unknown; hash: unknown };
	bars: [LooseBar, LooseBar, LooseBar];
	end: unknown;
};
const clone = () => structuredClone(ok) as unknown as Loose;
const THREE = { text: "| C | D | E |" };

/** The paths of the errors `value` draws. */
const errorPaths = (value: unknown, chart?: { text: string }) =>
	checkTimingMap(value, chart)
		.diagnostics.filter((d) => d.severity === "error")
		.map((d) => d.path);

describe("checkTimingMap", () => {
	test("an empty bars list is rejected at bars", () => {
		const m = { ...clone(), bars: [] };
		expect(checkTimingMap(m).map).toBeNull();
		expect(errorPaths(m)).toEqual(["bars"]);
	});

	test("a valid map passes, with and without its chart", () => {
		for (const chart of [undefined, THREE, { text: THREE.text, parse: parseChart(THREE.text) }]) {
			const r = checkTimingMap(ok, chart);
			expect(r.diagnostics).toEqual([]);
			expect(r.map).toBe(ok as unknown as TimingMap);
		}
	});

	test("unknown fields are kept", () => {
		const r = checkTimingMap({ ...ok, extra: 1 });
		expect(r.diagnostics).toEqual([]);
		expect((r.map as unknown as { extra: number }).extra).toBe(1);
	});

	describe("each rule has its error, with a path", () => {
		const cases: [string, (m: Loose) => void, string][] = [
			["starts not increasing", (m) => (m.bars[1].start = 0), "bars[1].start"],
			["end at the last start", (m) => (m.end = 4), "end"],
			["end before the last start", (m) => (m.end = 3), "end"],
			["an entry end at its start", (m) => (m.bars[1].end = 2), "bars[1].end"],
			["an entry end after the next start", (m) => (m.bars[1].end = 4.5), "bars[1].end"],
			["bar 0", (m) => (m.bars[0].bar = 0), "bars[0].bar"],
			["bar past chart.bars", (m) => (m.bars[0].bar = 4), "bars[0].bar"],
			["bar 2.5", (m) => (m.bars[0].bar = 2.5), "bars[0].bar"],
			["beats not increasing", (m) => (m.bars[2].beats = [5, 4.5]), "bars[2].beats"],
			["a beat at start", (m) => (m.bars[2].beats = [4, 5]), "bars[2].beats"],
			["a beat at the map end", (m) => (m.bars[2].beats = [5, 6]), "bars[2].beats"],
			["a beat at the entry end", (m) => (m.bars[1].beats = [3, 3.5]), "bars[1].beats"],
			["format wrong", (m) => (m.format = "other"), "format"],
			["chart.hash not hex", (m) => (m.chart.hash = "ABCDEF0123456789"), "chart.hash"],
			["chart.hash too short", (m) => (m.chart.hash = "abc"), "chart.hash"],
		];
		test.each(cases)("%s", (_name, mutate, path) => {
			const m = clone();
			mutate(m);
			const r = checkTimingMap(m);
			expect(r.map).toBeNull();
			expect(r.diagnostics.map((d) => d.path)).toContain(path);
			expect(r.diagnostics.every((d) => d.severity === "error")).toBe(true);
		});

		test.each([2, "1"])("version %j", (v) => {
			const m = clone();
			m.version = v;
			const r = checkTimingMap(m);
			expect(r.map).toBeNull();
			expect(r.diagnostics[0]?.path).toBe("version");
			expect(r.diagnostics[0]?.message).toContain(JSON.stringify(v));
		});
	});

	test("every problem is collected, not just the first", () => {
		const m = clone();
		m.bars[1].start = 0;
		m.format = "x";
		expect(errorPaths(m).sort()).toEqual(["bars[1].start", "format"]);
	});

	test("junk never throws", () => {
		const bad = clone();
		bad.bars[0].start = "0";
		for (const junk of [
			null,
			undefined,
			[],
			"map",
			7,
			{},
			bad,
			{ ...ok, bars: "x" },
			{ ...ok, chart: null },
		]) {
			const r = checkTimingMap(junk);
			expect(r.map).toBeNull();
			expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
		}
	});

	test("a recurring bar and missing bars are fine", () => {
		const recur = { ...ok, bars: [1, 2, 2, 3].map((bar, i) => ({ bar, start: i })), end: 4 };
		const missing = {
			...ok,
			bars: [1, 2, 3].map((bar, i) => ({ bar, start: i })).filter((b) => b.bar !== 2),
			end: 4,
		};
		expect(checkTimingMap(recur).diagnostics).toEqual([]);
		expect(checkTimingMap(missing).diagnostics).toEqual([]);
	});

	test("with the chart: hash mismatch", () => {
		const r = checkTimingMap(ok, { text: "| C | D | F |" });
		expect(r.diagnostics).toHaveLength(1);
		expect(r.diagnostics[0]).toMatchObject({
			severity: "error",
			code: "chart-hash-mismatch",
			path: "chart.hash",
		});
		expect(r.map).toBeNull();
	});

	test("with the chart: beat counts", () => {
		const text = "| C | D | E |";
		const four = clone();
		four.bars[2].beats = [4.5, 5];
		expect(errorPaths(four, { text })).toEqual(["bars[2].beats"]);

		const six8 = "time: 6/8\n| C | D | E |";
		const m = clone();
		m.chart.hash = chartHash(six8);
		m.bars[2].beats = [4.5];
		expect(errorPaths(m, { text: six8 })).toEqual([]);
		m.bars[2].beats = [4.5, 5];
		expect(errorPaths(m, { text: six8 })).toEqual(["bars[2].beats"]);
	});

	test("with the chart: chart.bars must match, and coverage is a warning", () => {
		const four = clone();
		four.chart.bars = 4;
		expect(errorPaths(four, THREE)).toEqual(["chart.bars"]);

		const gap = { ...ok, bars: [ok.bars[0], { ...ok.bars[2] }], end: 6 } as unknown;
		const r = checkTimingMap(gap, THREE);
		expect(r.map).not.toBeNull();
		expect(r.diagnostics).toHaveLength(1);
		expect(r.diagnostics[0]?.severity).toBe("warning");
	});
});

describe("barAt", () => {
	const m = ok as unknown as TimingMap;
	test("inside an entry", () => {
		expect(barAt(m, 0)).toEqual({ entry: 0, bar: 1, fraction: 0 });
		expect(barAt(m, 1)).toEqual({ entry: 0, bar: 1, fraction: 0.5 });
		expect(barAt(m, 3)).toEqual({ entry: 1, bar: 2, fraction: 2 / 3 });
	});
	test("in a pause", () => {
		expect(barAt(m, 3.75)).toEqual({ entry: 1, bar: 2, fraction: 1, paused: true });
	});
	test("a start belongs to its entry", () => {
		expect(barAt(m, 4)).toMatchObject({ entry: 2, bar: 3, fraction: 0 });
		expect(barAt(m, 2)).toMatchObject({ entry: 1, fraction: 0 });
	});
	test("outside the map", () => {
		expect(barAt(m, 6)).toBeNull();
		expect(barAt(m, 7)).toBeNull();
		expect(barAt(m, -1)).toBeNull();
		expect(barAt(m, Number.NaN)).toBeNull();
		expect(barAt(m, Number.POSITIVE_INFINITY)).toBeNull();
	});
	test("an empty map has nothing", () => {
		expect(barAt({ ...m, bars: [] }, 1)).toBeNull();
	});
});

describe("secondsAtBar", () => {
	const m = {
		...ok,
		bars: [1, 2, 2, 3].map((bar, i) => ({ bar, start: i * 2 })),
		end: 8,
	} as unknown as TimingMap;
	test("passes", () => {
		expect(secondsAtBar(m, 2)).toBe(2);
		expect(secondsAtBar(m, 2, 1)).toBe(2);
		expect(secondsAtBar(m, 2, 2)).toBe(4);
		expect(secondsAtBar(m, 3)).toBe(6);
	});
	test("nothing there", () => {
		expect(secondsAtBar(m, 2, 3)).toBeNull();
		expect(secondsAtBar(m, 9)).toBeNull();
		expect(secondsAtBar(m, 2, 0)).toBeNull();
		expect(secondsAtBar(m, 2, 1.5)).toBeNull();
	});
});

describe("an ending across lines (barmark's grammar 5.1)", () => {
	const text = "|: C | F |\n|1 G | A | B | C |\n| D :|\n|2 E |";
	/** A map of `n` played bars, two seconds each, made for `text`. */
	const mapOf = (n: number) => ({
		format: "barmark-timing",
		version: 1,
		chart: { bars: n, hash: chartHash(text) },
		bars: Array.from({ length: n }, (_, i) => ({ bar: i + 1, start: i * 2 })),
		end: n * 2,
	});
	test("a map times every bar the ending plays, its second line's included", () => {
		expect(parseChart(text).bars.map((b) => b.written)).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2, 8]);
		expect(checkTimingMap(mapOf(10), { text }).diagnostics).toEqual([]);
		expect(errorPaths(mapOf(8), { text })).toContain("chart.bars");
	});
	test("the second pass's first bar is played bar 8", () => {
		const map = mapOf(10) as unknown as TimingMap;
		expect(barAt(map, 14.5)).toEqual({ entry: 7, bar: 8, fraction: 0.25 });
		expect(secondsAtBar(map, 10)).toBe(18);
	});
});
