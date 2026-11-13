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
	test("off by default: no entries, and the shapes are never asked for", () => {
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
});
