import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { chartHtml } from "../src/lib/chart.ts";

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
	test("charts use the dark palette", () => {
		expect(chartHtml(demo)).toContain('data-theme="dark"');
	});
	test("a 2,000-line paste renders quickly", () => {
		const start = performance.now();
		chartHtml("| D | G |\n".repeat(2000));
		expect(performance.now() - start).toBeLessThan(500);
	});
});
