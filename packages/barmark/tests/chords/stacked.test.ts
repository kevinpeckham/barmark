/**
 * Stacked spellings (Kevin, 2026-11-10; stem-shovel issue 16): notation
 * programs print a chord's alterations one after another with no separator
 * ("D6 add9 omit5"), so charts arrive as `D6(omit5add9)` and `Gadd9omit3`.
 * Those read as their comma-separated form, with a warning whose suggestion
 * is that spelling. An altered fifth before the parenthesis on a chord with
 * no extension (`F#b5(omit3)`) stays an error, now with a suggestion where
 * the reading is unambiguous.
 */
import { describe, expect, test } from "bun:test";
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

describe("the stem-shovel table: accepted with a warning", () => {
	const accepted: [string, string, string][] = [
		// symbol, suggestion, canonical
		["D6(omit5add9)", "D6(omit5,add9)", "D6(9,no5)"],
		["D6(no5add9)", "D6(no5,add9)", "D6(9,no5)"],
		["Gadd9omit3", "Gadd9(omit3)", "G5(9)"],
		["Gomit5", "G(omit5)", "G(no5)"],
		["Gno5", "G(no5)", "G(no5)"],
	];
	for (const [symbol, suggestion, canonical] of accepted) {
		test(`${symbol} reads as ${suggestion}`, () => {
			const r = ok(symbol);
			const written = ok(suggestion);
			expect(r.value.canonical).toBe(canonical);
			expect(r.value.canonical).toBe(written.value.canonical);
			expect(r.value.pitches).toEqual(written.value.pitches);
			expect(r.value.parts).toEqual(written.value.parts);
			expect(r.value.source).toBe(symbol);
		});
		test(`${symbol} warns, suggesting ${suggestion}`, () => {
			const { warnings } = ok(symbol);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]?.token).toBe(symbol);
			expect(warnings[0]?.suggestion).toBe(suggestion);
			expect(warnings[0]?.message).toStartWith(`${symbol}: `);
		});
		test(`the suggestion for ${symbol} reads with no warning`, () => {
			expect(ok(suggestion).warnings).toEqual([]);
		});
	}
	test("the warning names what is wrong", () => {
		expect(ok("D6(omit5add9)").warnings[0]?.message).toContain("commas");
		expect(ok("Gomit5").warnings[0]?.message).toContain("parentheses");
	});
});

describe("the stem-shovel table: the spellings that already read", () => {
	const spellings: [string, string][] = [
		["D6(omit5,add9)", "D6(9,no5)"],
		["Gadd9(omit3)", "G5(9)"],
		["F#(b5,omit3)", "F#5(b5)"],
		["D6(no5)(add9)", "D6(9,no5)"],
		["G(omit5)", "G(no5)"],
	];
	for (const [symbol, canonical] of spellings)
		test(`${symbol} reads as before, with no warning`, () => {
			const r = ok(symbol);
			expect(r.value.canonical).toBe(canonical);
			expect(r.warnings).toEqual([]);
		});
});

describe("the stem-shovel table: an altered fifth before the parenthesis", () => {
	test("F#b5(omit3) is still an error, suggesting F#(b5,omit3)", () => {
		const e = fails("F#b5(omit3)");
		expect(e.token).toBe("F#b5(omit3)");
		expect(e.suggestion).toBe("F#(b5,omit3)");
		expect(e.message).toStartWith("F#b5(omit3): ");
		expect(e.message).toContain("parentheses");
	});
	test("the suggestion reads", () => {
		expect(ok("F#(b5,omit3)").value.canonical).toBe("F#5(b5)");
	});
	test("a sharp fifth, a minor chord, a slash bass and no parenthesis", () => {
		expect(fails("F#b5").suggestion).toBe("F#(b5)");
		expect(fails("C#5(omit3)").suggestion).toBeUndefined();
		expect(fails("D#5(omit3)").suggestion).toBeUndefined();
		expect(fails("E#5(no3)").suggestion).toBeUndefined();
		expect(fails("C#b5(omit3)/E").suggestion).toBe("C#(b5,omit3)/E");
		expect(fails("Fm#5").suggestion).toBe("Fm(#5)");
		expect(fails("Eb#5(omit3)").suggestion).toBe("Eb(#5,omit3)");
	});
	test("run-together items in its parenthesis are separated in the suggestion", () => {
		expect(fails("F#b5(omit3add9)").suggestion).toBe("F#(b5,omit3,add9)");
	});
	test("a flat root that could swallow the b is ambiguous: said so, no suggestion", () => {
		for (const symbol of ["Gb5(omit3)", "Ab5(no3)", "Bb5(omit3add9)"]) {
			const e = fails(symbol);
			expect(e.suggestion).toBeUndefined();
			expect(e.message).toContain("ambiguous");
			expect(e.message).toContain(`${symbol.slice(0, 2)}5`);
		}
	});
	test("so is a sharp root before 5", () => {
		const e = fails("G#5(omit3)");
		expect(e.suggestion).toBeUndefined();
		expect(e.message).toContain("ambiguous");
	});
});

describe("run-together items that are themselves wrong are still errors", () => {
	test("the same tone left out twice", () => {
		expect(fails("C(omit5omit5)").message).toContain("no5 is written twice");
		expect(fails("C(no5no5)").message).toContain("no5 is written twice");
	});
	test("a tone a chord can't leave out", () => {
		expect(fails("C7(omit7add9)").message).toContain('"no7": a chord leaves out only');
	});
	test("a tone a parenthesis can't add", () => {
		expect(fails("C(omit5add13)").message).toContain('"add13"');
		expect(fails("C(b9#12)").message).toContain('"#12"');
	});
	test("an altered tone left out", () => {
		expect(fails("C7(b5omit5)").message).toContain("the 5th is altered and left out");
	});
	test("a bare omission of a tone the chord doesn't have", () => {
		expect(fails("Csus4omit3").message).toContain("has no 3rd to leave out");
		expect(fails("Gomit7").message).toContain('"no7"');
	});
	test("digits run together are not split", () => {
		expect(fails("C(911)").message).toContain('"911"');
	});
});

describe("other run-together tones", () => {
	test("alterations run together", () => {
		const r = ok("C7(b9#11)");
		expect(r.value.canonical).toBe("C7(b9,#11)");
		expect(r.warnings[0]?.suggestion).toBe("C7(b9,#11)");
		expect(ok("C9(#11b13)").value.canonical).toBe("C9(#11,b13)");
		expect(ok("C7(9b13)").value.canonical).toBe("C7(9,b13)");
	});
	test("in one item of a list, the rest as written", () => {
		const r = ok("C7(b9#11,no5)");
		expect(r.value.canonical).toBe("C7(b9,#11,no5)");
		expect(r.warnings[0]?.suggestion).toBe("C7(b9,#11,no5)");
	});
	test("omit with a space", () => {
		const r = ok("D6(omit 5add9)");
		expect(r.value.canonical).toBe("D6(9,no5)");
		expect(r.warnings[0]?.suggestion).toBe("D6(omit 5,add9)");
	});
	test("Unicode accidentals", () => {
		expect(ok("C7(♭9♯11)").value.canonical).toBe("C7(b9,#11)");
	});
});

describe("mixed shapes", () => {
	test("a bare omission and a parenthesis: Gadd9omit3(b13)", () => {
		const r = ok("Gadd9omit3(b13)");
		expect(r.value.canonical).toBe(ok("Gadd9(b13,omit3)").value.canonical);
		expect(r.value.canonical).toBe("G5(9,b13)");
		expect(r.warnings).toHaveLength(1);
		expect(r.warnings[0]?.suggestion).toBe("Gadd9(b13,omit3)");
	});
	test("a bare omission with a slash bass", () => {
		const r = ok("Gm7omit5/D");
		expect(r.value.canonical).toBe("Gm7(no5)/D");
		expect(r.warnings[0]?.suggestion).toBe("Gm7(omit5)/D");
	});
	test("a bare omission and run-together items", () => {
		const r = ok("C7omit5(b9#11)");
		expect(r.value.canonical).toBe("C7(b9,#11,no5)");
		expect(r.warnings).toHaveLength(1);
		expect(r.warnings[0]?.suggestion).toBe("C7(b9,#11,omit5)");
	});
	test("only after the quality as written, not after an alias (grammar 3)", () => {
		expect(fails("G-7omit5").message).toContain("cannot read");
		expect(fails("Gmin7no5").message).toContain("cannot read");
		expect(fails("CΔno3").message).toContain("cannot read");
	});
	test("a warning a stacked spelling has as written stays", () => {
		const r = ok("C7(7b9)");
		expect(r.value.canonical).toBe("C7(7,b9)");
		expect(r.warnings.map((w) => w.message)).toContainEqual("C7(7b9) already contains 7");
	});
});

describe("no regression on spellings that read today", () => {
	const today: [string, string, string][] = [
		["Ab5", "Ab5", "Ab:5"],
		["Cb9", "Cb9", "Cb:9"],
		["C7b9", "C7(b9)", "C:7(b9)"],
		["Gb5(9)", "Gb5(9)", "Gb:sus2"],
		["Am7b5", "Am7(b5)", "A:hdim7"],
		["Bbm7(b5)", "Bbm7(b5)", "Bb:hdim7"],
		["Cm(maj7)", "Cmmaj7", "C:minmaj7"],
		["Cadd9", "C(9)", "C:maj(9)"],
		["C(b9,add11)", "C(b9,11)", "C:maj(b9,11)"],
		["F#(5)(7)", "F#5(7)", "F#:5(b7)"],
		["C7(omit 3)", "C7(no3)", "C:7(*3)"],
		["Cadd9/G", "C(9)/G", "C:maj(9)/5"],
		["Db", "Db", "Db:maj"],
	];
	for (const [symbol, canonical, harte] of today)
		test(`${symbol} reads as ${canonical}, with no warning`, () => {
			const r = ok(symbol);
			expect(r.value.canonical).toBe(canonical);
			expect(r.value.harte).toBe(harte);
			expect(r.warnings).toEqual([]);
		});
	test("Cb5 is still the Cb power chord and Ab5 never A(b5)", () => {
		expect(ok("Cb5").value.pitches).toEqual(["Cb", "Gb"]);
		expect(ok("Ab5").value.root).toBe("Ab");
	});
});

describe("Harte labels for the accepted shapes", () => {
	const labels: [string, string][] = [
		["D6(omit5add9)", "D:maj6(9,*5)"],
		["D6(no5add9)", "D:maj6(9,*5)"],
		["Gomit5", "G:maj(*5)"],
		["Gno5", "G:maj(*5)"],
		["C7(b9#11)", "C:7(b9,#11)"],
	];
	for (const [symbol, harte] of labels)
		test(`${symbol} is ${harte}`, () => {
			expect(ok(symbol).value.harte).toBe(harte);
		});
	test("Gadd9omit3 is labelled as Gadd9(omit3) is", () => {
		expect(ok("Gadd9omit3").value.harte).toBe(ok("Gadd9(omit3)").value.harte);
	});
});

describe("a long run-together parenthesis reads in linear time", () => {
	/** The best of five parses of `symbol`, after one to warm up. */
	const timed = (symbol: string): number => {
		parseChord(symbol);
		let ms = Number.POSITIVE_INFINITY;
		for (let run = 0; run < 5; run++) {
			const start = performance.now();
			parseChord(symbol);
			ms = Math.min(ms, performance.now() - start);
		}
		return ms;
	};
	const shapes: [string, (n: number) => string][] = [
		["alterations", (n) => `C7(${"b9#11".repeat(n)})`],
		["adds", (n) => `D6(${"add9b13".repeat(n)})`],
		["omissions", (n) => `G(${"omit5".repeat(n)})`],
		["bare omissions", (n) => `G${"omit5".repeat(n)}`],
	];
	for (const [name, shape] of shapes)
		test(`${name}: ten times as long takes far less than a hundred times as long`, () => {
			const small = timed(shape(2_000));
			const large = timed(shape(20_000));
			expect(parseChord(shape(20_000))).toBeDefined();
			expect(large / Math.max(small, 0.5)).toBeLessThan(30);
		}, 60_000);
});

describe("review nits (PR #255)", () => {
	test("pieces split from an item are trimmed", () => {
		const r = ok("C7(b9 #11)");
		expect(r.value.canonical).toBe("C7(b9,#11)");
		expect(r.warnings[0]?.suggestion).toBe("C7(b9,#11)");
	});
	test("the ambiguity is said only when the fifth reading would read", () => {
		expect(fails("Gb5(omit3)").message).toContain("ambiguous");
		for (const symbol of ["Gb5(xyz)", "Gb5(no7)", "G#5(no7)"]) {
			const e = fails(symbol);
			expect(e.message).not.toContain("ambiguous");
			expect(e.suggestion).toBeUndefined();
		}
	});
	test("a bare omission is read only at the end of the chord's name, before any parenthesis or bass", () => {
		for (const symbol of ["Cno5maj7", "Cno5m", "CΔno3", "Comit5sus4", "Cno3add9"]) {
			expect(parseChord(symbol).ok).toBe(false);
		}
		expect(ok("Gm7omit5/D").value.canonical).toBe("Gm7(no5)/D");
		expect(ok("Gadd9omit3(b13)").value.canonical).toBe("G5(9,b13)");
		expect(ok("C7omit5(b9#11)").value.canonical).toBe("C7(b9,#11,no5)");
		expect(ok("Csus4omit5").value.canonical).toBe("Csus4(no5)");
		expect(ok("Cmmaj7no5").value.canonical).toBe("Cmmaj7(no5)");
		expect(ok("C7b9no5").value.canonical).toBe("C7(b9,no5)");
	});
	test("a bare omission after a parenthesis is not read", () => {
		expect(parseChord("C7(b9)no5").ok).toBe(false);
	});
});
