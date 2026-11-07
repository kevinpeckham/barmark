import { describe, expect, test } from "bun:test";
import { chartFromDetections } from "../src/build/build.js";
import { createReport } from "../src/build/report.js";
import type { BarSpan, SymbolRun } from "../src/build/runs.js";
import { voteSlots } from "../src/build/vote.js";

const run = (label: string, start: number, end: number) => ({ start, end, label });
const build = (bars: number[], runs: ReturnType<typeof run>[]) =>
	chartFromDetections({ grid: { bars }, meter: "4/4", chords: { runs } });

describe("voting a symbol for each slot", () => {
	test("plurality of covered time", () => {
		const r = build(
			[0, 2, 4, 6, 8],
			[run("C:maj", 0, 4), run("G:maj", 4, 6), run("F:maj", 6, 7), run("C:maj", 7, 8)],
		);
		expect(r.chart).toBe("time: 4/4\n| C | / | G | F C |\n");
	});

	test("a change just off the beat lands on it", () => {
		const r = build([0, 2, 4, 6, 8], [run("C:maj", 0, 4.2), run("G:maj", 4.2, 8)]);
		expect(r.chart).toBe("time: 4/4\n| C | / | G | / |\n");
	});

	test("a tie goes to the chord at the slot's start", () => {
		const bars: BarSpan[] = [{ start: 0, end: 2, meter: { n: 4, d: 4 }, beats: 4 }];
		const runs: SymbolRun[] = [
			{ start: 0, end: 0.25, symbol: "C" },
			{ start: 0.25, end: 0.5, symbol: "G" },
		];
		expect(voteSlots(bars, runs, createReport())[0]?.[0]).toBe("C");
	});

	test("then to the earlier-starting run", () => {
		const bars: BarSpan[] = [{ start: 0, end: 2, meter: { n: 4, d: 4 }, beats: 4 }];
		const runs: SymbolRun[] = [
			{ start: 0.1, end: 0.3, symbol: "C" },
			{ start: 0.3, end: 0.5, symbol: "G" },
		];
		expect(voteSlots(bars, runs, createReport())[0]?.[0]).toBe("C");
	});

	test("under half covered is ?, warned once per stretch", () => {
		const r = build([0, 2], [run("C:maj", 0, 1)]);
		expect(r.chart).toBe("time: 4/4\n| C ? |\n");
		const warns = r.diagnostics.filter((d) => d.code === "no-chord-detected");
		expect(warns).toHaveLength(1);
		expect(warns[0]?.bar).toBe(1);
		expect(warns[0]?.at).toBe(1);
	});

	test("a short chord between long ones is outvoted", () => {
		const r = build([0, 2], [run("C:maj", 0, 0.9), run("D:maj", 0.9, 1.1), run("C:maj", 1.1, 2)]);
		expect(r.chart).toBe("time: 4/4\n| C |\n");
	});
});
