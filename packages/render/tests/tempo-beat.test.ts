import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { layoutChart, renderChartUnwrapped } from "../src/index.js";

const doc = (html: string) =>
	parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
const header = (text: string) => doc(renderChartUnwrapped(text)).querySelector(".bm-meta");
const directives = (text: string) => [
	...doc(renderChartUnwrapped(text)).querySelectorAll(".bm-directive"),
];
/** What a screen reader hears for each beat note drawn. */
const spoken = (el: Element | null | undefined) =>
	[...(el?.querySelectorAll(".bm-beat") ?? [])].map((b) => [
		b.getAttribute("role"),
		b.getAttribute("aria-label"),
	]);
const directiveBeats = (text: string) =>
	layoutChart(text)
		.blocks.flatMap((b) => b.items)
		.flatMap((i) => (i.kind === "directive" ? [i.tempoBeat] : []));

const QUARTER = { note: 4, dotted: false };
const DOTTED_QUARTER = { note: 4, dotted: true };

describe("the beat a tempo counts (barmark's grammar 2.1)", () => {
	test("4/4, and a chart with no time:, count quarters", () => {
		expect(header("time: 4/4, tempo: 120\n| G |")?.textContent).toBe("4/4 · ♩ = 120");
		expect(header("tempo: 120\n| G |")?.textContent).toBe("♩ = 120");
		expect(spoken(header("tempo: 120\n| G |"))).toEqual([["img", "quarter note"]]);
		expect(layoutChart("tempo: 120\n| G |").tempoBeat).toEqual(QUARTER);
	});

	test("6/8 counts the dotted quarter", () => {
		const meta = header("time: 6/8, tempo: 40\n| G |");
		expect(meta?.textContent).toBe("6/8 · ♩. = 40");
		expect(spoken(meta)).toEqual([["img", "dotted quarter note"]]);
		expect(layoutChart("time: 6/8, tempo: 40\n| G |").tempoBeat).toEqual(DOTTED_QUARTER);
	});

	test("12/8 and 9/8 count the dotted quarter", () => {
		expect(header("time: 12/8, tempo: 50\n| G |")?.textContent).toBe("12/8 · ♩. = 50");
		expect(header("time: 9/8, tempo: 50\n| G |")?.textContent).toBe("9/8 · ♩. = 50");
	});

	test("simple meters count the bottom number: 2/2 halves, 3/8 eighths", () => {
		expect(header("time: 2/2, tempo: 80\n| G |")?.textContent).toBe("2/2 · \u{1D15E} = 80");
		expect(spoken(header("time: 2/2, tempo: 80\n| G |"))).toEqual([["img", "half note"]]);
		expect(header("time: 3/8, tempo: 150\n| G |")?.textContent).toBe("3/8 · ♪ = 150");
		expect(spoken(header("time: 3/8, tempo: 150\n| G |"))).toEqual([["img", "eighth note"]]);
	});

	test("a rit. to a tempo counts the same beat", () => {
		const [rit] = directives("time: 6/8, tempo: 120\n## A\n| G |\ntempo: rit. to 90\n| C |");
		expect(rit?.textContent).toContain("Tempo rit. to ♩. = 90");
		expect(spoken(rit)).toEqual([["img", "dotted quarter note"]]);
		expect(header("time: 12/8, tempo: accel. to 70\n| G |")?.textContent).toBe(
			"12/8 · accel. to ♩. = 70",
		);
		expect(header("tempo: accel. to 160\n| G |")?.textContent).toBe("accel. to ♩ = 160");
	});

	test("a time: change mid-chart: a later tempo counts the new meter's beat", () => {
		const chart = [
			"time: 4/4, tempo: 120",
			"## A",
			"| G |",
			"time: 6/8",
			"| C |",
			"tempo: 60",
			"| D |",
			"time: 4/4, tempo: 100",
			"| G |",
		].join("\n");
		expect(header(chart)?.textContent).toBe("4/4 · ♩ = 120");
		expect(directives(chart).map((d) => d.textContent?.replace("→", ""))).toEqual([
			"Time 6/8",
			"Tempo ♩. = 60",
			"Time 4/4 · Tempo ♩ = 100",
		]);
		expect(directiveBeats(chart)).toEqual([DOTTED_QUARTER, DOTTED_QUARTER, QUARTER]);
	});

	test("a time: and a tempo on one line count the line's own meter", () => {
		const [d] = directives("time: 4/4, tempo: 120\n## A\n| G |\ntime: 6/8, tempo: 60\n| C |");
		expect(d?.textContent).toContain("Time 6/8 · Tempo ♩. = 60");
	});

	test("a one-bar meter never changes the beat: the time: in force counts (grammar 2.4)", () => {
		// A tempo before a bracketed bar in 6/8 still counts dotted quarters…
		const six = "time: 6/8, tempo: 60\n## A\n| [2/8] E7 | Am |\ntempo: 50\n| [3/4] Dm | Am |";
		expect(directives(six)[0]?.textContent).toContain("Tempo ♩. = 50");
		// …and one in 4/4 still counts quarters, beside a [6/8] bar.
		const four = "tempo: 100\n## A\n| [6/8] G | C |\ntempo: 90\n| [6/8] D | G |";
		expect(directives(four)[0]?.textContent).toContain("Tempo ♩ = 90");
		expect(directiveBeats(four)).toEqual([QUARTER]);
	});

	test("a replayed section's directives keep their beat", () => {
		const chart = "time: 6/8\n## A\n| G |\ntempo: 60\n| C |\n## A";
		expect(directives(chart).map((d) => d.textContent)).toEqual([
			expect.stringContaining("♩. = 60"),
			expect.stringContaining("♩. = 60"),
		]);
	});
});
