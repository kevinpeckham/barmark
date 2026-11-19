import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exportLyricsheet, type LyricsheetLossCode, type LyricsheetOptions } from "../src/index.js";
import { exported, FIXTURES, fixtureOf, fixtures, golden } from "./fixtures.js";
import { readCho } from "./read-cho.js";
import { readBack } from "./yardstick.js";

function sheet(chart: string, options: LyricsheetOptions = {}) {
	const r = exportLyricsheet(chart, options);
	if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
	readCho(r.text);
	return r;
}
const lines = (chart: string, options?: LyricsheetOptions) =>
	sheet(chart, options).text.split("\n");
const codes = (chart: string, options?: LyricsheetOptions) =>
	sheet(chart, options).losses.map((l) => l.code);
const loss = (chart: string, code: LyricsheetLossCode, options?: LyricsheetOptions) =>
	sheet(chart, options).losses.find((l) => l.code === code);
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
/** A fixture's export, as lines. */
const sheetOf = (cho: string) => exported(fixtureOf(cho)).split("\n");

describe("golden sheets (spec 5.1)", () => {
	const expected = [
		"changes.cho",
		"chorus-recall.cho",
		"marks.cho",
		"parts.cho",
		"parts@Gtr.cho",
		"stacked.cho",
		"untitled.cho",
		"verses.cho",
	];
	for (const cho of expected)
		test(`${cho} exists`, () => {
			expect(existsSync(join(FIXTURES, cho))).toBe(true);
		});
	for (const f of fixtures())
		test(`${f.cho} is the export of ${f.chart}, byte for byte`, () => {
			expect(exported(f)).toBe(golden(f));
		});
});

describe("sections (spec 4.1, 4.6)", () => {
	test("Verse, Chorus and Bridge by the heading's first word, any case; others sung are verses", () => {
		const out = lines(
			"## verse two\n| C |\nlyrics: | a |\n## CHORUS!\n| C |\nlyrics: | b |\n## Bridge\n| C |\nlyrics: | c |\n## Intro\n| C |\nlyrics: | d |\n## Pre-Chorus\n| C |\nlyrics: | e |\n## Verses\n| C |\nlyrics: | f |\n",
		).filter((l) => l.startsWith("{start_of"));
		expect(out).toEqual([
			'{start_of_verse: label="verse two"}',
			'{start_of_chorus: label="CHORUS!"}',
			'{start_of_bridge: label="Bridge"}',
			'{start_of_verse: label="Intro"}',
			'{start_of_verse: label="Pre-Chorus"}',
			'{start_of_verse: label="Verses"}',
		]);
	});

	test("bars before the first heading that sing are a verse with no label", () => {
		expect(lines("| C |\nlyrics: | a |\n")).toEqual([
			"{title: }",
			"{time: 4/4}",
			"",
			"{start_of_verse}",
			"[C]a",
			"{end_of_verse}",
			"",
		]);
	});

	test("a blank line between the header and each section, none at the end", () => {
		const r = sheet("key: C\n## A\n| C |\nlyrics: | a |\n## B\n| G |\nlyrics: | b |\n");
		expect(r.text).toBe(
			[
				"{title: }",
				"{key: C}",
				"{time: 4/4}",
				"",
				'{start_of_verse: label="A"}',
				"[C]a",
				"{end_of_verse}",
				"",
				'{start_of_verse: label="B"}',
				"[G]b",
				"{end_of_verse}",
				"",
			].join("\n"),
		);
	});

	test('a heading with a double quote or a backslash is escaped inside label="…"', () => {
		const out = lines('## Verse "One" \\ Two\n| C |\nlyrics: | a |\n');
		expect(out).toContain('{start_of_verse: label="Verse \\"One\\" \\\\ Two"}');
		expect(readBack(sheet('## Verse "One" \\ Two\n| C |\nlyrics: | a |\n').text)[0]?.label).toBe(
			'Verse "One" \\ Two',
		);
	});

	test("a bar line with no words in a sung section is a chord-only line", () => {
		const out = lines("## Verse\n| G | C |\nlyrics: | a | b |\n| D | G |\n");
		expect(out.slice(3, 7)).toEqual([
			'{start_of_verse: label="Verse"}',
			"[G]a [C]b",
			"[D] [G]",
			"{end_of_verse}",
		]);
	});
});

describe("repeats and replays (spec 4.5)", () => {
	test("a repeat whose passes sing verses 1 and 2 is written twice, in play order", () => {
		const out = sheetOf("verses.cho");
		const verses = out.filter((l) => l === '{start_of_verse: label="Verse 1"}');
		expect(verses.length).toBe(2);
		expect(out).toContain("[G]Down by the [C]river [G]waiting [D]");
		expect(out).toContain("[G]Up on the [C]hillside [G]standing [D]");
	});

	test("a replayed chorus with the same words is {chorus}; with new words it is written out", () => {
		const out = sheetOf("chorus-recall.cho");
		expect(out.filter((l) => l === "{chorus}").length).toBe(1);
		expect(out.filter((l) => l === '{start_of_chorus: label="Chorus"}').length).toBe(3);
		expect(out).toContain("[G]Two rivers [D]fall to[A]gether [D]down");
	});

	test("a replay of a verse is written out, never recalled", () => {
		const out = lines("## Verse\n| C |\nlyrics: | a |\n## Verse\n");
		expect(out.filter((l) => l === '{start_of_verse: label="Verse"}').length).toBe(2);
		expect(out).not.toContain("{chorus}");
	});

	test("a repeat singing the same words again stays in one environment, then {chorus}", () => {
		const out = lines(
			"## Chorus\n| G | D |\nlyrics: | Two | run |\n| A | D | x2\nlyrics: | to | home |\n## Chorus\n",
		);
		expect(out.slice(3)).toEqual([
			'{start_of_chorus: label="Chorus"}',
			"[G]Two [D]run",
			"[A]to [D]home",
			"[A]to [D]home",
			"{end_of_chorus}",
			"",
			"{chorus}",
			"",
		]);
	});

	test("x3 with one row is one environment of three passes", () => {
		const out = lines("## Verse\n| C | G | x3\nlyrics: | la | lo |\n");
		expect(out.slice(3)).toEqual([
			'{start_of_verse: label="Verse"}',
			"[C]la [G]lo",
			"[C]la [G]lo",
			"[C]la [G]lo",
			"{end_of_verse}",
			"",
		]);
	});

	test("an inner repeat of the same words does not split its verse", () => {
		const out = lines(
			"## Verse\n| C |\nlyrics: | a |\n|: G | D :|\nlyrics: | b | c |\n| F |\nlyrics: | d |\n",
		);
		expect(out.filter((l) => l.startsWith("{start_of")).length).toBe(1);
		expect(out).toContain("[F]d");
	});

	test("a verse-changing repeat around an inner same-words repeat: one environment per verse", () => {
		const out = lines(
			"## Verse x2\n| C | G |\nlyrics 1: | a | b |\nlyrics 2: | c | d |\n|: F | E :|\nlyrics: | e | f |\n",
		);
		expect(out.slice(3)).toEqual([
			'{start_of_verse: label="Verse"}',
			"[C]a [G]b",
			"[F]e [E]f",
			"[F]e [E]f",
			"{end_of_verse}",
			"",
			'{start_of_verse: label="Verse"}',
			"[C]c [G]d",
			"[F]e [E]f",
			"[F]e [E]f",
			"{end_of_verse}",
			"",
		]);
	});

	test("a replay heading in another case is recalled, as the parser matches it", () => {
		expect(lines("## Chorus\n| C |\nlyrics: | a |\n## chorus\n")).toContain("{chorus}");
	});

	test("text under a replay heading is written once, outside the environments, where the heading stands", () => {
		const out = lines(
			"## Chorus\n| C |\nlyrics: | a |\n## Verse\n| G |\nlyrics: | b |\n## Chorus\nsoftly now\n## Verse\n",
		);
		expect(out.filter((l) => l === "{comment: softly now}").length).toBe(1);
		const at = out.indexOf("{comment: softly now}");
		expect(out.slice(at - 2, at + 2)).toEqual([
			"{end_of_verse}",
			"",
			"{comment: softly now}",
			"{chorus}",
		]);
	});

	test("a chorus is recalled only when the chorus before it is the one it replays", () => {
		const out = lines(
			"## Chorus\n| C |\nlyrics: | a |\n## Chorus 2\n| G |\nlyrics: | b |\n## Chorus\n",
		);
		expect(out).not.toContain("{chorus}");
	});

	test("stacked verses are one pass per verse, each with its chords, and a loss", () => {
		const out = sheetOf("stacked.cho");
		expect(out.filter((l) => l === '{start_of_verse: label="Verse"}').length).toBe(2);
		expect(out).toContain("[C]The [F]lamp is [Bb]lit [F]a[C]gain");
		expect(out).toContain("[C]The [F]night is [Bb]long [F]and [C]still");
		const r = exportLyricsheet(fixture("stacked.chart.md"));
		expect(r.ok && r.losses.map((l) => l.code)).toContain("stacked-verses");
	});

	test("an open repeat is written once, then {comment: repeat ad lib.}", () => {
		const out = lines("## A\n| C | G | x ...\nlyrics: | la | lo |\n");
		expect(out.slice(3, 7)).toEqual([
			'{start_of_verse: label="A"}',
			"[C]la [G]lo",
			"{comment: repeat ad lib.}",
			"{end_of_verse}",
		]);
	});

	test("a jump that cuts a section closes its environment", () => {
		const text = sheet(fixture("changes.chart.md")).text;
		expect(() => readBack(text)).not.toThrow();
	});
});

describe("slots and symbols in lyric lines (spec 4.3)", () => {
	const out = () => sheetOf("marks.cho").join("\n");
	test("N.C., a stop and ? as annotations", () => {
		expect(out()).toContain("[*Stop]");
		expect(out()).toContain("[*N.C.]");
		expect(out()).toContain("[*?]");
	});
	test("a note set as its notes, a voicing as its chord's name", () => {
		expect(out()).toContain("[*C E F# B]");
		expect(out()).toContain("[Cmaj7]");
		expect(out()).not.toContain("E3");
	});
	test("words at their slot and a rehearsal mark at its bar", () => {
		expect(out()).toContain("[*@A]");
		expect(out()).toContain("[*solo][E]");
		expect(out()).toContain("[*fill]");
	});
	test("a fermata after its bar", () => {
		expect(out()).toContain("[E]so [*…] [A]long");
	});
	test("a fermata before the first bar is written before it, alone", () => {
		expect(lines("| ... | C D |\nlyrics: | wait- / / ing |\n")).toContain("[*…] [C]wait[D]ing");
	});
	test("each loss of the table once", () => {
		const got = codes(fixture("marks.chart.md"));
		const table: LyricsheetLossCode[] = [
			"note-sets",
			"voicing",
			"marks",
			"bar-meter",
			"fermata",
			"chord-names",
		];
		for (const code of table) expect([code, got.includes(code)]).toEqual([code, true]);
		expect(new Set(got).size).toBe(got.length);
	});
	test("a two-chord bar and a stop are no loss: the sheet keeps order, and *Stop says it", () => {
		expect(codes("## A\n| C G | C -- |\nlyrics: | a b | c d |\n")).toEqual([]);
	});
	test("a pickup is not a one-bar meter", () => {
		expect(codes("## A\n| [1/4] G | C |\nlyrics: | a | b |\n")).toEqual([]);
		expect(codes("## A\n| C | [2/4] G |\nlyrics: | a | b |\n")).toEqual(["bar-meter"]);
	});
	test("the fermata's loss says what a reader loses", () => {
		expect(loss("## A\n| C | ... | G |\nlyrics: | a | b |\n", "fermata")?.message).toContain(
			"not a fermata sign",
		);
	});
	test("a repeated N.C. or stop has no attack of its own", () => {
		expect(lines("## A\n| N.C. N.C. | N.C. |\nlyrics: | a b | c |\n")).toContain("[*N.C.]a b c");
	});
	test("a chord the reference's parser rejects is written as spelled, with its loss", () => {
		const l = loss("## A\n| F#m(b6) |\nlyrics: | a |\n", "chord-names");
		expect(lines("## A\n| F#m(b6) |\nlyrics: | a |\n")).toContain("[F#m(b6)]a");
		expect(l?.message).toContain("as text");
		expect(l?.message).toContain('diagrams: "guitar"');
	});
	test("an everyday chord has no loss", () => {
		expect(codes("## A\n| C | G7/D |\nlyrics: | a | b |\n")).toEqual([]);
	});
	test("a chord between two syllables of a word moves, with one loss", () => {
		const r = sheet(
			"## A\n| G D |\nlyrics: | wait- / / ing |\n| G D |\nlyrics: | wait- / / ing |\n",
		);
		expect(r.text).toContain("[G]wait[D]ing");
		expect(r.losses.filter((l) => l.code === "chord-moved").map((l) => l.message)).toEqual([
			expect.stringContaining("2 bars: 1, 2"),
		]);
	});
});

describe("key, time, tempo and feel (spec 4.6)", () => {
	const out = () => sheetOf("changes.cho");
	test("a change mid-chart is written where it happens, in play order, with a comment a reader sees", () => {
		const o = out();
		const at = (l: string) => o.indexOf(l);
		expect(at("{key: D}")).toBeGreaterThan(at("[C]stay"));
		expect(at("{comment: Key: D}")).toBe(at("{key: D}") - 1);
		expect(at("{comment: Time: 3/4}")).toBe(at("{key: D}") + 1);
		expect(at("{time: 3/4}")).toBe(at("{key: D}") + 2);
		expect(at("{comment: Tempo: 120}")).toBe(at("{tempo: 120}") - 1);
		// The header's opening values have no comment.
		expect(o.slice(0, at("")).some((l) => l.startsWith("{comment"))).toBe(false);
		expect(at("{tempo: 120}")).toBeGreaterThan(at("{key: D}"));
		// The D.S. goes back to the segno: C, 4/4 and 100 again.
		expect(o.filter((l) => l === "{key: C}").length).toBe(2);
		expect(o.filter((l) => l === "{tempo: 100}").length).toBe(2);
	});
	test("a rit. and a swing feel are comments", () => {
		expect(out()).toContain("{comment: rit.}");
		expect(out()).toContain("{comment: swing}");
	});
	test("a new tempo that ends a rit. writes no a tempo; a tempo does", () => {
		const base = "## A\ntempo: 100\n| C |\nlyrics: | a |\ntempo: rit.\n| C |\nlyrics: | b |\n";
		const to120 = lines(`${base}tempo: 120\n| C |\nlyrics: | c |\n`);
		expect(to120).toContain("{tempo: 120}");
		expect(to120).not.toContain("{comment: a tempo}");
		expect(lines(`${base}tempo: a tempo\n| C |\nlyrics: | c |\n`)).toContain("{comment: a tempo}");
	});
	test("text lines are comments", () => {
		expect(out()).toContain("{comment: Softly, the second time.}");
	});
});

describe("text ChordPro would read as markup (Review Focus 2)", () => {
	test("brackets and braces in lyrics and text lines become parentheses; a leading # gets a space", () => {
		const o = sheetOf("marks.cho");
		expect(o).toContain("{comment: Play (softly) (here).}");
		expect(o.some((l) => l.includes("(we)"))).toBe(true);
		expect(o.some((l) => l.startsWith(" #2"))).toBe(true);
		const changed = codes(fixture("marks.chart.md")).filter((c) => c === "text-changed");
		expect(changed.length).toBe(1);
	});
	test("the text-changed loss names each changed line's bar", () => {
		const l = loss(fixture("marks.chart.md"), "text-changed");
		expect(l?.message).toEndWith("(3 bars: 1, 5, 9)");
	});
	test("tag-like markup is written with parentheses in lyrics, text lines and labels", () => {
		const out = lines("## V <b>x</b>\n| C |\nlyrics: | <b>la</b> |\nsay <i>it</i>\n");
		expect(out).toContain('{start_of_verse: label="V (b)x(/b)"}');
		expect(out).toContain("[C](b)la(/b)");
		expect(out).toContain("{comment: say (i)it(/i)}");
	});
	test("a < with a > after it is markup to ChordPro, so both are changed; alone they stay", () => {
		expect(lines("## A\n| C |\nlyrics: | a |\na < b -> c\n")).toContain("{comment: a ( b -) c}");
		expect(codes("## A\n| C |\nlyrics: | a |\na < b\n<3\nx>y\n&amp;\n-> next\n")).toEqual([]);
	});
	test("plain text changes nothing", () => {
		expect(codes("## A\n| C |\nlyrics: | (a) |\nNo marks here.\n")).toEqual([]);
	});
});

describe("parts (spec 4.4, Review Focus 5)", () => {
	test("the default part is the first that writes chord symbols; the others are one loss", () => {
		const o = sheetOf("parts.cho");
		expect(o).toContain("[C]Sailing [Am]out past [F]the bay [G]home");
		const r = sheet(fixture("parts.chart.md"));
		expect(r.losses.map((l) => l.code)).toContain("other-parts");
		expect(r.losses.find((l) => l.code === "other-lines")?.message).toContain(
			"only the part's chords and the sung words are written",
		);
	});
	test("with part, that part's harmony and the singer's words", () => {
		const o = sheetOf("parts@Gtr.cho");
		expect(o).toContain("[C]Sailing [Am7]out past [Fmaj7]the bay [G]home");
	});
	test("a part that plays nothing in a section writes N.C. over the singer's words", () => {
		expect(sheetOf("parts@Gtr.cho")).toContain("[*N.C.]ever more");
	});
	test("a chart whose only words are on a melody line sings them", () => {
		const o = lines(
			"part: Vox = Voice, instrument: voice\n## A\nVox     | G | D |\nVox.Mel | {D4}:la {E4}:la | {F#4}:lo |\n",
		);
		expect(o).toContain("[G]la la [D]lo");
	});
	test("a single-part chart has no other-parts loss", () => {
		expect(codes("## A\n| C |\nlyrics: | a |\n")).not.toContain("other-parts");
	});
});

describe("words in some sections and not others (Review Focus 3)", () => {
	const CGab = [{ chord: "C" }, { word: "a" }, { chord: "G" }, { word: "b" }];
	test("only the sung occurrences are lyric environments, balanced", () => {
		const r = sheet(
			"## Intro\n| C | G |\n## Verse\n| C | G |\nlyrics: | a | b |\n## Outro\n| C |\n",
		);
		expect(readBack(r.text)).toEqual([
			{ label: "Intro", bars: [["C"], ["G"]] },
			{ label: "Verse", tokens: CGab },
			{ label: "Outro", bars: [["C"]] },
		]);
	});
	test("a section sung only on its second pass writes that pass, its first a grid", () => {
		const r = sheet("## Verse\n|: C | G :|\nlyrics 2: | a | b |\n");
		expect(readBack(r.text)).toEqual([
			{ label: "Verse", bars: [["C"], ["G"]] },
			{ label: "Verse", tokens: CGab },
		]);
	});
	test("a chart that ends inside a repeat closes its environment", () => {
		const r = sheet("## Verse\n| C | G | x ...\nlyrics: | a | b |\n");
		expect(() => readBack(r.text)).not.toThrow();
	});
});
