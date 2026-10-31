import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/index.js";
import { PEACEFUL_DREAMS } from "./fixtures.js";

const SONG = `# Song
## Intro
| D | A |
## Verse
| D | G |
## Chorus
| G | D |
## Verse
## Chorus
## Outro
| D |`;

describe("section form", () => {
	test("numbers distinct sections in first-appearance order; a replay shares its section's number", () => {
		expect(parseChart(SONG).sections.map((s) => s.form)).toEqual([0, 1, 2, 1, 2, 3]);
	});

	test("Peaceful Dreams: every Verse replay shares the Verse's form; Verse (Triads) has its own", () => {
		const { sections } = parseChart(PEACEFUL_DREAMS);
		const verses = sections.filter((s) => s.name === "Verse");
		expect(verses.length).toBe(3);
		expect(new Set(verses.map((s) => s.form)).size).toBe(1);
		const triads = sections.find((s) => s.name === "Verse (Triads)");
		expect(triads?.form).not.toBe(verses[0]?.form);
		expect(sections.map((s) => s.form)).toEqual([0, 1, 2, 1, 2, 3, 4, 1, 5, 6]);
	});

	test("an unmatched replay heading is no occurrence, and the numbering skips nothing", () => {
		const { sections } = parseChart(`## A\n| D |\n## Nope\n## B\n| G |\n## A`);
		expect(sections.map((s) => [s.name, s.form])).toEqual([
			["A", 0],
			["B", 1],
			["A", 0],
		]);
	});
});
