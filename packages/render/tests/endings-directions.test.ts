import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { layoutChart, renderChartUnwrapped } from "../src/index.js";
import type { BlockItem } from "../src/types.js";

type Row = Extract<BlockItem, { kind: "row" }>;
const rowsOf = (text: string) =>
	layoutChart(text).blocks.flatMap((b) => b.items.filter((i): i is Row => i.kind === "row"));
const doc = (html: string) =>
	parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
const texts = (html: string, sel: string) =>
	[...doc(html).querySelectorAll(sel)].map((e) => e.textContent?.trim() ?? "");

const VERSE = "## Verse\n|: C | F | G | C |\n|1 G | G7 :|\n|2 G | C |";
const CODA =
	"## Verse\n| Segno | C | F | G | To Coda | C |\n| Am | F | G | C | D.S. al Coda |\n## Coda\n| Coda | F | G | C | ... |";

describe("the model", () => {
	test("an ending row carries its passes", () => {
		expect(rowsOf(VERSE).map((r) => r.ending)).toEqual([null, [1], [2]]);
	});
	test("a direction is a cell of its own, not a bar", () => {
		const cells = rowsOf("| Segno | C | D.S. |")[0]?.cells ?? [];
		expect(cells.map((c) => c.kind)).toEqual(["direction", "slots", "direction"]);
		expect(cells[2]).toEqual({
			kind: "direction",
			direction: { kind: "jump", to: "segno", al: null },
		});
	});
	test("the bars after a direction draw what they play", () => {
		const cells = rowsOf("| C | Segno | % | D.S. |")[0]?.cells ?? [];
		const third = cells[2];
		expect(
			third?.kind === "slots" && third.slots[0]?.kind === "chord"
				? third.slots[0].chord.canonical
				: "",
		).toBe("C");
	});
	test("rows number their bars as written, the coda after the jump too", () => {
		expect(rowsOf(CODA).map((r) => r.barNumber)).toEqual([1, 5, 9]);
	});
});

describe("the HTML", () => {
	test("an ending labels its row's first bar, and says which passes", () => {
		const html = renderChartUnwrapped(VERSE);
		expect(
			[...doc(html).querySelectorAll("[data-ending]")].map((e) => e.getAttribute("data-ending")),
		).toEqual(["1.", "2."]);
		expect(texts(html, ".bm-sr").filter((t) => t.startsWith("ending"))).toEqual([
			"ending for pass 1",
			"ending for pass 2",
		]);
	});
	test("a range of passes reads as one", () => {
		const html = renderChartUnwrapped("|: C |\n|1-3 D :|\n|4 E |");
		expect(
			[...doc(html).querySelectorAll("[data-ending]")].map((e) => e.getAttribute("data-ending")),
		).toEqual(["1.–3.", "4."]);
		expect(texts(html, ".bm-sr").filter((t) => t.startsWith("ending"))).toEqual([
			"ending for passes 1 to 3",
			"ending for pass 4",
		]);
	});
	test("segno and coda are signs; words are words; each is spoken", () => {
		const html = renderChartUnwrapped(CODA);
		const marks = [...doc(html).querySelectorAll(".bm-direction")];
		expect(marks.map((m) => m.getAttribute("data-direction"))).toEqual([
			"segno",
			"to coda",
			"jump",
			"coda",
		]);
		expect(marks.map((m) => m.querySelector(".bm-sr")?.textContent)).toEqual([
			"segno",
			"to coda",
			"dal segno al coda",
			"coda",
		]);
		expect(marks[0]?.querySelector("svg")).not.toBeNull();
		expect(marks[3]?.querySelector("svg")).not.toBeNull();
		expect(marks[2]?.textContent).toContain("D.S. al Coda");
	});
	test("bars after a direction keep their spoken numbers", () => {
		const spoken = texts(renderChartUnwrapped("| Segno | C | D | D.S. |"), ".bm-bar .bm-sr");
		expect(spoken).toEqual(["segno", "bar 1: C", "bar 2: D", "dal segno"]);
	});
});

describe("an ending across rows (barmark's grammar 5.1)", () => {
	const FIVE = "|: C | F |\n|1 G | A | B | C |\n| D :|\n|2 E |";
	test("a row the ending continues onto carries its passes as `continues`", () => {
		const rows = rowsOf(FIVE);
		expect(rows.map((r) => r.ending)).toEqual([null, [1], null, [2]]);
		expect(rows.map((r) => r.continues ?? null)).toEqual([null, null, [1], null]);
		expect(rows.map((r) => r.barNumber)).toEqual([1, 3, 7, 8]);
	});
	test("the bracket runs on over the next row, labelled once, and is said to continue", () => {
		const html = renderChartUnwrapped(FIVE);
		const rows = [...doc(html).querySelectorAll(".bm-row")];
		expect(rows.map((r) => r.classList.contains("bm-ending"))).toEqual([false, true, true, true]);
		expect(
			rows.map((r) => r.querySelector("[data-ending]")?.getAttribute("data-ending") ?? null),
		).toEqual([null, "1.", null, "2."]);
		expect(texts(html, ".bm-sr").filter((t) => t.startsWith("ending"))).toEqual([
			"ending for pass 1",
			"ending for pass 1, continued",
			"ending for pass 2",
		]);
	});
	test("in a system, every part's row continues the ending", () => {
		const text = [
			"part: Gtr = Guitar",
			"part: Bass = Bass",
			"Gtr |: C |",
			"Bass |: C |",
			"Gtr |1 G |",
			"Bass |1 G |",
			"Gtr | A :|",
			"Bass | A :|",
			"Gtr |2 E |",
			"Bass |2 E |",
		].join("\n");
		const html = renderChartUnwrapped(text);
		const systems = [...doc(html).querySelectorAll(".bm-system")];
		expect(
			systems.map((s) =>
				[...s.querySelectorAll(".bm-row")].every((r) => r.classList.contains("bm-ending")),
			),
		).toEqual([false, true, true, true]);
	});
});
