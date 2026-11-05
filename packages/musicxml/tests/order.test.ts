import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractPart } from "barmark";
import { MORNING_SONG } from "../../barmark/tests/chart/morning-song.js";
import { measures, xmlOf } from "./helpers.js";
import { expected, expectedBars, play } from "./play.js";

const plays = (text: string) => {
	const xml = xmlOf(text);
	expect(play(xml)).toEqual(expected(text));
	return xml;
};

describe("play order", () => {
	test("|: :| and x N are repeat bar lines", () => {
		const xml = plays("|: G | C :| x3\n| D |");
		const [first, second] = measures(xml);
		expect(first).toContain('<repeat direction="forward"/>');
		expect(second).toContain('<repeat direction="backward" times="3"/>');
		expect(xml.match(/<measure /g)).toHaveLength(3);
		plays("| G | C | x2\n| D |");
		plays("|: G | C :|\n| D |");
	});
	test("x ... is an open repeat played once, with the words repeat as needed", () => {
		const xml = plays("| G | C | x ...\n|: D | A :| x2\n| E |");
		expect(measures(xml)[1]).toContain('<repeat direction="backward" times="1"/>');
		expect(xml).toContain("<words>repeat as needed</words>");
	});
	test("a count above 2 is also printed as ×N, since Dorico ignores times on import", () => {
		const [, second] = measures(plays("|: G | C :| x5\n| D |"));
		expect(second).toContain("<words>×5</words>");
		const [, , last] = measures(plays("## Chorus x3\n| G | C | D |\n## Out\n| G |"));
		expect(last).toContain("<words>×3</words>");
		expect(xmlOf("|: G | C :| x2\n| D |")).not.toContain("×");
		expect(xmlOf("|: G | C :|\n| D |")).not.toContain("×");
	});
	test("endings", () => {
		const xml = plays("|: G | C |\n|1 D :|\n|2 G |");
		const ms = measures(xml);
		expect(ms[2]).toContain('<ending number="1" type="start"/>');
		expect(ms[2]).toContain('<ending number="1" type="stop"/>');
		expect(ms[3]).toContain('<ending number="2" type="discontinue"/>');
		plays("|: G | C |\n|1-3 D | E :|\n|4 G |");
		plays("|: G |\n|1 D :|\n|2 E :|\n|3 F |");
	});
	test("a section heading is bold words; a rehearsal mark is rehearsal", () => {
		const xml = plays("## Verse\n| @B | G | C |");
		expect(measures(xml)[0]).toContain('<words font-weight="bold">Verse</words>');
		expect(measures(xml)[0]).toContain("<rehearsal>B</rehearsal>");
	});
	test("## Chorus x2 repeats the section", () => {
		const xml = plays("## Chorus x2\n| G | C |\n| D |\n## Out\n| G |");
		expect(measures(xml)[0]).toContain('<repeat direction="forward"/>');
		expect(measures(xml)[2]).toContain('<repeat direction="backward" times="2"/>');
		plays("## Chorus x2\n|: G | C :|\n| D |\n## Out\n| G |");
	});
	test("a replay is written out with its own numbers shown", () => {
		const text = readFileSync(
			new URL("../../../examples/peaceful-dreams.chart.md", import.meta.url),
			"utf8",
		);
		plays(text);
		const xml = plays("## A\n| C | D |\n## B\n| E |\n## A");
		expect(measures(xml).map((m) => /text="(\d+)"/.exec(m)?.[1])).toEqual([
			"1",
			"2",
			"3",
			"1",
			"2",
		]);
		expect(measures(xml)[3]).toContain('<words font-weight="bold">A</words>');
	});
	test("an elision drops its bar, on the last pass of x2 too", () => {
		plays("## Chorus\n| C | D | E |\n## Chorus ->\n## Out\n| G |");
		plays("## Chorus\n| C | D |\n## Chorus x2 ->\n## Out\n| G |");
	});
	test("D.S. al Coda with To Coda, in a chart that also repeats", () => {
		const xml = plays(
			"## V\n| Segno | C | To Coda | D |\n|: E | F :|\n| G | D.S. al Coda |\n## Coda\n| Coda | A | B |",
		);
		expect(xml).toContain('<sound segno="s1"/>');
		expect(xml).toContain('<sound dalsegno="s1"/>');
		expect(xml).toContain('<sound tocoda="c1"/>');
		expect(xml).toContain('<sound coda="c1"/>');
		expect(xml).toContain("<words>D.S. al Coda</words>");
		plays(
			"## V\n|: Segno | C | D |\n|1 E :|\n|2 F | To Coda | G | D.S. al Coda |\n## Coda\n| Coda | A |",
		);
	});
	test("D.C. al Fine", () => {
		const xml = plays("| C | D | Fine | E | F | D.C. al Fine |");
		expect(xml).toContain('<sound fine="yes"/>');
		expect(xml).toContain('<sound dacapo="yes"/>');
	});
	test("a fermata cell is a fermata on the bar line before it", () => {
		const xml = plays("| C | G | ... |");
		expect(measures(xml)[1]).toMatch(/<barline location="right"><fermata\/><\/barline>/);
	});
	test("a % of a one-bar meter keeps the meter, then the running one returns", () => {
		const ms = measures(plays("| [2/4] G | % | D |"));
		expect(ms[0]).toContain("<beats>2</beats>");
		expect(ms[1]).not.toContain("<time>");
		expect(ms[2]).toContain("<time><beats>4</beats><beat-type>4</beat-type></time>");
	});
	test("Morning Song's two parts each play the whole timeline", () => {
		const xml = plays(MORNING_SONG);
		const piano = extractPart(MORNING_SONG, "Pno");
		if (!piano) throw new Error("no piano");
		expect(play(xml, "P2")).toEqual(expectedBars(piano.bars));
		expect(play(xml, "P2").harmony).toContain("G/B");
	});
});
