import { describe, expect, test } from "bun:test";
import { parseDirectiveLine } from "../../src/chart/directives.js";
import type { TempoChange } from "../../src/chart/types.js";
import { parseChart, printChart } from "../../src/index.js";

const tempoOf = (value: string) => parseDirectiveLine(`tempo: ${value}`, 1);

describe("tempo: rit., accel. and a tempo", () => {
	const reads: [string, TempoChange][] = [
		["rit.", { kind: "rit", to: null }],
		["rit", { kind: "rit", to: null }],
		["ritardando", { kind: "rit", to: null }],
		["rall.", { kind: "rit", to: null }],
		["rallentando", { kind: "rit", to: null }],
		["Rit. to 90", { kind: "rit", to: 90 }],
		["rit. to 90 bpm", { kind: "rit", to: 90 }],
		["accel.", { kind: "accel", to: null }],
		["accelerando to 160", { kind: "accel", to: 160 }],
		["a tempo", { kind: "a tempo" }],
		["A Tempo", { kind: "a tempo" }],
	];
	for (const [value, change] of reads)
		test(`"${value}" reads`, () => {
			expect(tempoOf(value)?.set).toEqual({ tempoChange: change });
			expect(tempoOf(value)?.diagnostics).toEqual([]);
		});
	for (const bad of ["rit. to fast", "rit. to 0", "rit. 90", "slower", "a tempo 120"])
		test(`"${bad}" is an error`, () => {
			expect(tempoOf(bad)?.diagnostics.map((d) => d.severity)).toEqual(["error"]);
			expect(tempoOf(bad)?.diagnostics[0]?.message).toContain("rit.");
		});
	test("a number still reads as a steady tempo", () => {
		expect(tempoOf("120")?.set).toEqual({ tempo: 120 });
	});
});

describe("how a change plays", () => {
	const OUTRO = "tempo: 145\n## Outro\n| D | D |\ntempo: rit. to 90\n| D | D |\n| D | ... |";
	const bars = (text: string) => parseChart(text).bars.map((b) => [b.tempo, b.tempoChange]);

	test("from the next bar to the end of the chart", () => {
		expect(bars(OUTRO)).toEqual([
			[145, null],
			[145, null],
			[145, { kind: "rit", from: 145, to: 90 }],
			[145, { kind: "rit", from: 145, to: 90 }],
			[145, { kind: "rit", from: 145, to: 90 }],
		]);
		expect(parseChart(OUTRO).diagnostics).toEqual([]);
	});
	test("until the next tempo: a number", () => {
		expect(bars("tempo: 145\n| D |\ntempo: rit.\n| D |\ntempo: 90\n| D |")).toEqual([
			[145, null],
			[145, { kind: "rit", from: 145, to: null }],
			[90, null],
		]);
	});
	test("a tempo returns to the steady tempo", () => {
		expect(bars("tempo: 120\n| D |\ntempo: accel.\n| D |\ntempo: a tempo\n| D |")).toEqual([
			[120, null],
			[120, { kind: "accel", from: 120, to: null }],
			[120, null],
		]);
	});
	test("without a starting tempo the change still reads, from unknown", () => {
		expect(bars("tempo: rit.\n| D |")).toEqual([[null, { kind: "rit", from: null, to: null }]]);
	});
	test("a replayed section plays its change again", () => {
		const r = parseChart("tempo: 100\n## A\n| D |\ntempo: rit.\n| D |\ntempo: a tempo\n## A");
		expect(r.bars.map((b) => b.tempoChange?.kind ?? null)).toEqual([null, "rit", null, "rit"]);
	});
});

describe("warnings", () => {
	const warnings = (text: string) =>
		parseChart(text).diagnostics.map((d) => [d.line, d.severity, d.message]);
	test("a tempo with no change before it", () => {
		expect(warnings("tempo: 120\n| D |\ntempo: a tempo\n| D |")).toEqual([
			[3, "warning", "a tempo, but no rit. or accel. is in force"],
		]);
	});
	test("rit. to a faster tempo, accel. to a slower one", () => {
		expect(warnings("tempo: 120\n| D |\ntempo: rit. to 140\n| D |")).toEqual([
			[3, "warning", "rit. to 140 is not slower than 120"],
		]);
		expect(warnings("tempo: 120\n| D |\ntempo: accel. to 100\n| D |")).toEqual([
			[3, "warning", "accel. to 100 is not faster than 120"],
		]);
	});
});

describe("canonical form", () => {
	test("every spelling prints as rit., accel. or a tempo", () => {
		expect(
			printChart(
				"| D |\ntempo: Ritardando to 90 BPM\n| D |\ntempo: accelerando\n| D |\ntempo: A Tempo\n| D |",
			),
		).toBe("| D |\ntempo: rit. to 90\n| D |\ntempo: accel.\n| D |\ntempo: a tempo\n| D |\n");
	});
	test("with other directives on the line", () => {
		expect(printChart("| D |\nfeel: swing, tempo: rall.\n| D |")).toBe(
			"| D |\ntempo: rit., feel: swing\n| D |\n",
		);
	});
});
