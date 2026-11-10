import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/chart/parse.js";
import { printChart } from "../../src/chart/print.js";
import { transposeChart } from "../../src/chart/transpose.js";
import type { Line } from "../../src/chart/types.js";
import { meaning, play } from "./fixtures.js";

/** Grammar 5.1 (Kevin, 2026-11-10): an ending may continue onto the plain bar lines after it. */

const errors = (text: string) =>
	play(text)
		.all.filter((d) => d.severity === "error")
		.map((d) => [d.line, d.message]);
/** Each bar line's ending as the parse tree has it: `|1` where it starts, `+1` where it continues. */
const marks = (text: string) =>
	parseChart(text)
		.lines.filter((l): l is Extract<Line, { kind: "bars" }> => l.kind === "bars")
		.map((l) => (l.ending ? `|${l.ending}` : l.continues ? `+${l.continues}` : "|"));

const FIVE = "|: C | F |\n|1 G | A | B | C |\n| D :|\n|2 E |";

describe("an ending across lines", () => {
	test("a first ending continues through plain lines to its :|", () => {
		expect(play(FIVE).texts).toEqual(["C", "F", "G", "A", "B", "C", "D", "C", "F", "E"]);
		expect(errors(FIVE)).toEqual([]);
	});
	test("the parse tree marks the lines an ending continues onto", () => {
		expect(marks(FIVE)).toEqual(["|", "|1", "+1", "|2"]);
	});
	test("written numbers count the ending's bars once, as written", () => {
		expect(play(FIVE).bars.map((b) => b.written)).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2, 8]);
	});
	test("an ending may run over several lines; so may every ending but the last", () => {
		const text = "|: C |\n|1 D |\n| E |\n| F :|\n|2 G |\n| A :|\n|3 B |";
		expect(play(text).texts).toEqual(["C", "D", "E", "F", "C", "G", "A", "C", "B"]);
		expect(marks(text)).toEqual(["|", "|1", "+1", "+1", "|2", "+2", "|3"]);
		expect(errors(text)).toEqual([]);
	});
	test("a range's ending continues for every pass it plays", () => {
		const text = "|: C |\n|1-2 D |\n| E :|\n|3 F |";
		expect(play(text).texts).toEqual(["C", "D", "E", "C", "D", "E", "C", "F"]);
		expect(marks(text)).toEqual(["|", "|1,2", "+1,2", "|3"]);
	});
	test("the last ending ends at its own line: the lines after it play once", () => {
		const text = "|: C |\n|1 D | E :|\n|2 F |\n| G |\n| A |";
		expect(play(text).texts).toEqual(["C", "D", "E", "C", "F", "G", "A"]);
		expect(marks(text)).toEqual(["|", "|1", "|2", "|", "|"]);
	});
	test("an ending closed by :| on its own line does not continue", () => {
		const text = "|: C |\n|1 D :|\n| E |\n|2 F |";
		expect(marks(text)).toEqual(["|", "|1", "|", "|2"]);
		expect(errors(text).map(([, m]) => m)).toContain(
			"an ending follows the bars of a |: … :| repeat",
		);
	});
	test("a replay plays the continued ending again", () => {
		const text = `## Verse\n${FIVE}\n## Chorus\n| A |\n## Verse`;
		const texts = play(text).texts;
		expect(texts.slice(11)).toEqual(["C", "F", "G", "A", "B", "C", "D", "C", "F", "E"]);
	});
	test("after a jump the repeat takes its last ending, skipping a continued one", () => {
		const text = "|: Segno | C |\n|1 G |\n| A :|\n|2 E | D.S. |";
		expect(play(text).texts).toEqual(["C", "G", "A", "C", "E", "C", "E"]);
	});
	test("each pass sings its own verse on a continued ending", () => {
		const text = "|: C |\n|1 D |\nlyrics 1: | one |\n| E :|\nlyrics 1: | two |\n|2 F |";
		expect(errors(text)).toEqual([]);
		expect(marks(text)).toEqual(["|", "|1", "+1", "|2"]);
	});
});

describe("what may sit between an ending's lines", () => {
	test("text, credit, lyric-row and --- lines keep the ending going", () => {
		const text = "|: C |\n|1 D |\nwatch the drummer\n---\n| E :|\n|2 F |";
		expect(play(text).texts).toEqual(["C", "D", "E", "C", "F"]);
		expect(marks(text)).toEqual(["|", "|1", "+1", "|2"]);
		expect(errors(text)).toEqual([]);
	});
	test("a rehearsal mark is a cell on a continuation line, and keeps it going", () => {
		const text = "|: C |\n|1 D |\n| @B | E :|\n|2 F |";
		expect(marks(text)).toEqual(["|", "|1", "+1", "|2"]);
		expect(play(text).bars[2]?.rehearsal).toBe("B");
		expect(errors(text)).toEqual([]);
	});
	test("a blank line means nothing, here as anywhere", () => {
		expect(marks("|: C |\n|1 D |\n\n| E :|\n|2 F |")).toEqual(["|", "|1", "+1", "|2"]);
	});
	test("a directive line ends it: the errors are today's", () => {
		const text = "|: C |\n|1 G |\ntime: 3/4\n| D :|\n|2 E |";
		expect(marks(text)).toEqual(["|", "|1", "|", "|2"]);
		expect(errors(text)).toEqual([
			[2, "a repeat with endings plays at least two passes"],
			[4, ":| has no |: before it in this section"],
			[5, "an ending follows the bars of a |: … :| repeat"],
		]);
	});
	test("a heading ends it, as it ends every repeat", () => {
		const text = "|: C |\n|1 G |\n## B\n| D :|\n|2 E |";
		expect(marks(text)).toEqual(["|", "|1", "|", "|2"]);
		expect(errors(text)).toEqual([
			[2, "a repeat with endings plays at least two passes"],
			[4, ":| has no |: before it in this section"],
			[5, "an ending follows the bars of a |: … :| repeat"],
		]);
	});
	test("a |: line ends it: no repeat inside an ending", () => {
		const text = "|: C |\n|1 G |\n|: D :|\n|2 E |";
		expect(marks(text)).toEqual(["|", "|1", "|", "|2"]);
		expect(errors(text)).toEqual([
			[2, "a repeat with endings plays at least two passes"],
			[4, "an ending follows the bars of a |: … :| repeat"],
		]);
	});
	test("a line that can't be read ends it", () => {
		const text = "|: C |\n|1 G |\n| D |: E :|\n|2 E |";
		expect(marks(text)).toEqual(["|", "|1", "|2"]);
	});
	test("x N on a continuation line is an error, as on the ending's own line", () => {
		const text = "|: C |\n|1 G |\n| A | x2\n| D :|\n|2 E |";
		expect(marks(text)).toEqual(["|", "|1", "+1", "+1", "|2"]);
		expect(errors(text)).toEqual([[3, "x N on an ending: the endings give the count"]]);
		expect(play(text).texts).toEqual(["C", "G", "A", "D", "C", "E"]);
	});
});

describe("an ending that never meets its :|", () => {
	test("running into the next ending: one error, on the ending that should go back", () => {
		const text = "|: C |\n|1 G |\n| A |\n|2 E |";
		expect(marks(text)).toEqual(["|", "|1", "+1", "|2"]);
		expect(errors(text)).toEqual([[2, "an ending before the last goes back with :|"]]);
		expect(play(text).texts).toEqual(["C", "G", "A", "E"]);
	});
	test("running into the section's end: today's errors, and nothing continues", () => {
		const text = "|: C |\n|1 G |\n| A |\n## Next\n| B |";
		expect(marks(text)).toEqual(["|", "|1", "|", "|"]);
		expect(errors(text)).toEqual([[2, "a repeat with endings plays at least two passes"]]);
	});
	test("a :| with no ending after it: today's errors, and nothing continues", () => {
		const text = "|: C |\n|1 G |\n| A :|";
		expect(marks(text)).toEqual(["|", "|1", "|"]);
		expect(errors(text)).toEqual([
			[2, "a repeat with endings plays at least two passes"],
			[3, ":| has no |: before it in this section"],
		]);
	});
	test("a stray :| after the last ending stays stray: the repeat still plays", () => {
		const text = "|: C |\n|1 D :|\n|2 E |\n| F :|";
		expect(marks(text)).toEqual(["|", "|1", "|2", "|"]);
		expect(errors(text)).toEqual([[4, ":| has no |: before it in this section"]]);
		expect(play(text).texts).toEqual(["C", "D", "C", "E", "F"]);
	});
	test("endings with no repeat before them keep today's errors", () => {
		const text = "| C |\n|1 D |\n| E :|\n|2 F |";
		expect(errors(text)).toEqual([
			[2, "an ending follows the bars of a |: … :| repeat"],
			[3, ":| has no |: before it in this section"],
			[4, "an ending follows the bars of a |: … :| repeat"],
		]);
		expect(play(text).texts).toEqual(["C", "D", "E", "F"]);
	});
});

describe("repeats side by side", () => {
	test("a repeat after a continued ending's set starts afresh", () => {
		const text = "|: A |\n|1 B |\n| C :|\n|2 D |\n|: E |\n|1 F |\n| G :|\n|2 Bb |";
		expect(play(text).texts).toEqual([..."A B C A D".split(" "), ..."E F G E Bb".split(" ")]);
		expect(errors(text)).toEqual([]);
	});
	test("the body and the ending both across lines", () => {
		const text = "|: A | B |\n| C | D |\n|1 E | F |\n| G | Ab :|\n|2 Bb |";
		expect(play(text).texts.join(" ")).toBe("A B C D E F G Ab A B C D Bb");
	});
});

describe("several parts", () => {
	const PARTS = [
		"part: Gtr = Guitar",
		"part: Bass = Bass",
		"Gtr |: C |",
		"Bass |: C7 |",
		"Gtr |1 G | A |",
		"Bass |1 G7 | A7 |",
		"Gtr | B :|",
		"Bass | B7 :|",
		"Gtr |2 E |",
		"Bass |2 E7 |",
	].join("\n");
	test("a system's lines continue the ending together", () => {
		const p = parseChart(PARTS);
		expect(p.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(p.bars.map((b) => b.written)).toEqual([1, 2, 3, 4, 1, 5]);
		expect(marks(PARTS)).toEqual(["|", "|", "|1", "|1", "+1", "+1", "|2", "|2"]);
	});
});

describe("printing and transposing", () => {
	test("the lines print as written, and format is idempotent", () => {
		const text = `${FIVE}\n`;
		expect(printChart(text)).toBe(text);
		const odd = "|: C|\n|1 G |A|\n|  D :|\n|2 E|";
		const once = printChart(odd);
		expect(once).toBe("|: C |\n|1 G | A |\n| D :|\n|2 E |\n");
		expect(printChart(once)).toBe(once);
		expect(meaning(parseChart(once))).toEqual(meaning(parseChart(odd)));
	});
	test("transposing keeps the lines", () => {
		const out = transposeChart(`key: C\n${FIVE}`, { to: "D" }).text;
		expect(out).toBe("key: D\n|: D | G |\n|1 A | B | C# | D |\n| E :|\n|2 F# |\n");
	});
});
