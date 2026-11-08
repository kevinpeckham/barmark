import { describe, expect, test } from "bun:test";
import { parseBarLine } from "../../src/chart/barLine.js";
import { printChart } from "../../src/chart/print.js";
import { transposeChart } from "../../src/chart/transpose.js";
import type { Cell } from "../../src/chart/types.js";
import { play } from "./fixtures.js";

const read = (text: string) => parseBarLine(text, 1);
const errors = (text: string) => play(text).all.filter((d) => d.severity === "error");
const messages = (text: string) => errors(text).map((d) => d.message);
const direction = (cell: Cell | undefined) => (cell?.kind === "direction" ? cell.direction : null);

const VERSE = "## Verse\n|: C | F | G | C |\n|1 G | G7 :|\n|2 G | C |";

describe("endings: reading (grammar 5.1)", () => {
	test("a bar line that starts with pass numbers is an ending", () => {
		const bars = read("|1 G | G7 :|").bars;
		expect(bars?.ending).toEqual([1]);
		expect(bars?.closes).toBe(true);
		expect(bars?.cells.length).toBe(2);
	});
	test("passes may be a range or a list, read in order", () => {
		expect(read("|1-3 G |").bars?.ending).toEqual([1, 2, 3]);
		expect(read("|1,3 G |").bars?.ending).toEqual([1, 3]);
		expect(read("|3,1 G |").bars?.ending).toEqual([1, 3]);
	});
	test("a plain bar line is no ending", () => {
		expect(read("| G | C |").bars?.ending).toBeNull();
	});
	test("pass numbers that read as no passes are errors", () => {
		for (const t of ["|0 G |", "|3-1 G |", "|1,1 G |", "|1. G |"]) expect(read(t).bars).toBeNull();
	});
	test("an ending mark in the middle of a line is an error that says where it goes", () => {
		const r = read("| C |1 D |");
		expect(r.bars).toBeNull();
		expect(r.diagnostics[0]?.message).toContain("an ending starts its own bar line");
	});
});

describe("endings: playing", () => {
	test("each pass plays the body, then its ending", () => {
		expect(play(VERSE).texts).toEqual([
			"C",
			"F",
			"G",
			"C",
			"G",
			"G7",
			"C",
			"F",
			"G",
			"C",
			"G",
			"C",
		]);
		expect(messages(VERSE)).toEqual([]);
	});
	test("the highest ending gives the number of passes", () => {
		const r = play("|: C |\n|1-3 D :|\n|4 E |");
		expect(r.texts).toEqual(["C", "D", "C", "D", "C", "D", "C", "E"]);
	});
	test("a list plays its passes wherever they fall", () => {
		const r = play("|: C |\n|1,3 D :|\n|2 E :|\n|4 F |");
		expect(r.texts).toEqual(["C", "D", "C", "E", "C", "D", "C", "F"]);
	});
	test("the body may run over several lines, and text may sit between endings", () => {
		const r = play("|: C | F |\n| G |\n|1 D :|\nwatch the drummer\n|2 E |");
		expect(r.texts).toEqual(["C", "F", "G", "D", "C", "F", "G", "E"]);
		expect(r.all.filter((d) => d.severity === "error")).toEqual([]);
	});
	test("a replay plays the endings again", () => {
		expect(play(`${VERSE}\n## Chorus\n| A |\n## Verse`).texts.slice(13)).toEqual([
			"C",
			"F",
			"G",
			"C",
			"G",
			"G7",
			"C",
			"F",
			"G",
			"C",
			"G",
			"C",
		]);
	});
	test("written numbers count each ending's bars, as a printed score does", () => {
		expect(play(VERSE).bars.map((b) => b.written)).toEqual([1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 7, 8]);
	});
	test("bars after the endings play once", () => {
		expect(play("|: C |\n|1 D :|\n|2 E |\n| F |").texts).toEqual(["C", "D", "C", "E", "F"]);
	});
});

describe("endings: errors", () => {
	test("an ending that follows no repeat", () => {
		expect(messages("| C |\n|1 D :|\n|2 E |")[0]).toContain(
			"an ending follows the bars of a |: … :| repeat",
		);
	});
	test("a pass with no ending, or two", () => {
		expect(messages("|: C |\n|1 D :|\n|3 E |")[0]).toContain("pass 2 has no ending");
		expect(messages("|: C |\n|1,2 D :|\n|2-3 E |")[0]).toContain("pass 2 has two endings");
	});
	test("the last ending closes with :| or an earlier one does not", () => {
		expect(messages("|: C |\n|1 D :|\n|2 E :|")[0]).toContain("the last ending plays on");
		expect(messages("|: C |\n|1 D |\n|2 E |")[0]).toContain("goes back with :|");
	});
	test("the highest pass is the last ending, and is at least 2", () => {
		expect(messages("|: C |\n|2 D :|\n|1 E |")[0]).toContain("the last ending");
		expect(messages("|: C |\n|1 D :|")[0]).toContain("at least two passes");
	});
	test("x N on an ending: the endings give the count", () => {
		expect(messages("|: C |\n|1 D :| x3\n|2 E |")[0]).toContain("the endings give the count");
	});
	test("a broken set of endings still plays each line once", () => {
		expect(play("| C |\n|1 D :|\n|2 E |").texts).toEqual(["C", "D", "E"]);
	});
});

describe("directions: reading (grammar 5.2)", () => {
	test("a direction is a cell of its own", () => {
		const cells = read("| Segno | C | To Coda | Fine | Coda |").bars?.cells ?? [];
		expect(cells.map(direction)).toEqual([
			{ kind: "segno" },
			null,
			{ kind: "to coda" },
			{ kind: "fine" },
			{ kind: "coda" },
		]);
	});
	test("jumps say where they go back to and where they end", () => {
		const jump = (t: string) => direction(read(`| ${t} |`).bars?.cells[0]);
		expect(jump("D.C.")).toEqual({ kind: "jump", to: "start", al: null });
		expect(jump("D.C. al Fine")).toEqual({ kind: "jump", to: "start", al: "fine" });
		expect(jump("D.C. al Coda")).toEqual({ kind: "jump", to: "start", al: "coda" });
		expect(jump("D.S.")).toEqual({ kind: "jump", to: "segno", al: null });
		expect(jump("D.S. al Fine")).toEqual({ kind: "jump", to: "segno", al: "fine" });
		expect(jump("D.S. al Coda")).toEqual({ kind: "jump", to: "segno", al: "coda" });
	});
	test("any case, collapsed spaces, and the score's symbols", () => {
		const one = (t: string) => direction(read(`| ${t} |`).bars?.cells[0]);
		expect(one("d.s.  al  coda")).toEqual({ kind: "jump", to: "segno", al: "coda" });
		expect(one("TO CODA")).toEqual({ kind: "to coda" });
		expect(one("𝄋")).toEqual({ kind: "segno" });
		expect(one("𝄌")).toEqual({ kind: "coda" });
	});
	test("a near miss is an error that suggests the spelling", () => {
		const r = read("| C | D.S al Coda |");
		expect(r.bars).toBeNull();
		expect(r.diagnostics[0]?.suggestion).toBe("D.S. al Coda");
	});
	test("a direction must be alone in its cell", () => {
		const r = read("| C Fine |");
		expect(r.bars).toBeNull();
		expect(r.diagnostics[0]?.message).toContain("alone in its cell");
	});
});

const CODA =
	"## Verse\n| Segno | C | F | G | To Coda | C |\n| Am | F | G | C | D.S. al Coda |\n## Coda\n| Coda | F | G | C | ... |";

describe("directions: playing", () => {
	test("D.S. al Coda goes back to the segno and on at the coda", () => {
		expect(play(CODA).texts).toEqual([
			"C",
			"F",
			"G",
			"C",
			"Am",
			"F",
			"G",
			"C",
			"C",
			"F",
			"G",
			"F",
			"G",
			"C",
		]);
		expect(messages(CODA)).toEqual([]);
	});
	test("D.C. al Fine goes back to the first bar and stops at Fine", () => {
		const r = play("## A\n| C | F | Fine |\n## B\n| G | D.C. al Fine |");
		expect(r.texts).toEqual(["C", "F", "G", "C", "F"]);
	});
	test("a bare jump plays to the end", () => {
		expect(play("| C | D.C. |\n| G |").texts).toEqual(["C", "C", "G"]);
		expect(play("| C | Segno | D | E | D.S. |").texts).toEqual(["C", "D", "E", "D", "E"]);
	});
	test("after the jump every repeat plays once, |: :| taking its last ending", () => {
		const r = play("|: C |\n|1 D :|\n|2 E |\n| F | x2\n## Out x2\n| G |\n## End\n| A | D.C. |");
		expect(r.texts).toEqual(["C", "D", "C", "E", "F", "F", "G", "G", "A", "C", "E", "F", "G", "A"]);
	});
	test("bars keep their written numbers after the jump", () => {
		expect(play(CODA).bars.map((b) => b.written)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 9, 10, 11,
		]);
	});
	test("play-order numbers keep counting", () => {
		expect(play(CODA).bars.map((b) => b.index)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
		]);
	});
	test("each section the return passes through is another occurrence of it", () => {
		const occ = play(CODA).sections.map((s) => [s.name, s.line, s.replayOf, s.firstBar, s.lastBar]);
		expect(occ).toEqual([
			["Verse", 1, null, 1, 8],
			["Verse", 1, 1, 9, 11],
			["Coda", 4, null, 12, 14],
		]);
	});
	test("directives in force at the segno are the ones in force when the return reaches it", () => {
		const r = play("key: C\n| Segno | C |\nkey: D\n| D | D.S. |");
		expect(r.bars.map((b) => b.key?.tonic)).toEqual(["C", "D", "C", "D"]);
	});
	test("a direction is not a bar and takes no time", () => {
		const r = play("| C | Segno | D | D.S. |");
		expect(r.texts).toEqual(["C", "D", "D"]);
		expect(r.bars.map((b) => b.written)).toEqual([1, 2, 2]);
	});
});

describe("directions: errors", () => {
	test("one jump per chart", () => {
		expect(messages("| C | D.C. |\n| D | D.C. |")[0]).toContain("one D.C. or D.S.");
	});
	test("one of each mark", () => {
		expect(messages("| Segno | C | Segno | D | D.S. |")[0]).toContain("a second Segno");
	});
	test("D.S. needs a segno before it", () => {
		expect(messages("| C | D.S. |")[0]).toContain("no Segno before it");
		expect(messages("| C | D.S. | Segno | D |")[0]).toContain("no Segno before it");
	});
	test("al Fine needs a Fine, al Coda a To Coda and a Coda after it", () => {
		expect(messages("| C | D.C. al Fine |")[0]).toContain("no Fine");
		expect(messages("| C | D.C. al Coda |\n| Coda | D |")[0]).toContain("no To Coda");
		expect(messages("| C | To Coda | D | D.C. al Coda |")[0]).toContain("no Coda after");
		expect(messages("| Coda | C | To Coda | D | D.C. al Coda |")[0]).toContain("no Coda after");
	});
	test("a Coda needs a bar after it, anywhere later in the chart", () => {
		const text = "| C | To Coda | D | D.C. al Coda |\n## Coda\n| G | Coda |";
		const coda = errors(text).filter((d) => d.message.includes("no bar after it"));
		expect(coda).toHaveLength(1);
		expect(coda[0]?.line).toBe(3);
		expect(coda[0]?.token).toBe("Coda");
		expect(messages("| C | To Coda | D | D.C. al Coda | Coda |\n| E |")).toEqual([]);
		expect(messages("| C | To Coda | D | D.C. al Coda | Coda |\n## Coda\n| E |")).toEqual([]);
		expect(messages("| C | To Coda | D | D.C. al Coda | Coda | ... |\n| % |")).toEqual([]);
	});
	test("a replay heading after the Coda counts as its bars: the last chorus as coda", () => {
		const text =
			"## Verse\n| Segno | Am | F |\n## Chorus\n| C | To Coda | G | D.S. al Coda |\n| Coda |\n## Verse";
		expect(messages(text)).toEqual([]);
		expect(play(text).texts).toEqual(["Am", "F", "C", "G", "Am", "F", "C", "Am", "F"]);
		const twice = "## Verse\n| C | To Coda | D | D.C. al Coda |\n## Coda\n| Coda |\n## Verse x2";
		expect(messages(twice)).toEqual([]);
	});
	test("only the Coda an al Coda goes on needs a bar after it; an unused one has one error", () => {
		expect(messages("| C | Coda |")).toEqual(["Coda: no jump uses it"]);
	});
	test("a Coda with only marks after it is an error, and the jump is not taken", () => {
		const text = "| C | To Coda | D | D.C. al Coda | Coda | ... |\ntext\n| @A |";
		expect(messages(text).filter((m) => m.includes("no bar after it"))).toHaveLength(1);
		expect(play("| C | To Coda | D | D.C. al Coda | Coda |").texts).toEqual(["C", "D"]);
	});
	test("a mark no jump uses", () => {
		expect(messages("| C | Fine |")[0]).toContain("no jump uses");
		expect(messages("| Segno | C | D.C. |")[0]).toContain("no jump uses");
		expect(messages("| C | To Coda | D | D.C. al Fine | Fine |")[0]).toContain("no jump uses");
	});
	test("a broken jump is not taken", () => {
		expect(play("| C | D.S. |\n| D |").texts).toEqual(["C", "D"]);
	});
});

describe("printing", () => {
	test("endings print with passes in order, runs of three or more as a range", () => {
		expect(printChart("|: C |\n|1,2,3 D :|\n|4 E|")).toBe("|: C |\n|1-3 D :|\n|4 E |\n");
		expect(printChart("|: C |\n|2,1 D :|\n|3 E |")).toBe("|: C |\n|1,2 D :|\n|3 E |\n");
	});
	test("directions print in their canonical spelling", () => {
		expect(printChart("| 𝄋 | C | to coda | d.s.  al  coda |\n| 𝄌 | D |")).toBe(
			"| Segno | C | To Coda | D.S. al Coda |\n| Coda | D |\n",
		);
	});
	test("a Coda's line with no bar after it prints as written, as every line with an error does", () => {
		const text = "| C | to coda | D | d.c. al coda | 𝄌 |\n";
		expect(printChart(text)).toBe(text);
		expect(printChart(`${text}| E |\n`)).toBe("| C | To Coda | D | D.C. al Coda | Coda |\n| E |\n");
	});
	test("a direction cell doesn't shift the beats used to reduce the bars after it", () => {
		const text = "time: 3/4\n| Segno | G / / D / / | D.S. |\n";
		expect(printChart(text)).toBe(text);
	});
	test("printing is stable and keeps the meaning", () => {
		for (const t of [VERSE, CODA]) {
			const once = printChart(t);
			expect(printChart(once)).toBe(once);
			expect(play(once).texts).toEqual(play(t).texts);
		}
	});
});

describe("transposing", () => {
	test("endings and directions pass through", () => {
		const out = transposeChart("key: C\n|: Segno | C |\n|1 G :|\n|2 F | D.S. |", { to: "D" }).text;
		expect(out).toBe("key: D\n|: Segno | D |\n|1 A :|\n|2 G | D.S. |\n");
	});
});
