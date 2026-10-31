import { describe, expect, test } from "bun:test";
import { parseNoteSet } from "../../src/chords/noteSet.js";
import { parseChord } from "../../src/chords/parse.js";

const harte = (input: string) => {
	const r = input.startsWith("{") ? parseNoteSet(input) : parseChord(input);
	if (!r.ok) throw new Error(`${input}: ${r.error.message}`);
	return r.value.harte;
};

describe("Harte labels for chords", () => {
	const cases: [string, string][] = [
		["C", "C:maj"],
		["Am7", "A:min7"],
		["Bm7(b5)", "B:hdim7"],
		["C7(b9)", "C:7(b9)"],
		["C/E", "C:maj/3"],
		["C/Bb", "C:maj/b7"],
		["C13", "C:9(13)"],
		["C7alt", "C:1(3,b7)"],
		["C6/9", "C:maj6(9)"],
		["C9sus4", "C:sus4(b7,9)"],
	];
	for (const [symbol, label] of cases) {
		test(`${symbol} → ${label}`, () => expect(harte(symbol)).toBe(label));
	}
});

describe("Harte labels for note sets", () => {
	test("a single note is the root alone", () => expect(harte("{E}")).toBe("E:1"));
	test("a marked root is the Harte root", () => {
		expect(harte("{D E! G}")).toBe("E:1(b3,b7)/b7");
	});
	test("an unmarked set uses its bass as the root", () => {
		expect(harte("{C E F# B}")).toBe("C:1(3,#4,7)");
	});
});
