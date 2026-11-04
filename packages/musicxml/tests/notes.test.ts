import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { pitchesOf } from "../src/notes.js";
import { measures, notes, xmlOf } from "./helpers.js";

const noteSet = (text: string) => {
	const slot = parseChart(`| ${text} |`).bars[0]?.slots[0];
	if (slot?.kind !== "chord") throw new Error(text);
	return slot.chord;
};
const pitchText = (n: string) => {
	const step = /<step>(\w)<\/step>/.exec(n)?.[1];
	const alter = /<alter>(-?\d)<\/alter>/.exec(n)?.[1];
	const octave = /<octave>(\d)<\/octave>/.exec(n)?.[1];
	return `${step}${alter === "1" ? "#" : alter === "-1" ? "b" : ""}${octave}`;
};

describe("notes", () => {
	test("pitches keep written octaves, and rise from octave 4 without them", () => {
		expect(pitchesOf(noteSet("{C E G}"))).toEqual([
			{ step: "C", alter: 0, octave: 4 },
			{ step: "E", alter: 0, octave: 4 },
			{ step: "G", alter: 0, octave: 4 },
		]);
		expect(pitchesOf(noteSet("{G B D F}")).map((p) => p.octave)).toEqual([4, 4, 5, 5]);
		expect(pitchesOf(noteSet("{E2 Bb2}"))).toEqual([
			{ step: "E", alter: 0, octave: 2 },
			{ step: "B", alter: -1, octave: 2 },
		]);
	});
	test("a note set is a chord of real notes, with slash style off in its bar", () => {
		const [m] = measures(xmlOf("| {C E G} |"));
		const ns = notes(m ?? "");
		expect(ns.map(pitchText)).toEqual(["C4", "E4", "G4"]);
		expect(ns.map((n) => n.includes("<chord/>"))).toEqual([false, true, true]);
		expect(m).not.toContain("<harmony>");
		expect(m).not.toContain("<notehead>slash</notehead>");
		expect(m).not.toContain('<slash type="start"');
	});
	test("slash style stops in a bar of notes and starts again after it", () => {
		const ms = measures(xmlOf("| C | {C E G} | D |"));
		expect(ms[0]).toContain('<slash type="start" use-stems="no"/>');
		expect(ms[1]).toContain('<slash type="stop"/>');
		expect(ms[2]).toContain('<slash type="start" use-stems="no"/>');
	});
	test("a voicing is the harmony over its notes", () => {
		const [m] = measures(xmlOf("| Cmaj7{E3 G3 B3} |"));
		expect(m).toMatch(/<harmony>[\s\S]*major-seventh[\s\S]*<\/harmony><note>/);
		expect(notes(m ?? "").map(pitchText)).toEqual(["E3", "G3", "B3"]);
	});
	test("a part of low note sets gets a bass clef", () => {
		expect(xmlOf("| {E2 B2} | {A2 E3} |")).toContain("<clef><sign>F</sign><line>4</line></clef>");
		expect(xmlOf("| {E2 B2} | {C E G} | {C E G} |")).toContain(
			"<clef><sign>G</sign><line>2</line></clef>",
		);
	});
	test("an accent, and a hit as accent plus staccato", () => {
		const [accent, , hit] = notes(measures(xmlOf("| >C ^G |"))[0] ?? "");
		expect(accent).toContain("<articulations><accent/></articulations>");
		expect(hit).toContain("<articulations><accent/><staccato/></articulations>");
	});
	test("words on a bar are words before their slot", () => {
		const [one, two] = measures(xmlOf('| "solo" D | A "fill" |'));
		expect(one).toMatch(
			/<direction placement="above"><direction-type><words>solo<\/words><\/direction-type><\/direction><harmony>/,
		);
		expect(two).toMatch(
			/<\/note><direction placement="above"><direction-type><words>fill<\/words>/,
		);
	});
	test("? is a slash note marked ?", () => {
		const [m] = measures(xmlOf("| ? |"));
		expect(m).toMatch(/<words>\?<\/words>[\s\S]*<notehead>slash<\/notehead>/);
		expect(m).not.toContain("<harmony>");
	});
});
