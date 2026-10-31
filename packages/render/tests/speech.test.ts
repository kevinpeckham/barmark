import { describe, expect, test } from "bun:test";
import { type ChordRecord, parseChart, parseChord, parseNoteSet, type Slot } from "barmark";
import { enumerateSuffixes } from "../../barmark/src/chords/suffixes.js";
import { speakBar, speakChord, speakSlot } from "../src/speech.js";

const chord = (s: string): ChordRecord => {
	const r = s.startsWith("{") ? parseNoteSet(s) : parseChord(s);
	if (!r.ok) throw new Error(`${s} did not parse`);
	return r.value;
};
const slotsOf = (bar: string): Slot[] => {
	const p = parseChart(`| ${bar} |`);
	return p.bars[0]?.slots ?? [];
};

describe("spoken names: the design's examples", () => {
	const cases: [string, string][] = [
		["A7sus4", "A seven sus four"],
		["F#m7(b5)", "F sharp minor seven flat five"],
		["C/E", "C over E"],
		["{E}", "note E"],
		["{E1}", "note E one"],
		["{D E! G}", "notes D, E (root), G"],
	];
	for (const [symbol, spoken] of cases)
		test(`${symbol} → ${spoken}`, () => expect(speakChord(chord(symbol))).toBe(spoken));

	test("a group, and the other slot symbols", () => {
		expect(slotsOf("D_E_F#m").map(speakSlot)).toEqual(["triplet: D, E, F sharp minor"]);
		expect(slotsOf("N.C. -- ? /").map(speakSlot)).toEqual([
			"no chord",
			"stop",
			"unknown chord",
			"hold",
		]);
	});
});

describe("spoken names: Appendix A.4, on C", () => {
	const golden: [string, string][] = [
		["C", "C"],
		["Cm", "C minor"],
		["Cdim", "C diminished"],
		["Caug", "C augmented"],
		["Csus2", "C sus two"],
		["Csus4", "C sus four"],
		["C5", "C five"],
		["C6", "C six"],
		["Cm6", "C minor six"],
		["C6/9", "C six nine"],
		["C7", "C seven"],
		["Cmaj7", "C major seven"],
		["Cm7", "C minor seven"],
		["Cmmaj7", "C minor major seven"],
		["Cdim7", "C diminished seven"],
		["Cm7(b5)", "C minor seven flat five"],
		["Caug7", "C augmented seven"],
		["C7sus4", "C seven sus four"],
		["C9", "C nine"],
		["Cmaj9", "C major nine"],
		["Cm9", "C minor nine"],
		["C11", "C eleven"],
		["Cm11", "C minor eleven"],
		["C13", "C thirteen"],
		["Cm13", "C minor thirteen"],
		["Cmaj13", "C major thirteen"],
		["C9sus4", "C nine sus four"],
		["C7(b9)", "C seven flat nine"],
		["C7(#9)", "C seven sharp nine"],
		["C7(#11)", "C seven sharp eleven"],
		["C7(b13)", "C seven flat thirteen"],
		["C7alt", "C seven altered"],
		["C(9)", "C add nine"],
		["C5(7)", "C five add seven"],
		["C/E", "C over E"],
		["C/Bb", "C over B flat"],
	];
	for (const [symbol, spoken] of golden)
		test(`${symbol} → ${spoken}`, () => expect(speakChord(chord(symbol))).toBe(spoken));
});

describe("spoken names: every canonical suffix", () => {
	test("speaks in words, with no symbols left over", () => {
		const bad: string[] = [];
		const all = [...enumerateSuffixes().values()].flat().map((s) => s.suffix);
		expect(all.length).toBeGreaterThan(1000);
		for (const suffix of [...all, "7alt"]) {
			const spoken = speakChord(chord(`Bb${suffix}/F#`));
			if (!spoken || /[#()/]|b\d|\d/.test(spoken)) bad.push(`${suffix} → ${spoken}`);
		}
		expect(bad).toEqual([]);
	});
});

describe("speakBar", () => {
	test("a numbered bar, and one whose number is unknown", () => {
		const slots = slotsOf("G / D /");
		const cell = { kind: "slots" as const, meter: null, slots, cut: false };
		expect(speakBar(9, cell)).toBe("bar 9: G, hold, D, hold");
		expect(speakBar(null, cell)).toBe("bar: G, hold, D, hold");
	});
	test("one-bar meter, a cut bar, a fermata", () => {
		const slots = slotsOf("A7");
		expect(speakBar(16, { kind: "slots", meter: { n: 2, d: 4 }, slots, cut: false })).toBe(
			"bar 16, in 2/4: A seven",
		);
		expect(speakBar(16, { kind: "slots", meter: null, slots, cut: true })).toBe(
			"bar 16: A seven, cut on this pass",
		);
		expect(speakBar(null, { kind: "fermata" })).toBe("fermata: hold until cued");
	});
});
