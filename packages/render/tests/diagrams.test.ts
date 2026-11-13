import { describe, expect, test } from "bun:test";
import { shapeText } from "@barmark/fretboard";
import { layoutChart } from "../src/index.js";
import type { LayoutOptions } from "../src/types.js";
import { AMAZING_GRACE } from "./fixtures.js";
import { MORNING_SONG } from "./morning-song.js";

const entries = (text: string, o: LayoutOptions = {}) =>
	layoutChart(text, { chordDiagrams: "guitar", ...o }).diagrams;
const names = (text: string, o?: LayoutOptions) =>
	entries(text, o).map((e) => e.chord.canonical + (e.voicing?.canonical ?? ""));

describe("diagram entries (design 4.2, 4.3, 5.2)", () => {
	test("off by default: no entries", () => {
		expect(layoutChart("| C | F | G | C |").diagrams).toEqual([]);
	});

	test("one entry a distinct chord, in written order", () => {
		expect(names("| C | Am | F | G |\n| C | Am | F | G7 |")).toEqual(["C", "Am", "F", "G", "G7"]);
	});

	test("a replay, a % and a hold add nothing", () => {
		expect(names("## Verse\n| C | % | F / | G |\n## Verse ->")).toEqual(["C", "F", "G"]);
	});

	test("nothing from N.C., silence, unknown slots or an error line", () => {
		// An unreadable slot is drawn, so its neighbours count; a line drawn as written is an error item.
		expect(names("| N.C. | -- | ? | C |\n| C | oops( | G |")).toEqual(["C", "G"]);
		expect(names("| C |\n| D | || Am")).toEqual(["C"]);
	});

	test("a name and the same name with a voicing are two entries", () => {
		const e = entries("| Cmaj7 | Cmaj7{E3 G3} |");
		expect(e.map((x) => x.voicing?.canonical ?? null)).toEqual([null, "{E3 G3}"]);
		expect(shapeText(e[1]?.shape as never)).toBe("xx20xx");
		expect(e[1]?.caveat).toBeNull();
	});

	test("a voicing that does not fit shows the name's shape, and says so", () => {
		const [e] = entries("| Cmaj7{E3 G3 B3 C4} |");
		expect(shapeText(e?.shape as never)).toBe("x32000");
		expect(e?.caveat).toBe("voicing-replaced");
	});

	test("a note set on a chord line: placed, or not playable; a single note is nothing", () => {
		const e = entries("| {C3 G3 E4} | {E1} | {C3 C3} |");
		expect(e).toHaveLength(2);
		expect(shapeText(e[0]?.shape as never)).toBe("x3x0x0");
		expect(e[1]?.shape).toBeNull();
	});

	test("7alt is a shell", () => {
		expect(entries("| G7alt |")[0]?.caveat).toBe("shell");
	});

	test("enharmonic names are two entries with one shape", () => {
		const e = entries("| F# | Gb |");
		expect(e).toHaveLength(2);
		expect(e[0]?.shape).toEqual(e[1]?.shape);
	});

	test("the key is the one in force at the first appearance", () => {
		const e = entries("key: C\n| C | G |\nkey: G\n| G | D |");
		expect(e.map((x) => [x.chord.canonical, x.key?.tonic])).toEqual([
			["C", "C"],
			["G", "C"],
			["D", "G"],
		]);
	});
});

describe("diagram entries: parts and voice lines (grammar 7.4, 7.7)", () => {
	test("every part's chords without `part`; only that part's with it", () => {
		const all = names(MORNING_SONG);
		expect(all).toContain("G/B");
		expect(all).toContain("Em");
		const gtr = names(MORNING_SONG, { part: "Gtr" });
		expect(gtr).not.toContain("G/B");
		expect(gtr).not.toContain("Em");
		expect(gtr).toContain("C");
		const pno = names(MORNING_SONG, { part: "Pno" });
		expect(pno).toContain("G/B");
		expect(pno).toContain("Em");
	});

	test("a voice line with words gives nothing, a part's chord line still does", () => {
		const e = names(AMAZING_GRACE);
		expect(e).toEqual(["G", "G7", "C"]);
	});

	test("a voice line without words gives nothing", () => {
		const chart =
			"part: Vox = Voice, instrument: voice\nVox | C | G |\nVox.Mel | {C4 E4} | {D4 F4} |\n";
		expect(names(chart)).toEqual(["C", "G"]);
	});

	test("a bare voice line of a lone voice part gives nothing", () => {
		expect(names("part: Vox = Voice, instrument: voice\n| {C3 G3 E4} | {C4 E4} |\n")).toEqual([]);
	});

	test("a chart whose only line is a voice line gives []", () => {
		expect(entries("part: Vox = Voice, instrument: voice\nVox | {C4 E4} | {D4 F4} |\n")).toEqual(
			[],
		);
	});

	test("an unsung note set on a singing line still gives nothing", () => {
		const chart =
			"part: Vox = Voice, instrument: voice\nVox | C | G |\nVox.Mel | {C4 E4} | {D4 F4} |\n";
		expect(names(chart)).toEqual(["C", "G"]);
	});
});

describe("diagram entries: sung notes skip, names stay (design 4.2)", () => {
	test("a line mixing chord names and sung notes gives its names", () => {
		expect(names("| C {E4}:la | G {D4}:oh |\n")).toEqual(["C", "G"]);
	});

	test("names in the verse, sung notes in the chorus, names in the bridge", () => {
		const chart =
			"## Verse\n| C | Am | F | G |\n## Chorus\n| C {E4}:la | Am {D4}:oh | F | G |\n## Bridge\n| Dm | E7 |\n";
		expect(names(chart)).toEqual(["C", "Am", "F", "G", "Dm", "E7"]);
	});

	test("one sung note at the end of a line of names", () => {
		expect(names("| C | Am | F | G {G4}:yeah |\n")).toEqual(["C", "Am", "F", "G"]);
	});

	test("a lone declared voice part's bare line mixing names and sung notes", () => {
		expect(names("part: Vox = Voice, instrument: voice\n| C {E4}:la | G {D4}:oh |\n")).toEqual([
			"C",
			"G",
		]);
	});

	test("a declared part's bare line carrying one syllable keeps its names", () => {
		expect(names("part: Gtr = Guitar\n| C {E4}:la | G |\n")).toEqual(["C", "G"]);
	});
});

describe("diagram entries: a part's first line only (grammar 7.6)", () => {
	test("a second line in the same system gives nothing, note sets included", () => {
		const chart = "part: Pno = Piano\nPno | C | G |\nPno.LH | {C2 G2} | {G1 D2} |\n";
		expect(names(chart)).toEqual(["C", "G"]);
	});

	test("the first line present in a system carries the harmony, whichever it is", () => {
		const chart =
			"part: Pno = Piano\n## Intro\nPno.LH | Em | A7 |\n## Verse\nPno.RH | C | G |\nPno.LH | {C2 G2} | {G1 D2} |\n";
		expect(names(chart)).toEqual(["Em", "A7", "C", "G"]);
	});

	test("a later line written alone in its own system is that system's first", () => {
		const chart = "part: Pno = Piano\n## A\nPno.RH | C | G |\n## B\nPno.LH | Dm | E7 |\n";
		expect(names(chart)).toEqual(["C", "G", "Dm", "E7"]);
	});

	test("a melody line alone in a system gives its chord names", () => {
		const chart =
			"part: Gtr = Guitar\nGtr | C | G |\nGtr.Mel | {C4} | {D4} |\n\n## B\nGtr.Mel | Bm | F#m |\n";
		expect(names(chart)).toEqual(["C", "G", "Bm", "F#m"]);
	});

	test("a singing line alone in a system gives its names, not its sung notes", () => {
		const chart =
			"part: Vox = Voice, instrument: voice\nVox | C | Am |\nVox.Mel | {C4}:a | {D4}:b |\n\n## B\nVox.Mel | F {A4}:la | G {B4}:oh |\n";
		expect(names(chart)).toEqual(["C", "Am", "F", "G"]);
	});

	test("two parts each with a second line give each part's first line, in score order", () => {
		const chart =
			"part: Gtr = Guitar\npart: Pno = Piano\nGtr | D | A |\nGtr.Mel | {D4} | {A4} |\nPno | C | G |\nPno.LH | {C2} | {G2} |\n";
		expect(names(chart)).toEqual(["D", "A", "C", "G"]);
		expect(names(chart, { part: "Pno" })).toEqual(["C", "G"]);
		expect(names(chart, { part: "Gtr" })).toEqual(["D", "A"]);
	});

	test("a system with Pno and Pno.LH gives the first lines' chords only", () => {
		const chart =
			"part: Gtr = Guitar\npart: Pno = Piano\nGtr | D | A |\nPno | C | G |\nPno.LH | {C2 G2} | {D2 A2} |\n";
		expect(names(chart)).toEqual(["D", "A", "C", "G"]);
	});

	test("a chart with no declared parts is unaffected", () => {
		expect(names("| C | G |\n| {C3 G3 E4} | Am |\n")).toEqual(["C", "G", "{C3 G3 E4}", "Am"]);
	});
});

describe("diagram entries: groups and error rows", () => {
	test("a group's members each get an entry, in order", () => {
		expect(names("| C_G_D | Am |\n")).toEqual(["C", "G", "D", "Am"]);
	});

	test("a system with an error row gives the other rows' chords", () => {
		const chart = "part: Gtr = Guitar\npart: Pno = Piano\nGtr | C | G |\nPno | D || Am\n";
		expect(names(chart)).toEqual(["C", "G"]);
	});
});
