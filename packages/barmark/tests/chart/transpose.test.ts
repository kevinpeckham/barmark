import { describe, expect, test } from "bun:test";
import { parseChart, printChart, transposeChart } from "../../src/index.js";
import { AT_A_GLANCE, PEACEFUL_DREAMS } from "./fixtures.js";

const up = (text: string, semitones: number) => transposeChart(text, { semitones }).text;
const to = (text: string, key: string) => transposeChart(text, { to: key }).text;

describe("transposeChart: to a key", () => {
	test("every chord keeps its place in the key: D to Eb", () => {
		expect(to("key: D\n| D | A | Bm | G |\n| C | F#m/C# |\n", "Eb")).toBe(
			"key: Eb\n| Eb | Bb | Cm | Ab |\n| Db | Gm/D |\n",
		);
	});
	test("spelling follows the interval: A to C# writes E#, not F", () => {
		expect(to("key: D\n| D | G | A | E |\n", "C#")).toBe("key: C#\n| C# | F# | G# | D# |\n");
		expect(to("key: A\n| A | B | C# |\n", "C#")).toBe("key: C#\n| C# | D# | E# |\n");
	});
	test("quality, extension, sus and tones are kept", () => {
		expect(to("key: C\n| Cmaj7 | Dm7(b5) | G7sus4(b9)/F | Bbadd9 |\n", "D")).toBe(
			`key: D\n${printChart("| Dmaj7 | Em7(b5) | A7sus4(b9)/G | Cadd9 |\n")}`,
		);
	});
	test("a minor key moves by its tonic", () => {
		expect(to("key: Am\n| Am | C | G | E7 |\n", "Bbm")).toBe("key: Bbm\n| Bbm | Db | Ab | F7 |\n");
	});
	test("only the tonic of the target is read", () => {
		expect(to("key: Am\n| Am |\n", "Bb")).toBe("key: Bbm\n| Bbm |\n");
	});
	test("a modulation moves with the song", () => {
		expect(to("key: C\n| C | G |\nkey: D\n| D | A |\n", "D")).toBe(
			"key: D\n| D | A |\nkey: E\n| E | B |\n",
		);
	});
	test("the target may be written with ♭ or ♯", () => {
		expect(to("key: D\n| D |\n", "E♭")).toBe("key: Eb\n| Eb |\n");
	});
	test("a target key with no key: in the chart is an error, and the text is unchanged", () => {
		const text = "| D | A |\n";
		const r = transposeChart(text, { to: "Eb" });
		expect(r.text).toBe(text);
		expect(r.diagnostics.map((d) => [d.severity, d.line])).toEqual([["error", 1]]);
		expect(r.diagnostics[0]?.message).toContain("key:");
	});
	test("a target that isn't a key is an error, and the text is unchanged", () => {
		const text = "key: D\n| D |\n";
		const r = transposeChart(text, { to: "H" });
		expect(r.text).toBe(text);
		expect(r.diagnostics.map((d) => d.severity)).toEqual(["error"]);
	});
});

describe("transposeChart: by semitones", () => {
	test("the new key takes the signature with fewer accidentals", () => {
		expect(up("key: D\n| D | A |\n", 1)).toBe("key: Eb\n| Eb | Bb |\n");
		expect(up("key: C\n| C |\n", 1)).toBe("key: Db\n| Db |\n");
		expect(up("key: C\n| C |\n", 4)).toBe("key: E\n| E |\n");
		expect(up("key: G\n| G |\n", -2)).toBe("key: F\n| F |\n");
	});
	test("F# wins the tie with Gb", () => {
		expect(up("key: F\n| F | C |\n", 1)).toBe("key: F#\n| F# | C# |\n");
	});
	test("minor keys use their own signatures", () => {
		expect(up("key: Am\n| Am | C |\n", 1)).toBe("key: Bbm\n| Bbm | Db |\n");
		expect(up("key: Am\n| Am |\n", 4)).toBe("key: C#m\n| C#m |\n");
	});
	test("a mode uses its parent major's signature", () => {
		// A mixolydian has D major's signature; up one, Bb mixolydian (three flats) beats A# (nine sharps).
		expect(up("key: A mixolydian\n| A | G |\n", 1)).toBe("key: Bb mixolydian\n| Bb | Ab |\n");
		expect(up("key: E dorian\n| Em | A |\n", 2)).toBe("key: F# dorian\n| F#m | B |\n");
	});
	test("zero and whole octaves keep the spelling", () => {
		expect(up("key: Eb\n| Eb | Ab |\n", 0)).toBe("key: Eb\n| Eb | Ab |\n");
		expect(up("key: Eb\n| Eb | Ab |\n", -12)).toBe("key: Eb\n| Eb | Ab |\n");
	});
	test("a chart with no key spells each root from one table", () => {
		expect(up("| C | E | B | F# |\n", 1)).toBe("| C# | F | C | G |\n");
		expect(up("| D | Bb | G# |\n", -2)).toBe("| C | Ab | F# |\n");
	});
	test("a number of semitones that isn't a whole number is an error", () => {
		const r = transposeChart("key: D\n| D |\n", { semitones: 1.5 });
		expect(r.text).toBe("key: D\n| D |\n");
		expect(r.diagnostics.map((d) => d.severity)).toEqual(["error"]);
	});
});

describe("transposeChart: notes and spelling", () => {
	test("double sharps and flats are respelled to the plain note", () => {
		// D to C# is a major seventh down: C# becomes B#, kept; G# becomes Fx, written G.
		expect(to("key: D\n| C# | G# |\n", "C#")).toBe("key: C#\n| B# | G |\n");
		expect(to("key: C\n| Bb | Eb |\n", "Bb")).toBe("key: Bb\n| Ab | Db |\n");
		expect(to("key: C\n| Fb |\n", "Bb")).toBe("key: Bb\n| D |\n");
	});
	test("note sets move, octaves with them", () => {
		expect(up("key: D\n| {B3 D4} | {F#} | {A! C#} |\n", 1)).toBe(
			"key: Eb\n| {C4 Eb4} | {G} | {Bb! D} |\n",
		);
		expect(to("key: C\n| {C4 E4 G4} |\n", "A")).toBe("key: A\n| {A3 C#4 E4} |\n");
		expect(up("key: C\n| {C4} |\n", 12)).toBe("key: C\n| {C5} |\n");
	});
	test("a note pushed out of octaves 0–8 stays put, with a warning", () => {
		const r = transposeChart("key: C\n| {G8 B8} | C |\n", { semitones: 1 });
		expect(r.text).toBe("key: Db\n| {Ab8 B8} | Db |\n");
		expect(r.diagnostics).toEqual([
			{
				line: 2,
				severity: "warning",
				message: "B8 can't move: octaves run 0–8, so it stays as written",
				token: "B8",
			},
		]);
	});
	test("N.C., silence, holds, ?, % and groups pass through", () => {
		expect(up("key: C\n| C / G_A | N.C. | -- | ? | % | ... |\n", 2)).toBe(
			"key: D\n| D / A_B | N.C. | -- | ? | % | ... |\n",
		);
	});
});

describe("transposeChart: the rest of the chart", () => {
	test("text lines, titles and headings never change", () => {
		const chart =
			"# Song in D\n\nkey: D\n## Verse\n| D | A |\nD is for dreams\n### capo 2, D shapes\n";
		expect(to(chart, "E")).toBe(
			"# Song in D\n\nkey: E\n\n## Verse\n| E | B |\nD is for dreams\n### capo 2, D shapes\n",
		);
	});
	test("other directives on a key: line are kept", () => {
		expect(to("key: D, time: 3/4, tempo: 90\n| D |\n", "F")).toBe(
			"key: F, time: 3/4, tempo: 90\n| F |\n",
		);
	});
	test("a line with an error is left as written, with a warning", () => {
		const r = transposeChart("key: D\n| D | Hm |\n| A |\n", { to: "E" });
		expect(r.text).toBe("key: E\n| D | Hm |\n| B |\n");
		expect(r.diagnostics).toEqual([
			{
				line: 2,
				severity: "warning",
				message: "not transposed: this line has an error",
				token: "| D | Hm |",
			},
		]);
	});
	test("the output is canonical", () => {
		expect(to("key: D\n|D|A7(9)|\n", "D")).toBe(printChart("key: D\n|D|A7(9)|\n"));
	});
	test("up and back down returns the canonical chart", () => {
		for (const chart of [PEACEFUL_DREAMS, AT_A_GLANCE])
			for (const n of [1, 5, 6, -3]) expect(up(up(chart, n), -n)).toBe(printChart(chart));
	});
	test("Peaceful Dreams in E parses cleanly", () => {
		const e = to(PEACEFUL_DREAMS, "E");
		expect(e).toContain("key: E, time: 4/4, tempo: 145");
		expect(e).toContain("| E7sus4 | % | % | % | x2");
		expect(parseChart(e).diagnostics).toEqual(parseChart(PEACEFUL_DREAMS).diagnostics);
	});
	test("never throws", () => {
		for (const text of [
			"",
			"|",
			"key: X\n| Q |",
			"{",
			"| {C9} |",
			"﻿| C |",
			"key: D\n```\n| D |\n```",
		])
			for (const by of [{ semitones: 7 }, { to: "F" }, { semitones: Number.NaN }, { to: "" }])
				expect(() => transposeChart(text, by)).not.toThrow();
	});
});
