import { describe, expect, test } from "bun:test";
import { readCho } from "./read-cho.js";

/** Typed by hand: every construct this package writes, so the tests' instrument is tested on its own. */
const SHEET = `{title: Down by the River}
{meta: arranger C. Hand}
{key: G}
{define: Am7b5 base-fret 1 frets x 0 1 0 1 3}

{start_of_verse: label="Verse 1"}
[G]Down by the [C]river [G]wait[D]ing [*N.C.]
[G] [C] [D]
[*C E F# B]so [*@B]long
{end_of_verse}
{chorus}

{start_of_grid: label="Intro" shape="1+4x4+1"}
@B |: C . G/B . | Am7b5 / % . |1 N.C. *Stop *? C~G :| x2
|2 . . . . || F#m7b5 … . . |
{end_of_grid}
{comment: repeat ad lib.}
`;

describe("readCho", () => {
	test("reads every line shape this package writes", () => {
		expect(readCho(SHEET)).toEqual([
			{ kind: "directive", name: "title", value: "Down by the River" },
			{ kind: "directive", name: "meta", value: "arranger C. Hand" },
			{ kind: "directive", name: "key", value: "G" },
			{ kind: "directive", name: "define", value: "Am7b5 base-fret 1 frets x 0 1 0 1 3" },
			{ kind: "blank" },
			{ kind: "directive", name: "start_of_verse", value: 'label="Verse 1"' },
			{
				kind: "lyrics",
				tokens: [
					{ chord: "G" },
					{ word: "Down" },
					{ word: "by" },
					{ word: "the" },
					{ chord: "C" },
					{ word: "river" },
					{ chord: "G" },
					{ word: "wait" },
					{ chord: "D" },
					{ word: "ing", joins: true },
					{ chord: "*N.C." },
				],
			},
			{ kind: "lyrics", tokens: [{ chord: "G" }, { chord: "C" }, { chord: "D" }] },
			{
				kind: "lyrics",
				tokens: [{ chord: "*C E F# B" }, { word: "so" }, { chord: "*@B" }, { word: "long" }],
			},
			{ kind: "directive", name: "end_of_verse", value: "" },
			{ kind: "directive", name: "chorus", value: "" },
			{ kind: "blank" },
			{ kind: "directive", name: "start_of_grid", value: 'label="Intro" shape="1+4x4+1"' },
			{
				kind: "grid",
				cells: [
					"@B",
					"|:",
					"C",
					".",
					"G/B",
					".",
					"|",
					"Am7b5",
					"/",
					"%",
					".",
					"|1",
					"N.C.",
					"*Stop",
					"*?",
					"C~G",
					":|",
					"x2",
				],
			},
			{
				kind: "grid",
				cells: ["|2", ".", ".", ".", ".", "||", "F#m7b5", "…", ".", ".", "|"],
			},
			{ kind: "directive", name: "end_of_grid", value: "" },
			{ kind: "directive", name: "comment", value: "repeat ad lib." },
		]);
	});

	test("a chord inside a word joins the piece after it; a chord before a word does not", () => {
		expect(readCho("wait[D]ing [E]now\n")).toEqual([
			{
				kind: "lyrics",
				tokens: [
					{ word: "wait" },
					{ chord: "D" },
					{ word: "ing", joins: true },
					{ chord: "E" },
					{ word: "now" },
				],
			},
		]);
	});

	test("words alone are a lyric line", () => {
		expect(readCho("la la\n")).toEqual([
			{ kind: "lyrics", tokens: [{ word: "la" }, { word: "la" }] },
		]);
	});

	const refused: [string, string][] = [
		["no final newline", "{title: T}"],
		["a carriage return", "{title: T}\r\n"],
		["a tab", "[G]Down\tby\n"],
		["a trailing space", "[G]Down \n"],
		["a leading space", " [G]Down\n"],
		["two spaces between words", "Down  by\n"],
		["a comment line", "# a note\n"],
		["a directive with junk after it", "{title: T} x\n"],
		["a directive name with capitals", "{Title: T}\n"],
		["a directive with no space after its colon", "{title:T}\n"],
		["an empty chord", "[]Down\n"],
		["an unclosed chord", "[G Down\n"],
		["a stray bracket", "Down] by\n"],
		["a brace in a lyric line", "Down {by}\n"],
		["a chord in a grid", "{start_of_grid}\n| [C] . . . |\n{end_of_grid}\n"],
		["a grid never ended", "{start_of_grid}\n| C . . . |\n"],
		["a grid inside a grid", "{start_of_grid}\n{start_of_grid}\n{end_of_grid}\n"],
		["an end with no grid", "{end_of_grid}\n"],
		["a blank line in a grid", "{start_of_grid}\n\n{end_of_grid}\n"],
	];
	for (const [why, text] of refused)
		test(`throws on ${why}`, () => {
			expect(() => readCho(text)).toThrow();
		});
});
