import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { layoutChart, renderChartUnwrapped } from "../src/index.js";
import { speakBar } from "../src/speech.js";
import type { BlockItem, CellModel } from "../src/types.js";

type Row = Extract<BlockItem, { kind: "row" }>;

// A pickup is bar 0 (barmark's grammar 2.4); the gutter draws no number for it.
const PICKUP = "time: 4/4\n\n| [1/4] G |\n| C | D | G |";

const rows = () =>
	layoutChart(PICKUP)
		.blocks.flatMap((b) => b.items)
		.filter((i): i is Row => i.kind === "row");

const gutters = (html: string) =>
	[...parseHTML(html).document.querySelectorAll(".bm-bar-number")].map((e) => e.textContent);

describe("a pickup row", () => {
	test("the model numbers it 0 and the next row 1", () => {
		expect(rows().map((r) => r.barNumber)).toEqual([0, 1]);
	});

	test("the gutter prints nothing for it", () => {
		expect(gutters(renderChartUnwrapped(PICKUP))).toEqual(["", "1"]);
	});

	test("the speech says pickup, not bar 0", () => {
		const cell = rows()[0]?.cells[0] as Extract<CellModel, { kind: "slots" }>;
		expect(speakBar(0, { ...cell, meter: null })).toStartWith("pickup: ");
		expect(renderChartUnwrapped(PICKUP)).toContain(">pickup, in 1/4: G<");
		expect(renderChartUnwrapped(PICKUP)).not.toContain("bar 0");
	});

	test("bars after the pickup on its row count from 1", () => {
		const html = renderChartUnwrapped("time: 4/4\n\n| [1/4] G | C | D |");
		expect(gutters(html)).toEqual([""]);
		expect(html).toContain(">pickup, in 1/4: G<");
		expect(html).toContain(">bar 1: C<");
		expect(html).toContain(">bar 2: D<");
	});
});

describe("a chart without a pickup", () => {
	test("renders exactly as before", () => {
		expect(renderChartUnwrapped("time: 4/4\n\n| G | C |\n| D | G |")).toBe(STORED);
	});
});

const STORED =
	'<div class="bm-chart" data-theme="auto"><header class="bm-header"><p class="bm-meta" part="meta">4/4</p></header><section class="bm-section"><div class="bm-grid" style="--bm-cols:2" data-fit="16"><div class="bm-row"><span class="bm-bar-number" part="bar-number" aria-hidden="true">1</span><div class="bm-bar" part="bar"><span class="bm-sr">bar 1: G</span><span class="bm-bar-body" aria-hidden="true"><span class="bm-chord" part="chord">G</span></span></div><div class="bm-bar" part="bar"><span class="bm-sr">bar 2: C</span><span class="bm-bar-body" aria-hidden="true"><span class="bm-chord" part="chord">C</span></span></div><span class="bm-repeat"></span></div><div class="bm-row"><span class="bm-bar-number" part="bar-number" aria-hidden="true">3</span><div class="bm-bar" part="bar"><span class="bm-sr">bar 3: D</span><span class="bm-bar-body" aria-hidden="true"><span class="bm-chord" part="chord">D</span></span></div><div class="bm-bar" part="bar"><span class="bm-sr">bar 4: G</span><span class="bm-bar-body" aria-hidden="true"><span class="bm-chord" part="chord">G</span></span></div><span class="bm-repeat"></span></div></div></section></div>';
