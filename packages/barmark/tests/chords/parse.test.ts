import { describe, expect, test } from "bun:test";
import { parseChord } from "../../src/chords/parse.js";
import type { ChordRecord } from "../../src/chords/types.js";

const ok = (symbol: string): ChordRecord => {
	const r = parseChord(symbol);
	if (!r.ok) throw new Error(`${symbol}: ${r.error.message}`);
	return r.value;
};

/** Appendix A.4, spelled on C: root first, then by interval degree, a slash bass last. */
const A4: [string, string[]][] = [
	["C", ["C", "E", "G"]],
	["Cm", ["C", "Eb", "G"]],
	["Cdim", ["C", "Eb", "Gb"]],
	["Caug", ["C", "E", "G#"]],
	["Csus2", ["C", "D", "G"]],
	["Csus4", ["C", "F", "G"]],
	["C5", ["C", "G"]],
	["C6", ["C", "E", "G", "A"]],
	["Cm6", ["C", "Eb", "G", "A"]],
	["C6/9", ["C", "E", "G", "A", "D"]],
	["C7", ["C", "E", "G", "Bb"]],
	["Cmaj7", ["C", "E", "G", "B"]],
	["Cm7", ["C", "Eb", "G", "Bb"]],
	["Cmmaj7", ["C", "Eb", "G", "B"]],
	["Cdim7", ["C", "Eb", "Gb", "Bbb"]],
	["Cm7(b5)", ["C", "Eb", "Gb", "Bb"]],
	["Caug7", ["C", "E", "G#", "Bb"]],
	["C7sus4", ["C", "F", "G", "Bb"]],
	["C9", ["C", "E", "G", "Bb", "D"]],
	["Cmaj9", ["C", "E", "G", "B", "D"]],
	["Cm9", ["C", "Eb", "G", "Bb", "D"]],
	["C11", ["C", "G", "Bb", "D", "F"]],
	["Cm11", ["C", "Eb", "G", "Bb", "D", "F"]],
	["C13", ["C", "E", "G", "Bb", "D", "A"]],
	["Cm13", ["C", "Eb", "G", "Bb", "D", "F", "A"]],
	["Cmaj13", ["C", "E", "G", "B", "D", "A"]],
	["C9sus4", ["C", "F", "G", "Bb", "D"]],
	["C7(b9)", ["C", "E", "G", "Bb", "Db"]],
	["C7(#9)", ["C", "E", "G", "Bb", "D#"]],
	["C7(#11)", ["C", "E", "G", "Bb", "F#"]],
	["C7(b13)", ["C", "E", "G", "Bb", "Ab"]],
	["C7alt", ["C", "E", "Bb"]],
	["C(9)", ["C", "E", "G", "D"]],
	["C5(7)", ["C", "G", "Bb"]],
	["C/E", ["C", "E", "G"]],
	["C/Bb", ["C", "E", "G", "Bb"]],
];

describe("Appendix A.4", () => {
	for (const [symbol, pitches] of A4) {
		test(`${symbol} spells ${pitches.join(" ")}`, () => {
			const r = ok(symbol);
			expect(r.pitches).toEqual(pitches);
			expect(r.canonical).toBe(symbol);
			expect(r.kind).toBe("chord");
		});
	}
	test("C7alt leaves its altered tones open", () => {
		expect(ok("C7alt").alteredOpen).toBe(true);
		expect(ok("C7").alteredOpen).toBe(false);
	});
	test("a slash bass is the bass; otherwise the root is", () => {
		expect(ok("C/Bb").bass).toBe("Bb");
		expect(ok("C/E").bass).toBe("E");
		expect(ok("C6/9").bass).toBe("C");
	});
});

describe("root accidentals versus alterations", () => {
	test("Ab5 is the A-flat power chord", () => {
		const r = ok("Ab5");
		expect(r.root).toBe("Ab");
		expect(r.pitches).toEqual(["Ab", "Eb"]);
	});
	test("Bb7b9 reads the inline alteration after the extension", () => {
		expect(ok("Bb7b9").canonical).toBe("Bb7(b9)");
	});
	test("Cb9 is a C-flat ninth chord", () => {
		const r = ok("Cb9");
		expect(r.root).toBe("Cb");
		expect(r.pitches).toEqual(["Cb", "Eb", "Gb", "Bbb", "Db"]);
	});
});

describe("the parentheses rule", () => {
	test("an altered fifth replaces the fifth", () => {
		expect(ok("Am7(b5)").pitches).toEqual(["A", "C", "Eb", "G"]);
	});
	test("an altered ninth replaces the ninth", () => {
		expect(ok("C13(b9)").pitches).toEqual(["C", "E", "G", "Bb", "Db", "A"]);
	});
	test("a natural tone the chord already has is a warning", () => {
		const r = parseChord("C7(7)");
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.warnings).toHaveLength(1);
	});
	test("canonical tones are sorted by degree", () => {
		expect(ok("C7(#11,b9)").canonical).toBe("C7(b9,#11)");
	});
});

describe("slashes", () => {
	test("6/9 with a bass", () => {
		const r = ok("Cm6/9/E");
		expect(r.bass).toBe("E");
		expect(r.canonical).toBe("Cm6/9/E");
	});
	test("two basses is an error", () => {
		expect(parseChord("C/E/G").ok).toBe(false);
	});
});

describe("invalid combinations", () => {
	test("Cdim9 names the combination", () => {
		const r = parseChord("Cdim9");
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.token).toBe("Cdim9");
			expect(r.error.message).toContain("dim");
		}
	});
	test("sus with a minor quality is an error", () => {
		expect(parseChord("Cm7sus4").ok).toBe(false);
	});
	test("unknown text is an error, never a throw", () => {
		expect(parseChord("Cxyz").ok).toBe(false);
		expect(parseChord("").ok).toBe(false);
	});
});
