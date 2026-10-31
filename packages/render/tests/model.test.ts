import { describe, expect, test } from "bun:test";
import { layoutChart } from "../src/index.js";
import type { BlockItem, ChartModel } from "../src/types.js";
import { EXAMPLE, PEACEFUL_DREAMS } from "./fixtures.js";

type Row = Extract<BlockItem, { kind: "row" }>;
const rows = (m: ChartModel) =>
	m.blocks.flatMap((b) => b.items.filter((i): i is Row => i.kind === "row"));
/** The written sections of EXAMPLE: Intro, Verse, Chorus, Outro (blocks 3 and 4 are replays). */
const writtenRows = (m: ChartModel) =>
	[0, 1, 2, 5].flatMap((i) => (m.blocks[i]?.items ?? []).filter((x): x is Row => x.kind === "row"));
const block = (m: ChartModel, i: number) => {
	const b = m.blocks[i];
	if (!b) throw new Error(`no block ${i}`);
	return b;
};

describe("layoutChart: written sections", () => {
	const m = layoutChart(EXAMPLE);

	test("title, header and headings in order", () => {
		expect(m.title).toBe("Example Song");
		expect(m.header).toEqual({
			key: { tonic: "D", mode: "major" },
			time: { n: 4, d: 4 },
			tempo: 145,
			feel: "swing",
		});
		expect(m.blocks.map((b) => b.heading)).toEqual([
			"Intro",
			"Verse",
			"Chorus",
			"Verse",
			"Chorus",
			"Outro",
		]);
	});

	test("written rows carry their first-pass bar numbers; numbering stops after an open repeat", () => {
		const written = writtenRows(m).map((r) => r.barNumber);
		expect(written).toEqual([1, 9, 13, 17, 21, 41, null]);
	});

	test("% is drawn as the bar it copies", () => {
		const intro = rows(m)[0];
		expect(intro?.cells[1]).toEqual(intro?.cells[0]);
		expect(intro?.cells[1]?.kind).toBe("slots");
	});

	test("one-bar meter and fermata cells", () => {
		const verse2 = writtenRows(m)[2];
		expect(verse2?.cells[3]).toMatchObject({ kind: "slots", meter: { n: 2, d: 4 } });
		const outro2 = writtenRows(m)[6];
		expect(outro2?.cells[1]).toEqual({ kind: "fermata" });
	});

	test("row repeats and repeat brackets", () => {
		expect(rows(m)[0]?.repeat).toBe(2);
		expect(writtenRows(m)[5]?.repeat).toBe("open");
		const bracket = layoutChart("## A\n|: D | A |\n| G | D :| x3");
		const [first, second] = rows(bracket);
		expect([first?.opens, first?.closes, second?.opens, second?.closes]).toEqual([
			true,
			false,
			false,
			true,
		]);
		expect(second?.repeat).toBe(3);
	});

	test("text lines: plain lyrics, and ### notes without their marks", () => {
		const texts = block(m, 2).items.filter((i) => i.kind === "text");
		expect(texts).toEqual([{ kind: "text", text: "Watch Kevin for the cutoff", note: true }]);
		expect(block(m, 1).items.filter((i) => i.kind === "text")).toEqual([
			{ kind: "text", text: "Morning comes in slow, the kettle's on", note: false },
			{ kind: "text", text: "Every road I know leads back to you", note: false },
		]);
	});

	test("a mid-chart directive is an item where it is written", () => {
		const all = m.blocks.flatMap((b) => b.items);
		expect(all.filter((i) => i.kind === "directive")).toEqual([
			{ kind: "directive", set: { key: { tonic: "E", mode: "major" }, tempo: 120 } },
		]);
	});

	test("columns are the widest row's cell count", () => {
		expect(m.blocks.map((b) => b.columns)).toEqual([4, 4, 4, 4, 4, 4]);
	});

	test("form comes from the section occurrence", () => {
		expect(m.blocks.map((b) => b.form)).toEqual([0, 1, 2, 1, 2, 3]);
	});
});

describe("layoutChart: lines with errors", () => {
	test("a line with an error is shown as written, with its messages", () => {
		const m = layoutChart("## A\n| D | Q7x |\n| G |");
		const items = block(m, 0).items;
		expect(items[0]).toMatchObject({ kind: "error", line: 2, source: "| D | Q7x |" });
		expect((items[0] as { messages: string[] }).messages.length).toBeGreaterThan(0);
		expect(items[1]).toMatchObject({ kind: "row", line: 3 });
	});
});

describe("layoutChart: degenerate charts never throw", () => {
	const charts = [
		"",
		"just some words\nand more",
		"| Q | Z |\n:|",
		"# Only a title",
		"## Ghost",
		"key: nonsense\n## A\n| D |",
		"## Vamp x ...\n| D | A |\n## Next\n| G |\n## Vamp\n## Next",
	];
	for (const c of charts)
		test(JSON.stringify(c.slice(0, 30)), () => {
			expect(() => layoutChart(c)).not.toThrow();
		});

	test("a chart of only text keeps its text", () => {
		const m = layoutChart("just some words\nand more");
		expect(m.blocks[0]?.items.map((i) => i.kind)).toEqual(["text", "text"]);
	});

	test("the vamp's numbering stops after it, even in a later replay", () => {
		const m = layoutChart("## Vamp x ...\n| D | A |\n## Next\n| G |");
		expect(rows(m).map((r) => r.barNumber)).toEqual([1, null]);
	});

	test("Peaceful Dreams lays out with 152 numbered bars' worth of rows", () => {
		const m = layoutChart(PEACEFUL_DREAMS);
		expect(m.diagnostics).toEqual([]);
		expect(rows(m)[0]?.barNumber).toBe(1);
	});
});
