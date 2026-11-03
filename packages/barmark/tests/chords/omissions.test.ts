import { describe, expect, test } from "bun:test";
import { parseChord } from "../../src/chords/parse.js";

const ok = (symbol: string) => {
	const r = parseChord(symbol);
	if (!r.ok) throw new Error(r.error.message);
	return r.value;
};
const fails = (symbol: string) => {
	const r = parseChord(symbol);
	return r.ok ? null : r.error.message;
};

describe("omissions (no3, no5)", () => {
	test("no3 leaves out the third", () => {
		const c = ok("C7(no3)");
		expect(c.canonical).toBe("C7(no3)");
		expect(c.pitches).toEqual(["C", "G", "Bb"]);
	});
	test("no5 leaves out the fifth", () => {
		const c = ok("Cmaj9(no5)");
		expect(c.canonical).toBe("Cmaj9(no5)");
		expect(c.pitches).toEqual(["C", "E", "B", "D"]);
	});
	test("omissions go with other tones, listed after them", () => {
		expect(ok("C7(b9,no5)").pitches).toEqual(["C", "E", "Bb", "Db"]);
		expect(ok("C7(no5,b9)").canonical).toBe("C7(b9,no5)");
		expect(ok("C7(b9)(no5)").canonical).toBe("C7(b9,no5)");
	});
	test("omit3 and omit 3 are spelled no3", () => {
		expect(ok("C7(omit3)").canonical).toBe("C7(no3)");
		expect(ok("C7(omit 5)").canonical).toBe("C7(no5)");
	});
	test("a triad with no third is the power chord, one spelling", () => {
		expect(ok("C(no3)").canonical).toBe("C5");
		expect(ok("Cm(no3)").canonical).toBe("C5");
		expect(ok("C(no3)/G").canonical).toBe("C5/G");
		expect(ok("C(9,no3)").canonical).toBe("C5(9)");
	});
	test("the Harte label marks the omission", () => {
		expect(ok("C7(no3)").harte).toBe("C:7(*3)");
		expect(ok("Cmaj9(no5)").harte).toBe("C:maj9(*5)");
		expect(ok("C(no3)").harte).toBe("C:5");
	});
	test("a chord omits only a tone it has", () => {
		expect(fails("Csus4(no3)")).toContain("Csus4(no3): Csus4 has no 3rd to leave out");
		expect(fails("C11(no3)")).toContain("has no 3rd to leave out");
		expect(fails("C7alt(no5)")).toContain("has no 5th to leave out");
		expect(fails("C5(no3)")).toContain("C5 has no 3rd to leave out");
	});
	test("only the 3rd and the 5th can be left out", () => {
		expect(fails("C7(no7)")).toContain('"no7": a chord leaves out only its 3rd or 5th (no3, no5)');
	});
	test("a tone can't be both altered and left out", () => {
		expect(fails("C7(b5,no5)")).toContain("C7(b5,no5): the 5th is altered and left out");
	});
	test("leaving out a tone twice is an error", () => {
		expect(fails("C7(no3,no3)")).toContain("no3 is written twice");
	});
});
