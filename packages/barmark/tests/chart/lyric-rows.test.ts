import { describe, expect, test } from "bun:test";
import { readLyricRow } from "../../src/chart/lyricRows.js";
import { parseChart } from "../../src/chart/parse.js";
import { printChart, printPart } from "../../src/chart/print.js";

const TWO = "part: G = Guitar\npart: P = Piano\n";
const errors = (chart: string) =>
	parseChart(chart).diagnostics.filter((d) => d.severity === "error");
const rowAt = (chart: string, line: number) => parseChart(chart).lines.find((l) => l.line === line);

describe("lyric rows (grammar 7.7)", () => {
	test("a lyric row divides its bars like a chord row", () => {
		const p = parseChart(
			"| Am7 | D9 |\nlyrics: | I_got roll-_in' on_the / | beat_and -- I_keep it_up |\n",
		);
		expect(p.diagnostics).toEqual([]);
		expect(p.lines[1]).toMatchObject({
			kind: "lyrics",
			verse: null,
			cells: [
				[{ kind: "group" }, { kind: "group" }, { kind: "group" }, { kind: "hold" }],
				expect.any(Array),
			],
			covers: [1],
		});
	});
	test("each token is a syllable, a hold, a breath or a group", () => {
		const { row, diagnostics } = readLyricRow("lyrics: | roll-_in' / -- the~end |", 4);
		expect(diagnostics).toEqual([]);
		expect(row).toEqual({
			kind: "lyrics",
			line: 4,
			verse: null,
			covers: [],
			cells: [
				[
					{
						kind: "group",
						members: [
							{ kind: "syllable", syllable: { kind: "sung", parts: ["roll"], continues: true } },
							{ kind: "syllable", syllable: { kind: "sung", parts: ["in'"], continues: false } },
						],
					},
					{ kind: "hold" },
					{ kind: "breath" },
					{ kind: "syllable", syllable: { kind: "sung", parts: ["the", "end"], continues: false } },
				],
			],
		});
	});
	test("lyrics 2: is verse 2", () => {
		expect(rowAt("| C |\nlyrics 2: | la |\n", 2)).toMatchObject({ kind: "lyrics", verse: 2 });
		expect(rowAt("| C |\nLYRICS 3: | la |\n", 2)).toMatchObject({ kind: "lyrics", verse: 3 });
	});
	test("verse 0 is an error", () => {
		expect(errors("| C |\nlyrics 0: | la |\n")).toMatchObject([
			{ line: 2, message: "a verse is numbered from 1" },
		]);
	});
	test("several rows may follow one bar line", () => {
		const p = parseChart("| C | D |\nlyrics 1: | a | b |\nlyrics 2: | c | d |\n");
		expect(p.diagnostics).toEqual([]);
		expect(p.lines.slice(1)).toMatchObject([{ covers: [1] }, { covers: [1] }]);
	});
	test("a row with a different bar count from the line above is an error", () => {
		expect(errors("| C | D |\nlyrics: | la |\n")).toMatchObject([
			{
				line: 2,
				severity: "error",
				message: "this lyric row has 1 bar; the bar line it covers has 2 (line 1)",
			},
		]);
	});
	test("a fermata or a mark is not a bar, so the row has no cell for it", () => {
		const p = parseChart("| C | ... | @A | D |\nlyrics: | a | b |\n");
		expect(p.diagnostics).toEqual([]);
	});
	test("a row covers a labelled system, and ends it", () => {
		const chart = `${TWO}G | C | D |\nP | Em | F |\nlyrics: | la | la |\nG | E | A |\n`;
		const p = parseChart(chart);
		expect(p.diagnostics).toEqual([]);
		expect(rowAt(chart, 5)).toMatchObject({ kind: "lyrics", covers: [3, 4] });
		expect(rowAt(chart, 6)).toMatchObject({ system: 1 });
	});
	test("a row under a system checks the system's bar count", () => {
		expect(errors(`${TWO}G | C | D |\nP | Em | F |\nlyrics: | la |\n`)).toMatchObject([
			{ line: 5, message: "this lyric row has 1 bar; the bar line it covers has 2 (line 3)" },
		]);
	});
	test("under a replay heading, rows cover the section's written lines in order", () => {
		const chart = "## V\n| C | D |\n| E |\n## V\nlyrics: | a | b |\nlyrics: | c |\n";
		expect(parseChart(chart).diagnostics).toEqual([]);
		expect(rowAt(chart, 5)).toMatchObject({ covers: [2] });
		expect(rowAt(chart, 6)).toMatchObject({ covers: [3] });
	});
	test("under a replay heading, each verse's rows start again at the first line", () => {
		const chart = "## V\n| C | D |\n| E |\n## V\nlyrics 1: | a | b |\nlyrics 2: | c | d |\n";
		expect(parseChart(chart).diagnostics).toEqual([]);
		expect(rowAt(chart, 6)).toMatchObject({ covers: [2] });
	});
	test("under a replay heading, a row covers a system", () => {
		const chart = `${TWO}## V\nG | C | D |\nP | Em | F |\n## V\nlyrics: | a | b |\n`;
		expect(parseChart(chart).diagnostics).toEqual([]);
		expect(rowAt(chart, 7)).toMatchObject({ covers: [4, 5] });
	});
	test("a replay's row with the wrong bar count for its line is an error", () => {
		const chart = "## V\n| C | D |\n| E |\n## V\nlyrics: | a | b |\nlyrics: | c | d |\n";
		expect(errors(chart)).toMatchObject([
			{ line: 6, message: "this lyric row has 2 bars; the bar line it covers has 1 (line 3)" },
		]);
	});
	test("a replay's row with no line left to cover is an error", () => {
		const chart = "## V\n| C |\n## V\nlyrics: | a |\nlyrics: | b |\n";
		expect(errors(chart)).toMatchObject([
			{ line: 5, message: "V has 1 bar line to cover; this lyric row is one too many" },
		]);
	});
	test("Fine, x2 and @A in a lyric row are syllables", () => {
		const p = parseChart("| C | D |\nlyrics: | Fine x2 | @A % |\n");
		expect(p.diagnostics).toEqual([]);
		expect(p.lines[1]).toMatchObject({
			cells: [
				[{ syllable: { parts: ["Fine"] } }, { syllable: { parts: ["x2"] } }],
				[{ syllable: { parts: ["@A"] } }, { syllable: { parts: ["%"] } }],
			],
		});
		expect(p.bars).toHaveLength(2);
	});
	test("an empty bar, an empty member or a malformed syllable is an error", () => {
		expect(errors("| C | D |\nlyrics: | | a |\n")[0]).toMatchObject({ line: 2 });
		expect(errors("| C |\nlyrics: | a__b |\n")[0]).toMatchObject({ line: 2, token: "a__b" });
		expect(errors("| C |\nlyrics: | /- |\n")[0]).toMatchObject({ line: 2, token: "/-" });
		expect(errors("| C |\nlyrics: | a~ |\n")[0]).toMatchObject({ line: 2, token: "a~" });
	});
	test("a quote or a brace in a lyric row is an error", () => {
		expect(errors('| C |\nlyrics: | "a" |\n')[0]).toMatchObject({ line: 2, token: '"a"' });
		expect(errors("| C |\nlyrics: | {C4} |\n")[0]).toMatchObject({ line: 2, token: "{C4}" });
	});
	test("a row without its trailing | warns", () => {
		expect(parseChart("| C |\nlyrics: | la\n").diagnostics).toMatchObject([
			{ line: 2, severity: "warning", message: "missing trailing |" },
		]);
	});
	test("lyrics: followed by text is still the lyricist near miss", () => {
		expect(parseChart("lyrics: Kevin\n| C |\n").diagnostics[0]).toMatchObject({
			severity: "warning",
			suggestion: "lyricist: Kevin",
		});
	});
	test("an escaped lyric row is text, and no near miss", () => {
		expect(parseChart("| C |\n\\lyrics: | la |\n").diagnostics).toEqual([]);
	});
	test("a lyric row with no bar line above it is an error", () => {
		const message = "a lyric row goes under a bar line, or under a replay heading";
		expect(errors("lyrics: | la |\n| C |\n")).toMatchObject([{ line: 1, message }]);
		expect(errors("| C |\nWatch Kevin\nlyrics: | la |\n")).toMatchObject([{ line: 3, message }]);
		expect(errors("| C |\n## B\nlyrics: | la |\n| D |\n")).toMatchObject([{ line: 3, message }]);
	});
	test("a lyric row is not a bar line: a section of only rows replays", () => {
		const p = parseChart("## V\n| C | D |\n## V\nlyrics: | a | b |\n");
		expect(p.bars).toHaveLength(4);
		expect(p.sections.map((s) => s.replayOf)).toEqual([null, 1]);
	});
});

describe("printing lyric rows (grammar 7.7, section 8)", () => {
	test("lyric rows print aligned under their bars", () => {
		const chart = "| Am7       | D9 |\nlyrics: | I_got / | la |\n";
		expect(printChart(chart)).toBe("        | Am7     | D9 |\nlyrics: | I_got / | la |\n");
		expect(printChart(printChart(chart))).toBe(printChart(chart));
	});
	test("a long syllable cell widens the bar line's column", () => {
		expect(printChart("| C | D |\nlyrics: | sun-_shine | a |\n")).toBe(
			"        | C          | D |\nlyrics: | sun-_shine | a |\n",
		);
	});
	test("rows of several verses pad to the widest label", () => {
		expect(printChart("| C | D |\nlyrics 1: | a | b |\nlyrics 12: | c | d |\n")).toBe(
			"           | C | D |\nlyrics 1:  | a | b |\nlyrics 12: | c | d |\n",
		);
	});
	test("a row's cell spans the cells that are not bars", () => {
		expect(printChart("| C | ... | D |\nlyrics: | a | b |\n")).toBe(
			"        | C | ... | D |\nlyrics: | a       | b |\n",
		);
	});
	test("a row aligns with its system's columns", () => {
		expect(printChart(`${TWO}P | Em | F |\nG | C | D |\nlyrics: | la-_la | o |\n`)).toBe(
			`${TWO}G       | C      | D |\nP       | Em     | F |\nlyrics: | la-_la | o |\n`,
		);
	});
	test("a row under a replay heading prints with single spaces", () => {
		const chart = "## V\n| C | D |\n\n## V\nlyrics:   |  a   |   b |\n";
		expect(printChart(chart)).toBe("## V\n| C | D |\n\n## V\nlyrics: | a | b |\n");
	});
	test("a row is never reduced: its holds place the syllables", () => {
		expect(printChart("| C |\nlyrics: | la / / / |\n")).toBe(
			"        | C        |\nlyrics: | la / / / |\n",
		);
	});
	test("a row with an error prints as written, and its bar line unpadded", () => {
		expect(printChart("| C  | D |\nlyrics:  | la |\n")).toBe("| C | D |\nlyrics:  | la |\n");
	});
	test("printing is stable", () => {
		for (const chart of [
			"| Am7 | D9 |\nlyrics: | I_got roll-_in' on_the / | beat_and -- I_keep it_up |\n",
			`${TWO}G | C | D |\nP | Em | F |\nlyrics 1: | la-_la | o |\nlyrics 2: | a | b |\n`,
			"## V\n| C | D |\n| E |\n## V\nlyrics: | a | b |\nlyrics: | c |\n",
		]) {
			const once = printChart(chart);
			expect(printChart(once)).toBe(once);
			expect(parseChart(once).diagnostics).toEqual(parseChart(chart).diagnostics);
		}
	});
	test("an extracted part keeps the rows under its bars", () => {
		const chart = `${TWO}G | C | D |\nP | Em | F |\nlyrics: | la | o |\n`;
		expect(printPart(chart, "G")).toBe(
			"part: G = Guitar\n        | C  | D |\nlyrics: | la | o |\n",
		);
	});
});

describe("lyric rows and breaks between endings (review fixes)", () => {
	const written = (chart: string) => parseChart(chart).bars.map((b) => b.written);
	test("a lyric row under each ending keeps the repeat", () => {
		const chart = "|: C | D |\n|1 G | G7 :|\nlyrics: | c | d |\n|2 C | C |\nlyrics: | e | f |\n";
		expect(parseChart(chart).diagnostics).toEqual([]);
		expect(written(chart)).toEqual([1, 2, 3, 4, 1, 2, 5, 6]);
	});
	test("--- between endings keeps the repeat", () => {
		const chart = "|: C | D |\n|1 G | G7 :|\n---\n|2 C | C |\n";
		expect(parseChart(chart).diagnostics).toEqual([]);
		expect(written(chart)).toEqual([1, 2, 3, 4, 1, 2, 5, 6]);
	});
	test("a verse number past the largest safe integer is an error", () => {
		expect(errors("| C |\nlyrics 99999999999999999999999: | la |\n")).toMatchObject([
			{ line: 2, message: "a verse number goes up to 9007199254740991" },
		]);
	});
});
