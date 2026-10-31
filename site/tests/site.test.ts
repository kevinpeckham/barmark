import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseChart } from "barmark";
import { HEADLINE, LINKS, TAGLINE_AFTER, TAGLINE_BEFORE, TAGLINE_LINK } from "../src/lib/site.ts";

const demo = await Bun.file(join(import.meta.dir, "../src/lib/demo.chart.md")).text();

describe("site copy", () => {
	test("the headline is the project in one sentence", () => {
		expect(HEADLINE).toBe(
			"A markdown-inspired plain-text notation for chord charts that bands and machines can both read.",
		);
	});
	test("the second sentence names Stem Shovel", () => {
		expect(TAGLINE_BEFORE + TAGLINE_LINK + TAGLINE_AFTER).toBe(
			"barmark was developed as part of Stem Shovel, an open-source platform for musician collaboration.",
		);
	});
	test("every link is https", () => {
		for (const url of Object.values(LINKS)) expect(url).toStartWith("https://");
	});
});

describe("the demo chart", () => {
	const chart = parseChart(demo);
	test("parses cleanly", () => {
		expect(chart.diagnostics).toEqual([]);
	});
	test("is Peaceful Dreams, opening to outro", () => {
		expect(chart.title).toBe("Peaceful Dreams");
		expect(chart.sections.map((s) => s.name)).toEqual([
			"Intro",
			"Verse",
			"Chorus",
			"Verse",
			"Chorus",
			"Outro",
		]);
	});
});
