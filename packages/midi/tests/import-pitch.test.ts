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

describe("the edges of the range", () => {
	test("a pitch the key would spell out of range takes its plain name", () => {
		// B8 is Cb9 in Gb, and C0 is B#-1 in F#: both can be written, so they are (spec 4.3).
		expect(pitchName(119, major("Gb"))).toBe("B8");
		expect(pitchName(12, major("F#"))).toBe("C0");
		expect(pitchName(11, major("Gb"))).toBe("Cb0");
		expect(pitchName(120, major("C#"))).toBe("B#8");
	});
	test("every pitch from C0 to B8 has a name in every key, and nothing outside has a plain one", () => {
		const tonics = "Cb Gb Db Ab Eb Bb F C G D A E B F# C#".split(" ");
		for (const tonic of tonics)
			for (let midi = 12; midi <= 119; midi++) expect(pitchName(midi, major(tonic))).not.toBeNull();
		expect(pitchName(11, null)).toBeNull();
		expect(pitchName(120, null)).toBeNull();
	});
});

describe("the key in force", () => {
	test("the first key is in force from the start, as the chord reading has it", () => {
		const out = named([attack(0, [59]), attack(1920, [59])], [keyAt(1920, "Gb")]);
		expect(out.attacks.map((a) => a.names)).toEqual([["Cb4"], ["Cb4"]]);
	});
	test("an attack several keys on takes the last of them", () => {
		const keys = [keyAt(0, "C"), keyAt(480, "Gb"), keyAt(960, "D")];
		const out = named([attack(0, [61, 66]), attack(960, [61, 66]), attack(1000, [61])], keys);
		expect(out.attacks.map((a) => a.names)).toEqual([["Db4", "F#4"], ["C#4", "F#4"], ["C#4"]]);
	});
	test("a key is spelled as key: will read it", () => {
		// seven sharps are written Db (conventionalKey): C is C, not B#
		const out = named([attack(0, [60, 61])], [keyAt(0, "C#")]);
		expect(out.attacks[0]?.names).toEqual(["C4", "Db4"]);
	});
	test("a key whose name is no key spells with none", () => {
		const keys = [keyAt(0, "Db"), keyAt(480, "undefined")];
		const out = named([attack(0, [61]), attack(480, [61])], keys);
		expect(out.attacks.map((a) => a.names)).toEqual([["Db4"], ["C#4"]]);
	});
	test("every pitch left out is counted, over all attacks", () => {
		const out = named([attack(0, [3, 5, 40]), attack(480, [125, 127])], []);
		expect(out.attacks.map((a) => a.names)).toEqual([["E2"]]);
		expect(out.outOfRange).toBe(4);
	});
	test("a key signature under every attack: ten times the attacks and keys, in linear time", () => {
		const best = (n: number) => {
			const attacks = Array.from({ length: n }, (_, i) => attack(i * 240, [60]));
			const keys = Array.from({ length: n }, (_, i) => keyAt(i * 240, "C"));
			let ms = Number.POSITIVE_INFINITY;
			for (let run = 0; run < 3; run++) {
				const start = performance.now();
				expect(named(attacks, keys).attacks.length).toBe(n);
				ms = Math.min(ms, performance.now() - start);
			}
			return ms;
		};
		best(5_000);
		expect(best(50_000) / best(5_000)).toBeLessThan(25);
	}, 120_000);
});
