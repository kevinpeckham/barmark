import { describe, expect, test } from "bun:test";
import { parseChord } from "barmark";
import { typesetChord } from "../src/chord.js";

const set = (symbol: string) => {
	const r = parseChord(symbol);
	if (!r.ok || !r.value.parts) throw new Error(`${symbol} did not parse`);
	return typesetChord(r.value.parts);
};

describe("typesetChord: canonical form, never the author's spelling", () => {
	test("Cø is Cm⁷(♭5)", () => {
		expect(set("Cø")).toEqual({ root: "C", quality: "m", superscript: "7(♭5)", bass: null });
	});
	test("C-7 is Cm⁷", () => {
		expect(set("C-7")).toEqual({ root: "C", quality: "m", superscript: "7", bass: null });
	});
	test("CΔ is C^maj7", () => {
		expect(set("CΔ")).toEqual({ root: "C", quality: "", superscript: "maj7", bass: null });
	});
	test("C7b9 is C⁷(♭9)", () => {
		expect(set("C7b9")).toEqual({ root: "C", quality: "", superscript: "7(♭9)", bass: null });
	});
	test("F#m7(b5): sharps and flats as glyphs", () => {
		expect(set("F#m7(b5)")).toEqual({ root: "F♯", quality: "m", superscript: "7(♭5)", bass: null });
	});
	test("A7sus4, Bbmaj7, C/E, Cdim7, C5", () => {
		expect(set("A7sus4")).toEqual({ root: "A", quality: "", superscript: "7sus4", bass: null });
		expect(set("Bbmaj7")).toEqual({ root: "B♭", quality: "", superscript: "maj7", bass: null });
		expect(set("C/E")).toEqual({ root: "C", quality: "", superscript: "", bass: "E" });
		expect(set("Cdim7")).toEqual({ root: "C", quality: "dim", superscript: "7", bass: null });
		expect(set("C5")).toEqual({ root: "C", quality: "5", superscript: "", bass: null });
		expect(set("Am7/G#")).toMatchObject({ bass: "G♯" });
	});
});
