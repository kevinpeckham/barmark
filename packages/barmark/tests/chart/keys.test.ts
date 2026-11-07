import { describe, expect, test } from "bun:test";
import { signature } from "../../src/chart/keys.js";
import type { Key, Mode } from "../../src/index.js";
import { conventionalKey, keyFromText, parseChart, printKey, spellPitch } from "../../src/index.js";

const k = (tonic: string, mode: Mode = "major"): Key => ({ tonic, mode });

describe("keyFromText", () => {
	test("reads key: values and detector forms", () => {
		const cases: [string, Key][] = [
			["F♯ minor", k("F#", "minor")],
			["D major", k("D")],
			["Bb Maj", k("Bb")],
			["E♭ min", k("Eb", "minor")],
			["C#m", k("C#", "minor")],
			["f# MINOR", k("F#", "minor")],
			["A Mixolydian", k("A", "mixolydian")],
			["  G  ", k("G")],
		];
		for (const [text, key] of cases) expect(keyFromText(text)).toEqual(key);
	});
	test("rejects what isn't a key", () => {
		for (const text of ["H", "C##", "Cm7", "", "C sharp", "CM"])
			expect(keyFromText(text)).toBeNull();
	});
	test("key: keeps its rules", () => {
		const r = parseChart("key: Bb Maj\n| C |\n");
		expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
	});
});

describe("conventionalKey", () => {
	test("takes the fewest accidentals", () => {
		const cases: [Key, Key][] = [
			[k("Ab", "minor"), k("G#", "minor")],
			[k("C#"), k("Db")],
			[k("Cb"), k("B")],
			[k("A#", "minor"), k("Bb", "minor")],
			[k("B#"), k("C")],
			[k("G#", "mixolydian"), k("Ab", "mixolydian")],
		];
		for (const [a, b] of cases) expect(conventionalKey(a)).toEqual(b);
	});
	test("a tie keeps the spelling given", () => {
		for (const key of [k("Eb", "minor"), k("D#", "minor"), k("F#"), k("Gb")])
			expect(conventionalKey(key)).toEqual(key);
	});
});

test("printKey is the canonical key: value", () => {
	expect(printKey(k("F#", "minor"))).toBe("F#m");
	expect(printKey(k("A", "mixolydian"))).toBe("A mixolydian");
	expect(printKey(k("D"))).toBe("D");
});

describe("spellPitch", () => {
	test("the key's own notes take its signature", () => {
		expect(spellPitch(1, k("D"))).toBe("C#");
		expect(spellPitch(6, k("D"))).toBe("F#");
		expect(spellPitch(5, k("F#"))).toBe("E#");
	});
	test("other notes by degree, bIII bVI bVII flat in sharp keys", () => {
		expect(spellPitch(10, k("D"))).toBe("Bb");
		expect(spellPitch(0, k("D"))).toBe("C");
		expect(spellPitch(7, k("E"))).toBe("G");
		expect(spellPitch(3, k("Bb"))).toBe("Eb");
		expect(spellPitch(8, k("A", "minor"))).toBe("G#");
	});
	test("a double accidental falls back", () => {
		expect(spellPitch(2, k("G#", "minor"))).toBe("D");
	});
	test("with no key is transpose's table", () => {
		expect([...Array(12).keys()].map((pc) => spellPitch(pc, null)).join(" ")).toBe(
			"C C# D Eb E F F# G Ab A Bb B",
		);
		expect(spellPitch(-1, null)).toBe("B");
	});
	test("every pitch class and mode", () => {
		const modes: Mode[] = [
			"major",
			"minor",
			"ionian",
			"dorian",
			"phrygian",
			"lydian",
			"mixolydian",
			"aeolian",
			"locrian",
		];
		const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
		const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
		for (let pc = 0; pc < 12; pc++)
			for (const mode of modes)
				for (const tonic of [SHARPS[pc], FLATS[pc], "Cb", "Fb", "E#", "B#"] as string[]) {
					const key = k(tonic, mode);
					expect(Math.abs(signature(conventionalKey(key).tonic, mode))).toBeLessThanOrEqual(6);
					for (let q = 0; q < 12; q++) expect(spellPitch(q, key)).toMatch(/^[A-G][#b]?$/);
				}
	});
});
