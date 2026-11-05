import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { pitchesOf } from "../src/notes.js";
import { measures, notes, xmlOf } from "./helpers.js";
import { validate } from "./schema.js";

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
	test("slash style stops in a bar with a rest, so the rest shows", () => {
		const ms = measures(xmlOf("| C | G -- -- -- | D |"));
		expect(ms[1]).toContain('<slash type="stop"/>');
		expect(ms[2]).toContain('<slash type="start" use-stems="no"/>');
	});
	test("slash style stops in a part's tacet bars", () => {
		const chart =
			"part: Gtr = Guitar\npart: Pno = Piano\n\nGtr | G | C |\nPno | G | C |\nGtr | D | G |\n| C |";
		const [gtr9, pno9, pno13] = [
			measures(xmlOf(chart), "P1")[2],
			measures(xmlOf(chart), "P2")[2],
			measures(xmlOf(chart), "P2")[4],
		];
		expect(pno9).toContain('<rest measure="yes"/>');
		expect(pno9).toContain('<slash type="stop"/>');
		expect(pno13).toContain('<slash type="start" use-stems="no"/>');
		expect(gtr9).not.toContain("<slash ");
	});
	test("a voicing is the harmony over its notes", () => {
		const [m] = measures(xmlOf("| Cmaj7{E3 G3 B3} |"));
		expect(m).toMatch(/<harmony>[\s\S]*major-seventh[\s\S]*<\/harmony><note>/);
		expect(notes(m ?? "").map(pitchText)).toEqual(["E3", "G3", "B3"]);
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

	test("a marked root is a processing instruction on its note", () => {
		const xml = xmlOf("# R\n\n| {D3 E3! G3 B3} |\n");
		expect(xml).toContain("<note><?barmark root?><chord/>"); // E3 is the second note
		expect(xml.match(/<\?barmark root\?>/g)?.length).toBe(1);
		expect(validate(xml)).toEqual([]);
	});

	test("a voicing's marked root is marked too", () => {
		const xml = xmlOf("# R\n\n| C{E3! G3} |\n");
		expect(xml.match(/<\?barmark root\?>/g)?.length).toBe(1);
		expect(validate(xml)).toEqual([]);
	});

	test("no marker without a marked root", () => {
		expect(xmlOf("# R\n\n| {D3 E3 G3 B3} |\n")).not.toContain("<?barmark");
	});
});
