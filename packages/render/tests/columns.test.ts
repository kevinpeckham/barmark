import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { optionsFromAttributes } from "../src/element.js";
import { renderChart, renderChartUnwrapped, stylesheet } from "../src/index.js";
import { AMAZING_GRACE, EXAMPLE } from "./fixtures.js";
import { MORNING_SONG } from "./morning-song.js";

// `columns: "row"` (stem-shovel#16 ask 5, Kevin 2026-11-10): each row sizes
// its own cells, so a busy bar no longer widens its column down the section.
// Only the layout changes: the music, its markup and what is spoken stay.

const doc = (html: string) =>
	parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;

const BUSY = "## A\n| G7 | G7 C6/G Bbmaj7/F Fmaj9 | C | F |\n| C | F | G | C |\n";
const MIXED = `## A
|: C | D |
|1 E | F :|
|2 G | % |
| C | CM7 |
| E :| F |
| A | B | C | D | E | F | G | A |
`;

describe('columns: "row"', () => {
	test("marks the chart, and the element keeps it as an attribute", () => {
		const d = doc(renderChart(BUSY, { columns: "row" }));
		expect(d.querySelector("barmark-chart")?.getAttribute("columns")).toBe("row");
		const chart = (html: string) => doc(html).querySelector(".bm-chart");
		expect(
			chart(renderChartUnwrapped(BUSY, { columns: "row" }))?.getAttribute("data-columns"),
		).toBe("row");
		expect(doc(renderChart(BUSY)).querySelector("barmark-chart")?.hasAttribute("columns")).toBe(
			false,
		);
		expect(chart(renderChartUnwrapped(BUSY))?.hasAttribute("data-columns")).toBe(false);
	});

	test("draws the same music: only data-columns and data-fit differ", () => {
		for (const text of [EXAMPLE, AMAZING_GRACE, MORNING_SONG, BUSY, MIXED]) {
			const strip = (html: string) =>
				html.replace(' data-columns="row"', "").replace(/ data-fit="\d+"/g, "");
			expect(strip(renderChartUnwrapped(text, { columns: "row" }))).toBe(
				strip(renderChartUnwrapped(text)),
			);
		}
	});

	test("a screen reader hears the same chart", () => {
		const said = (html: string) =>
			[...doc(html).querySelectorAll(".bm-sr, [aria-label]")].map(
				(e) => `${e.getAttribute("aria-label") ?? ""}|${e.textContent}`,
			);
		for (const text of [EXAMPLE, MORNING_SONG, MIXED])
			expect(said(renderChartUnwrapped(text, { columns: "row" }))).toEqual(
				said(renderChartUnwrapped(text)),
			);
	});

	test("a section wraps only when its widest row no longer fits, not its widest columns", () => {
		const fit = (html: string) =>
			Number(doc(html).querySelector(".bm-grid")?.getAttribute("data-fit"));
		const text = "## A\n| G7 | G7 C6/G Bbmaj7/F Fmaj9 |\n| C | F | G | C | F | G | C | F |\n";
		expect(fit(renderChartUnwrapped(text, { columns: "row" }))).toBeLessThan(
			fit(renderChartUnwrapped(text)),
		);
		for (const t of [EXAMPLE, MORNING_SONG, AMAZING_GRACE])
			expect(fit(renderChartUnwrapped(t, { columns: "row" }))).toBeLessThanOrEqual(
				fit(renderChartUnwrapped(t)),
			);
	});

	test("the stylesheet gives each row, and each system, its own tracks", () => {
		expect(stylesheet).toContain('.bm-chart[data-columns="row"]');
		expect(stylesheet).toMatch(/\[data-columns="row"\][^{]*\.bm-system[^{]*\{[^}]*display:grid/);
	});
});

describe("the columns attribute", () => {
	const el = (attrs: Record<string, string>) => ({
		getAttribute: (n: string) => attrs[n] ?? null,
		hasAttribute: (n: string) => n in attrs,
	});
	test('"row" is taken; anything else is shared, the default', () => {
		expect(optionsFromAttributes(el({ columns: "row" })).columns).toBe("row");
		for (const odd of ["shared", "ROW", "rows", ""])
			expect(optionsFromAttributes(el({ columns: odd })).columns).toBeUndefined();
		expect(optionsFromAttributes(el({})).columns).toBeUndefined();
	});
});
