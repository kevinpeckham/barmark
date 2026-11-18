/**
 * The delta after m, Maj9 and ma9, and the triangle signs (Kevin,
 * 2026-11-18, with Claude's rulings the same day): more spellings of the
 * major seventh that jazz charts use. Each reads as its `maj`/`mmaj`
 * spelling, and what is still refused is refused as before.
 */
import { describe, expect, test } from "bun:test";
import { growth, TIMING_TIMEOUT } from "../../../../test-support/growth.js";
import { parseChord } from "../../src/chords/parse.js";
import { parseChart, printParsed } from "../../src/index.js";

const ok = (symbol: string) => {
	const r = parseChord(symbol);
	if (!r.ok) throw new Error(`${symbol}: ${r.error.message}`);
	return r;
};
const fails = (symbol: string) => {
	const r = parseChord(symbol);
	if (r.ok) throw new Error(`${symbol} reads as ${r.value.canonical}`);
	return r.error;
};

/** Written, the canonical spelling it reads as, its pitches. */
const READS: [string, string, string][] = [
	["C∆", "Cmaj7", "C E G B"],
	["C∆7", "Cmaj7", "C E G B"],
	["C△", "Cmaj7", "C E G B"],
	["C△7", "Cmaj7", "C E G B"],
	["C▵", "Cmaj7", "C E G B"],
	["C▵7", "Cmaj7", "C E G B"],
	["C∆9", "Cmaj9", "C E G B D"],
	["C△9", "Cmaj9", "C E G B D"],
	["C▵9", "Cmaj9", "C E G B D"],
	["C∆13", "Cmaj13", "C E G B D A"],
	["C△13", "Cmaj13", "C E G B D A"],
	["CMaj9", "Cmaj9", "C E G B D"],
	["Cma9", "Cmaj9", "C E G B D"],
	["CMaj13", "Cmaj13", "C E G B D A"],
	["Cma13", "Cmaj13", "C E G B D A"],
	["CmΔ", "Cmmaj7", "C Eb G B"],
	["CmΔ7", "Cmmaj7", "C Eb G B"],
	["C-Δ", "Cmmaj7", "C Eb G B"],
	["C-Δ7", "Cmmaj7", "C Eb G B"],
	["CminΔ", "Cmmaj7", "C Eb G B"],
	["CminΔ7", "Cmmaj7", "C Eb G B"],
	["CmΔ9", "Cmmaj9", "C Eb G B D"],
	["C-Δ9", "Cmmaj9", "C Eb G B D"],
	["CminΔ9", "Cmmaj9", "C Eb G B D"],
	["Cm∆", "Cmmaj7", "C Eb G B"],
	["Cm△7", "Cmmaj7", "C Eb G B"],
	["C-▵", "Cmmaj7", "C Eb G B"],
	["Cmin∆7", "Cmmaj7", "C Eb G B"],
	["C-∆9", "Cmmaj9", "C Eb G B D"],
	["Cmin△9", "Cmmaj9", "C Eb G B D"],
	["Cm▵9", "Cmmaj9", "C Eb G B D"],
	// What may follow a maj7, maj9 or mmaj7 today.
	["CMaj9(#11)", "Cmaj9(#11)", "C E G B D F#"],
	["C∆7#11", "Cmaj7(#11)", "C E G B F#"],
	["CmΔ/Eb", "Cmmaj7/Eb", "C Eb G B"],
	["C-Δ9(11)", "Cmmaj9(11)", "C Eb G B D F"],
	["Cma13/E", "Cmaj13/E", "C E G B D A"],
	// Roots with accidentals, and the unicode ones.
	["F♯∆", "F#maj7", "F# A# C# E#"],
	["B♭-Δ", "Bbmmaj7", "Bb Db F A"],
	["E♭mΔ9", "Ebmmaj9", "Eb Gb Bb D F"],
	["F#ma9", "F#maj9", "F# A# C# E# G#"],
];

describe("the new spellings read as their maj and mmaj spellings", () => {
	test.each(READS)("%s is %s: %s", (written, canonical, pitches) => {
		const r = ok(written);
		expect(r.value.canonical).toBe(canonical);
		expect(r.value.pitches.join(" ")).toBe(pitches);
		expect(r.warnings).toEqual([]);
	});
	test.each(READS)("%s has its canonical spelling's Harte label, root and bass", (written) => {
		const r = ok(written);
		const c = ok(r.value.canonical);
		expect([r.value.harte, r.value.root, r.value.bass, r.value.pitches]).toEqual([
			c.value.harte,
			c.value.root,
			c.value.bass,
			c.value.pitches,
		]);
	});
	test.each(READS)("%s prints canonically, with no triangle or Maj", (written) => {
		const { canonical } = ok(written).value;
		expect(canonical).not.toMatch(/[Δ∆△▵]|Maj|ma(?!j)/);
		expect(ok(canonical).value.canonical).toBe(canonical);
	});
});

describe("a bare omission after the triangle reads as after the delta", () => {
	test.each([
		["C△no3", "Cmaj7(no3)", "CΔ(no3)"],
		["CmΔno5", "Cmmaj7(no5)", "CmΔ(no5)"],
		["C-∆7omit5", "Cmmaj7(no5)", "C-Δ7(omit5)"],
	])("%s reads as %s, suggesting %s", (written, canonical, suggestion) => {
		const r = ok(written);
		expect(r.value.canonical).toBe(canonical);
		expect(r.warnings).toHaveLength(1);
		expect(r.warnings[0]?.suggestion).toBe(suggestion);
		expect(ok(suggestion).value.canonical).toBe(canonical);
	});
});

describe("still refused", () => {
	// Each message as at the base commit 8d6319b.
	test.each([
		["CΔ11", 'CΔ11: cannot read "11"', undefined],
		["CMaj11", 'CMaj11: cannot read "Maj11"', undefined],
		["Cma11", 'Cma11: cannot read "a11"', undefined],
		["CΔsus4", '"sus4" is not allowed on this chord (Appendix A.3)', undefined],
		["C6Δ", 'C6Δ: cannot read "Δ"', undefined],
		["CMaj", 'CMaj: cannot read "Maj"', undefined],
		["Cma", 'Cma: cannot read "a"', undefined],
		["CMAJ7", 'CMAJ7: "M" is one shifted letter from "m"; write maj', "Cmaj7"],
		["CMa7", 'CMa7: "M" is one shifted letter from "m"; write maj', "Cma7"],
		["CM7", 'CM7: "M" is one shifted letter from "m"; write maj', "Cmaj7"],
		["Cmma7", 'Cmma7: cannot read "ma7"', undefined],
		["Cmma9", 'Cmma9: cannot read "ma9"', undefined],
		["CmMaj", 'CmMaj: cannot read "Maj"', undefined],
		["CmMaj11", 'CmMaj11: cannot read "Maj11"', undefined],
		// Maj after the minor quality is not an alias (Kevin, 2026-11-09: barmark does not read CmMaj7).
		["CmMaj7", 'CmMaj7: cannot read "Maj7"', undefined],
		["C-Maj7", 'C-Maj7: cannot read "Maj7"', undefined],
		["CminMaj7", 'CminMaj7: cannot read "Maj7"', undefined],
		["CmMaj9", 'CmMaj9: cannot read "Maj9"', undefined],
		["C-Maj9", 'C-Maj9: cannot read "Maj9"', undefined],
		["CminMaj9", 'CminMaj9: cannot read "Maj9"', undefined],
		["CmMaj13", 'CmMaj13: cannot read "Maj13"', undefined],
		["E♭mMaj7", 'E♭mMaj7: cannot read "Maj7"', undefined],
		["Cm(maj9)", 'Cm(maj9): "maj9" is not a tone a parenthesis can add', undefined],
		["Cm(Maj7)", 'Cm(Maj7): "Maj7" is not a tone a parenthesis can add', undefined],
	])("%s, as before", (written, message, suggestion) => {
		const e = fails(written);
		expect(e.message).toBe(message);
		expect(e.suggestion).toBe(suggestion);
	});
	test("the increment sign and the triangle before 11: as the delta, maj11 is not a chord", () => {
		for (const sign of ["∆", "△", "▵"]) {
			expect(fails(`C${sign}11`).message).toBe(`C${sign}11: cannot read "11"`);
		}
	});
	test("the delta 13 after m: the error Cmmaj13 gives", () => {
		const base = fails("Cmmaj13").message;
		expect(base).toBe('"m" with "maj13" is not a valid combination (Appendix A.3)');
		for (const written of ["CmΔ13", "C-Δ13", "CminΔ13", "Cm△13"]) {
			const e = fails(written);
			expect([written, e.message, e.token]).toEqual([written, base, written]);
		}
	});
	test("ma is not an alias after m: Cma7 stays C major seventh", () => {
		expect(ok("Cma7").value.canonical).toBe("Cmaj7");
		expect(parseChord("Cmma7").ok).toBe(false);
		expect(parseChord("C-ma7").ok).toBe(false);
	});
});

describe("in a chart", () => {
	test("| C∆7 | CmΔ | C-Δ9 | CMaj9 | reads cleanly and prints canonically", () => {
		const text = "| C∆7 | CmΔ | C-Δ9 | CMaj9 |\n";
		const parsed = parseChart(text);
		expect(parsed.diagnostics).toEqual([]);
		expect(printParsed(text, parsed)).toBe("| Cmaj7 | Cmmaj7 | Cmmaj9 | Cmaj9 |\n");
	});
});

describe("long input neither hangs nor throws", () => {
	const shapes: [string, (n: number) => string][] = [
		["C and deltas", (n) => `C${"Δ".repeat(n)}`],
		["Cm and increments", (n) => `Cm${"∆".repeat(n)}`],
		["C and Maj", (n) => `C${"Maj".repeat(n)}`],
	];
	for (const [name, shape] of shapes)
		test(
			`${name}: an error, in linear time`,
			() => {
				const [small, large] = [shape(5_000), shape(20_000)];
				expect(parseChord(large).ok).toBe(false);
				expect(
					growth(
						() => parseChord(small),
						() => parseChord(large),
						{ runs: 5, balance: 4 },
					),
				).toBeLessThan(12);
			},
			TIMING_TIMEOUT,
		);
});
