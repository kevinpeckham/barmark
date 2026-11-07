import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseChart } from "barmark";
import { chartFromDetections } from "../src/build/build.js";
import type { Detections } from "../src/build/types.js";
import { checkTimingMap } from "../src/timing/index.js";

const DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));
const read = (name: string) => readFileSync(`${DIR}${name}`, "utf8");

/** Real ChordMini runs of two songs (scripts/detection-fixtures.ts), as frames and as one symbol a bar. */
const FIXTURES = ["letter-lands", "eat-all-the-clocks"].flatMap((song) => [
	{ name: `${song}`, file: song },
	{ name: `${song} by symbol`, file: `${song}.symbols` },
]);

describe("real detections", () => {
	for (const { name, file } of FIXTURES) {
		const detections = JSON.parse(read(`${file}.detections.json`)) as Detections;
		const built = chartFromDetections(detections);
		const expected = read(`${file}.chart.md`);

		test(`${name} builds to its checked-in chart`, () => {
			expect(built.chart).toBe(expected);
		});

		test(`${name} has no chart errors`, () => {
			expect(parseChart(built.chart).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
			expect(built.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		});

		test(`${name} has a timing map that checks against its chart`, () => {
			const { map, diagnostics } = checkTimingMap(built.timing, { text: built.chart });
			expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
			expect(map).not.toBeNull();
			expect(built.timing?.chart.bars).toBe(parseChart(built.chart).bars.length);
		});
	}
});
