import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { readInput } from "../src/build/input.js";
import { createReport } from "../src/build/report.js";
import { writeChart } from "../src/build/write.js";

describe("the starting directives", () => {
	test("key, meter and tempo share a line, comma separated", () => {
		const input = readInput(
			{ grid: { bars: [0, 2, 4] }, meter: "4/4", key: "C major", chords: { runs: [] } },
			createReport(),
		);
		if (!input) throw new Error("grid");
		input.tempo = 90;
		const text = writeChart(
			input,
			[
				["C", "C", "C", "C"],
				["C", "C", "C", "C"],
			],
			{
				simile: true,
				barsPerLine: 4,
			},
		);
		expect(text).toBe("key: C, time: 4/4, tempo: 90\n| C / / / | / / / / |\n");
		expect(parseChart(text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});
});
