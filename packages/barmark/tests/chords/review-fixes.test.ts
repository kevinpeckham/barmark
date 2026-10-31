import { describe, expect, test } from "bun:test";
import { harteToBarmark } from "../../src/chords/harte.js";
import { parseChord } from "../../src/chords/parse.js";

const ok = (symbol: string) => {
	const r = parseChord(symbol);
	if (!r.ok) throw new Error(`${symbol}: ${r.error.message}`);
	return r;
};

describe("inline alterations are limited to the tones a parenthesis allows", () => {
	for (const bad of ["C7b11", "C7#13", "Cmaj7b11"]) {
		test(`${bad} is an error`, () => expect(parseChord(bad).ok).toBe(false));
	}
});

describe("tone order never changes the chord", () => {
	for (const [a, b] of <[string, string][]>[
		["C7(9,b9)", "C7(b9,9)"],
		["C(13,b13)", "C(b13,13)"],
		["C7(#11,11)", "C7(11,#11)"],
	]) {
		test(`${a} and ${b} are the same chord, and the canonical re-parses to it`, () => {
			const x = ok(a).value;
			expect(ok(b).value.pitches).toEqual(x.pitches);
			expect(ok(x.canonical).value.pitches).toEqual(x.pitches);
		});
	}
});

describe("a tone the chord already has (by pitch class) warns and is not doubled", () => {
	for (const symbol of ["Csus2(9)", "Csus4(11)", "C6(13)"]) {
		test(symbol, () => {
			const r = ok(symbol);
			expect(r.warnings).toHaveLength(1);
			expect(new Set(r.value.pitches).size).toBe(r.value.pitches.length);
		});
	}
});

describe("Harte conversion picks the names musicians write", () => {
	const cases: [string, string][] = [
		["A:sus4", "Asus4"],
		["A:sus2", "Asus2"],
		["A:sus4(9)", "Asus4(9)"],
		["A:hdim7", "Am7(b5)"],
		["A:hdim7/b3", "Am7(b5)/C"],
		["F:aug(9)", "Faug(9)"],
	];
	for (const [label, out] of cases) {
		test(`${label} → ${out}`, () => expect(harteToBarmark(label)).toBe(out));
	}
	test("C11's Harte label reads as the 9sus4 it sounds like", () => {
		expect(ok("C11").value.harte).toBe("C:sus4(b7,9)");
	});
});

describe("the M rejection suggests something readable", () => {
	for (const [input, suggestion] of <[string, string][]>[
		["CMa7", "Cma7"],
		["CMAJ7", "Cmaj7"],
		["CMin7", "Cmin7"],
		["CM7/E", "Cmaj7/E"],
	]) {
		test(`${input} suggests ${suggestion}`, () => {
			const r = parseChord(input);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error.suggestion).toBe(suggestion);
		});
	}
});

describe("Harte shorthands are looked up as own keys only", () => {
	for (const label of ["C:constructor", "C:toString", "C:__proto__", "C:hasOwnProperty(9)"]) {
		test(`${label} is unreadable, never a throw`, () => {
			expect(harteToBarmark(label)).toBeNull();
		});
	}
});
