/** Part lines as staves and voices (barmark's grammar 7.6). */
import { describe, expect, test } from "bun:test";
import { voicesFor } from "../src/measure-xml.js";
import { AMAZING_GRACE } from "./charts.js";
import { measures, notes, xmlOf } from "./helpers.js";

const MORNING = `# Morning Song
part: Pno = Piano, instrument: piano
part: Bs = Bass, instrument: electric bass

## Verse
Pno.RH | G{B3 D4 G4} | C{C4 E4 G4} | D{D4 F#4 A4} | G{B3 D4 G4} |
Pno.LH | {G2}        | {C3}        | {D3} / {F#2} / | {G2}       |
Bs     | {G1}        | {C2}        | {D2}         | {G1}         |
`;

const tag = (n: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(n)?.[1];
/** Each note's pitch (or "rest"), voice, staff and stem. */
const placed = (measure: string) =>
	notes(measure).map((n) => [
		n.includes("<rest") ? "rest" : `${tag(n, "step")}${tag(n, "octave")}`,
		Number(tag(n, "voice")),
		Number(tag(n, "staff") ?? 0),
		tag(n, "stem") ?? null,
	]);

describe("voicesFor", () => {
	test("two staves: RH, LH, then a second voice on each", () => {
		expect(voicesFor(2, 4)).toEqual([
			{ voice: 1, staff: 1 },
			{ voice: 5, staff: 2 },
			{ voice: 2, staff: 1 },
			{ voice: 6, staff: 2 },
		]);
		expect(voicesFor(1, 2)).toEqual([
			{ voice: 1, staff: 1 },
			{ voice: 2, staff: 1 },
		]);
	});
});

describe("part lines in MusicXML", () => {
	test("piano lines: RH on the upper staff, LH on the lower, no middle-C split", () => {
		const xml = xmlOf(MORNING);
		const [first, , third] = measures(xml, "P1");
		expect(placed(first ?? "")).toEqual([
			["B3", 1, 1, null],
			["D4", 1, 1, null],
			["G4", 1, 1, null],
			["G2", 5, 2, null],
		]);
		expect(placed(third ?? "").filter(([, v]) => v === 5)).toEqual([
			["D3", 5, 2, null],
			["F2", 5, 2, null],
		]);
		expect(measures(xml)).toHaveLength(4);
		expect(measures(xml, "P2")).toHaveLength(4);
	});
	test("a bare chord line beside a piano's hands: harmony over the RH, hands on their staves (7.6)", () => {
		const xml = xmlOf(
			"part: Pno = Piano, instrument: piano\nPno | Cmaj7 |\nPno.RH | {E4 G4 B4} |\nPno.LH | {C2} |\n",
		);
		const [first = ""] = measures(xml, "P1");
		expect(placed(first)).toEqual([
			["E4", 1, 1, null],
			["G4", 1, 1, null],
			["B4", 1, 1, null],
			["C2", 5, 2, null],
		]);
		expect(first.match(/<harmony>/g)).toHaveLength(1);
		expect(first).toMatch(/<\/harmony><note><pitch><step>E<\/step>/);
		expect(first).not.toContain("<notehead>slash</notehead>");
		expect(first).not.toContain('<slash type="start"');
	});
	test("the spec's lead sheet: one voice, each chord symbol before the note it falls on (7.6, 7.7)", () => {
		const xml = xmlOf(AMAZING_GRACE);
		const bars = measures(xml, "P1");
		expect(bars).toHaveLength(5);
		for (const bar of bars) {
			expect(notes(bar).every((n) => tag(n, "voice") === "1")).toBe(true);
			expect(bar).not.toContain("<notehead>slash</notehead>");
			expect(bar).not.toContain("<measure-style>");
		}
		// Each chord symbol's kind, and the note it stands right before.
		const chords = (bar: string) =>
			[...bar.matchAll(/<kind[^>]*>(\w+)<\/kind><\/harmony><note><pitch><step>([A-G])/g)].map(
				(m) => `${m[1]} ${m[2]}`,
			);
		expect(chords(bars[0] ?? "")).toEqual(["none D"]);
		expect(chords(bars[1] ?? "")).toEqual(["major G"]);
		expect(chords(bars[2] ?? "")).toEqual(["major B", "dominant A"]);
		expect(chords(bars[3] ?? "")).toEqual(["major G"]);
		expect(bars.join("")).not.toContain("<offset>");
	});
	test("a hands-only system beside a bare-plus-hands one exports as it did without the bare line", () => {
		const hands = "Pno.RH | {F4} |\nPno.LH | {F2} |\n";
		const head = "part: Pno = Piano, instrument: piano\n";
		const withBare = xmlOf(`${head}Pno | C |\nPno.RH | {E4} |\nPno.LH | {C2} |\n---\n${hands}`);
		const without = xmlOf(`${head}Pno.RH | {E4} |\nPno.LH | {C2} |\n---\n${hands}`);
		expect(measures(withBare, "P1")[1]).toBe(measures(without, "P1")[1]);
	});
	test("a bare line with notes of its own beside named lines is the next voice on staff 1", () => {
		const xml = xmlOf(
			"part: Pno = Piano, instrument: piano\nPno | {G3 C4} |\nPno.RH | {E4} |\nPno.LH | {C2} |\n",
		);
		expect(placed(measures(xml, "P1")[0] ?? "")).toEqual([
			["E4", 1, 1, "up"],
			["C2", 5, 2, null],
			["G3", 2, 1, "down"],
			["C4", 2, 1, "down"],
		]);
		const lead = xmlOf(
			"part: Vox = Voice, instrument: voice\nVox | {D4} |\nVox.Mel | {G4} / {B4} / |\n",
		);
		expect(placed(measures(lead, "P1")[0] ?? "").map(([p, v]) => [p, v])).toEqual([
			["G4", 1],
			["B4", 1],
			["D4", 2],
		]);
	});
	test("a bare line alone in a system plays where the first line would", () => {
		const xml = xmlOf(
			"part: Pno = Piano, instrument: piano\nPno | C |\nPno.RH | {E4} |\nPno.LH | {C2} |\n---\nPno | {D4} |\n",
		);
		expect(placed(measures(xml, "P1")[1] ?? "")).toEqual([
			["D4", 1, 1, null],
			["rest", 5, 2, null],
		]);
	});
	test("a resting line: the lower staff rests", () => {
		const xml = xmlOf(`${MORNING}\nPno.RH | Em{E4 G4 B4} |\nBs | {E1} |\n`);
		const last = measures(xml, "P1")[4] ?? "";
		expect(placed(last).filter(([, , s]) => s === 2)).toEqual([["rest", 5, 2, null]]);
		expect(last).toContain('<rest measure="yes"/>');
	});
	test("third line: voice 2, stems down, on the upper staff", () => {
		const xml = xmlOf(
			"part: Pno = Piano, instrument: piano\nPno.RH | {G4} / / / |\nPno.LH | {G2} / / / |\nPno.RH2 | {D4} {E4} {F4} {G4} |\n",
		);
		const m = placed(measures(xml)[0] ?? "");
		expect(m.filter(([, v]) => v === 1).map((n) => n[3])).toEqual(["up"]);
		expect(m.filter(([, v]) => v === 2)).toEqual([
			["D4", 2, 1, "down"],
			["E4", 2, 1, "down"],
			["F4", 2, 1, "down"],
			["G4", 2, 1, "down"],
		]);
	});
	test("guitar two lines: one staff, voices 1 and 2", () => {
		const xml = xmlOf(
			"part: Gtr = Guitar, instrument: electric guitar\nGtr.1 | {E4} {G4} |\nGtr.2 | {E3} |\n",
		);
		expect(xml).not.toContain("<staves>");
		expect(placed(measures(xml)[0] ?? "")).toEqual([
			["E4", 1, 0, "up"],
			["G4", 1, 0, "up"],
			["E3", 2, 0, "down"],
		]);
	});
	test("an LH-only intro keeps the RH on the upper staff", () => {
		const xml = xmlOf(
			"part: Pno = Piano, instrument: piano\n## Intro\nPno.LH | {C3} |\n## Verse\nPno.RH | C{C4 E4 G4} |\nPno.LH | {C3} |\n",
		);
		const [intro, verse] = measures(xml);
		expect(placed(intro ?? "")).toEqual([
			["rest", 1, 1, null],
			["C3", 5, 2, null],
		]);
		expect(placed(verse ?? "").map(([p, v]) => [p, v])).toEqual([
			["C4", 1],
			["E4", 1],
			["G4", 1],
			["C3", 5],
		]);
	});
	test("export --part keeps the lines", () => {
		const xml = xmlOf(MORNING, "Pno");
		expect(placed(measures(xml)[0] ?? "").map(([, v]) => v)).toEqual([1, 1, 1, 5]);
	});
});
