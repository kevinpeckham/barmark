import { describe, expect, test } from "bun:test";
import { parseBarLine } from "../../src/chart/barLine.js";
import { parseChart } from "../../src/chart/parse.js";
import { printChart } from "../../src/chart/print.js";
import { transposeChart } from "../../src/chart/transpose.js";
import { meaning, play } from "./fixtures.js";

const read = (text: string) => parseBarLine(text, 1);
const messages = (text: string) =>
	play(text)
		.all.filter((d) => d.severity === "error")
		.map((d) => d.message);

describe("rehearsal marks: reading", () => {
	test("@ and a label is a cell of its own, between bars", () => {
		const cells = read("| @B | D | A |").bars?.cells;
		expect(cells?.[0]).toEqual({ kind: "rehearsal", label: "B" });
		expect(cells?.length).toBe(3);
	});
	test("a label is letters and digits", () => {
		for (const label of ["A", "B2", "17", "Intro"])
			expect(read(`| @${label} | D |`).bars?.cells[0]).toEqual({ kind: "rehearsal", label });
	});
	test("a mark shares its cell with nothing", () => {
		const r = read("| @B D | A |");
		expect(r.bars).toBeNull();
		expect(r.diagnostics[0]?.message).toContain("a rehearsal mark is a cell of its own");
		expect(r.diagnostics[0]?.suggestion).toBe("| @B | D |");
	});
	test("@ needs a label of letters and digits", () => {
		for (const t of ["| @ | D |", "| @B! | D |", "| @ B | D |"]) {
			const r = read(t);
			expect(r.bars).toBeNull();
			expect(r.diagnostics[0]?.message).toContain("a rehearsal mark is @ and a label");
		}
	});
	test("a mark takes no bar number", () => {
		expect(read("| @A | D | A |").written).toBe(2);
		expect(read("| Segno | D | A |").written).toBe(2);
	});
});

describe("rehearsal marks: playing", () => {
	test("the mark is on the bar after it", () => {
		const bars = play("| D | A |\n| @B | G | D |").bars;
		expect(bars.map((b) => b.rehearsal ?? null)).toEqual([null, null, "B", null]);
	});
	test("the bar after a mark at a line's end is on the next line", () => {
		const bars = play("| D | @B |\n| G |").bars;
		expect(bars.map((b) => b.rehearsal ?? null)).toEqual([null, "B"]);
	});
	test("a repeat or replay plays the mark with its bar", () => {
		const bars = play("## Verse\n|: @A | D | A :|\n## Verse").bars;
		expect(bars.map((b) => b.rehearsal ?? null)).toEqual([
			"A",
			null,
			"A",
			null,
			"A",
			null,
			"A",
			null,
		]);
	});
	test("a mark is not a bar and takes no time", () => {
		expect(play("| @A | D | @B | A |").bars.map((b) => b.written)).toEqual([1, 2]);
	});
	test("a mark with no bar after it is an error", () => {
		expect(messages("| D | @B |")).toEqual([
			"a rehearsal mark marks the bar after it; none follows",
		]);
	});
	test("two marks on one bar is an error", () => {
		expect(messages("| @A | @B | D |")).toEqual(["two rehearsal marks on one bar"]);
	});
});

describe("words on a bar: reading", () => {
	test("quoted words go on the slot after them", () => {
		const cell = read('| "solo" D A |').bars?.cells[0];
		expect(cell?.kind === "slots" && cell.words).toEqual([{ text: "solo", at: 0 }]);
	});
	test("words between slots, and after the last one", () => {
		const cell = read('| D "rit." G "fill" |').bars?.cells[0];
		expect(cell?.kind === "slots" && cell.words).toEqual([
			{ text: "rit.", at: 1 },
			{ text: "fill", at: 2 },
		]);
		expect(cell?.kind === "slots" && cell.slots.length).toBe(2);
	});
	test("words may hold spaces, and curly quotes are accepted", () => {
		const cell = read("| “half time” D |").bars?.cells[0];
		expect(cell?.kind === "slots" && cell.words).toEqual([{ text: "half time", at: 0 }]);
	});
	test("a bar with no words has none", () => {
		const cell = read("| D |").bars?.cells[0];
		expect(cell?.kind === "slots" && "words" in cell).toBe(false);
	});
	test("words go on % too, on the whole bar", () => {
		expect(read('| D | "solo" % |').bars?.cells[1]).toEqual({
			kind: "simile",
			words: [{ text: "solo", at: 0 }],
		});
	});
	test("an unclosed quote and empty words are errors", () => {
		expect(read('| "solo D |').diagnostics[0]?.message).toContain("words need a closing quote");
		expect(read('| "" D |').diagnostics[0]?.message).toContain("empty words");
	});
	test("words need a bar: alone, on a mark or a direction, they are errors", () => {
		for (const t of ['| "solo" |', '| "x" @A | D |', '| "x" D.S. |', '| "x" ... |'])
			expect(read(t).diagnostics[0]?.message).toContain("words go on a bar");
	});
	test("words are not read as chords or directions", () => {
		expect(read('| "D.S. al Coda" D |').bars?.cells.map((c) => c.kind)).toEqual(["slots"]);
		expect(read('| "Coda" D |').bars?.cells.map((c) => c.kind)).toEqual(["slots"]);
	});
});

describe("words on a bar: playing", () => {
	test("played bars carry their words", () => {
		const bars = play('| "solo" D | A |\n| D "rit." G |').bars;
		expect(bars.map((b) => b.words ?? null)).toEqual([
			[{ text: "solo", at: 0 }],
			null,
			[{ text: "rit.", at: 1 }],
		]);
	});
	test("% copies the chords, not the words before it", () => {
		const bars = play('| "solo" D | % |').bars;
		expect(bars[1]?.words).toBeUndefined();
	});
	test("words carry no musical meaning: rit. in quotes changes no tempo", () => {
		const bars = parseChart('tempo: 120\n| D "rit." | A |').bars;
		expect(bars.map((b) => b.tempoChange)).toEqual([null, null]);
	});
});

describe("printing and transposing", () => {
	test("marks and words print canonically", () => {
		expect(printChart("| @B | “solo”  D   A | %   “fill” |")).toBe(
			'| @B | "solo" D A | "fill" % |\n',
		);
	});
	test("printing is stable and keeps marks and words", () => {
		const text = '## Verse\n|: @A | "solo" D | A "fill" :|\n| @B | G "rit." D |\n\n## Verse\n';
		const once = printChart(text);
		expect(printChart(once)).toBe(once);
		expect(meaning(parseChart(once))).toEqual(meaning(parseChart(text)));
		expect(once).toBe(text);
	});
	test("transposing leaves marks and words alone", () => {
		expect(transposeChart('key: C\n| @A | "solo" C | G |', { to: "D" }).text).toBe(
			'key: D\n| @A | "solo" D | A |\n',
		);
	});
});
