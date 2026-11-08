/** Import's round trips (spec 9): generator-form charts come back exactly, and every chart sounds the same by ear. */
import { describe, expect, test } from "bun:test";
import { parseChart, printChart } from "barmark";
import { AT_A_GLANCE } from "../../barmark/tests/chart/fixtures.js";
import { corpus } from "../../musicxml/tests/charts.js";
import { GENERATOR_FORM } from "./helpers/charts.js";
import { byEar, throughMidi } from "./helpers/voted.js";

describe("round trip", () => {
	test("generator-form charts come back exactly", () => {
		for (const [name, chart] of GENERATOR_FORM) {
			expect(printChart(chart), name).toBe(chart);
			expect(throughMidi(chart), name).toBe(chart);
		}
	});

	test("every chart sounds the same on every beat", () => {
		const charts: [string, string][] = [["at a glance", AT_A_GLANCE], ...corpus()];
		const misses: string[] = [];
		let unnamed = 0;
		for (const [name, chart] of charts) {
			const ear = byEar(parseChart(chart), parseChart(throughMidi(chart)));
			misses.push(...ear.misses.slice(0, 3).map((m) => `${name}: ${m}`));
			unnamed += ear.unnamed;
		}
		console.log(`by ear: ${charts.length} charts, ${unnamed} beats written as ? and skipped`);
		expect(misses).toEqual([]);
	});
});
