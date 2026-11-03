import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { layoutChart, renderChartUnwrapped } from "../src/index.js";
import type { BlockItem } from "../src/types.js";

type Row = Extract<BlockItem, { kind: "row" }>;
const rowsOf = (text: string) =>
	layoutChart(text).blocks.flatMap((b) => b.items.filter((i): i is Row => i.kind === "row"));
const doc = (html: string) =>
	parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;

describe("the model", () => {
	test("a rehearsal mark is a cell of its own, not a bar", () => {
		const row = rowsOf("| D | @B | A | G |")[0];
		expect(row?.cells.map((c) => c.kind)).toEqual(["slots", "rehearsal", "slots", "slots"]);
		expect(row?.cells[1]).toEqual({ kind: "rehearsal", label: "B" });
	});
	test("the bars after a mark draw what they play", () => {
		const cells = rowsOf("| C | @B | % |")[0]?.cells ?? [];
		const copy = cells[2];
		expect(
			copy?.kind === "slots" && copy.slots[0]?.kind === "chord"
				? copy.slots[0].chord.canonical
				: "",
		).toBe("C");
	});
	test("a bar carries its words", () => {
		const cells = rowsOf('| "solo" D | D "rit." G "fill" |')[0]?.cells ?? [];
		expect(cells.map((c) => (c.kind === "slots" ? (c.words ?? null) : null))).toEqual([
			[{ text: "solo", at: 0 }],
			[
				{ text: "rit.", at: 1 },
				{ text: "fill", at: 2 },
			],
		]);
	});
	test("rows number their bars without the marks", () => {
		expect(rowsOf("| @A | D | A |\n| @B | G | D |").map((r) => r.barNumber)).toEqual([1, 3]);
	});
});

describe("the HTML", () => {
	test("a mark draws as its boxed label and is spoken", () => {
		const html = renderChartUnwrapped("| @B | D |");
		const mark = doc(html).querySelector(".bm-mark");
		expect(mark?.getAttribute("part")).toBe("mark");
		expect(mark?.querySelector(".bm-box")?.textContent).toBe("B");
		expect(mark?.querySelector(".bm-sr")?.textContent).toBe("rehearsal B");
	});
	test("words draw above their slot, and after the last at the bar's end", () => {
		const html = renderChartUnwrapped('| D "rit." G "fill" |');
		const words = [...doc(html).querySelectorAll("[part=words]")];
		expect(words.map((w) => w.textContent)).toEqual(["rit.", "fill"]);
		expect(words[0]?.parentElement?.textContent).toContain("G");
		expect(words[1]?.classList.contains("bm-words-end")).toBe(true);
	});
	test("words are spoken where they sit", () => {
		const spoken = doc(renderChartUnwrapped('| "solo" D A "fill" |')).querySelector(
			".bm-bar .bm-sr",
		)?.textContent;
		expect(spoken).toBe("bar 1: “solo” D, A, “fill”");
	});
	test("words are escaped", () => {
		const html = renderChartUnwrapped('| "<b>x</b>" D |');
		expect(html).not.toContain("<b>x</b>");
	});
});
