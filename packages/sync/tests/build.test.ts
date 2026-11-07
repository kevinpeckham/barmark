import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { chartFromDetections } from "../src/build/build.js";
import { chartHash, checkTimingMap } from "../src/timing/index.js";

const C = (start: number, end: number, label = "C:maj") => ({ start, end, label });
const make = (
	bars: number[],
	runs: { start: number; end: number; label: string }[],
	o?: { simile?: boolean; barsPerLine?: number },
) => chartFromDetections({ grid: { bars }, meter: "4/4", chords: { runs } }, o);

describe("holds", () => {
	test("holds across bar lines; the first slot is named", () => {
		expect(make([0, 2, 4], [C(0, 4)]).chart).toBe("time: 4/4, tempo: 120\n| C | / |\n");
		const r = make([0, 2, 4], [{ start: 0, end: 0.1, label: "C:maj" }]);
		expect(r.chart).toBe("time: 4/4, tempo: 120\n| ? | / |\n");
	});

	test("N.C. and ? hold too", () => {
		expect(make([0, 2, 4], [C(0, 4, "N")]).chart).toBe("time: 4/4, tempo: 120\n| N.C. | / |\n");
	});
});

describe("simile", () => {
	const runs = [0, 2, 4].flatMap((t) => [C(t, t + 1), C(t + 1, t + 2, "G:maj")]);
	test("% for a repeated multi-chord bar", () => {
		expect(make([0, 2, 4, 6], runs).chart).toBe("time: 4/4, tempo: 120\n| C G | % | % |\n");
		expect(make([0, 2, 4, 6], runs, { simile: false }).chart).toBe(
			"time: 4/4, tempo: 120\n| C G | C G | C G |\n",
		);
	});
});

describe("simile on held cells", () => {
	test("a bar that only matches the raw symbols is not %", () => {
		const r = make([0, 2, 4, 6], [C(0, 3), C(3, 4, "G:maj"), C(4, 5), C(5, 6, "G:maj")]);
		expect(r.chart).toBe("time: 4/4, tempo: 120\n| C | / G | C G |\n");
		expect(parseChart(r.chart).bars.map((b) => b.slots.length)).toEqual([1, 2, 2]);
	});
});

describe("directives", () => {
	const withKey = (extra: Record<string, unknown>) =>
		chartFromDetections({
			grid: { bars: [0, 2, 4] },
			meter: "4/4",
			key: "C major",
			chords: { runs: [{ start: 0, end: 4, symbol: "C" }] },
			...extra,
		});
	test("key and meter share a line, comma separated", () => {
		const r = withKey({});
		expect(r.chart).toBe("key: C, time: 4/4, tempo: 120\n| C | / |\n");
		expect(parseChart(r.chart).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});
});

describe("layout", () => {
	const lines = (o?: { barsPerLine?: number }) => {
		const grid = [0, 2, 4, 6, 8, 10, 12];
		const runs = grid.slice(0, -1).map((t, i) => C(t, t + 2, i % 2 ? "G:maj" : "C:maj"));
		return make(grid, runs, o).chart.trim().split("\n").slice(1);
	};
	test("barsPerLine", () => {
		expect(lines()).toHaveLength(2);
		expect(lines()[0]?.split("|").length).toBe(6);
		expect(lines({ barsPerLine: 2 })).toHaveLength(3);
		expect(lines({ barsPerLine: 0 })).toHaveLength(2);
		expect(lines({ barsPerLine: Number.NaN })).toHaveLength(2);
		expect(lines({ barsPerLine: 3.9 })).toHaveLength(2);
		expect(lines({ barsPerLine: 3.9 })[0]?.split("|").length).toBe(5);
	});
});

describe("the timing map", () => {
	test("is the builder's own", () => {
		const r = chartFromDetections({
			grid: { bars: [0, 2, 4] },
			meter: "4/4",
			chords: { runs: [C(0, 4)] },
			recording: { id: "r1", duration: 4.5 },
		});
		const t = r.timing;
		expect(t?.bars).toEqual([
			{ bar: 1, start: 0 },
			{ bar: 2, start: 2 },
		]);
		expect(t?.end).toBe(4);
		expect(t?.chart.bars).toBe(2);
		expect(t?.chart.hash).toBe(chartHash(r.chart));
		expect(t?.source).toBe("detected");
		expect(t?.recording).toEqual({ id: "r1", duration: 4.5 });
		expect(t?.bars.some((b) => "beats" in b || "end" in b)).toBe(false);
		expect(t && "ref" in t.chart).toBe(false);
		expect(checkTimingMap(t, { text: r.chart }).diagnostics).toEqual([]);
		expect(r.confidence?.bars).toHaveLength(2);
	});

	test("a recording with nothing usable is left out", () => {
		const r = chartFromDetections({
			grid: { bars: [0, 2] },
			chords: { runs: [C(0, 2)] },
			recording: { id: 5, duration: Number.NaN } as never,
		});
		expect(r.timing && "recording" in r.timing).toBe(false);
	});

	test("a negative duration is left out, so the map still checks", () => {
		const r = chartFromDetections({
			grid: { bars: [0, 2] },
			chords: { runs: [C(0, 2)] },
			recording: { id: "r", duration: -1 },
		});
		expect(r.timing?.recording).toEqual({ id: "r" });
		expect(checkTimingMap(r.timing as never, { text: r.chart }).diagnostics).toEqual([]);
	});

	test("an unusable grid", () => {
		const r = chartFromDetections({ grid: { bars: [1] }, chords: { runs: [] } });
		expect(r.chart).toBe("");
		expect(r.timing).toBeNull();
		expect(r.confidence).toBeNull();
		expect(r.diagnostics.map((d) => d.code)).toEqual(["grid-unusable"]);
	});
});

describe("junk", () => {
	test("never throws", () => {
		const junk = [
			null,
			{},
			{ grid: { bars: "0,2" } },
			{ grid: { bars: [0, 2] }, chords: null },
			{ grid: { bars: [0, "2", 4] }, chords: { runs: "x" } },
		];
		for (const d of junk) {
			const r = chartFromDetections(d as never, 7 as never);
			if (r.chart === "") {
				expect(r.diagnostics.some((x) => x.code === "grid-unusable")).toBe(true);
			} else {
				const errors = parseChart(r.chart).diagnostics.filter((x) => x.severity === "error");
				expect(errors).toEqual([]);
			}
		}
	});

	test("SS's stored shapes read as they are", () => {
		const runs = [
			{ start: 0, end: 40, label: "C:maj", extra: 1 },
			{ start: 40, end: 110, label: "G:maj", extra: 2 },
		];
		const r = chartFromDetections({
			grid: { bars: [0, 2, 4, 6, 8] },
			chords: { frameSec: 0.1, frames: 110, vocab: "large", runs } as never,
			changes: [{ kind: "key", start: 0, value: "C major", confidence: 0.8 }],
		});
		expect(r.diagnostics.map((d) => d.code).sort()).toEqual(["meter-assumed", "outside-bars"]);
		expect(r.chart).toBe("key: C, tempo: 120\n| C | / | G | / |\n");
	});
});
