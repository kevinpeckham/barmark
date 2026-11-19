import { describe, expect, test } from "bun:test";
import type { Key } from "barmark";
import type { Attack } from "../src/import/attacks.js";
import type { KeyAt } from "../src/import/directives.js";
import { named, pitchName } from "../src/import/pitch.js";

const major = (tonic: string): Key => ({ tonic, mode: "major" });
const keyAt = (tick: number, name: string): KeyAt => ({ tick, name, scale: new Set() });
const attack = (tick: number, pitches: number[]): Attack => ({ tick, end: tick + 240, pitches });

describe("pitchName", () => {
	test("the octave belongs to the letter", () => {
		expect(pitchName(60, major("C"))).toBe("C4");
		expect(pitchName(59, major("Gb"))).toBe("Cb4");
		expect(pitchName(60, major("C#"))).toBe("B#3");
	});

	test("a key spells the pitch class", () => {
		expect(pitchName(61, major("Db"))).toBe("Db4");
		expect(pitchName(61, major("D"))).toBe("C#4");
	});

	test("the range is C0 to B8", () => {
		expect(pitchName(12, null)).toBe("C0");
		expect(pitchName(11, null)).toBeNull();
		expect(pitchName(11, major("Gb"))).toBe("Cb0");
		expect(pitchName(119, null)).toBe("B8");
		expect(pitchName(120, null)).toBeNull();
	});
});

describe("named", () => {
	test("each attack is spelled for the key in force at its tick", () => {
		const keys = [keyAt(0, "C"), keyAt(1920, "Gb")];
		const out = named([attack(0, [59]), attack(1920, [59])], keys);
		expect(out.attacks.map((a) => a.names)).toEqual([["B3"], ["Cb4"]]);
		expect(out.outOfRange).toBe(0);
	});

	test("no key spells with none", () => {
		expect(named([attack(0, [61])], []).attacks[0]?.names).toEqual(["C#4"]);
	});

	test("a pitch with no name is left out and counted", () => {
		const out = named([attack(0, [5, 40])], []);
		expect(out.attacks).toEqual([{ tick: 0, end: 240, pitches: [40], names: ["E2"] }]);
		expect(out.outOfRange).toBe(1);
	});

	test("an attack left with no pitch is left out", () => {
		const out = named([attack(0, [5])], []);
		expect(out.attacks).toEqual([]);
		expect(out.outOfRange).toBe(1);
	});
});
