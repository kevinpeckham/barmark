/** A score's marks shown once, and the review's minors on running values, endings, short values and open repeats. */
import { describe, expect, test } from "bun:test";
import { ownText as ownTextOf } from "../src/directions.js";
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
	test("the top part writes them, shown once over it (system only-top)", () => {
		const [first] = measures(xmlOf(BAND), "P1");
		for (const inner of [">Verse</words>", "<rehearsal>A</rehearsal>"]) {
			const found = holding(first ?? "", inner);
			expect(found).toHaveLength(1);
			expect(found[0]).toContain('system="only-top"');
		}
	});
	test("the parts below don't, since Dorico ignores system and shows them over every staff", () => {
		const [first] = measures(xmlOf(BAND), "P2");
		expect(first).not.toContain(">Verse</words>");
		expect(first).not.toContain("<rehearsal>");
	});
	test("so do tempo, feel and jumps", () => {
		const xml = xmlOf(
			`${BAND}tempo: 96, feel: swing\nGtr | D | Segno | G | A | D.S. |\nBs  | {D2} | Segno | {G1} | {A1} | D.S. |\n`,
		);
		const [top, below] = ["P1", "P2"].map((p) => measures(xml, p).join(""));
		for (const inner of ["<metronome", ">swing</words>", "<segno/>", ">D.S.</words>"]) {
			expect(holding(top ?? "", inner).length).toBeGreaterThan(0);
			expect(holding(top ?? "", inner).every((d) => d.includes('system="only-top"'))).toBe(true);
			expect(below).not.toContain(inner);
		}
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

describe("the description belongs to the score", () => {
	const DESCRIBED = `A slow one, every note a quarter.\n${BAND}`;
	test("the top part writes it, once", () => {
		const xml = xmlOf(DESCRIBED);
		expect(xml.match(/every note a\u00a0quarter\./g)).toHaveLength(1);
		expect(measures(xml, "P1")[0]).toContain("every note a\u00a0quarter.");
		expect(measures(xml, "P2")[0]).not.toContain("quarter");
	});
	test("a part exported alone writes it", () => {
		expect(xmlOf(DESCRIBED, "Bs")).toContain("every note a\u00a0quarter.");
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
	test("after a one-bar meter, keeps the time: meter and its tempo (grammar 2.4)", () => {
		const chart =
			"key: D, time: 6/8, tempo: 60\n| D | To Coda |\ntempo: rit.\n| [2/8] G |\n| D.C. al Coda | E |\n| Coda | A | D |";
		const ms = measures(xmlOf(chart));
		expect(ms[2]).toContain("<beats>6</beats><beat-type>8</beat-type>");
		expect(ms[2]).not.toContain('<sound tempo="30"/>');
		expect(ms[3]).not.toContain("<beats>");
		const own = measures(xmlOf(chart.replace("| E |", "| [3/4] E |")));
		expect(own[2]).toContain("<beats>3</beats><beat-type>4</beat-type>");
		expect(own[2]).toContain('<sound tempo="90"/>');
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

describe("a lone word A", () => {
	/** Dorico reads a lone "a" as the article in "a tempo" and drops it. */
	const NBSP = " ";
	test("a heading A keeps its letter: a no-break space follows it", () => {
		const xml = xmlOf("## A\n| G | C |\n## A section\n| D |");
		expect(xml).toContain(`>A${NBSP}</words>`);
		expect(xml).toContain(`>A${NBSP}section</words>`);
	});
	test("so does a text line, in either case", () => {
		const xml = xmlOf("| G | C |\n### a cappella\n");
		expect(xml).toContain(`>a${NBSP}cappella</words>`);
	});
	test("so does every lone a, not only a leading one", () => {
		// Shenandoah's "every note a quarter." read "every note  quarter." in Dorico.
		const xml = xmlOf("every note a quarter.\n\n## Plan A\n| G | C |\n### a, then A or a\n");
		expect(xml).toContain(`>every note a${NBSP}quarter.</words>`);
		expect(xml).toContain(`>Plan A${NBSP}</words>`);
		expect(xml).toContain(`>a, then A${NBSP}or a${NBSP}</words>`);
	});
	test("an a before a tab or a line break is held too", () => {
		expect(ownTextOf("a\tb")).toBe("a\u00a0b");
		expect(ownTextOf("Plan a\n")).toBe("Plan a\u00a0");
	});
	test("a word holding an a is written as it is", () => {
		const xml = xmlOf("## Abba, a.k.a. B\n| G |\n### Sara and band (a)\n");
		expect(xml).toContain(">Abba, a.k.a. B</words>");
		expect(xml).toContain(">Sara and band (a)</words>");
	});
	test("other text, and barmark's own a tempo, are written as they are", () => {
		const xml = xmlOf("tempo: 120\n## Abba\n| G |\ntempo: rit.\n| C |\ntempo: a tempo\n| D |");
		expect(xml).toContain(">Abba</words>");
		expect(xml).toContain(">a tempo</words>");
		expect(xml).not.toContain(`${NBSP}tempo`);
	});
});
