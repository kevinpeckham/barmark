import { describe, expect, test } from "bun:test";
import { gridParts, readCho } from "./read-cho.js";

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

/** A chord token: whether a space (or the line's edge) is before it and after it. */
const c = (chord: string, before: boolean, after: boolean) => ({ chord, before, after });

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
					c("G", true, false),
					{ word: "Down" },
					{ word: "by" },
					{ word: "the" },
					c("C", true, false),
					{ word: "river" },
					c("G", true, false),
					{ word: "wait" },
					c("D", false, false),
					{ word: "ing", joins: true },
					c("*N.C.", true, true),
				],
			},
			{ kind: "lyrics", tokens: [c("G", true, true), c("C", true, true), c("D", true, true)] },
			{
				kind: "lyrics",
				tokens: [
					c("*C E F# B", true, false),
					{ word: "so" },
					c("*@B", true, false),
					{ word: "long" },
				],
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
					c("D", false, false),
					{ word: "ing", joins: true },
					c("E", true, false),
					{ word: "now" },
				],
			},
		]);
	});

	test("a chord token tells the spaces on each side apart (spec 4.2)", () => {
		const tokens = (line: string) => {
			const [read] = readCho(`${line}\n`);
			return read?.kind === "lyrics" ? read.tokens : [];
		};
		expect(tokens("the[C] river")).toEqual([
			{ word: "the" },
			c("C", false, true),
			{ word: "river" },
		]);
		expect(tokens("the [C]river")).toEqual([
			{ word: "the" },
			c("C", true, false),
			{ word: "river" },
		]);
		expect(tokens("the [C] river")).toEqual([
			{ word: "the" },
			c("C", true, true),
			{ word: "river" },
		]);
		expect(tokens("[C][G]la")).toEqual([c("C", true, false), c("G", false, false), { word: "la" }]);
		expect(tokens("la [C]")).toEqual([{ word: "la" }, c("C", true, true)]);
	});

	test("a malformed long line is refused quickly", () => {
		const line = `${"[C]la ".repeat(833)}la  x\n`;
		expect(line.length).toBeGreaterThan(5000);
		const start = performance.now();
		expect(() => readCho(line)).toThrow();
		expect(performance.now() - start).toBeLessThan(100);
		const bracket = `${"a[b".repeat(1700)}\n`;
		const again = performance.now();
		expect(() => readCho(bracket)).toThrow();
		expect(performance.now() - again).toBeLessThan(100);
	});

	test("an empty value is read as empty", () => {
		expect(readCho("{title: }\n")).toEqual([{ kind: "directive", name: "title", value: "" }]);
	});

	test("a space may lead a lyric line only before a `#`, which would start a comment", () => {
		expect(readCho(" #2 [G]so\n")).toEqual([
			{ kind: "lyrics", tokens: [{ word: "#2" }, c("G", true, false), { word: "so" }] },
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
		["a lyric line ending in a backslash", "[C]la\\\nnext\n"],
		["a grid line ending in a backslash", "{start_of_grid}\n| C . . . | a\\\n{end_of_grid}\n"],
	];
	for (const [why, text] of refused)
		test(`throws on ${why}`, () => {
			expect(() => readCho(text)).toThrow();
		});
});

describe("gridParts: a grid line's margins and measures", () => {
	const cells = (line: string) => line.split(" ");
	test("left margin, measures with the bar symbols around them, right margin", () => {
		expect(gridParts(cells("@B |: C . G/B . | % . . . :| solo x3"))).toEqual({
			left: "@B",
			measures: [
				{ cells: ["C", ".", "G/B", "."], before: "|:", after: "|" },
				{ cells: ["%", ".", ".", "."], before: "|", after: ":|" },
			],
			right: "solo x3",
		});
	});
	test("a volta, shared cells, annotations and a fermata measure", () => {
		expect(gridParts(cells("|1 N.C. *Stop *? .~G | C~D~E *C,E,G | *… |"))).toEqual({
			left: "",
			measures: [
				{ cells: ["N.C.", "*Stop", "*?", ".~G"], before: "|1", after: "|" },
				{ cells: ["C~D~E", "*C,E,G"], before: "|", after: "|" },
				{ cells: ["*…"], before: "|", after: "|" },
			],
			right: "",
		});
	});
	const refused: [string, string][] = [
		["no bar symbol", "C . . ."],
		["one bar symbol", "| C . . ."],
		["an empty measure", "| C | | D |"],
		["a % that is not first", "| C % |"],
		["a / inside a shared cell", "| C~/ |"],
		["a cell that is no chord", "| x . |"],
	];
	for (const [why, line] of refused)
		test(`throws on ${why}`, () => {
			expect(() => gridParts(cells(line))).toThrow();
		});
});
