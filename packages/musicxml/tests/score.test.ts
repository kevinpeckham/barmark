import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChart } from "barmark";
import { MORNING_SONG } from "../../barmark/tests/chart/morning-song.js";
import { exportMusicXml, VERSION } from "../src/index.js";
import { validate } from "./schema.js";

const xmlOf = (text: string) => {
	const r = exportMusicXml(text);
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
	return r.xml;
};

describe("the score", () => {
	test("a chart with an error exports nothing", () => {
		const r = exportMusicXml("| H |");
		expect(r.ok).toBe(false);
		expect(r.diagnostics).toEqual(parseChart("| H |").diagnostics);
	});
	test("a title and a part name", () => {
		const xml = xmlOf("# Morning & Night\npart: Gtr = Guitar\n| G |");
		expect(xml).toContain("<work-title>Morning &amp; Night</work-title>");
		expect(xml).toContain('<score-part id="P1">');
		expect(xml).toContain("<part-name>Guitar</part-name>");
		expect(xml).toContain("<part-abbreviation>Gtr</part-abbreviation>");
	});
	test("a chart with no part: is one part named Chart", () => {
		const xml = xmlOf("| G |");
		expect(xml.match(/<score-part /g)).toHaveLength(1);
		expect(xml).toContain("<part-name>Chart</part-name>");
	});
	test("several parts are score-parts in score order", () => {
		const xml = xmlOf(MORNING_SONG);
		expect(
			[...xml.matchAll(/<score-part id="(P\d)">\s*<part-name>([^<]*)</g)].map((m) => [m[1], m[2]]),
		).toEqual([
			["P1", "Electric Guitar 1"],
			["P2", "Piano"],
		]);
		expect(xml).toContain('<part id="P2">');
	});
	test("the encoding names the software, at the package's version", () => {
		const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"));
		expect(VERSION).toBe(pkg.version);
		expect(xmlOf("| G |")).toContain(`<software>@barmark/musicxml ${VERSION}</software>`);
	});
	test("it validates", () => {
		for (const text of ["| G |", "# Morning & Night\npart: Gtr = Guitar\n| G |", MORNING_SONG])
			expect(validate(xmlOf(text))).toEqual([]);
	});
});
