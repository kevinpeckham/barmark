/** Keyboard parts on two staves (the notation design, section 5): split at middle C, one voice a staff. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MORNING_SONG } from "../../barmark/tests/chart/morning-song.js";
import { measures, xmlOf } from "./helpers.js";

const piano = (bars: string) => xmlOf(`part: Pno = Piano\n${bars}`);
/** Every <note> of a measure, hidden ones included. */
const allNotes = (m: string) => m.match(/<note[ >][\s\S]*?<\/note>/g) ?? [];
/** A staff's notes as text: pitches ("G4", chord members joined by +) or "r", each with its type. */
function staff(m: string, n: 1 | 2): string[] {
	const out: string[] = [];
	for (const note of allNotes(m)) {
		if (!note.includes(`<staff>${n}</staff>`)) continue;
		const step = /<step>(\w)<\/step>/.exec(note)?.[1];
		const name = step ? `${step}${/<octave>(\d)<\/octave>/.exec(note)?.[1]}` : "r";
		const type = /<type>(\w+)<\/type>/.exec(note)?.[1] ?? "bar";
		if (note.includes("<chord/>"))
			out[out.length - 1] = `${out[out.length - 1]?.split(":")[0]}+${name}:${type}`;
		else out.push(`${name}:${type}`);
	}
	return out;
}
const threeParts = readFileSync(new URL("fixtures/three-parts.chart.md", import.meta.url), "utf8");

describe("two staves", () => {
	test("a note set splits at middle C", () => {
		const [m = ""] = measures(piano("| {G2 D3 B3 G4} |"));
		expect(staff(m, 1)).toEqual(["G4:whole"]);
		expect(staff(m, 2)).toEqual(["G2+D3+B3:whole"]);
	});
	test("an arpeggio moves between the staves note by note", () => {
		const m = measures(xmlOf(threeParts), "P2")[1] ?? "";
		expect(staff(m, 1)).toEqual([
			"r:eighth",
			"C4:16th",
			"E4:16th",
			"G4:16th",
			"C5:16th",
			"G4:16th",
			"C4+E4+G4:half",
		]);
		expect(staff(m, 2)).toEqual(["C3:16th", "E3:16th", "G3:16th", "r:16th", "r:quarter", "r:half"]);
	});
	test("a slash bar: slashes and chord symbols above, a whole-bar rest below", () => {
		const [m = ""] = measures(piano("| C |"));
		expect(staff(m, 1)).toEqual(["B4:quarter", "B4:quarter", "B4:quarter", "B4:quarter"]);
		const lower = allNotes(m).filter((n) => n.includes("<staff>2</staff>"));
		expect(lower).toHaveLength(1);
		expect(lower[0]).toStartWith('<note><rest measure="yes"/>');
		expect(m.indexOf("<harmony>")).toBeLessThan(m.indexOf("<backup>"));
	});
	test("two staves never turn slash style on: the notes are slashes, and Verovio slashed both staves", () => {
		const ms = measures(piano("| C | {C3 C4} | D |"));
		for (const m of ms) expect(m).not.toContain('<slash type="start"');
		// Alone, nothing turned slash style on: no measure-style at all.
		expect(ms.join("")).not.toContain("<measure-style");
		// After a slashed part, off in the first measure: Verovio carries slash style on from it.
		const after = xmlOf("part: Gtr = Guitar\npart: Pno = Piano\n| C | {C3 C4} | D |");
		const [first = "", ...rest] = measures(after, "P2");
		expect(first).toContain('<measure-style><slash type="stop"/></measure-style>');
		expect(rest.join("")).not.toContain("<measure-style");
		expect(staff(ms[0] ?? "", 1)).toEqual(["B4:quarter", "B4:quarter", "B4:quarter", "B4:quarter"]);
		expect(ms[0]).toContain("<notehead>slash</notehead>");
		expect(ms[0]).toContain("<stem>none</stem>");
	});
	test("each staff is its own voice, joined by a backup of the bar", () => {
		const xml = piano("| {C3 C4} |");
		const [m = ""] = measures(xml);
		const divisions = Number(/<divisions>(\d+)<\/divisions>/.exec(xml)?.[1]);
		expect(m).toContain(`<backup><duration>${4 * divisions}</duration></backup>`);
		const [upper = "", lower = ""] = m.split("<backup>");
		expect(upper).toContain("<voice>1</voice>");
		expect(upper).not.toContain("<voice>5</voice>");
		expect(lower).toContain("<voice>5</voice>");
	});
	test("two staves, treble and bass, set once", () => {
		const ms = measures(piano("| {C3 C4} | {E2 C6} |"));
		expect(ms[0]).toContain(
			'<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>',
		);
		expect(ms[1]).not.toContain("<clef");
	});
	test("a held note set ties on each staff", () => {
		const [one = "", two = ""] = measures(piano("| {B3 D4} | / |"));
		for (const [m, tie] of [
			[one, "start"],
			[two, "stop"],
		] as const)
			for (const s of [1, 2])
				expect(
					allNotes(m).find((n) => n.includes(`<staff>${s}</staff>`) && n.includes("<pitch>")),
				).toContain(`<tie type="${tie}"/>`);
	});
	test("a tacet bar rests on both staves", () => {
		const m = measures(xmlOf(MORNING_SONG), "P2")[8] ?? "";
		const rests = allNotes(m).filter((n) => n.includes('<rest measure="yes"/>'));
		expect(rests.map((n) => /<staff>(\d)<\/staff>/.exec(n)?.[1])).toEqual(["1", "2"]);
		expect(rests.every((n) => !n.includes("print-object"))).toBe(true);
	});
});
