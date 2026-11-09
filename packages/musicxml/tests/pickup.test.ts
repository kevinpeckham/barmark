/** A first bar in a one-bar meter shorter than the running one is a pickup (grammar 2.4): measure 0, implicit, under the running meter. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { importMusicXml } from "../src/index.js";
import { AMAZING_GRACE } from "./charts.js";
import { all, measures, xmlOf } from "./helpers.js";

const opening = (m: string) => /<measure [^>]*>/.exec(m)?.[0] ?? "";

describe("a pickup", () => {
	test("is measure 0, implicit, in the running meter, with no time of its own", () => {
		const xml = xmlOf("time: 3/4\n| [1/4] C | D | E |");
		const ms = measures(xml);
		expect(opening(ms[0] ?? "")).toBe('<measure number="0" implicit="yes" text="0">');
		expect(opening(ms[1] ?? "")).toBe('<measure number="1" text="1">');
		expect(all(xml, "beats")).toEqual(["3"]);
		expect(ms[0]).toContain("<beats>3</beats><beat-type>4</beat-type>");
	});
	test("in 6/8 counts eighths, as MuseScore's import does", () => {
		const xml = xmlOf("time: 6/8, tempo: 60\n| [2/8] E7 | Am | Dm |");
		expect(opening(measures(xml)[0] ?? "")).toContain('implicit="yes"');
		expect(all(xml, "beats")).toEqual(["6"]);
	});
	test("every part's first measure is the pickup", () => {
		const xml = xmlOf(
			"part: Gtr = Guitar\npart: Bs = Bass\nGtr | [1/4] C | D |\nBs | [1/4] C | D |",
		);
		for (const p of ["P1", "P2"])
			expect(opening(measures(xml, p)[0] ?? "")).toContain('implicit="yes"');
	});
	test("reads back as the same pickup", () => {
		for (const chart of [
			"time: 3/4\n| [1/4] C | D | E |",
			"time: 6/8, tempo: 60\n| [2/8] E7 | Am | Dm |",
			AMAZING_GRACE,
		]) {
			const back = importMusicXml(xmlOf(chart)).text ?? "";
			expect(back).toContain(chart.includes("[2/8]") ? "[2/8]" : "[1/4]");
			expect(back).not.toMatch(/^time: 1\/4/m);
		}
	});
	test("in 4/4: measure 0 text 0, then measure 1 text 1", () => {
		const ms = measures(xmlOf("time: 4/4\n| [1/4] G | C | D |"));
		expect(ms.map(opening)).toEqual([
			'<measure number="0" implicit="yes" text="0">',
			'<measure number="1" text="1">',
			'<measure number="2" text="2">',
		]);
	});
	test("into a time: line, the pickup shows the meter it leads into", () => {
		const ms = measures(xmlOf("| [1/4] D |\ntime: 3/4\n| G | C |"));
		expect(opening(ms[0] ?? "")).toBe('<measure number="0" implicit="yes" text="0">');
		expect(ms[0]).toContain("<beats>3</beats><beat-type>4</beat-type>");
		expect(ms[1]).not.toContain("<time>");
	});
	test("[1/4] in 6/8 is measure 0, not implicit: it keeps its own time signature (an implicit bar would read back [2/8])", () => {
		const ms = measures(xmlOf("time: 6/8\n| [1/4] G | C |"));
		expect(opening(ms[0] ?? "")).toBe('<measure number="0" text="0">');
		expect(ms[0]).toContain("<beats>1</beats><beat-type>4</beat-type>");
		expect(opening(ms[1] ?? "")).toBe('<measure number="1" text="1">');
		expect(ms[1]).toContain("<beats>6</beats><beat-type>8</beat-type>");
	});
	test("a chart that is only one short bar is not a pickup", () => {
		const ms = measures(xmlOf("| [1/4] G |"));
		expect(opening(ms[0] ?? "")).toBe('<measure number="1" text="1">');
	});
	test("lyric rows stay on their bars: the pickup's syllable is in measure 0", () => {
		const xml = xmlOf("time: 3/4\n| [1/4] D | G | C |\nlyrics: | A- | maz- ing | grace |");
		const lyrics = (m: string) => [...m.matchAll(/<text>([^<]*)<\/text>/g)].map((x) => x[1]);
		const staff =
			xml.match(
				/<part id="P\d+">(?:(?!<\/part>)[\s\S])*?<\?barmark lyrics\?>[\s\S]*?<\/part>/,
			)?.[0] ?? "";
		const ms = staff.match(/<measure [\s\S]*?<\/measure>/g) ?? [];
		expect(ms.map((m) => [/text="(\d+)"/.exec(m)?.[1], lyrics(m)])).toEqual([
			["0", ["A"]],
			["1", ["maz", "ing"]],
			["2", ["grace"]],
		]);
	});
	test("a first bar that is no pickup keeps its own time signature and counts from 1", () => {
		for (const chart of [
			"| [5/4] C | D |",
			"| C | [1/4] D | E |",
			"| [2/4] G | % | D |",
			"| [1/4] G | [2/4] C | D |",
		]) {
			const ms = measures(xmlOf(chart));
			expect(ms.join("")).not.toContain('implicit="yes"');
			expect(opening(ms[0] ?? "")).toStartWith('<measure number="1" text="1"');
		}
	});
});

describe("importing a score that opens with a pickup", () => {
	for (const name of ["hymn", "dorico-hymn", "six-guitars"])
		test(`${name}: the self-check finds nothing`, () => {
			const xml = readFileSync(
				new URL(`fixtures/import/${name}.musicxml`, import.meta.url),
				"utf8",
			);
			const bugs = importMusicXml(xml).diagnostics.filter((d) =>
				d.message.startsWith("importer bug"),
			);
			expect(bugs).toEqual([]);
		});
});
