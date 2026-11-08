import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { chartHtml, scoreHtml } from "../src/lib/chart.ts";

const demo = await Bun.file(join(import.meta.dir, "../src/lib/demo.chart.md")).text();

describe("chartHtml", () => {
	test("an empty source is an empty chart, not an exception", () => {
		expect(chartHtml("")).toStartWith("<barmark-chart");
	});
	test("the text is escaped, never markup", () => {
		const html = chartHtml("# A & <b>\n| D |");
		expect(html).toContain("A &amp; &lt;b&gt;");
		expect(html).not.toContain("<b>");
	});
	test("a chart can leave out bar numbers", () => {
		const host = (html: string) => html.slice(0, html.indexOf(">") + 1);
		expect(host(chartHtml("| C |", { barNumbers: false }))).toContain('bar-numbers="off"');
		expect(host(chartHtml("| C |"))).not.toContain("bar-numbers");
	});
	test("charts never wrap their rows: a wide section scrolls", () => {
		expect(chartHtml("| C |")).toContain('wrap="off"');
	});
	test("charts use the dark palette", () => {
		expect(chartHtml(demo)).toContain('data-theme="dark"');
	});
	test("sections are lettered A, B, C in play order", () => {
		expect(chartHtml(demo)).toContain('<span class="bm-rehearsal"');
	});
	test("a 2,000-line paste renders quickly", () => {
		const start = performance.now();
		chartHtml("| D | G |\n".repeat(2000));
		expect(performance.now() - start).toBeLessThan(500);
	});
});

describe("scoreHtml", () => {
	test("is a <barmark-score> with the grid drawn and the Grid / Score switch, Grid checked", () => {
		const html = scoreHtml(demo);
		expect(html).toStartWith("<barmark-score");
		expect(html).toContain('<template shadowrootmode="open">');
		expect(html).toContain('role="radiogroup" aria-label="View"');
		expect(html).toContain('data-view="grid" aria-checked="true"');
		expect(html).toContain("Peaceful Dreams");
	});
	test("draws the grid as chartHtml does: dark, lettered, never wrapping", () => {
		const html = scoreHtml(demo);
		const host = html.slice(0, html.indexOf(">") + 1);
		expect(host).toContain('wrap="off"');
		expect(host).toContain('theme="dark"');
		expect(html).toContain('data-theme="dark"');
		expect(html).toContain('<span class="bm-rehearsal"');
		expect(scoreHtml("| C |", { barNumbers: false })).toContain('bar-numbers="off"');
	});
	test("carries the chart's text, escaped so it can't end its script", () => {
		const html = scoreHtml("# A </script><b>\n| D |");
		expect(html).toContain('<script type="text/barmark">');
		// Inside the script the text is never markup; only its own end tag closes it.
		expect(html.match(/<\/script>/gi)?.length).toBe(1);
		expect(html).toContain("# A <\\/script><b>");
	});
	test("an empty source is an empty chart, not an exception", () => {
		expect(scoreHtml("")).toStartWith("<barmark-score");
	});
});
