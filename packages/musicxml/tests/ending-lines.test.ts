/** Barmark's grammar 5.1 (2026-11-10): an ending may continue onto the plain bar lines after it. */
import { describe, expect, test } from "bun:test";
import { type ChartParse, parseChart } from "barmark";
import { growth, TIMING_TIMEOUT } from "../../../test-support/growth.js";
import { writtenMeasures } from "../src/measures.js";
import { measures, xmlOf } from "./helpers.js";
import { expected, play } from "./play.js";

/** The `<ending>` marks of each measure, in order. */
const endings = (xml: string, part = "P1") =>
	measures(xml, part).map((m) =>
		(m.match(/<ending [^>]*\/>/g) ?? []).map((e) => {
			const n = /number="([^"]*)"/.exec(e)?.[1];
			const t = /type="([^"]*)"/.exec(e)?.[1];
			return `${n}:${t}`;
		}),
	);
const backward = (xml: string) =>
	measures(xml).map(
		(m) =>
			/<repeat direction="backward"(?: times="(\d+)")?/.exec(m)?.[1] ??
			(m.includes('direction="backward"') ? "2" : null),
	);

const plays = (text: string) => {
	const xml = xmlOf(text);
	expect(play(xml)).toEqual(expected(text));
	return xml;
};

describe("an ending across lines", () => {
	test("starts on its first line's first bar and stops on its :| line's last", () => {
		const xml = plays("|: C | F |\n|1 G | A | B | C |\n| D :|\n|2 E |");
		expect(endings(xml)).toEqual([
			[],
			[],
			["1:start"],
			[],
			[],
			[],
			["1:stop"],
			["2:start", "2:discontinue"],
		]);
		expect(backward(xml)).toEqual([null, null, null, null, null, null, "2", null]);
	});
	test("every ending but the last may run on; the repeat goes back at each :|", () => {
		const xml = plays("|: C |\n|1 D |\n| E :|\n|2 F |\n| G :|\n|3 A |");
		expect(endings(xml)).toEqual([
			[],
			["1:start"],
			["1:stop"],
			["2:start"],
			["2:stop"],
			["3:start", "3:discontinue"],
		]);
		expect(backward(xml)).toEqual([null, null, "3", null, "3", null]);
	});
	test("text between its lines changes nothing", () => {
		plays("|: C |\n|1 D |\nwatch the drummer\n| E :|\n|2 F |");
	});
	test("a line repeated inside the bracket writes the passes out, the continued ending included", () => {
		const xml = plays("|: C |\n| D | x2\n|1 E |\n| F :|\n|2 G |");
		expect(endings(xml).flat()).toEqual([]);
	});
	test("each part of a system writes the same ending", () => {
		const text = [
			"part: Gtr = Guitar",
			"part: Bs = Bass",
			"Gtr |: C |",
			"Bs |: {C2} |",
			"Gtr |1 G |",
			"Bs |1 {G2} |",
			"Gtr | A :|",
			"Bs | {A2} :|",
			"Gtr |2 E |",
			"Bs |2 {E2} |",
		].join("\n");
		const xml = xmlOf(text);
		for (const part of ["P1", "P2"])
			expect(endings(xml, part)).toEqual([
				[],
				["1:start"],
				["1:stop"],
				["2:start", "2:discontinue"],
			]);
	});
});

describe("many bar lines", () => {
	/** How much longer 16,000 lines of `line` take to walk than 2,000. */
	const walkGrowth = (line = "| C |") => {
		const [small, large] = [2000, 16000].map((n) =>
			parseChart(Array.from({ length: n }, () => line).join("\n")),
		) as [ChartParse, ChartParse];
		// 2,000 lines walk in 3 to 7 ms: sixteen walks a run against two of 16,000, so both runs are long
		// beside a pause and last as long (CI's runners failed the single walks at 17 and 18 against 16).
		return growth(
			() => writtenMeasures(small),
			() => writtenMeasures(large),
			{ balance: 8, repeat: 2 },
		);
	};
	test(
		"eight times as many lines are walked in linear time",
		() => {
			// About eight now; 42 when each line copied the lines after it to look for an ending's next line.
			expect(walkGrowth()).toBeLessThan(16);
			// Each `:|` looks ahead for endings too.
			expect(walkGrowth("|: C :|")).toBeLessThan(16);
		},
		TIMING_TIMEOUT,
	);
});
