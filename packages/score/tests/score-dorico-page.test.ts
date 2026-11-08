import { describe, expect, test } from "bun:test";
import { sideBySide } from "../../../scripts/score-dorico-page.js";

const svg = '<div class="bms-score-page"><svg viewBox="0 0 1 1"><script>x()</script></svg></div>';

describe("sideBySide", () => {
	test("a row per entry, the PDF embedded by relative path", () => {
		const html = sideBySide([
			{ name: "one", svg, pdf: "one.pdf" },
			{ name: "two", svg, pdf: "two.pdf" },
		]);
		expect(html.match(/<section/g)?.length).toBe(2);
		expect(html).toContain('src="one.pdf"');
		expect(html).toContain('src="two.pdf"');
		expect(html).toContain("<!doctype html>");
	});

	test("names and paths are escaped", () => {
		const html = sideBySide([{ name: '<b>"x"&', svg, pdf: 'a"b.pdf' }]);
		expect(html).not.toContain("<b>");
		expect(html).toContain("&lt;b&gt;&quot;x&quot;&amp;");
		expect(html).toContain('src="a&quot;b.pdf"');
	});

	test("the SVG goes through cleanSvg", () => {
		const html = sideBySide([{ name: "one", svg, pdf: "one.pdf" }]);
		expect(html).not.toContain("<script");
		expect(html).toContain("<svg");
	});
});
