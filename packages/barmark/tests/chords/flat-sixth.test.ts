/**
 * The flat sixth, `add` before any tone, and `Δ9` (Kevin, 2026-11-13 and
 * 2026-11-14; design `docs/superpowers/specs/2026-11-14-flat-sixth-design.md`).
 * A user wrote `F#m(♭6)`, `F#maddb6` and `F#maddb13`: all three now read,
 * and what is still refused says what to write instead.
 */
import { describe, expect, test } from "bun:test";
import { growth, TIMING_TIMEOUT } from "../../../../test-support/growth.js";
import type { Key } from "../../src/chart/types.js";
import { harteToBarmark } from "../../src/chords/harte.js";
import { nameNotes } from "../../src/chords/name.js";
import { parseChord } from "../../src/chords/parse.js";

const ok = (symbol: string) => {
	const r = parseChord(symbol);
	if (!r.ok) throw new Error(r.error.message);
	return r;
};
const fails = (symbol: string) => {
	const r = parseChord(symbol);
	if (r.ok) throw new Error(`${symbol} reads as ${r.value.canonical}`);
	return r.error;
};
/** The pitches a Harte label converts back to, as a set. */
const harteBack = (harte: string) => {
	const back = harteToBarmark(harte);
	if (!back) throw new Error(`${harte} does not convert`);
	return [...ok(back).value.pitches].sort();
};

/** Input, canonical, pitches (the parser's spelling and order), Harte label or null for a round trip. */
const READS: [string, string, string, string | null][] = [
	["F#m(b6)", "F#m(b6)", "F# A C# D", "F#:min(b6)"],
	["F#m(♭6)", "F#m(b6)", "F# A C# D", "F#:min(b6)"],
	["F#maddb6", "F#m(b6)", "F# A C# D", "F#:min(b6)"],
	["F#m(addb6)", "F#m(b6)", "F# A C# D", "F#:min(b6)"],
	["F#maddb13", "F#m(b13)", "F# A C# D", "F#:min(b13)"],
	["F#m(addb13)", "F#m(b13)", "F# A C# D", "F#:min(b13)"],
	["F#m7b6", "F#m7(b6)", "F# A C# D E", "F#:min7(b6)"],
	["F#m7b13", "F#m7(b13)", "F# A C# E D", "F#:min7(b13)"],
	["C(b6)", "C(b6)", "C E G Ab", "C:maj(b6)"],
	["C6(b6)", "C6(b6)", "C E G Ab", null],
	["C13(b6)", "C13(b6)", "C E G Ab Bb D A", null],
	["C(9,b6)", "C(b6,9)", "C E G Ab D", "C:maj(b6,9)"],
	["C(b6,#5)", "C(#5,b6)", "C E G# Ab", null],
	["Abaddb6", "Ab(b6)", "Ab C Eb Fb", null],
	["Cb6", "Cb6", "Cb Eb Gb Ab", "Cb:maj6"],
	["Cadd13", "C(13)", "C E G A", "C:maj6"],
	["C(add13)", "C(13)", "C E G A", "C:maj6"],
	["Cadd#11", "C(#11)", "C E G F#", "C:maj(#11)"],
	["C(add#11)", "C(#11)", "C E G F#", "C:maj(#11)"],
	["Caddb9", "C(b9)", "C E G Db", "C:maj(b9)"],
	["Cadd6", "C(6)", "C E G A", "C:maj6"],
	["Cadd7", "C(7)", "C E G Bb", "C:7"],
	["Am(b9,add13)", "Am(b9,13)", "A C E Bb F#", null],
	["Cm7add13", "Cm7(13)", "C Eb G Bb A", null],
	["Bbadd#11", "Bb(#11)", "Bb D F E", null],
	["CΔ9", "Cmaj9", "C E G B D", "C:maj9"],
	// Harte's maj13 has an 11 that barmark's maj13 does not: the parser's own label, as for Cmaj13.
	["CΔ13", "Cmaj13", "C E G B D A", "C:maj9(13)"],
	["DΔ9/F#", "Dmaj9/F#", "D F# A C# E", "D:maj9/3"],
	["CΔ9(#11)", "Cmaj9(#11)", "C E G B D F#", null],
	["CΔ9#11", "Cmaj9(#11)", "C E G B D F#", null],
	["CΔ", "Cmaj7", "C E G B", "C:maj7"],
	["CΔ7", "Cmaj7", "C E G B", "C:maj7"],
];

describe("what reads", () => {
	test.each(READS)("%s reads as %s", (input, canonical, pitches, harte) => {
		const r = ok(input);
		expect(r.value.canonical).toBe(canonical);
		expect(r.value.pitches.join(" ")).toBe(pitches);
		expect(r.warnings).toEqual([]);
		if (harte) expect(r.value.harte).toBe(harte);
		expect(harteBack(r.value.harte)).toEqual([...r.value.pitches].sort());
		// The canonical form reads as itself.
		expect(ok(canonical).value.canonical).toBe(canonical);
	});
	test("DΔ9/F# has F# in the bass", () => {
		expect(ok("DΔ9/F#").value.bass).toBe("F#");
	});
});

describe("warnings", () => {
	test("b6 and b13 are the same note: the second already there", () => {
		const r = ok("C(b6,b13)");
		expect(r.value.pitches).toEqual(["C", "E", "G", "Ab"]);
		expect(r.warnings).toHaveLength(1);
		expect(r.warnings[0]?.message).toContain("already contains");
	});
	const stackedMessage = (() => {
		const r = ok("D6(omit5add9)");
		return r.warnings[0]?.message.replace("D6(omit5add9): ", "") ?? "";
	})();
	test.each([
		["D6(omit5addb6)", "D6(b6,no5)"],
		["C(omit5add13)", "C(13,no5)"],
	])("%s reads as %s with the stacked-spelling warning", (input, canonical) => {
		const r = ok(input);
		expect(r.value.canonical).toBe(canonical);
		expect(r.warnings).toHaveLength(1);
		expect(r.warnings[0]?.message).toBe(`${input}: ${stackedMessage}`);
		const suggestion = r.warnings[0]?.suggestion ?? "";
		expect(ok(suggestion).value.canonical).toBe(canonical);
	});
});

describe("refused, with a suggestion only when it reads", () => {
	const REFUSED: [string, string, string | undefined][] = [
		["F#m(b2)", '"b2" is not a tone a parenthesis can add', "F#m(b9)"],
		["C(#2)", '"#2" is not a tone', "C(#9)"],
		["C(#4)", '"#4" is not a tone', "C(#11)"],
		["C(b7)", '"b7" is not a tone', "C(7)"],
		["C7(b2,#4)", '"b2" is not a tone', "C7(b9,#11)"],
		["C(b2,x)", "is not a tone", undefined],
		["Cmb6", "an altered 6th goes in the parentheses", "Cm(b6)"],
		["Cmb13", "an altered 13th goes in the parentheses", "Cm(b13)"],
		["Cmb9", "an altered 9th goes in the parentheses", "Cm(b9)"],
		["CΔ11", 'cannot read "11"', undefined],
		["Abmb6", "an altered 6th goes in the parentheses", "Abm(b6)"],
		["Cm#11", "an altered 11th goes in the parentheses", "Cm(#11)"],
		// Review Focus 4: each suggests a symbol that reads.
		["C5(b2)", '"b2" is not a tone', "C5(b9)"],
		["C6(b7)", '"b7" is not a tone', "C6(7)"],
		["Cdim(#4)", '"#4" is not a tone', "Cdim(#11)"],
		["F#m(♭2)", '"b2" is not a tone', "F#m(b9)"],
	];
	test.each(REFUSED)("%s", (input, message, suggestion) => {
		const e = fails(input);
		expect(e.message).toContain(message);
		expect(e.suggestion).toBe(suggestion);
		if (suggestion) expect(parseChord(suggestion).ok).toBe(true);
	});
	test("an alteration after a bare quality: the altered fifth's message, unchanged for b5", () => {
		expect(fails("Cmb6").message).toBe(
			"Cmb6: an altered 6th goes in the parentheses unless it follows an extension (grammar 3)",
		);
		expect(fails("Cmb5").message).toBe(
			"Cmb5: an altered 5th goes in the parentheses unless it follows an extension (grammar 3)",
		);
		expect(fails("Cmb5").suggestion).toBe("Cm(b5)");
	});
	test("a flat root that could be the alteration's flat: no suggestion", () => {
		// `Cb6`, `Ab9`, `Bb13` read as chords on flat roots; failing, they never become C(b6,…).
		for (const symbol of ["Cb6(no5,x)", "Ab9(x)", "Bb13(no7)"])
			expect(fails(symbol).suggestion).toBeUndefined();
		expect(ok("Ab9").value.root).toBe("Ab");
		expect(ok("Bb13").value.root).toBe("Bb");
	});
});

describe("add beside its neighbours (Review Focus 2): as add9 does in each place", () => {
	// Base commit a23242b: Cadd9 C(9), Cadd2 C(2), Cadd4 C(4), Cadd11 C(11),
	// Csus4add9 Csus4(9), Cm7add11 Cm7(11), Cadd9add11 C(9,11), Cadd9(b9)
	// C(b9,9), Cm7(add11)add9 Cm7(9,11).
	test.each([
		["Cadd9", "C(9)"],
		["Cadd2", "C(2)"],
		["Cadd4", "C(4)"],
		["Cadd11", "C(11)"],
		["Csus4add9", "Csus4(9)"],
		["Csus4add13", "Csus4(13)"],
		["Cm7add11", "Cm7(11)"],
		["Cadd9add11", "C(9,11)"],
		["Cadd9add13", "C(9,13)"],
		["Cadd9(b9)", "C(b9,9)"],
		["Cadd13(b9)", "C(b9,13)"],
		["Cm7(add11)add9", "Cm7(9,11)"],
		["Cm7(add13)add9", "Cm7(9,13)"],
	])("%s reads as %s", (input, canonical) => {
		expect(ok(input).value.canonical).toBe(canonical);
	});
	// The existing forms, at base: `cannot read "add"`, `"add5"`, `"add3"`,
	// `"add14"`, `"x(9)"`, and `"add" is not a tone a parenthesis can add`.
	test.each([
		["Cadd", 'Cadd: cannot read "add"'],
		["Cadd5", 'Cadd5: cannot read "add5"'],
		["Cadd3", 'Cadd3: cannot read "add3"'],
		["Cadd14", 'Cadd14: cannot read "add14"'],
		["Cadd9x", 'Cadd9x: cannot read "x(9)"'],
		["C(add)", 'C(add): "add" is not a tone a parenthesis can add'],
	])("%s is still refused, as before, with no suggestion", (input, message) => {
		const e = fails(input);
		expect(e.message).toBe(message);
		expect(e.suggestion).toBeUndefined();
	});
	test("Caddb2: add is stripped first, then b2 is refused, suggesting C(b9)", () => {
		const e = fails("Caddb2");
		expect(e.message).toContain('"b2" is not a tone a parenthesis can add');
		expect(e.suggestion).toBe("C(b9)");
	});
});

describe("a root's own accidental (Review Focus 1)", () => {
	test.each(["Ab6", "Bb6", "Eb6", "Gb6", "Db6", "Cb6"])("%s is a sixth chord", (symbol) => {
		const r = ok(symbol);
		expect(r.value.canonical).toBe(symbol);
		expect(r.value.root).toBe(symbol.slice(0, 2));
		expect(r.value.harte).toBe(`${symbol.slice(0, 2)}:maj6`);
	});
	test.each([
		["Cbadd9", "Cb(9)"],
		["Abaddb6", "Ab(b6)"],
		["Bbadd#11", "Bb(#11)"],
	])("%s reads with the root's flat", (symbol, canonical) => {
		expect(ok(symbol).value.canonical).toBe(canonical);
	});
});

describe("Harte labels in", () => {
	test.each([
		["C:min(b6)", "Cm(b6)"],
		["C:min(b13)", "Cm(b13)"],
		["C:maj(b6)", "C(b6)"],
		["C:min7(b6)", "Cm7(b6)"],
	])("%s is %s", (label, symbol) => {
		expect(harteToBarmark(label)).toBe(symbol);
	});
});

describe("a long run-together parenthesis reads in linear time (Review Focus 3)", () => {
	const shapes: [string, (n: number) => string][] = [
		["addb6", (n) => `C(${"addb6".repeat(n)})`],
		["add#11", (n) => `C(${"add#11".repeat(n)})`],
		["b6", (n) => `C(${"b6".repeat(n)})`],
	];
	for (const [name, shape] of shapes)
		test(
			`${name} 5,000 times takes far less than a hundred times 500`,
			() => {
				const [small, large] = [shape(500), shape(5_000)];
				expect(parseChord(large).ok).toBe(true);
				expect(
					growth(
						() => parseChord(small),
						() => parseChord(large),
						{ runs: 5, balance: 10, repeat: 2 },
					),
				).toBeLessThan(30);
			},
			TIMING_TIMEOUT,
		);
});

describe("names from notes are unchanged (Review Focus 5)", () => {
	const keys: (Key | null)[] = [
		null,
		...["C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"].map(
			(tonic): Key => ({ tonic, mode: "major" }),
		),
	];
	const sets: number[][] = [];
	const grow = (set: number[]) => {
		if (set.length >= 3) sets.push(set);
		if (set.length === 4) return;
		for (let pc = (set.at(-1) ?? -1) + 1; pc < 12; pc++) grow([...set, pc]);
	};
	grow([]);
	test("every three- and four-note set, on each of its notes, in 16 keys: the base commit's names", () => {
		const hash = new Bun.CryptoHasher("sha256");
		let count = 0;
		for (const key of keys)
			for (const pcs of sets)
				for (const bass of pcs) {
					hash.update(`${nameNotes(pcs, bass, key) ?? "-"}\n`);
					count++;
				}
		expect(count).toBe(42_240);
		// The same loop run at the base commit, a23242b, before `b6` was a tone.
		expect(hash.digest("hex")).toBe(
			"62b60ad77bad092159d5c797cde9ff9db9976ce5bcd1733f4374eb5343c2592f",
		);
	}, 60_000);
});
