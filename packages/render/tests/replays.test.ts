import { describe, expect, test } from "bun:test";
import { layoutChart } from "../src/index.js";
import type { BlockItem, ChartModel, SectionBlock } from "../src/types.js";
import { EXAMPLE } from "./fixtures.js";

type Row = Extract<BlockItem, { kind: "row" }>;
const rowsOf = (b: SectionBlock | undefined) =>
	(b?.items ?? []).filter((i): i is Row => i.kind === "row");
const rows = (m: ChartModel) => m.blocks.flatMap((b) => rowsOf(b));
const texts = (b: SectionBlock | undefined) =>
	(b?.items ?? []).flatMap((i) => (i.kind === "text" ? [i.text] : []));
const strip = (items: BlockItem[]) =>
	items.map((i) => (i.kind === "row" ? { ...i, barNumber: null, line: 0 } : i));

describe("replays", () => {
	const m = layoutChart(EXAMPLE);

	test("a replay draws its written section in full, with its own bar numbers", () => {
		const [verse, , replay] = [m.blocks[1], m.blocks[2], m.blocks[3]];
		expect(strip(replay?.items ?? [])).toEqual(strip(verse?.items ?? []));
		expect(rowsOf(replay).map((r) => r.barNumber)).toEqual([25, 29]);
		expect(replay?.columns).toBe(4);
	});

	test("every row of the chart has its play-order number", () => {
		expect(rows(m).map((r) => r.barNumber)).toEqual([1, 9, 13, 17, 21, 25, 29, 33, 37, 41, null]);
	});

	test("a replay's own directive lines follow its rows", () => {
		const chorus2 = m.blocks[4]?.items ?? [];
		expect(chorus2.at(-1)).toMatchObject({ kind: "directive", set: { tempo: 120 } });
		expect(chorus2.filter((i) => i.kind === "row").length).toBe(2);
	});
});

const VERSE = `## Verse
| D | A |
first line
| G | D |
second line
`;

describe("lyrics in a replay", () => {
	test("the replay's own text lines replace the written ones, in order", () => {
		const m = layoutChart(`${VERSE}## Verse\nverse two, one\nverse two, two\n`);
		const replay = m.blocks[1];
		expect(texts(replay)).toEqual(["verse two, one", "verse two, two"]);
		expect(replay?.items.map((i) => i.kind)).toEqual(["row", "text", "row", "text"]);
	});

	test("extra lines follow the last row", () => {
		const m = layoutChart(`${VERSE}## Verse\na\nb\nc\n`);
		expect(m.blocks[1]?.items.map((i) => (i.kind === "text" ? i.text : i.kind))).toEqual([
			"row",
			"a",
			"row",
			"b",
			"c",
		]);
	});

	test("with no text lines of its own a replay shows the written section's", () => {
		const m = layoutChart(`${VERSE}## Verse\n`);
		expect(texts(m.blocks[1])).toEqual(["first line", "second line"]);
	});

	test("a ### note in the written section is replaced like any text line", () => {
		const m = layoutChart("## A\n| D |\n### loud\n## A\nsoft\n");
		expect(m.blocks[1]?.items.filter((i) => i.kind === "text")).toEqual([
			{ kind: "text", text: "soft", note: false },
		]);
	});

	test("directives inside the written section appear again in the replay", () => {
		const m = layoutChart("## A\n| D |\nfeel: swing\n| G |\n## A\n");
		expect(m.blocks[1]?.items.map((i) => i.kind)).toEqual(["row", "directive", "row"]);
	});
});

const cuts = (b: SectionBlock | undefined) =>
	rowsOf(b).flatMap((r, ri) =>
		r.cells.flatMap((c, ci) => (c.kind === "slots" && c.cut ? [[ri, ci]] : [])),
	);

describe("elision", () => {
	test("-> marks the written section's last bar as cut, and nothing else", () => {
		const m = layoutChart("## C\n| G | D |\n| A | E |\n## C ->\n## O\n| G |");
		expect(cuts(m.blocks[0])).toEqual([]);
		expect(cuts(m.blocks[1])).toEqual([[1, 1]]);
		const occ = m.blocks[1];
		expect(rowsOf(occ).map((r) => r.barNumber)).toEqual([5, 7]);
	});

	test("the cut bar is the parser's: the next section starts where it would have been", () => {
		const m = layoutChart("## C\n| G | D |\n| A | E |\n## C ->\n## O\n| G |");
		expect(rowsOf(m.blocks[2])[0]?.barNumber).toBe(8);
	});

	test("a last row marked x2 is drawn once, its last bar marked cut", () => {
		const m = layoutChart("## C\n| G | D | x2\n## C ->");
		expect(cuts(m.blocks[1])).toEqual([[0, 1]]);
	});

	test("a fermata is never the cut bar", () => {
		const m = layoutChart("## C\n| G | D | ... |\n## C ->");
		expect(cuts(m.blocks[1])).toEqual([[0, 1]]);
	});

	test("## C x2 -> marks the same bar", () => {
		const m = layoutChart("## C\n| G | D |\n## C x2 ->");
		expect(cuts(m.blocks[1])).toEqual([[0, 1]]);
		expect(m.blocks[1]?.repeat).toBe(2);
	});
});

describe("rehearsal letters", () => {
	test("one per section occurrence in play order; replays get their own", () => {
		const m = layoutChart(EXAMPLE, { rehearsalLetters: true });
		expect(m.blocks.map((b) => b.rehearsal)).toEqual(["A", "B", "C", "D", "E", "F"]);
	});

	test("a leading block gets one only if it has rows", () => {
		expect(
			layoutChart("words\n## A\n| D |", { rehearsalLetters: true }).blocks.map((b) => b.rehearsal),
		).toEqual([null, "A"]);
		expect(
			layoutChart("| C |\n## A\n| D |", { rehearsalLetters: true }).blocks.map((b) => b.rehearsal),
		).toEqual(["A", "B"]);
	});

	test("off by default", () => {
		expect(layoutChart(EXAMPLE).blocks.every((b) => b.rehearsal === null)).toBe(true);
	});

	test("past Z the letters double: AA, AB", () => {
		const chart = Array.from({ length: 28 }, (_, i) => `## S${i}\n| D |`).join("\n");
		const letters = layoutChart(chart, { rehearsalLetters: true }).blocks.map((b) => b.rehearsal);
		expect(letters.slice(24)).toEqual(["Y", "Z", "AA", "AB"]);
	});
});
