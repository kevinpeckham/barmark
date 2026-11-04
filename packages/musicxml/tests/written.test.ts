/** Instruments, transposition and clefs from the part line (barmark's grammar 7.3). */
import { describe, expect, test } from "bun:test";
import { writtenKey, writtenPitch } from "../src/written.js";
import { all, measures, notes, xmlOf } from "./helpers.js";

const TRUMPET = "part: Tpt = Trumpet, instrument: trumpet in Bb\nkey: C\n";
const pitchOf = (n: string) =>
	`${/<step>(\w)<\/step>/.exec(n)?.[1]}${/<alter>(-?\d)<\/alter>/.exec(n)?.[1] === "1" ? "#" : /<alter>-1<\/alter>/.test(n) ? "b" : ""}${/<octave>(\d)<\/octave>/.exec(n)?.[1]}`;

describe("writtenPitch and writtenKey", () => {
	test("a major second up, a major sixth, a ninth, an octave", () => {
		const c4 = { step: "C", alter: 0, octave: 4 };
		expect(writtenPitch(c4, { diatonic: 1, chromatic: 2 })).toEqual({
			step: "D",
			alter: 0,
			octave: 4,
		});
		expect(writtenPitch(c4, { diatonic: 5, chromatic: 9 })).toEqual({
			step: "A",
			alter: 0,
			octave: 4,
		});
		expect(writtenPitch(c4, { diatonic: 8, chromatic: 14 })).toEqual({
			step: "D",
			alter: 0,
			octave: 5,
		});
		expect(writtenPitch(c4, { diatonic: 7, chromatic: 12 })).toEqual({
			step: "C",
			alter: 0,
			octave: 5,
		});
		expect(
			writtenPitch({ step: "B", alter: -1, octave: 3 }, { diatonic: 1, chromatic: 2 }),
		).toEqual({
			step: "C",
			alter: 0,
			octave: 4,
		});
		expect(writtenPitch({ step: "E", alter: 0, octave: 4 }, { diatonic: 1, chromatic: 2 })).toEqual(
			{
				step: "F",
				alter: 1,
				octave: 4,
			},
		);
	});
	test("keys move by the interval's fifths", () => {
		expect(writtenKey(0, { diatonic: 1, chromatic: 2 })).toBe(2);
		expect(writtenKey(-1, { diatonic: 1, chromatic: 2 })).toBe(1);
		expect(writtenKey(0, { diatonic: 5, chromatic: 9 })).toBe(3);
		expect(writtenKey(3, { diatonic: 7, chromatic: 12 })).toBe(3);
	});
});

describe("instruments from the part line", () => {
	test("trumpet", () => {
		const xml = xmlOf(`${TRUMPET}| {C5} |\n`);
		const [first] = measures(xml);
		expect(all(first ?? "", "fifths")).toEqual(["2"]);
		expect(notes(first ?? "").map(pitchOf)).toEqual(["D5"]);
		expect(xml).toContain(
			"<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>",
		);
		expect(xml).toContain("<midi-program>57</midi-program>");
	});
	test("trumpet follows key changes", () => {
		const xml = xmlOf(`${TRUMPET}| {C5} |\nkey: F\n| {F4} |\n`);
		expect(all(xml, "fifths")).toEqual(["2", "1"]);
		expect(notes(measures(xml)[1] ?? "").map(pitchOf)).toEqual(["G4"]);
	});
	test("chords written", () => {
		const xml = xmlOf(`${TRUMPET}| C / Bb/D / |\n`);
		expect(all(xml, "root-step")).toEqual(["D", "C"]);
		expect(all(xml, "bass-step")).toEqual(["E"]);
	});
	test("alto and tenor", () => {
		const alto = xmlOf("part: As = Alto, instrument: alto sax\n| {C4} |\n");
		expect(notes(measures(alto)[0] ?? "").map(pitchOf)).toEqual(["A4"]);
		expect(alto).toContain(
			"<transpose><diatonic>-5</diatonic><chromatic>-9</chromatic></transpose>",
		);
		const tenor = xmlOf("part: Ts = Tenor, instrument: tenor sax\n| {C4} |\n");
		expect(notes(measures(tenor)[0] ?? "").map(pitchOf)).toEqual(["D5"]);
		expect(tenor).toContain(
			"<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic><octave-change>-1</octave-change></transpose>",
		);
	});
	test("the bass keeps its octave transposition", () => {
		const xml = xmlOf("part: Bs = Bass, instrument: electric bass\n| {E1} |\n");
		expect(notes(measures(xml)[0] ?? "").map(pitchOf)).toEqual(["E2"]);
		expect(xml).toContain(
			"<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>",
		);
	});
	test("clef: alto, fixed for the whole part", () => {
		const xml = xmlOf("part: Va = Viola, clef: alto\n| {C3} | {C6} | {C2} | {C6} |\n");
		expect(xml.match(/<clef>[\s\S]*?<\/clef>/g)).toEqual([
			"<clef><sign>C</sign><line>3</line></clef>",
		]);
	});
	test("named instrument over the guess", () => {
		const xml = xmlOf("part: Keys 2 = Bass Synth, instrument: synth\n| {C4} |\n");
		expect(xml).toContain("<staves>2</staves>");
		expect(xml).toContain("<midi-program>81</midi-program>");
	});
	test("clef: on a guessed keyboard: one staff", () => {
		const xml = xmlOf("part: Pno = Piano, clef: bass\n| {C3} |\n");
		expect(xml).not.toContain("<staves>");
		expect(xml.match(/<clef>[\s\S]*?<\/clef>/g)).toEqual([
			"<clef><sign>F</sign><line>4</line></clef>",
		]);
	});
});
