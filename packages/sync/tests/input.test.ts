import { describe, expect, test } from "bun:test";
import { readInput } from "../src/build/input.js";
import { createReport } from "../src/build/report.js";

const chords = { runs: [] };
const read = (over: Record<string, unknown>) => {
	const report = createReport();
	const input = readInput({ grid: { bars: [0, 2, 4] }, chords, ...over }, report);
	return { input, list: report.list };
};

describe("the grid", () => {
	test("fewer than two finite bar starts is grid-unusable", () => {
		for (const d of [
			{ grid: { bars: [1] }, chords },
			{ grid: { bars: [Number.NaN, 2] }, chords },
			{ chords },
			null,
			"x",
		]) {
			const report = createReport();
			expect(readInput(d, report)).toBeNull();
			expect(report.list).toHaveLength(1);
			expect(report.list[0]).toMatchObject({
				severity: "error",
				code: "grid-unusable",
				path: "grid.bars",
			});
		}
	});

	test("unsorted and duplicate starts are mended once", () => {
		const { input, list } = read({ grid: { bars: [4, 0, 2, 2.0005, Number.POSITIVE_INFINITY] } });
		expect(input?.bars.map((b) => b.start)).toEqual([0, 2]);
		expect(input?.bars).toHaveLength(2);
		expect(list.filter((d) => d.code === "grid-unsorted")).toHaveLength(1);
		expect(list.find((d) => d.code === "grid-unsorted")?.severity).toBe("warning");
	});

	test("bar spans divide into beats", () => {
		const { input } = read({ grid: { bars: [0, 3, 6] }, meter: "6/8" });
		expect(input?.bars).toMatchObject([
			{ start: 0, end: 3, beats: 2 },
			{ start: 3, end: 6, beats: 2 },
		]);
	});
});

describe("the meter", () => {
	test("none is 4/4, assumed", () => {
		const { input, list } = read({});
		expect(input?.meter).toEqual({ n: 4, d: 4 });
		expect(input?.meterWritten).toBe(false);
		expect(list).toMatchObject([{ severity: "info", code: "meter-assumed" }]);
	});

	test("unreadable is 4/4, with a warning", () => {
		const { input, list } = read({ meter: "7/7" });
		expect(input?.meter).toEqual({ n: 4, d: 4 });
		expect(list).toMatchObject([{ severity: "warning", code: "meter-unreadable" }]);
	});

	test("a wrapped meter keeps its confidence", () => {
		const { input, list } = read({ meter: { value: "6/8", confidence: 0.7 } });
		expect(input?.meter).toEqual({ n: 6, d: 8 });
		expect(input?.bars[0]?.beats).toBe(2);
		expect(input?.meterWritten).toBe(true);
		expect(input?.confidence.meter).toBe(0.7);
		expect(list).toEqual([]);
	});
});

describe("the key", () => {
	test("a key is read", () => {
		expect(read({ key: "F♯ minor" }).input?.key).toEqual({ tonic: "F#", mode: "minor" });
	});

	test("a key is respelled to the fewest accidentals", () => {
		const { input, list } = read({ key: "Ab minor" });
		expect(input?.key).toEqual({ tonic: "G#", mode: "minor" });
		expect(list.filter((d) => d.code === "key-respelled")).toMatchObject([{ severity: "info" }]);
	});

	test("an unreadable key is null, with a warning", () => {
		const { input, list } = read({ key: "H dur" });
		expect(input?.key).toBeNull();
		expect(list.filter((d) => d.code === "key-unreadable")).toHaveLength(1);
	});

	test("omitted or null is null, silently", () => {
		for (const over of [{}, { key: null }]) {
			const { input, list } = read({ meter: "4/4", ...over });
			expect(input?.key).toBeNull();
			expect(list).toEqual([]);
		}
	});

	test("the title, tempo, changes and sections are left to later", () => {
		const { input } = read({ key: { value: "D", confidence: 2 } });
		expect(input).toMatchObject({ title: null, tempo: null });
		expect(input?.changes.size).toBe(0);
		expect(input?.sections.size).toBe(0);
		expect(input?.confidence.key).toBe(1);
	});
});
