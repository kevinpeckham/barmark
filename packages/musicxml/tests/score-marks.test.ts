/** A score's marks shown once, and the review's minors on running values, endings, short values and open repeats. */
import { describe, expect, test } from "bun:test";
import { all, measures, notes, xmlOf } from "./helpers.js";
import { expected, play } from "./play.js";

const BAND = `part: Gtr = Guitar
part: Bs = Bass

## Verse
Gtr | @A | G | C |
Bs  | @A | {G1} | {C2} |
`;

describe("headings and rehearsal marks belong to the score", () => {
	/** Each direction of a measure that holds `inner`, as XML. */
	const holding = (measure: string, inner: string) =>
		(measure.match(/<direction[ >][\s\S]*?<\/direction>/g) ?? []).filter((d) => d.includes(inner));
	test("every part writes them, shown once over the top part (system only-top)", () => {
		const xml = xmlOf(BAND);
		for (const part of ["P1", "P2"]) {
			const [first] = measures(xml, part);
			for (const inner of [">Verse</words>", "<rehearsal>A</rehearsal>"]) {
				const found = holding(first ?? "", inner);
				expect(found).toHaveLength(1);
				expect(found[0]).toContain('system="only-top"');
			}
		}
	});
	test("so do tempo, feel and jumps", () => {
		const xml = xmlOf("tempo: 96, feel: swing\n| D | Segno | G | A | D.S. |");
		for (const inner of ["<metronome", ">swing</words>", "<segno/>", ">D.S.</words>"])
			expect(holding(xml, inner).every((d) => d.includes('system="only-top"'))).toBe(true);
	});
	test("a part's own words don't", () => {
		const xml = xmlOf(`${BAND}### play softly\n`);
		expect(holding(xml, "play softly")[0]).not.toContain("system=");
	});
	test("a part exported alone keeps them", () => {
		const [only] = measures(xmlOf(BAND, "Bs"));
		expect(only).toContain(">Verse</words>");
		expect(only).toContain("<rehearsal>A</rehearsal>");
	});
	test("every part keeps its own chord symbols", () => {
		const xml = xmlOf(BAND.replace("Bs  | @A | {G1} | {C2} |", "Bs  | @A | Em{E1} | C{C2} |"));
		expect(all(measures(xml, "P1").join(""), "root-step")).toEqual(["G", "C"]);
		expect(all(measures(xml, "P2").join(""), "root-step")).toEqual(["E", "C"]);
	});
});

describe("a bar no pass plays", () => {
	const CODA =
		"key: D, time: 3/4, tempo: 90\n| D | To Coda | G |\n| D.C. al Coda | E |\n| Coda | A | D |";
	test("keeps the running meter, key and tempo, so the next bar changes nothing", () => {
		const xml = xmlOf(CODA);
		expect(all(xml, "beats")).toEqual(["3"]);
		expect(all(xml, "fifths")).toEqual(["2"]);
		expect(xml.match(/<metronome/g)).toHaveLength(1);
	});
});

describe("the last ending", () => {
	test("plays on into the next bar, so a push across it is written early", () => {
		const text = "|: D |\n|1 G :|\n|2 A |\n| <E |";
		const xml = xmlOf(text);
		expect(play(xml)).toEqual(expected(text));
		expect(xml).not.toContain("<words>push</words>");
	});
});

describe("values shorter than a 128th", () => {
	test("fill exactly the time they take", () => {
		const group = Array.from({ length: 128 }, () => "C").join("_");
		const xml = xmlOf(`time: 1/16\n| ${group} |`);
		const durations = notes(measures(xml)[0] ?? "").map((n) =>
			Number(/<duration>(\d+)/.exec(n)?.[1]),
		);
		const divisions = Number(all(xml, "divisions")[0]);
		expect(durations.reduce((a, b) => a + b, 0)).toBe(divisions / 4);
		expect(all(xml, "type").every((t) => t === "1024th")).toBe(true);
	});
});

describe("an open repeat", () => {
	test("writes times=1, so notation programs play it once, as barmark does", () => {
		const text = "| G | C | x ...\n| E |";
		const xml = xmlOf(text);
		expect(xml).toContain('<repeat direction="backward" times="1"/>');
		expect(play(xml)).toEqual(expected(text));
	});
});
