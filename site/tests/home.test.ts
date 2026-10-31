import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { HEADLINE, LINKS, TAGLINE_AFTER, TAGLINE_BEFORE, TAGLINE_LINK } from "../src/lib/site.ts";
import { build, page } from "./built.ts";

const demo = await Bun.file(join(import.meta.dir, "../src/lib/demo.chart.md")).text();
let doc: Document;
beforeAll(() => {
	build();
	doc = page("index.html");
}, 120_000);

describe("the home page, prerendered", () => {
	test("leads with the headline, then Stem Shovel", () => {
		const h1 = doc.querySelector("h1");
		expect(h1?.textContent?.trim()).toBe(HEADLINE);
		const next = h1?.nextElementSibling;
		expect(next?.textContent?.replace(/\s+/g, " ").trim()).toBe(
			TAGLINE_BEFORE + TAGLINE_LINK + TAGLINE_AFTER,
		);
		expect(next?.querySelector("a")?.getAttribute("href")).toBe(LINKS.stemShovel);
	});
	test("links to the syntax, GitHub, npm and the article", () => {
		const hrefs = [...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"));
		for (const href of ["/syntax", LINKS.github, LINKS.npm, LINKS.article])
			expect(hrefs).toContain(href);
	});
	test("the source window holds the demo chart", () => {
		expect(doc.querySelector("textarea")?.textContent).toBe(demo);
	});
	test("the render window shows the chart without JavaScript", () => {
		const template = doc.querySelector("barmark-chart template[shadowrootmode=open]");
		expect(template?.innerHTML).toContain("Peaceful Dreams");
	});
	test("has a title, canonical URL and Open Graph tags", () => {
		expect(doc.title).toBe("barmark: plain-text chord charts");
		expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
			"https://barmark.dev/",
		);
		expect(doc.querySelector('meta[property="og:title"]')).not.toBeNull();
		expect(doc.querySelector('meta[property="og:description"]')).not.toBeNull();
		expect(doc.querySelector('meta[name="description"]')).not.toBeNull();
	});
	test("no inline styles outside the chart", () => {
		const styled = [...doc.querySelectorAll("[style]")].filter(
			(el) => !el.closest("barmark-chart"),
		);
		expect(styled.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
	});
});
