import { beforeAll, describe, expect, test } from "bun:test";
import { parseChart, printChart, transposeChart } from "barmark";
import { LINKS } from "../src/lib/site.ts";
import { SAMPLE_CHART } from "../src/lib/start.ts";
import { build, page } from "./built.ts";

beforeAll(build, 120_000);

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim();

describe("the sample chart Get Started shows", () => {
	test("reads cleanly, as the page says it does", () => {
		const chart = parseChart(SAMPLE_CHART);
		expect(chart.diagnostics).toEqual([]);
		expect(chart.title).toBe("Example Song");
		expect(chart.bars.length).toBe(16);
		expect(chart.sections.map((s) => s.name)).toEqual(["Verse", "Chorus"]);
	});
	test("transposes and prints as the page says", () => {
		expect(transposeChart(SAMPLE_CHART, { to: "E" }).text).toContain("|: E | B | C#m | A :|");
		expect(printChart("| D / A / |")).toBe("| D A |\n");
	});
});

describe("Get Started, prerendered", () => {
	const doc = () => page("get-started.html");
	test("has its title and canonical link", () => {
		expect(doc().title).toBe("Get Started · Barmark");
		expect(doc().querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
			`${LINKS.origin}/get-started`,
		);
	});
	test("walks from writing a chart to the parser, the renderer and the element", () => {
		const steps = [...doc().querySelectorAll("main section > h2")].map(text);
		expect(steps).toEqual([
			"1. Write a chart",
			"2. Read it with the parser",
			"3. Render it as HTML",
			"4. Or use the web component",
		]);
		const page = text(doc().querySelector("main")) ?? "";
		for (const line of [
			"npm install barmark",
			"npm install @barmark/render",
			'import "@barmark/render/element";',
			"<barmark-chart",
			"renderChart(",
			"parseChart(",
		])
			expect(page).toContain(line);
	});
	test("shows the sample chart rendered", () => {
		expect(doc().querySelector("main barmark-chart template[shadowrootmode=open]")).not.toBeNull();
	});
});

describe("the FAQ, prerendered", () => {
	const doc = () => page("faq.html");
	test("has its title and canonical link", () => {
		expect(doc().title).toBe("FAQ · Barmark");
		expect(doc().querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
			`${LINKS.origin}/faq`,
		);
	});
	test("answers the questions asked, each with its own link", () => {
		const questions = [...doc().querySelectorAll("main h2[id]")].map(text);
		for (const q of [
			"What is Barmark?",
			"What is Stem Shovel?",
			"Who is behind Barmark?",
			"How is Barmark different from other chord notations?",
			"What is Barmark a good fit for?",
			"Is Barmark open source?",
		])
			expect(questions).toContain(q);
		const ids = [...doc().querySelectorAll("main h2[id]")].map((h) => h.id);
		expect(new Set(ids).size).toBe(ids.length);
		const contents = [...doc().querySelectorAll("main nav a")].map((a) => a.getAttribute("href"));
		expect(contents).toEqual(ids.map((id) => `#${id}`));
	});
	test("links to Stem Shovel, the code and the licence", () => {
		const hrefs = [...doc().querySelectorAll("main a")].map((a) => a.getAttribute("href"));
		expect(hrefs).toContain(LINKS.stemShovel);
		expect(hrefs).toContain(LINKS.github);
		expect(hrefs).toContain(LINKS.license);
	});
});

describe("the nav", () => {
	test("leads with Get Started and ends the pages with the FAQ", () => {
		const links = [...page("index.html").querySelectorAll("nav a")].map((a) => [
			a.getAttribute("href"),
			text(a),
		]);
		const pages = links.filter(([href]) => href?.startsWith("/") && href !== "/");
		expect(pages).toEqual([
			["/get-started", "Get Started"],
			["/syntax", "Syntax Guide"],
			["/try", "Try It"],
			["/faq", "FAQ"],
		]);
	});
});

describe("the name in prose", () => {
	// Barmark, the notation, is capitalized in text; the package name stays in code.
	for (const path of ["index.html", "syntax.html", "try.html", "get-started.html", "faq.html"])
		test(`${path} writes Barmark with a capital B`, () => {
			const doc = page(path);
			for (const el of doc.querySelectorAll("code, pre, script, style, template, barmark-chart"))
				el.remove();
			doc.querySelector("nav a[href='/']")?.remove(); // the wordmark
			const words = [doc.title, doc.querySelector("main")?.textContent ?? ""].join(" ");
			expect(words.match(/\bbarmark\b(?![./-])/g) ?? []).toEqual([]);
		});
});

describe("licences", () => {
	test("the FAQ names both: MIT for the code, CC BY 4.0 for the grammar", () => {
		const doc = page("faq.html");
		const hrefs = [...doc.querySelectorAll("main a")].map((a) => a.getAttribute("href"));
		expect(hrefs).toContain(LINKS.license);
		expect(hrefs).toContain(LINKS.specLicense);
		expect(text(doc.querySelector("#open-source")?.parentElement)).toContain("CC BY 4.0");
	});
	for (const path of ["index.html", "faq.html"])
		test(`${path}'s footer links both licences`, () => {
			const hrefs = [...page(path).querySelectorAll("footer a")].map((a) => a.getAttribute("href"));
			expect(hrefs).toContain(LINKS.license);
			expect(hrefs).toContain(LINKS.specLicense);
		});
});
