/** A chart's credits (barmark grammar 7.5) as `<creator>` and `<rights>`. */
import { describe, expect, test } from "bun:test";
import { xmlOf } from "./helpers.js";

const identification = (xml: string) =>
	/<identification>([\s\S]*?)<\/identification>/.exec(xml)?.[1]?.replace(/\s+</g, "<") ?? "";

describe("credits", () => {
	test("creators in role order, then the rights, before the encoding", () => {
		const xml = xmlOf(
			"copyright: E\narranger: D\ncomposer: A\ncomposer: B\nlyricist: C\ncopyright: F\n| G |",
		);
		expect(identification(xml)).toStartWith(
			'<creator type="composer">A</creator><creator type="composer">B</creator><creator type="lyricist">C</creator><creator type="arranger">D</creator><rights>E</rights><rights>F</rights><encoding>',
		);
	});
	test("values are escaped", () => {
		expect(xmlOf("composer: A & <B>\n| G |")).toContain(
			'<creator type="composer">A &amp; &lt;B&gt;</creator>',
		);
	});
	test("without credits the identification is the encoding alone", () => {
		expect(identification(xmlOf("| G |"))).toStartWith("<encoding>");
	});
	test("an exported part carries the chart's credits", () => {
		const xml = xmlOf("composer: A\npart: G = Gtr\npart: P = Pno\n\nG | C |\nP | D |", "P");
		expect(identification(xml)).toStartWith('<creator type="composer">A</creator>');
	});
});
