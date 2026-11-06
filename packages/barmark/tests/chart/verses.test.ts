import { describe, expect, test } from "bun:test";
import { extractPart, parseChart } from "../../src/chart/parse.js";
import { printPart } from "../../src/chart/print.js";
import { transposeChart } from "../../src/chart/transpose.js";
import type { PlayedBar } from "../../src/chart/types.js";

/**
 * Amazing Grace from the spec's section 1. Its chords are on a named first
 * line (`Vox.Ch`): grammar 7.6 doesn't let a bare `Vox` line share a system
 * with `Vox.Mel`.
 */
const AMAZING_GRACE = `# Amazing Grace
part: Vox = Voice, instrument: voice
key: G, time: 3/4

## Verse
Vox.Ch    | [1/4] N.C.    | G                           | G          / G7       | C            / /      | G              |
Vox.Mel   | [1/4] {D4}:A- | {G4}:maz- / {B4}:ing_{G4}:/ | {B4}:grace / {A4}:how | {G4}:sweet / {E4}:the | {D4}:sound / / |
lyrics 2: | 'Twas         | grace / that                | taught / my           | heart / to            | fear / /       |
`;
const VOICE = "part: V = Voice, instrument: voice\n";

/** Each bar's verses, as `verse: syllables` with each syllable's text (held as `/`). */
const sung = (bars: PlayedBar[]) =>
	bars.map((b) =>
		(b.lyrics ?? []).map(
			(v) =>
				`${v.verse}: ${v.syllables.map((s) => (s.syllable.kind === "held" ? "/" : s.syllable.parts.join("~"))).join(" ")}`,
		),
	);
const errors = (chart: string) =>
	parseChart(chart).diagnostics.filter((d) => d.severity === "error");
const warnings = (chart: string) =>
	parseChart(chart).diagnostics.filter((d) => d.severity === "warning");

describe("verses in play order (spec sections 3 and 4)", () => {
	test("syllables on notes are verse 1, at their notes' onsets", () => {
		const p = parseChart(AMAZING_GRACE);
		expect(p.diagnostics).toEqual([]);
		expect(p.parts[0]?.sings).toBe("Mel");
		expect(p.bars[1]?.lyrics?.[0]).toEqual({
			verse: 1,
			part: "Vox",
			syllables: [
				{ at: 0, syllable: { kind: "sung", parts: ["maz"], continues: true }, note: true },
				{ at: 1 / 2, syllable: { kind: "sung", parts: ["ing"], continues: false }, note: true },
				{ at: 5 / 8, syllable: { kind: "held" }, note: true },
			],
		});
	});
	test("a lyric row's syllables sit on the beats, each on the note starting there", () => {
		expect(parseChart(AMAZING_GRACE).bars[1]?.lyrics?.[1]).toEqual({
			verse: 2,
			part: "Vox",
			syllables: [
				{ at: 0, syllable: { kind: "sung", parts: ["grace"], continues: false }, note: true },
				{ at: 1 / 2, syllable: { kind: "sung", parts: ["that"], continues: false }, note: true },
			],
		});
	});
	test("stacked verses outside a repeat don't change the play order", () => {
		const p = parseChart(AMAZING_GRACE);
		expect(p.bars).toHaveLength(5);
		expect(sung(p.bars)).toEqual([
			["1: A", "2: 'Twas"],
			["1: maz ing /", "2: grace that"],
			["1: grace how", "2: taught my"],
			["1: sweet the", "2: heart to"],
			["1: sound", "2: fear"],
		]);
	});
	test("inside a repeat, verse N is sung on pass N", () => {
		const rows = "lyrics 1: | a | b |\nlyrics 2: | c | d |\n";
		const each = [["1: a"], ["1: b"], ["2: c"], ["2: d"]];
		expect(sung(parseChart(`|: C | D :|\n${rows}`).bars)).toEqual(each);
		expect(sung(parseChart(`| C | D | x2\n${rows}`).bars)).toEqual(each);
		expect(sung(parseChart(`## A x2\n| C | D |\n${rows}`).bars)).toEqual(each);
	});
	test("inside a repeat, syllables on notes are verse 1 and a row verse 2", () => {
		const chart = `${VOICE}V |: {C4}:a | {D4}:b :|\nlyrics 2: | c | d |\n`;
		expect(sung(parseChart(chart).bars)).toEqual([["1: a"], ["1: b"], ["2: c"], ["2: d"]]);
	});
	test("a repeat with one verse sings it on every pass", () => {
		expect(sung(parseChart("|: C | D :|\nlyrics: | a | b |\n").bars)).toEqual([
			["1: a"],
			["1: b"],
			["1: a"],
			["1: b"],
		]);
	});
	test("a second ending carries only verse 2", () => {
		const chart =
			"|: C | D |\nlyrics 1: | a | b |\nlyrics 2: | c | d |\n|1 E :|\nlyrics 1: | e |\n|2 F |\nlyrics 2: | f |\n";
		const p = parseChart(chart);
		expect(p.diagnostics).toEqual([]);
		expect(sung(p.bars)).toEqual([["1: a"], ["1: b"], ["1: e"], ["2: c"], ["2: d"], ["2: f"]]);
	});
	test("a jump's pass back is not a pass", () => {
		const chart =
			"|: C | D | Fine :|\nlyrics 1: | a | b |\nlyrics 2: | c | d |\n| E | D.C. al Fine |\n";
		const p = parseChart(chart);
		expect(p.diagnostics).toEqual([]);
		expect(sung(p.bars)).toEqual([["1: a"], ["1: b"], ["2: c"], ["2: d"], [], ["1: a"], ["1: b"]]);
	});
	test("a replay with a lyric row sings its new words; without one, the words it was written with", () => {
		const chart =
			"## Verse\n| C | D |\nlyrics: | a | b |\n## Chorus\n| E |\nlyrics: | e |\n## Verse\nlyrics: | x | y |\n## Verse\n";
		const p = parseChart(chart);
		expect(p.diagnostics).toEqual([]);
		expect(sung(p.bars)).toEqual([
			["1: a"],
			["1: b"],
			["1: e"],
			["1: x"],
			["1: y"],
			["1: a"],
			["1: b"],
		]);
	});
	test("a replay's lyric row replaces the words on the notes", () => {
		const chart = `${AMAZING_GRACE}\n## Verse\nlyrics: | Through | man- / y | dan- / gers | toils / and | snares / / |\n`;
		const p = parseChart(chart);
		expect(p.diagnostics).toEqual([]);
		expect(sung(p.bars.slice(5))).toEqual([
			["1: Through"],
			["1: man y"],
			["1: dan gers"],
			["1: toils and"],
			["1: snares"],
		]);
	});
	test("lyrics 1: over notes that carry syllables is an error", () => {
		const chart = AMAZING_GRACE.replace("lyrics 2:", "lyrics 1:");
		expect(errors(chart)).toMatchObject([
			{
				line: 8,
				message:
					"the notes above sing verse 1 on their syllables, so a lyric row under them is verse 2 or later (lyrics 2:)",
			},
		]);
		expect(sung(parseChart(chart).bars)[0]).toEqual(["1: A"]);
	});
	test("an unnumbered row mixed with numbered rows over the same bars is an error", () => {
		const chart = "| C | D |\nlyrics: | a | b |\nlyrics 2: | c | d |\n";
		expect(errors(chart)).toMatchObject([
			{
				line: 2,
				message:
					"an unnumbered lyric row among numbered ones over the same bars; number every verse (lyrics 1:, lyrics 2:)",
			},
		]);
	});
	test("syllables on notes and an unnumbered row over the same bars is an error", () => {
		expect(errors(AMAZING_GRACE.replace("lyrics 2:", "lyrics: "))).toMatchObject([
			{ line: 8, severity: "error" },
		]);
	});
	test("a verse written twice over the same bars is an error", () => {
		expect(errors("| C |\nlyrics 2: | a |\nlyrics 2: | b |\n")).toMatchObject([
			{ line: 3, message: "verse 2 is already written over these bars (line 2)" },
		]);
		expect(errors("| C |\nlyrics: | a |\nlyrics: | b |\n")).toMatchObject([
			{ line: 3, message: "these bars already have their words (line 2); number each verse" },
		]);
	});
	test("a syllable where the singing line starts no note warns", () => {
		const chart = `${VOICE}V | {C4} / {D4} / |\nlyrics: | a b c d |\n`;
		expect(warnings(chart)).toMatchObject([
			{ line: 3, message: '"b" falls where the voice starts no note', token: "b" },
		]);
		const notes = parseChart(chart).bars[0]?.lyrics?.[0]?.syllables.map((s) => s.note);
		expect(notes).toEqual([true, false, true, false]);
	});
	test(":/ with no syllable sung before it warns", () => {
		expect(warnings(`${VOICE}V | {C4}:/ {D4}:la |\n`)).toMatchObject([
			{
				line: 2,
				message: ":/ holds the syllable before it, and none is sung before it",
				token: ":/",
			},
		]);
		expect(warnings(`${VOICE}V | {C4}:la | {D4}:/ |\n`)).toEqual([]);
	});
	test("the lyrics belong to the first voice part, else the first part with syllables", () => {
		const voices =
			"part: G = Guitar\npart: A = Alto, instrument: voice\npart: B = Bari, instrument: voice\nG | C |\nA | {E4}:la |\nB | {C3}:lo |\n";
		const p = parseChart(voices);
		expect(p.bars[0]?.lyrics).toEqual([
			{
				verse: 1,
				part: "A",
				syllables: [
					{ at: 0, syllable: { kind: "sung", parts: ["la"], continues: false }, note: true },
				],
			},
		]);
		expect(p.parts.map((x) => x.sings)).toEqual([undefined, "", undefined]);
		const syllables = "part: G = Guitar\npart: S = Singer\nG | C |\nS | {E4}:la |\n";
		expect(parseChart(syllables).bars[0]?.lyrics?.[0]?.part).toBe("S");
	});
	test("a chart with no voice part keeps a lyric row's words, with no part", () => {
		const chart =
			"part: G = Guitar\npart: P = Piano\nG | C | D |\nP | Em | F |\nlyrics: | la | o |\n";
		expect(parseChart(chart).bars[0]?.lyrics).toEqual([
			{
				verse: 1,
				syllables: [
					{ at: 0, syllable: { kind: "sung", parts: ["la"], continues: false }, note: false },
				],
			},
		]);
		const rap = parseChart(
			"| Am7 | D9 |\nlyrics: | I_got roll-_in' on_the / | beat_and -- I_keep it_up |\n",
		);
		expect(rap.diagnostics).toEqual([]);
		expect(rap.bars[1]?.lyrics?.[0]?.syllables.map((s) => s.at)).toEqual([
			0,
			1 / 8,
			1 / 2,
			5 / 8,
			3 / 4,
			7 / 8,
		]);
	});
	test("a pickup cell and a % bar under a lyric row", () => {
		const chart = `${VOICE}time: 3/4\nV | [1/4] {D4} | {G4} / {B4} | % |\nlyrics: | A- | maz- / ing | grace / how |\n`;
		const p = parseChart(chart);
		expect(p.diagnostics).toEqual([]);
		expect(p.bars[0]?.lyrics?.[0]?.syllables).toEqual([
			{ at: 0, syllable: { kind: "sung", parts: ["A"], continues: true }, note: true },
		]);
		expect(sung(p.bars)).toEqual([["1: A"], ["1: maz ing"], ["1: grace how"]]);
		const copied = `${VOICE}V | {G4}:la | % |\nlyrics 2: | a | b |\n`;
		expect(sung(parseChart(copied).bars)).toEqual([["1: la", "2: a"], ["2: b"]]);
	});
	test("transposing keeps every syllable and lyric row", () => {
		const { text, diagnostics } = transposeChart(AMAZING_GRACE, { to: "A" });
		expect(diagnostics).toEqual([]);
		expect(text).toContain("{A4}:maz-");
		expect(text).toContain("{C#5}:ing_{A4}:/");
		expect(text).toContain("lyrics 2: | 'Twas");
		expect(sung(parseChart(text).bars)).toEqual(sung(parseChart(AMAZING_GRACE).bars));
	});
	test("extracting the voice part keeps its lines, syllables and lyric rows; another part's extract has none", () => {
		const chart =
			"part: Vox = Voice, instrument: voice\npart: Gtr = Guitar\nVox.Ch  | G | C |\nVox.Mel | {G4}:la | {E4}:lo |\nGtr     | G | C |\nlyrics 2: | a | b |\n";
		const p = parseChart(chart);
		expect(p.diagnostics).toEqual([]);
		expect(sung(p.bars)).toEqual([
			["1: la", "2: a"],
			["1: lo", "2: b"],
		]);
		const vox = extractPart(chart, "Vox");
		expect(vox?.parts[0]?.sings).toBe("Mel");
		expect(vox?.lines.some((l) => l.kind === "lyrics")).toBe(true);
		expect(sung(vox?.bars ?? [])).toEqual(sung(p.bars));
		expect(sung(extractPart(chart, "Vox", "Mel")?.bars ?? [])).toEqual(sung(p.bars));
		const gtr = extractPart(chart, "Gtr");
		expect(gtr?.lines.some((l) => l.kind === "lyrics")).toBe(false);
		expect(gtr?.bars.some((b) => b.lyrics)).toBe(false);
		expect(printPart(chart, "Gtr")).not.toContain("lyrics");
	});
});
