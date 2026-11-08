/** Instruments from the part's name (the notation design, section 4). */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { instrumentOf } from "../src/instruments.js";
import { measures, notes, xmlOf } from "./helpers.js";
import { sounding } from "./sounding.js";

const kind = (name: string) => instrumentOf({ name })?.kind ?? null;
const pitch = (n: string) =>
	`${/<step>(\w)<\/step>/.exec(n)?.[1]}${/<octave>(\d)<\/octave>/.exec(n)?.[1]}`;
const threeParts = readFileSync(new URL("fixtures/three-parts.chart.md", import.meta.url), "utf8");

describe("instrumentOf", () => {
	test("bass: alone, or with the words a bass guitar is called by", () => {
		for (const name of ["Bass Guitar", "Electric Bass", "Bass", "upright bass", "Fretless Bass 2"])
			expect(kind(name)).toBe("bass");
	});
	test("not a bass: a bassoon, a bass voice", () => {
		expect(kind("Bassoon")).toBeNull();
		expect(kind("Bass Voice")).toBeNull();
	});
	test("guitar, unless it is a bass guitar", () => {
		expect(kind("Acoustic Guitar")).toBe("guitar");
		expect(instrumentOf({ name: "Guitar", label: "Gtr" })?.kind).toBe("guitar");
		expect(kind("Bass Guitar")).not.toBe("guitar");
	});
	test("keyboards", () => {
		for (const name of ["Piano", "Keys", "Rhodes", "Synth Pad", "Organ", "Keyboards"])
			expect(kind(name)).toBe("keyboard");
	});
	test("anything else is unmatched", () => {
		expect(kind("Vocals")).toBeNull();
		expect(instrumentOf(null)).toBeNull();
	});
});

describe("the export", () => {
	test("a bass part is written an octave up in bass clef, and sounds where it plays", () => {
		const xml = xmlOf("part: Bass = Bass Guitar\n| {G2} | {E3} |");
		const [one = "", two = ""] = measures(xml);
		expect(pitch(notes(one)[0] ?? "")).toBe("G3");
		expect(one).toContain(
			"<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>",
		);
		expect(one).toContain("<clef><sign>F</sign><line>4</line></clef>");
		expect(two).not.toContain("<clef>");
		expect(xml).toContain("<instrument-name>Electric Bass</instrument-name>");
		expect(xml).toContain("<midi-program>34</midi-program>");
		expect(sounding(xml).notes.map((n) => n.pitch)).toEqual([43, 52]);
	});
	test("a bass part keeps its clef where its bars sit high", () => {
		const xml = xmlOf("part: Bass\n| {E2} | {E4} | {G4} | {C5} |");
		expect(measures(xml).filter((m) => m.includes("<clef>"))).toHaveLength(1);
	});
	test("a guitar part is in treble 8vb, its notes where they sound", () => {
		const xml = xmlOf("part: Gtr = Electric Guitar\n| {E3} |");
		const [m = ""] = measures(xml);
		expect(m).toContain(
			"<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>",
		);
		expect(m).not.toContain("<transpose>");
		expect(pitch(notes(m)[0] ?? "")).toBe("E3");
		expect(xml).toContain("<instrument-name>Electric Guitar</instrument-name>");
		expect(xml).toContain("<midi-program>28</midi-program>");
	});
	test("an acoustic guitar sounds as one: barmark's listed acoustic guitar", () => {
		// Shenandoah's "Acoustic Guitar" was exported as Electric Guitar, program 28.
		const guessed = xmlOf("part: Gtr = Acoustic Guitar\n| C |");
		const named = xmlOf("part: Gtr = Gtr, instrument: acoustic guitar\n| C |");
		for (const xml of [guessed, named]) {
			expect(xml).toContain("<instrument-name>Acoustic guitar</instrument-name>");
			expect(xml).toContain("<midi-program>26</midi-program>");
			expect(xml).toContain("<clef-octave-change>-1</clef-octave-change>");
		}
		expect(instrumentOf({ name: "Acoustic Guitar 2" })?.program).toBe(26);
		expect(instrumentOf({ name: "Guitar" })?.program).toBe(28);
	});
	test("a guitar's slashes sit on its staff's middle line", () => {
		const [m = ""] = measures(xmlOf("part: Guitar\n| C |"));
		expect(pitch(notes(m)[0] ?? "")).toBe("B3");
	});
	test("an unmatched part has no instrument", () => {
		const xml = xmlOf("part: Vox = Vocals\n| C |");
		expect(xml).not.toContain("<score-instrument");
		expect(xml).not.toContain("<transpose>");
	});
	test("Three Parts: the bass sounds at G2, written at G3", () => {
		const xml = xmlOf(threeParts);
		expect(pitch(notes(measures(xml, "P1")[0] ?? "")[0] ?? "")).toBe("G3");
		expect(sounding(xml, "P1").notes[0]?.pitch).toBe(43);
		expect(xml).toContain("<instrument-name>Piano</instrument-name>");
		expect(xml).toContain("<midi-program>1</midi-program>");
	});
});
