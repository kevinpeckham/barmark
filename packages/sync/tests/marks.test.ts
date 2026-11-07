import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { chartFromDetections } from "../src/build/build.js";
import { readInput } from "../src/build/input.js";
import { cleanTitle, gridTempo, sectionName, snapToBar } from "../src/build/marks.js";
import { createReport } from "../src/build/report.js";
import { cutRuns } from "../src/build/runs.js";
import { voteSlots } from "../src/build/vote.js";
import { writeChart } from "../src/build/write.js";

const GRID = [0, 2, 4, 6, 8];
const run = (start: number, end: number, label = "C:maj") => ({ start, end, label });
const build = (over: Record<string, unknown> = {}, runs = [run(0, 8)], o = {}) =>
	chartFromDetections(
		{ grid: { bars: GRID }, meter: "4/4", chords: { runs }, ...over } as never,
		o,
	);
const errors = (chart: string) =>
	parseChart(chart).diagnostics.filter((d) => d.severity === "error");
const codes = (r: { diagnostics: { code: string }[] }) => r.diagnostics.map((d) => d.code);
const lineOf = (chart: string, prefix: string) =>
	chart.split("\n").find((l) => l.startsWith(prefix));

describe("title", () => {
	test("title whitespace collapses; an empty title is left out", () => {
		expect(build({ title: "  Morning\n Song  " }).chart).toContain("# Morning Song\n");
		expect(build({ title: "  " }).chart).not.toContain("#");
		expect(cleanTitle("  a \n b ")).toBe("a b");
		expect(cleanTitle(5)).toBeNull();
	});

	test("hostile titles and names keep the chart's shape", () => {
		for (const title of ["Intro\n| C |", "## Coda", "key: G", "| C |", "%", "\\x"]) {
			const r = build({ title });
			const p = parseChart(r.chart);
			expect(p.title).not.toBeNull();
			expect(p.lines.filter((l) => l.kind === "title")).toHaveLength(1);
			expect(p.bars).toHaveLength(4);
			expect(errors(r.chart)).toEqual([]);
			expect(r.timing?.chart.bars).toBe(4);
		}
		for (const name of [
			"key: G",
			"| C |",
			"%",
			"## Coda",
			"# T",
			"tempo: 90",
			"\\ x",
			"Verse x2 x2",
		]) {
			const r = build({ sections: [{ name, start: 4 }] });
			const p = parseChart(r.chart);
			expect(p.lines.filter((l) => l.kind === "section")).toHaveLength(1);
			expect(p.lines.filter((l) => l.kind === "title")).toHaveLength(0);
			expect(p.bars).toHaveLength(4);
			expect(errors(r.chart)).toEqual([]);
		}
	});
});

describe("sections", () => {
	test("sections snap to the nearest bar start", () => {
		const bars = GRID.slice(0, -1).map((start, i) => ({
			start,
			end: GRID[i + 1] as number,
			meter: { n: 4, d: 4 },
			beats: 4,
		}));
		expect([0.1, 4.9, 5.0, -3].map((t) => snapToBar(t, bars))).toEqual([0, 2, 3, 0]);
		expect(snapToBar(7.9, bars)).toBe("after");
		expect(snapToBar(100, bars)).toBe("after");
		const withPickup = [{ ...bars[0], pickup: true as const }, ...bars.slice(1)];
		expect(snapToBar(-3, withPickup as never)).toBe(1);
	});

	test("a section's first bar restates a held chord", () => {
		const r = build({ sections: [{ name: "Chorus", start: 4 }] });
		expect(r.chart).toContain("## Chorus\n| C |");
		expect(r.chart.split("\n").filter((l) => l.startsWith("| "))).toHaveLength(2);
	});

	test("repeat and elision marks are stripped", () => {
		const report = createReport();
		const names = ["Chorus x2", "Chorus X 2", "Outro x ...", "Bridge ->", "Coda →"];
		expect(names.map((n, i) => sectionName(n, report, `sections[${i}]`))).toEqual([
			"Chorus",
			"Chorus",
			"Outro",
			"Bridge",
			"Coda",
		]);
		expect(report.list.map((d) => d.code)).toEqual(Array(5).fill("section-marks-stripped"));
		const r2 = createReport();
		expect(sectionName("x2", r2, "sections[0]")).toBeNull();
		expect(sectionName("  ", r2, "sections[1]")).toBeNull();
		expect(sectionName(7, r2, "sections[2]")).toBeNull();
		expect(r2.list.map((d) => d.code)).toEqual(Array(3).fill("section-unnamed"));
		expect(r2.list[0]?.path).toBe("sections[0]");
	});

	test("two sections on one bar: the later wins", () => {
		const r = build({
			sections: [
				{ name: "B", start: 4.2 },
				{ name: "A", start: 3.9 },
			],
		});
		expect(r.chart).toContain("## B\n");
		expect(r.chart).not.toContain("## A");
		expect(codes(r)).toContain("section-collision");
	});

	test("a section at the grid's end is after-last-bar", () => {
		const r = build({ sections: [{ name: "End", start: 7.9 }] });
		expect(r.chart).not.toContain("##");
		expect(r.diagnostics.find((d) => d.code === "after-last-bar")?.path).toBe("sections[0]");
	});

	test("a name may recur, written out in full", () => {
		const r = build({
			sections: [
				{ name: "Chorus", start: 0 },
				{ name: "Chorus", start: 4 },
			],
		});
		const p = parseChart(r.chart);
		expect(p.lines.filter((l) => l.kind === "section")).toHaveLength(2);
		expect(p.sections.map((s) => [s.replayOf, s.firstBar])).toEqual([
			[null, 1],
			[null, 3],
		]);
		expect(errors(r.chart)).toEqual([]);
	});

	test("% is refused on a section's first bar and after a directive", () => {
		const runs = GRID.slice(0, -1).flatMap((t) => [run(t, t + 1), run(t + 1, t + 2, "G:maj")]);
		expect(build({}, runs).chart).toContain("| C G | % | % | % |");
		expect(build({ sections: [{ name: "Chorus", start: 4 }] }, runs).chart).toContain(
			"| C G | % |\n\n## Chorus\n| C G | % |",
		);
		for (const [change, line] of [
			[{ kind: "meter", start: 4, value: "2/4" }, "time: 2/4"],
			[{ kind: "key", start: 4, value: "D" }, "key: D"],
			[{ kind: "tempo", start: 4, value: 90 }, "tempo: 90"],
		] as const) {
			const lines = build({ key: "C", changes: [change] }, runs).chart.split("\n");
			const at = lines.indexOf(line);
			expect(at).toBeGreaterThan(0);
			expect(lines[at + 1]).toStartWith("| C G");
		}
	});
});

describe("tempo", () => {
	test("a given tempo is written as given; omitted is derived; null is none", () => {
		expect(build({ tempo: 87.5 }).chart).toContain("tempo: 87.5");
		expect(build({ tempo: { value: 90, confidence: 0.4 } }).chart).toContain("tempo: 90");
		expect(build().chart).toContain("time: 4/4, tempo: 120");
		expect(build({ tempo: null }).chart).not.toContain("tempo");
	});

	test("bars of 2, 2 and 2.2 s still give 120 (the median)", () => {
		const r = chartFromDetections({
			grid: { bars: [0, 2, 4, 6.2] },
			meter: "4/4",
			chords: { runs: [] },
		});
		expect(r.chart).toContain("tempo: 120");
		const bars = [2, 2, 2.2].map((l, i) => ({
			start: i * 2,
			end: i * 2 + l,
			meter: { n: 4, d: 4 },
			beats: 4,
		}));
		expect(gridTempo(bars)).toBeCloseTo(120, 6);
	});

	test("a tempo far from the grid's warns; one near it does not", () => {
		expect(codes(build({ tempo: 60 }))).toContain("tempo-grid-disagree");
		expect(codes(build({ tempo: 60 }))).not.toContain("tempo-unreadable");
		expect(build({ tempo: 60 }).chart).toContain("tempo: 60");
		expect(codes(build({ tempo: 130 }))).not.toContain("tempo-grid-disagree");
	});

	test("an unreadable tempo is dropped and nothing replaces it", () => {
		for (const tempo of [0, 1000, Number.NaN, "fast"]) {
			const r = build({ tempo });
			expect(codes(r)).toContain("tempo-unreadable");
			expect(r.chart).not.toContain("tempo");
		}
	});

	test("a 6/8 tempo in eighths disagrees", () => {
		const r = chartFromDetections({
			grid: { bars: [0, 3, 6] },
			meter: "6/8",
			tempo: 120,
			chords: { runs: [run(0, 6)] },
		});
		expect(codes(r)).toContain("tempo-grid-disagree");
		expect(
			codes(
				chartFromDetections({
					grid: { bars: [0, 3, 6] },
					meter: "6/8",
					tempo: 40,
					chords: { runs: [] },
				}),
			),
		).not.toContain("tempo-grid-disagree");
	});

	test("no time line when the meter is assumed, even with a tempo", () => {
		const r = chartFromDetections({ grid: { bars: GRID }, chords: { runs: [] } });
		expect(r.chart.startsWith("tempo: 120\n")).toBe(true);
	});

	test("tempo: null drops only the starting line; changes still write", () => {
		const r = build({ tempo: null, changes: [{ kind: "tempo", start: 4, value: 90 }] });
		expect(r.chart).toContain("tempo: 90");
		expect(r.chart.split("tempo").length).toBe(2);
	});
});

describe("changes", () => {
	test("a key change gives a key line before its bar", () => {
		const r = build({ key: "C", changes: [{ kind: "key", start: 4.1, value: "D" }] });
		expect(r.chart).toContain("| C | / |\nkey: D\n| / | / |");
		expect(errors(r.chart)).toEqual([]);
	});

	test("a key change is respelled, with an info", () => {
		const r = build({ key: "C", changes: [{ kind: "key", start: 4, value: "Ab minor" }] });
		expect(r.chart).toContain("key: G#m");
		expect(r.diagnostics.find((d) => d.code === "key-respelled")).toMatchObject({
			severity: "info",
			path: "changes[0]",
		});
	});

	test("a change already in force is dropped silently", () => {
		const r = build({ key: "C", changes: [{ kind: "key", start: 4, value: "C major" }] });
		expect(r.chart.split("key:").length).toBe(2);
		expect(r.diagnostics).toEqual([]);
	});

	test("two key changes on one bar keep the later", () => {
		const r = build({
			key: "C",
			changes: [
				{ kind: "key", start: 4.2, value: "D" },
				{ kind: "key", start: 3.9, value: "E" },
			],
		});
		expect(r.chart).toContain("key: D");
		expect(r.chart).not.toContain("key: E");
		expect(r.diagnostics.find((d) => d.code === "change-collision")?.path).toBe("changes[1]");
	});

	test("a change at bar 1 replaces the starting value", () => {
		const r = build({ key: "C", changes: [{ kind: "key", start: 0.2, value: "D" }] });
		expect(r.chart.split("key:").length).toBe(2);
		expect(r.chart.startsWith("key: D, time: 4/4")).toBe(true);
	});

	test("a meter change gives that many slots a bar from there", () => {
		const r = build({ changes: [{ kind: "meter", start: 4, value: "3/4" }] }, [
			run(0, 4),
			run(4, 4.7, "G:maj"),
			run(4.7, 5.4, "A:min"),
			run(5.4, 8, "C:maj"),
		]);
		expect(r.chart).toContain("time: 3/4");
		expect(parseChart(r.chart).bars.map((b) => b.slots.length)).toEqual([1, 1, 3, 1]);
		expect(errors(r.chart)).toEqual([]);
		const input = readInput(
			{
				grid: { bars: GRID },
				changes: [{ kind: "meter", start: 4, value: "3/4" }],
				chords: { runs: [] },
			},
			createReport(),
		);
		expect(input?.bars.map((b) => b.beats)).toEqual([4, 4, 3, 3]);
	});

	test("key, meter and tempo on one bar share a line", () => {
		const r = build({
			key: "C",
			changes: [
				{ kind: "tempo", start: 4, value: 90 },
				{ kind: "meter", start: 4, value: "3/4" },
				{ kind: "key", start: 4, value: "D" },
			],
		});
		expect(lineOf(r.chart, "key: D")).toBe("key: D, time: 3/4, tempo: 90");
	});

	test("unreadable changes are named", () => {
		const r = build({
			changes: [
				{ kind: "meter", start: 4, value: "7/7" },
				{ kind: "feel", start: 4, value: "swing" },
			],
		});
		expect(r.diagnostics.filter((d) => d.code === "change-unreadable").map((d) => d.path)).toEqual([
			"changes[0]",
			"changes[1]",
		]);
	});

	test("a change at the grid's end is after-last-bar", () => {
		const r = build({ changes: [{ kind: "key", start: 7.9, value: "D" }] });
		expect(r.diagnostics.find((d) => d.code === "after-last-bar")?.path).toBe("changes[0]");
		expect(r.chart.split("key:").length).toBe(1);
	});

	test("heading before the directive line on the same bar", () => {
		const r = build({
			key: "C",
			sections: [{ name: "Bridge", start: 4 }],
			changes: [{ kind: "key", start: 4, value: "D" }],
		});
		expect(r.chart).toContain("## Bridge\nkey: D\n| C |");
	});

	test("a run across a key change keeps the spelling of its start", () => {
		const report = createReport();
		const input = readInput(
			{
				grid: { bars: GRID },
				key: "E",
				changes: [{ kind: "key", start: 4, value: "D" }],
				chords: { runs: [run(0, 8, "A#:maj")] },
			},
			report,
		);
		if (!input) throw new Error("grid");
		const runs = cutRuns(input.runs, input.bars, report);
		const text = writeChart(input, voteSlots(input.bars, runs, report), {
			simile: true,
			barsPerLine: 4,
		});
		expect(text).toContain("| A# / / / | / / / / |\nkey: D\n| / / / / | / / / / |");
	});

	test("a run after a key change is spelled in the new key", () => {
		const r = build({ key: "E", changes: [{ kind: "key", start: 4, value: "D" }] }, [
			run(4, 6, "A#:maj"),
		]);
		expect(r.chart).toContain("Bb");
		expect(r.chart).not.toContain("A#");
	});
});

describe("pickup", () => {
	const G = (start: number, end: number) => run(start, end, "G:maj");
	test("a pickup bar is written on the first line and is bar 1 of the map", () => {
		const r = chartFromDetections({
			grid: { bars: [1, 3, 5] },
			meter: "4/4",
			pickup: { start: 0.5 },
			chords: { runs: [G(0.5, 1), run(1, 5)] },
		});
		expect(lineOf(r.chart, "|")).toBe("| [1/4] G | C | / |");
		expect(r.timing?.bars.map((b) => [b.bar, b.start])).toEqual([
			[1, 0.5],
			[2, 1],
			[3, 3],
		]);
		expect(parseChart(r.chart).bars).toHaveLength(3);
		expect(errors(r.chart)).toEqual([]);
	});

	test("in 6/8 a pickup 1.5 s long is [3/8]", () => {
		const r = chartFromDetections({
			grid: { bars: [3, 6, 9] },
			meter: "6/8",
			pickup: { start: 1.5 },
			chords: { runs: [G(1.5, 3), run(3, 9)] },
		});
		expect(lineOf(r.chart, "|")).toContain("| [3/8] G |");
		expect(errors(r.chart)).toEqual([]);
	});

	test("a pickup too short or too long is ignored", () => {
		for (const start of [0.9, -1, Number.NaN]) {
			const r = chartFromDetections({
				grid: { bars: [1, 3, 5] },
				meter: "4/4",
				pickup: { start },
				chords: { runs: [run(1, 5)] },
			});
			expect(r.diagnostics.find((d) => d.code === "pickup-ignored")?.severity).toBe("info");
			expect(parseChart(r.chart).bars).toHaveLength(2);
			expect(r.timing?.bars).toHaveLength(2);
		}
	});

	test("a section on grid bar 1 is written before the pickup", () => {
		const r = chartFromDetections({
			grid: { bars: [1, 3, 5] },
			meter: "4/4",
			pickup: { start: 0.5 },
			sections: [{ name: "Intro", start: 1 }],
			chords: { runs: [G(0.5, 1), run(1, 5)] },
		});
		expect(r.chart).toContain("## Intro\n| [1/4] G | C | / |");
		expect(parseChart(r.chart).sections[0]?.firstBar).toBe(1);
	});

	test("outside-bars is measured from the pickup", () => {
		const grid = { bars: [2, 6, 10] };
		const base = { grid, meter: "4/4", chords: { runs: [run(0.5, 1.9), run(2, 10)] } };
		expect(codes(chartFromDetections(base as never))).toContain("outside-bars");
		const r = chartFromDetections({ ...base, pickup: { start: 1 } } as never);
		expect(codes(r)).not.toContain("outside-bars");
	});
});
