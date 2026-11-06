import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { layoutChart, renderChartUnwrapped } from "../src/index.js";
import type { BlockItem, RowItem } from "../src/types.js";
import { AMAZING_GRACE } from "./fixtures.js";

/** Grammar 7.7's spoken example: a lyric row over chords, on no melody. */
const SPOKEN = `| Am7 | D9 |
lyrics: | I_got roll-_in' on_the / | beat_and -- I_keep it_up |
`;
const VOICE = "part: V = Voice, instrument: voice\n";

const doc = (text: string) => parseHTML(`<body>${renderChartUnwrapped(text)}</body>`).document;
const texts = (root: ParentNode | null | undefined, selector: string) =>
	[...(root?.querySelectorAll(selector) ?? [])].map((e) => e.textContent ?? "");
/** A lyric row's lines on no melody, verse `n`'s in each bar it covers, in order. */
const beatLines = (text: string, n = 1) => [
	...doc(text).querySelectorAll(`.bm-bar > .bm-bar-stack > .bm-beats[data-verse="${n}"]`),
];
/** A singing row's syllables, verse by verse: each verse's under its slots, in order. */
const sungRows = (row: Element | undefined, verses: number) =>
	Array.from({ length: verses }, (_, v) =>
		texts(row, `.bm-under[data-verse="${v + 1}"] .bm-syllable`),
	);
const singing = (text: string) => [...doc(text).querySelectorAll(".bm-sings")];
/** A lyric row's bar: each position's text, in order. */
const positions = (bar: Element | undefined) =>
	texts(bar, ".bm-syllable-slot").map((t) => t.trim());

const systemOf = (text: string) =>
	layoutChart(text).blocks[0]?.items.find(
		(i): i is Extract<BlockItem, { kind: "system" }> => i.kind === "system",
	);

describe("voice lines and lyrics (spec section 5)", () => {
	test("a voice line draws its pitch names and, under them, its syllables at their slots", () => {
		const mel = systemOf(AMAZING_GRACE)?.rows[1]?.row as RowItem;
		expect(mel.sings).toBe(true);
		// Bar 2: maz- on G, a tie, then ing on B and :/ holding it over G.
		expect(mel.verses?.[0]?.verse).toBe(1);
		expect(mel.verses?.[0]?.cells[1]).toEqual([
			[{ kind: "sung", parts: ["maz"], continues: true }],
			[],
			[{ kind: "sung", parts: ["ing"], continues: false }],
			[{ kind: "held" }],
		]);
		const d = doc(AMAZING_GRACE);
		const melRow = [...d.querySelectorAll(".bm-part-row")][1];
		const bar2 = melRow?.querySelectorAll(".bm-bar")[1];
		expect(texts(bar2, ".bm-pitch")).toEqual(["G", "B", "G"]);
		expect(bar2?.querySelector(".bm-ring")).toBeNull();
		expect(texts(bar2, '.bm-under[data-verse="1"] .bm-syllable')).toEqual(["maz –", "ing"]);
		expect(bar2?.querySelectorAll('.bm-under[data-verse="1"] .bm-extender')).toHaveLength(1);
		// Each syllable is under its own note: a column per slot, a group's per member.
		const columns = [...(bar2?.querySelectorAll(".bm-sung") ?? [])];
		expect(columns.map((c) => texts(c, ".bm-pitch, .bm-hold, .bm-syllable"))).toEqual([
			["G", "maz –", "grace"],
			["/"],
			["B", "ing", "that"],
			["G"],
		]);
	});
	test("a stacked verse draws as a second syllable row, numbered", () => {
		const mel = singing(AMAZING_GRACE)[0];
		expect(sungRows(mel, 2)).toEqual([
			["A –", "maz –", "ing", "grace", "how", "sweet", "the", "sound"],
			["'Twas", "grace", "that", "taught", "my", "heart", "to", "fear"],
		]);
		// Numbered once, at the first bar.
		expect(texts(mel, ".bm-verse")).toEqual(["1.", "2."]);
		expect(mel?.querySelectorAll(".bm-bar")[0]?.querySelectorAll(".bm-verse")).toHaveLength(2);
		// One verse needs no number.
		const one = singing(`${VOICE}| {C4}:la {D4}:di |\n`)[0];
		expect(sungRows(one, 1)).toEqual([["la", "di"]]);
		expect(one?.querySelector(".bm-verse")).toBeNull();
	});
	test("a lyric row with no melody draws its syllables spaced by beat", () => {
		const items = layoutChart(SPOKEN).blocks[0]?.items ?? [];
		expect(items.map((i) => i.kind)).toEqual(["row"]);
		expect((items[0] as RowItem).lyrics?.map((v) => v.verse)).toEqual([1]);
		// Each bar's words are drawn in the bar they cover, so they wrap with it.
		expect(beatLines(SPOKEN).map(positions)).toEqual([
			["I", "got", "roll –", "in'", "on", "the", "", ""],
			["beat", "and", "", "", "I", "keep", "it", "up"],
		]);
	});
	test("verses sung on a repeat's passes both draw under its written bars", () => {
		const row = singing(`${VOICE}V |: {C4}:a | {D4}:b :|\nlyrics 2: | c | d |\n`)[0];
		expect(sungRows(row, 2)).toEqual([
			["a", "b"],
			["c", "d"],
		]);
	});
	test("a replay draws its own words under the bars it replays", () => {
		const chart = "## A\n| C | D |\nlyrics: | a | b |\n\n## A\nlyrics: | c | d |\n";
		const sections = [...doc(chart).querySelectorAll(".bm-section")];
		expect(sections.map((s) => texts(s, ".bm-syllable-slot"))).toEqual([
			["a", "b"],
			["c", "d"],
		]);
	});
	test("each part of a choir sings under its own line", () => {
		const choir =
			"part: S = Soprano, instrument: voice\npart: A = Alto, instrument: voice\nS | {C5}:a | {D5}:b |\nA | {C4}:c | {D4}:d |\n";
		const rows = [...doc(choir).querySelectorAll(".bm-system > div")];
		expect(rows.map((r) => r.className)).toEqual([
			"bm-row bm-part-row bm-sings",
			"bm-row bm-part-row bm-sings",
		]);
		expect(sungRows(rows[0], 1)).toEqual([["a", "b"]]);
		expect(sungRows(rows[1], 1)).toEqual([["c", "d"]]);
	});
	test("syllables are text, never markup", () => {
		const html = renderChartUnwrapped(`${VOICE}| {C4}:<b> |\n`);
		expect(html).toContain("&lt;b&gt;");
		expect(html).not.toContain("<b>");
		const row = renderChartUnwrapped("| C |\nlyrics: | <i>&amp; |\n");
		expect(row).toContain("&lt;i&gt;&amp;amp;");
		expect(row).not.toContain("<i>");
	});
	test("a screen reader hears each bar's words", () => {
		const melRow = [...doc(AMAZING_GRACE).querySelectorAll(".bm-part-row")][1];
		const bar2 = melRow?.querySelectorAll(".bm-bar")[1]?.querySelector(".bm-sr")?.textContent;
		expect(bar2).toContain("verse 1 “maz-ing”, verse 2 “grace that”");
		const one = doc(`${VOICE}| {C4}:the~end {D4}:ma- | {E4}:ny |\n`);
		expect(texts(one, ".bm-bar > .bm-sr")).toEqual([
			"bar 1: note C four, note D four, sung “the end ma-”",
			"bar 2: note E four, sung “ny”",
		]);
		// A lyric row's words are spoken with the bar they cover; what is drawn is hidden.
		expect(texts(doc(SPOKEN), ".bm-bar > .bm-sr")).toEqual([
			"bar 1: A minor seven, words “I got roll-in' on the”",
			"bar 2: D nine, words “beat and I keep it up”",
		]);
		expect(beatLines(SPOKEN)[0]?.getAttribute("aria-hidden")).toBe("true");
	});
	test("stacked lyric rows on no melody are numbered in their first bar", () => {
		const chart = "| C | D |\nlyrics 1: | a | b |\nlyrics 2: | c | d |\n";
		expect([1, 2].map((n) => beatLines(chart, n).map(positions))).toEqual([
			[["a"], ["b"]],
			[["c"], ["d"]],
		]);
		expect([1, 2].map((n) => texts(beatLines(chart, n)[0], ".bm-verse"))).toEqual([["1."], ["2."]]);
		expect(beatLines(chart, 1)[1]?.querySelector(".bm-verse")).toBeNull();
	});
	test("a lyric row under a system draws in the system's last row", () => {
		const chart =
			"part: V = Voice, instrument: voice\npart: G = Guitar\nV | C | D |\nG | C | D |\nlyrics: | x | y |\n";
		const rows = [...doc(chart).querySelectorAll(".bm-part-row")];
		expect(rows.map((r) => texts(r, ".bm-beats"))).toEqual([[], ["x", "y"]]);
	});
	test("a voice line with no words draws as any part line does", () => {
		const notes = "Vox | G | C |\nVox.Mel | {G4} {B4} {D5}_{C5} {B4} | {C5 E5} / / / |\n";
		const voice = renderChartUnwrapped(`part: Vox = Voice, instrument: voice\n${notes}`);
		expect(voice).toBe(renderChartUnwrapped(`part: Vox = Voice\n${notes}`));
		expect(voice).toContain("E<sub>5</sub>");
		expect(voice).not.toContain("bm-sings");
	});
	test("a divisi on a singing line shows every note's name", () => {
		const mel = singing(`${VOICE}| {G4 A4}:God {C5}:save |\n`)[0];
		expect(texts(mel, ".bm-pitch")).toEqual(["G A", "C"]);
		expect(sungRows(mel, 1)).toEqual([["God", "save"]]);
	});
});
