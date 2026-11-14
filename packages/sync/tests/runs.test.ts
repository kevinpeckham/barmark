import { describe, expect, test } from "bun:test";
import { createReport } from "../src/build/report.js";
import { type BarSpan, cutRuns, symbolRuns } from "../src/build/runs.js";
import { labelSymbol, slotSymbol } from "../src/build/spell.js";

const key = (tonic: string, mode: "major" | "minor" = "major") => ({ tonic, mode });

describe("labels", () => {
	test("labels are respelled for the key", () => {
		expect(labelSymbol("D#:min", key("Bb"))).toBe("Ebm");
		expect(labelSymbol("A#:maj", key("D"))).toBe("Bb");
		expect(labelSymbol("A:min6", null)).toBe("Am6");
		expect(labelSymbol("C:hdim7", null)).toBe("Cm7(b5)");
		expect(labelSymbol("C:min(b6)", null)).toBe("Cm(b6)");
		expect(labelSymbol("C:min(b13)", null)).toBe("Cm(b13)");
		expect(labelSymbol("N", null)).toBe("N.C.");
		expect(labelSymbol("X", null)).toBe("?");
	});

	test("a double accidental retries the enharmonic root", () => {
		expect(labelSymbol("D#:maj/3", key("E"))).toBe("Eb/G");
	});

	test("unreadable labels", () => {
		expect(labelSymbol("H:maj", null)).toBeNull();
		expect(labelSymbol("C:constructor", null)).toBeNull();
	});
});

describe("symbols", () => {
	test("symbols are read as one slot", () => {
		for (const s of ["Am7", "{C E G}", "N.C.", "?"]) expect(slotSymbol(s)).toBe(s);
		for (const s of ["| C | D", "C\nD", "H7", "/", "%", "--", "C_D", "C D"])
			expect(slotSymbol(s)).toBeNull();
	});

	test("a symbol run reads as given", () => {
		const report = createReport();
		const runs = symbolRuns(
			{ runs: [{ start: 0, end: 2, symbol: "Am7" }] },
			{ keyAt: () => null, turnTimes: [] },
			report,
		);
		expect(runs).toEqual([{ start: 0, end: 2, symbol: "Am7" }]);
		expect(report.list).toEqual([]);
	});

	test("an unreadable symbol is ? with label-unknown", () => {
		const report = createReport();
		const runs = symbolRuns(
			{ runs: [{ start: 0, end: 2, symbol: "C D" }] },
			{ keyAt: () => null, turnTimes: [] },
			report,
		);
		expect(runs[0]?.symbol).toBe("?");
		expect(report.list.map((d) => d.code)).toEqual(["label-unknown"]);
	});
});

const read = (chords: unknown, k = null as ReturnType<typeof key> | null) => {
	const report = createReport();
	return { runs: symbolRuns(chords, { keyAt: () => k, turnTimes: [] }, report), list: report.list };
};

describe("symbolRuns", () => {
	test("frames convert by frameSec", () => {
		const { runs } = read({ runs: [{ start: 0, end: 22, label: "C:maj" }], frameSec: 0.5 });
		expect(runs).toEqual([{ start: 0, end: 11, symbol: "C" }]);
	});

	test("the key in force at the run's start respells", () => {
		const { runs } = read({ runs: [{ start: 0, end: 1, label: "D#:min" }] }, key("Bb"));
		expect(runs[0]?.symbol).toBe("Ebm");
	});

	test("invalid runs: one warning each, capped at ten", () => {
		const bad = Array.from({ length: 12 }, (_, i) => ({ start: i, end: i, label: "C" }));
		const { runs, list } = read({ runs: bad });
		expect(runs).toEqual([]);
		expect(list).toHaveLength(11);
		expect(list.every((d) => d.code === "run-invalid" && d.severity === "warning")).toBe(true);
		for (let i = 0; i < 10; i++) expect(list[i]?.path).toBe(`chords.runs[${i}]`);
		expect(list[10]?.message).toContain("2 more");
	});

	test("both or neither of label and symbol is invalid", () => {
		const { runs, list } = read({
			runs: [
				{ start: 0, end: 1, label: "C", symbol: "C" },
				{ start: 1, end: 2 },
				{ start: Number.NaN, end: 2, label: "C" },
				{ start: 2, end: 3, label: "C" },
			],
		});
		expect(runs).toHaveLength(1);
		expect(list.map((d) => d.path)).toEqual(["chords.runs[0]", "chords.runs[1]", "chords.runs[2]"]);
	});

	test("a bad frameSec drops every run with one warning", () => {
		for (const frameSec of [0, -1, Number.NaN, "x", null]) {
			const { runs, list } = read({ runs: [{ start: 0, end: 1, label: "C" }], frameSec });
			expect(runs).toEqual([]);
			expect(list).toMatchObject([{ code: "run-invalid", path: "chords.frameSec" }]);
		}
	});

	test("confidence is clamped, and a non-finite one is not given", () => {
		const { runs } = read({
			runs: [
				{ start: 0, end: 1, label: "C", confidence: 3 },
				{ start: 1, end: 2, label: "D", confidence: -1 },
				{ start: 2, end: 3, label: "E", confidence: Number.NaN },
				{ start: 3, end: 4, label: "F", confidence: 0.4 },
			],
		});
		expect(runs.map((r) => r.confidence)).toEqual([1, 0, undefined, 0.4]);
		expect("confidence" in (runs[2] ?? {})).toBe(false);
	});

	test("overlaps: the later onset wins, the earlier resumes", () => {
		const { runs, list } = read({
			runs: [
				{ start: 0, end: 10, label: "C" },
				{ start: 2, end: 3, label: "G" },
			],
		});
		expect(runs).toEqual([
			{ start: 0, end: 2, symbol: "C" },
			{ start: 2, end: 3, symbol: "G" },
			{ start: 3, end: 10, symbol: "C" },
		]);
		const overlaps = list.filter((d) => d.code === "run-overlap");
		expect(overlaps).toHaveLength(1);
		expect(overlaps[0]?.severity).toBe("warning");
		expect(overlaps[0]?.message).toContain("1 ");
	});

	test("an earlier run that ends inside the later one does not resume", () => {
		const { runs } = read({
			runs: [
				{ start: 0, end: 3, label: "C" },
				{ start: 2, end: 6, label: "G" },
			],
		});
		expect(runs).toEqual([
			{ start: 0, end: 2, symbol: "C" },
			{ start: 2, end: 6, symbol: "G" },
		]);
	});

	test("equal starts keep the longer, then the later in input order", () => {
		expect(
			read({
				runs: [
					{ start: 0, end: 4, label: "C" },
					{ start: 0, end: 2, label: "G" },
				],
			}).runs,
		).toEqual([{ start: 0, end: 4, symbol: "C" }]);
		expect(
			read({
				runs: [
					{ start: 0, end: 2, label: "C" },
					{ start: 0, end: 2, label: "G" },
				],
			}).runs,
		).toEqual([{ start: 0, end: 2, symbol: "G" }]);
	});

	test("runs given out of order are sorted", () => {
		const { runs, list } = read({
			runs: [
				{ start: 2, end: 4, label: "G" },
				{ start: 0, end: 2, label: "C" },
			],
		});
		expect(runs.map((r) => r.symbol)).toEqual(["C", "G"]);
		expect(list).toEqual([]);
	});

	test("label-unknown once per distinct label", () => {
		const { runs, list } = read({
			runs: [
				{ start: 0, end: 1, label: "Q:maj" },
				{ start: 1, end: 2, label: "Q:maj" },
				{ start: 2, end: 3, label: "Q:maj" },
				{ start: 3, end: 4, label: "Z" },
			],
		});
		expect(runs.map((r) => r.symbol)).toEqual(["?", "?", "?", "?"]);
		expect(list.filter((d) => d.code === "label-unknown")).toHaveLength(2);
	});

	test("X is ? with no diagnostic", () => {
		const { runs, list } = read({ runs: [{ start: 0, end: 1, label: "X" }] });
		expect(runs[0]?.symbol).toBe("?");
		expect(list).toEqual([]);
	});
});

describe("cutRuns", () => {
	const bars: BarSpan[] = [0, 2, 4, 6].map((start) => ({
		start,
		end: start + 2,
		meter: { n: 4, d: 4 },
		beats: 4,
	}));
	const cut = (runs: { start: number; end: number; symbol: string }[]) => {
		const report = createReport();
		return { runs: cutRuns(runs, bars, report), list: report.list };
	};

	test("runs are cut at the bars, with outside-bars per side", () => {
		const { runs, list } = cut([
			{ start: -3, end: 1, symbol: "C" },
			{ start: 7, end: 9.4, symbol: "G" },
		]);
		expect(runs).toEqual([
			{ start: 0, end: 1, symbol: "C" },
			{ start: 7, end: 8, symbol: "G" },
		]);
		expect(list.map((d) => d.code)).toEqual(["outside-bars", "outside-bars"]);
		expect(list[0]?.message).toContain("3 s");
		expect(list[1]?.message).toContain("1.4 s");
	});

	test("an N.C. run before bar 1 loses time silently", () => {
		const { runs, list } = cut([{ start: -3, end: 1, symbol: "N.C." }]);
		expect(runs).toEqual([{ start: 0, end: 1, symbol: "N.C." }]);
		expect(list).toEqual([]);
	});

	test("a ? lead-in and tail of several seconds give no warning", () => {
		const { list } = cut([
			{ start: -5, end: 1, symbol: "?" },
			{ start: 7, end: 12, symbol: "?" },
		]);
		expect(list).toEqual([]);
	});

	test("a chord run 2 s before the first bar still warns", () => {
		const { list } = cut([{ start: -2, end: 1, symbol: "C" }]);
		expect(list.map((d) => d.code)).toEqual(["outside-bars"]);
	});

	test("a mix warns only on the chord time", () => {
		const { list } = cut([
			{ start: -5, end: -2, symbol: "?" },
			{ start: -2, end: 1, symbol: "C" },
		]);
		expect(list).toHaveLength(1);
		expect(list[0]?.message).toContain("2 s");
	});

	test("under a beat lost gives no warning", () => {
		const { runs, list } = cut([{ start: -0.4, end: 1, symbol: "C" }]);
		expect(runs).toEqual([{ start: 0, end: 1, symbol: "C" }]);
		expect(list).toEqual([]);
	});

	test("a run wholly outside is dropped", () => {
		const { runs, list } = cut([{ start: 9, end: 10, symbol: "C" }]);
		expect(runs).toEqual([]);
		expect(list.map((d) => d.code)).toEqual(["outside-bars"]);
	});
});
