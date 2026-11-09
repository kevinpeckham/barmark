/** A first bar in a one-bar meter shorter than the running one is a pickup: implicit, under the running meter. */
import { describe, expect, test } from "bun:test";
import { importMusicXml } from "../src/index.js";
import { AMAZING_GRACE } from "./charts.js";
import { all, measures, xmlOf } from "./helpers.js";

const opening = (m: string) => /<measure [^>]*>/.exec(m)?.[0] ?? "";

describe("a pickup", () => {
	test("is measure 0, implicit, in the running meter, with no time of its own", () => {
		const xml = xmlOf("time: 3/4\n| [1/4] C | D | E |");
		const ms = measures(xml);
		expect(opening(ms[0] ?? "")).toBe('<measure number="0" implicit="yes" text="1">');
		expect(opening(ms[1] ?? "")).toBe('<measure number="1" text="2">');
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
	test("a first bar MusicXML's pickup can't say keeps its own time signature", () => {
		// An implicit bar reads back in the running meter's beat: [1/4] in 6/8 would come back [2/8].
		for (const chart of [
			"time: 6/8\n| [1/4] C | D |",
			"| [5/4] C | D |",
			"| C | [1/4] D | E |",
			"| [2/4] G | % | D |",
		]) {
			const ms = measures(xmlOf(chart));
			expect(ms.join("")).not.toContain('implicit="yes"');
			expect(opening(ms[0] ?? "")).toStartWith('<measure number="1"');
		}
	});
});
