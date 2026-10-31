import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { renderChart, renderChartUnwrapped } from "../src/index.js";
import { EXAMPLE } from "./fixtures.js";

const doc = (html: string) =>
	parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
/** The shadow root's markup, as a document of its own. */
const shadow = (html: string) => {
	const tpl = doc(html).querySelector("template");
	if (!tpl) throw new Error("no template");
	return doc(tpl.innerHTML);
};
const texts = (d: Document, sel: string) =>
	[...d.querySelectorAll(sel)].map((e) => e.textContent?.trim() ?? "");

describe("renderChart: the wrapper", () => {
	const html = renderChart(EXAMPLE);

	test("a <barmark-chart> holding a declarative open shadow root", () => {
		expect(html.startsWith("<barmark-chart")).toBe(true);
		expect(
			doc(html).querySelector('barmark-chart > template[shadowrootmode="open"]'),
		).not.toBeNull();
		expect(shadow(html).querySelector("style")).not.toBeNull();
	});

	test("every public part appears", () => {
		const d = shadow(renderChart(EXAMPLE, { rehearsalLetters: true }));
		for (const part of [
			"title",
			"meta",
			"heading",
			"bar",
			"chord",
			"text",
			"bar-number",
			"rehearsal",
		])
			expect(d.querySelector(`[part~="${part}"]`)).not.toBeNull();
	});

	test("title and meta", () => {
		const d = shadow(html);
		expect(texts(d, '[part~="title"]')).toEqual(["Example Song"]);
		expect(texts(d, ".bm-header [part~='meta']")[0]).toBe("D major · 4/4 · ♩ = 145 · swing");
	});
});

describe("renderChart: accessibility", () => {
	const d = shadow(renderChart(EXAMPLE));

	test("each bar has a spoken name, and its visual pieces are hidden", () => {
		const bars = [...d.querySelectorAll('[part~="bar"]')];
		expect(bars.length).toBeGreaterThan(40);
		for (const bar of bars) {
			expect(bar.querySelectorAll(":scope > .bm-sr").length).toBe(1);
			expect(bar.querySelector(":scope > [aria-hidden='true']")).not.toBeNull();
		}
		const spoken = texts(d, '[part~="bar"] > .bm-sr');
		expect(spoken[0]).toBe("bar 1: D");
		expect(spoken).toContain("bar 9: D");
		expect(spoken).toContain("bar 22: A seven sus four, hold, A seven, hold");
		expect(spoken).toContain("bar 23: triplet: D, E, F sharp minor, hold, G over B, hold");
	});

	test("sections are labelled by their heading", () => {
		const labels = [...d.querySelectorAll("section")].map((s) => s.getAttribute("aria-label"));
		expect(labels).toEqual(["Intro", "Verse", "Chorus", "Verse", "Chorus", "Outro"]);
	});

	test("repeats are spoken", () => {
		expect(texts(d, ".bm-sr")).toContain("play 2 times");
		expect(texts(d, ".bm-sr")).toContain("repeat until cued");
	});
});

describe("renderChart: options", () => {
	test("theme", () => {
		expect(
			shadow(renderChart(EXAMPLE)).querySelector(".bm-chart")?.getAttribute("data-theme"),
		).toBe("auto");
		expect(
			shadow(renderChart(EXAMPLE, { theme: "dark" }))
				.querySelector(".bm-chart")
				?.getAttribute("data-theme"),
		).toBe("dark");
	});
	test("bar numbers on by default, off on request", () => {
		expect(texts(shadow(renderChart(EXAMPLE)), '[part~="bar-number"]').slice(0, 3)).toEqual([
			"1",
			"9",
			"13",
		]);
		expect(
			shadow(renderChart(EXAMPLE, { barNumbers: false })).querySelector('[part~="bar-number"]'),
		).toBeNull();
	});
	test("rehearsal letters", () => {
		expect(
			texts(shadow(renderChart(EXAMPLE, { rehearsalLetters: true })), '[part~="rehearsal"]'),
		).toEqual(["A", "B", "C", "D", "E", "F"]);
	});
	test("diagnostics listed on request", () => {
		const chart = "## A\n| D | ? |";
		expect(shadow(renderChart(chart)).querySelector(".bm-diagnostics")).toBeNull();
		expect(
			texts(shadow(renderChart(chart, { diagnostics: true })), ".bm-diagnostics li")[0],
		).toMatch(/^line 2: /);
	});
});

describe("renderChart: notation", () => {
	const d = shadow(
		renderChart(`## A x2
| {E} | {E1} | {D E! G} | D_E_F#m |
| [2/4] A7 | N.C. | -- | ? |
| C | ... |
## A ->`),
	);

	test("a single note is ringed, with its octave as a subscript", () => {
		const rings = [...d.querySelectorAll(".bm-ring")];
		expect(rings.map((r) => r.textContent)).toEqual(["E", "E1", "E", "E1"]);
		expect(rings[1]?.querySelector("sub")?.textContent).toBe("1");
		expect(rings[0]?.closest('[part~="chord"]')?.querySelector("sup")).toBeNull();
	});
	test("a note set in faint braces, its root underlined", () => {
		const set = d.querySelector(".bm-notes");
		expect(set?.querySelectorAll(".bm-brace").length).toBe(2);
		expect(set?.querySelector("u")?.textContent).toBe("E");
	});
	test("a group carries its count", () => {
		expect(d.querySelector(".bm-group")?.getAttribute("data-count")).toBe("3");
		expect(texts(d, ".bm-group > .bm-tuplet")[0]).toBe("3");
	});
	test("one-bar meter, N.C., silence, unknown and fermata are distinct", () => {
		expect(texts(d, ".bm-meter span").slice(0, 2)).toEqual(["2", "4"]);
		expect(d.querySelector(".bm-nc")?.textContent).toBe("N.C.");
		expect(d.querySelector(".bm-silence")).not.toBeNull();
		expect(d.querySelector(".bm-unknown")?.textContent).toBe("?");
		expect(d.querySelector(".bm-fermata svg")).not.toBeNull();
	});
	test("a cut bar is marked, and a section repeat shows in its heading", () => {
		expect(d.querySelectorAll("[data-cut]").length).toBe(1);
		expect(texts(d, '[part~="heading"]')[0]).toContain("×2");
	});
	test("chord pieces: root, baseline quality, superscript, bass", () => {
		const e = shadow(renderChart("| F#m7(b5)/E |"));
		const chord = e.querySelector('[part~="chord"]');
		expect(chord?.textContent).toBe("F♯m7(♭5)/E");
		expect(chord?.querySelector("sup")?.textContent).toBe("7(♭5)");
	});
});

describe("renderChart: chart text is never markup", () => {
	const hostile = `# Tom & Jerry <3
## <script>alert(1)</script>
| D |
"quoted" & <b>bold</b>
| <img src=x onerror=alert(1)> |`;
	const d = shadow(renderChart(hostile));

	test("no element comes from the chart's text", () => {
		expect(d.querySelector("script, img, b")).toBeNull();
	});
	test("the text shows as written", () => {
		expect(texts(d, '[part~="title"]')).toEqual(["Tom & Jerry <3"]);
		expect(texts(d, '[part~="heading"]')[0]).toBe("<script>alert(1)</script>");
		expect(texts(d, '[part~="text"]')).toContain('"quoted" & <b>bold</b>');
		expect(texts(d, ".bm-error code")).toEqual(["| <img src=x onerror=alert(1)> |"]);
	});
	test("an error line's message is in a tooltip and spoken", () => {
		const err = d.querySelector(".bm-error");
		expect(err?.getAttribute("title")?.length).toBeGreaterThan(0);
		expect(err?.querySelector(".bm-sr")?.textContent).toMatch(/^Error: /);
	});
});

describe("several charts on one page", () => {
	test("no ids to collide", () => {
		const page = renderChart(EXAMPLE) + renderChart(EXAMPLE);
		expect(page.includes(" id=")).toBe(false);
	});
});

describe("renderChartUnwrapped", () => {
	const html = renderChartUnwrapped(EXAMPLE);
	test("no shadow root, and only bm- classes", () => {
		expect(html.includes("<template")).toBe(false);
		const classes = [...doc(html).querySelectorAll("[class]")].flatMap((e) =>
			(e.getAttribute("class") ?? "").split(/\s+/),
		);
		expect(classes.length).toBeGreaterThan(0);
		expect(classes.filter((c) => !c.startsWith("bm-"))).toEqual([]);
	});
});
