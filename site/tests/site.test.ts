import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseChart } from "barmark";
import {
	HEADLINE,
	LINKS,
	TAGLINE_AFTER,
	TAGLINE_BEFORE,
	TAGLINE_LINK,
	VALUE,
} from "../src/lib/site.ts";
import { build, page } from "./built.ts";

const demo = await Bun.file(
	join(import.meta.dir, "../src/lib/examples/peaceful-dreams.chart.md"),
).text();
/** Peaceful Dreams as Stem Shovel has it, kept in the repository's examples. */
const official = await Bun.file(
	join(import.meta.dir, "../../examples/peaceful-dreams.chart.md"),
).text();

describe("site copy", () => {
	test("the headline is the project in one sentence", () => {
		expect(HEADLINE).toBe(
			"A markdown-inspired plain-text notation for chord charts that bands and machines can both read.",
		);
	});
	test("the second sentence names Stem Shovel", () => {
		expect(TAGLINE_BEFORE + TAGLINE_LINK + TAGLINE_AFTER).toBe(
			"Barmark was developed as part of Stem Shovel, an open-source platform for musician collaboration.",
		);
	});
	test("then what it offers musicians and music apps", () => {
		expect(VALUE).toBe(
			"It gives musicians a way to write charts that is predictable, precise, and easy to read and write, so a band can agree on one style. And it gives modern music applications charts they can read, transpose and display exactly as the band means them.",
		);
	});
	test("every link is https", () => {
		for (const url of Object.values(LINKS)) expect(url).toStartWith("https://");
	});
});

describe("Peaceful Dreams, one of the examples", () => {
	const chart = parseChart(demo);
	test("parses cleanly", () => {
		expect(chart.diagnostics).toEqual([]);
	});
	test("is Peaceful Dreams exactly as the repository's example has it", () => {
		expect(demo).toBe(official);
	});
	test("is the whole song, opening to outro", () => {
		expect(chart.title).toBe("Peaceful Dreams");
		expect(chart.sections.map((s) => s.name)).toEqual([
			"Intro",
			"Verse",
			"Chorus",
			"Verse",
			"Chorus",
			"Bridge",
			"Verse (Triads)",
			"Verse",
			"Interlude",
			"Outro",
		]);
	});
});

describe("the lighter Verovio's licence", () => {
	beforeAll(build, 120_000);
	/** An element's text, its whitespace collapsed. */
	const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ") ?? "";
	test("the footer credits a modified build of Verovio and links its notice and release", () => {
		expect(LINKS.engraverNotice).toBe(
			"https://github.com/kevinpeckham/barmark/blob/engraver-v0.1.1/packages/engraver/NOTICE.md",
		);
		expect(LINKS.engraverRelease).toBe(
			"https://github.com/kevinpeckham/barmark/releases/tag/engraver-v0.1.1",
		);
		for (const path of ["index.html", "faq.html", "get-started.html"]) {
			const footer = page(path).querySelector("footer");
			expect(text(footer)).toContain(
				"scores engraved by a modified build of Verovio © Laurent Pugin and others, LGPL-3.0",
			);
			const hrefs = [...(footer?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
			expect(hrefs).toContain(LINKS.engraverNotice);
			expect(hrefs).toContain(LINKS.engraverRelease);
		}
	});
	test("the FAQ says the site loads a smaller build made by barmark, the CLI Verovio unmodified", () => {
		const answer = text(page("faq.html").querySelector("#verovio")?.parentElement);
		expect(answer).toContain("@barmark/engraver");
		expect(answer).toContain("smaller build");
		expect(answer).toContain("CLI's standalone binaries carry Verovio unmodified");
		expect(answer).not.toContain("loaded unchanged when a score is drawn");
	});
	test("Get Started shows the lighter build's attributes beside the stock ones", () => {
		const step = text(page("get-started.html").querySelector("#score")?.parentElement);
		for (const name of [
			"verovio-wasm-integrity",
			"ENGRAVER_CDN_URL",
			"ENGRAVER_CDN_INTEGRITY",
			"ENGRAVER_WASM_INTEGRITY",
			"@barmark/engraver",
			"VEROVIO_CDN_URL",
		])
			expect(step).toContain(name);
	});
});
