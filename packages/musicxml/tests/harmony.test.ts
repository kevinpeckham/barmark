import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { type Interval, parseChord } from "barmark";
import { harmonyXml, intervalsOf, kindOf, noChordXml, textSpells } from "../src/harmony.js";
import { measures, xmlOf } from "./helpers.js";

const record = (symbol: string) => {
	const r = parseChord(symbol);
	if (!r.ok) throw new Error(`${symbol} does not parse`);
	return r.value;
};
const key = (ivs: Interval[]) =>
	ivs
		.map((i) => `${i.alter}:${i.degree}`)
		.sort()
		.join(" ");

/** The symbols of the grammar's Appendix A.4 table. */
function appendixA4(): string[] {
	const grammar = readFileSync(
		new URL("../../../docs/grammar-v0.1-draft.md", import.meta.url),
		"utf8",
	);
	const section = grammar.split("### A.4")[1]?.split("\n### ")[0] ?? "";
	return [...section.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
}

describe("harmony", () => {
	test("root, alter and bass", () => {
		const xml = harmonyXml(record("F#m7/C#"));
		expect(xml).toContain("<root><root-step>F</root-step><root-alter>1</root-alter></root>");
		expect(xml).toContain('<kind text="m7">minor-seventh</kind>');
		expect(xml).toContain("<bass><bass-step>C</bass-step><bass-alter>1</bass-alter></bass>");
		expect(harmonyXml(record("Bbmaj7"))).toContain(
			"<root-step>B</root-step><root-alter>-1</root-alter>",
		);
		expect(harmonyXml(record("C"))).not.toContain("<bass>");
	});
	test("kind text is barmark's canonical quality", () => {
		expect(harmonyXml(record("Cø"))).toContain('<kind text="m7(b5)">half-diminished</kind>');
		expect(harmonyXml(record("C"))).toContain('<kind text="">major</kind>');
	});
	test("degrees make the exact chord", () => {
		for (const symbol of [
			"C7#9b13",
			"C(omit3)",
			"Cadd9",
			"C6/9",
			"Cm7(b5)",
			"C7sus4",
			"C5",
			"C7(b9)",
			"Cdim7",
		]) {
			const { kind, degrees } = kindOf(record(symbol).intervals);
			expect(`${symbol} ${key(intervalsOf(kind, degrees))}`).toBe(
				`${symbol} ${key(record(symbol).intervals)}`,
			);
		}
		expect(kindOf(record("C7#9b13").intervals).kind).toBe("dominant");
		expect(kindOf(record("Cm7(b5)").intervals)).toEqual({ kind: "half-diminished", degrees: [] });
	});
	test("every chord in Appendix A.4 round-trips", () => {
		const symbols = appendixA4();
		expect(symbols.length).toBeGreaterThan(30);
		for (const symbol of symbols) {
			const r = parseChord(symbol);
			if (!r.ok) throw new Error(`${symbol} does not parse`);
			const { kind, degrees } = kindOf(r.value.intervals);
			expect(`${symbol} ${key(intervalsOf(kind, degrees))}`).toBe(
				`${symbol} ${key(r.value.intervals)}`,
			);
		}
	});
	test("an added degree is written relative to a dominant chord", () => {
		// MusicXML: an added 7 is a minor seventh unless altered.
		expect(harmonyXml(record("C(9)"))).toContain(
			'<degree print-object="no"><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree>',
		);
		expect(harmonyXml(record("C7(#9)"))).toContain(
			'<degree print-object="no"><degree-value>9</degree-value><degree-alter>1</degree-alter><degree-type>add</degree-type></degree>',
		);
	});
	test("a degree the kind text already spells is not printed again", () => {
		// Verovio prints the text and then each printed degree: D7sus4(7), G5(7)(no3).
		const sus = harmonyXml(record("D7sus4"));
		expect(sus).toContain('<kind text="7sus4">suspended-fourth</kind>');
		expect(sus).toContain(
			'<degree print-object="no"><degree-value>7</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree>',
		);
		const power = harmonyXml(record("G5(7)"));
		expect(power).toContain('<kind text="5(7)">dominant</kind>');
		expect(power).toContain(
			'<degree print-object="no"><degree-value>3</degree-value><degree-alter>0</degree-alter><degree-type>subtract</degree-type></degree>',
		);
		expect(power).not.toMatch(/<degree>/);
	});
	test("degrees stay printed when the kind text does not spell the chord", () => {
		// A kind text that names less than the chord leaves its degrees to say the rest.
		const add9 = record("C(9)").intervals;
		expect(textSpells("C", "(9)", add9)).toBe(true);
		expect(textSpells("C", "", add9)).toBe(false);
		expect(textSpells("C", "(", add9)).toBe(false);
	});
	test("F#m(b6) is minor with one degree: 6, flattened, added; the file validates", () => {
		const xml = harmonyXml(record("F#m(b6)"));
		expect(xml).toContain('<kind text="m(b6)">minor</kind>');
		expect(xml.match(/<degree[ >]/g)).toHaveLength(1);
		expect(xml).toContain(
			"<degree-value>6</degree-value><degree-alter>-1</degree-alter><degree-type>add</degree-type>",
		);
		// xmlOf validates the whole file against the vendored XSD
		expect(xmlOf("| F#m(b6) | C6(b6) | Cadd13 | CΔ9 |")).toContain(
			"<degree-value>6</degree-value>",
		);
	});
	test("(b6) and (b13) are one note, written as different degrees", () => {
		const b6 = kindOf(record("Cm(b6)").intervals);
		const b13 = kindOf(record("Cm(b13)").intervals);
		expect(b6.degrees).toEqual([{ value: 6, alter: -1, type: "add" }]);
		expect(b13.degrees).toEqual([{ value: 13, alter: -1, type: "add" }]);
	});
	test("N.C. is kind none with its root hidden", () => {
		expect(noChordXml()).toBe(
			'<harmony><root><root-step text="">C</root-step></root><kind text="N.C.">none</kind></harmony>',
		);
	});
	test("a chord slot writes its harmony before its slash note; N.C. too", () => {
		const [m] = measures(xmlOf("| F#m7/C# N.C. |"));
		expect(m).toMatch(/<harmony>[\s\S]*minor-seventh[\s\S]*<\/harmony><note>/);
		expect(m).toMatch(/<harmony>[\s\S]*none<\/kind><\/harmony><note>/);
		expect((m ?? "").match(/<harmony>/g)).toHaveLength(2);
	});
});
