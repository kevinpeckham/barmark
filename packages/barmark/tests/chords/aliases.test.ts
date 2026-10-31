import { describe, expect, test } from "bun:test";
import { parseChord } from "../../src/chords/parse.js";

const canonical = (symbol: string) => {
	const r = parseChord(symbol);
	if (!r.ok) throw new Error(`${symbol}: ${r.error.message}`);
	return r.value.canonical;
};

/** Appendix A.5: accepted input → canonical. */
const A5: [string, string][] = [
	["Cmin7", "Cm7"],
	["Cmin", "Cm"],
	["C-7", "Cm7"],
	["C-", "Cm"],
	["Cmaj", "C"],
	["Cmaj/E", "C/E"],
	["C°", "Cdim"],
	["C°7", "Cdim7"],
	["C+", "Caug"],
	["C+7", "Caug7"],
	["Csus", "Csus4"],
	["C7sus", "C7sus4"],
	["CMaj7", "Cmaj7"],
	["Cma7", "Cmaj7"],
	["CΔ", "Cmaj7"],
	["CΔ7", "Cmaj7"],
	["Cø", "Cm7(b5)"],
	["Cø7", "Cm7(b5)"],
	["Cm(maj7)", "Cmmaj7"],
	["Cminmaj7", "Cmmaj7"],
	["Cadd2", "C(2)"],
	["Cadd4", "C(4)"],
	["Cadd9", "C(9)"],
	["Cadd11", "C(11)"],
	["Cm7add11", "Cm7(11)"],
	["C7(b9)add11", "C7(b9,11)"],
	["Cadd9/E", "C(9)/E"],
	["C7b9", "C7(b9)"],
	["Cm7b5", "Cm7(b5)"],
	["C7b9#11", "C7(b9,#11)"],
];

describe("Appendix A.5 aliases", () => {
	for (const [input, out] of A5) {
		test(`${input} → ${out}`, () => expect(canonical(input)).toBe(out));
	}
});

describe("Unicode from phones and editors", () => {
	test("sharp and flat signs", () => expect(canonical("C♯m7♭5")).toBe("C#m7(b5)"));
	test("triangle", () => expect(canonical("CΔ7")).toBe("Cmaj7"));
	test("flat root with a flat alteration", () => expect(canonical("B♭7♭9")).toBe("Bb7(b9)"));
});

/** Appendix A.6: rejected, with the exact suggestion. */
const A6: [string, string][] = [
	["cm7", "Cm7"],
	["CM7", "Cmaj7"],
	["CM", "C"],
	["Cbb", "Bb"],
	["F##7", "G7"],
	["H7", "B7"],
	["C2", "Csus2 or C(9)"],
	["C4", "Csus4 or C(11)"],
];

describe("Appendix A.6 rejections", () => {
	for (const [input, suggestion] of A6) {
		test(`${input} suggests ${suggestion}`, () => {
			const r = parseChord(input);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error.suggestion).toBe(suggestion);
		});
	}
});

describe("canonical form is stable", () => {
	const inputs = [...A5.map(([i]) => i), "Cm6/9/E", "C13(b9)", "Ab5", "C7alt"];
	for (const input of inputs) {
		test(`${input} canonicalizes idempotently`, () => {
			const once = canonical(input);
			expect(canonical(once)).toBe(once);
		});
	}
});
