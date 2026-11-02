import { describe, expect, test } from "bun:test";
import { parseChart, parseChord } from "../../src/index.js";
import { play } from "../chart/fixtures.js";

/**
 * Conformance: the trap rules — places where a plausible misreading of
 * the grammar changes the music. Each expectation here was verified
 * against real recordings by the stem-bench program (the study is named
 * on each test); a parser that fails one of these plays the wrong song
 * while looking right.
 */

describe("conformance: the trap rules hold", () => {
	test("slash-in-a-cell is a beat hold, not a bar repeat (Study 16: the Letter Lands chorus split)", () => {
		// Four slots: three beats of F#5(7), one of Esus4 — NOT four bars.
		const r = play("| F#5(7) / / Esus4 |");
		expect(r.texts).toEqual(["F#5(7) / / Esus4"]);
	});
	test("% repeats the previous bar's contents; a lone / holds what was sounding (grammar section 2)", () => {
		const r = play("| C G | % | / |");
		expect(r.texts).toEqual(["C G", "C G", "/"]);
	});
	test("`...` alone in a cell is an unmeasured hold, never a counted bar (Study 16: Peaceful Dreams is 153 bars, not 154)", () => {
		const r = play("| Em | ... |");
		expect(r.bars).toHaveLength(1);
		expect(r.texts).toEqual(["Em"]);
	});
	test("N.C. is no harmony, -- is silence; a drums-only break is N.C. (Study 16: the Eat All the Clocks bridge)", () => {
		const r = play("| N.C. | -- |");
		expect(r.texts).toEqual(["N.C.", "--"]);
	});
	test("x N plays the whole LINE N times, never the last chord (Study 12: this ambiguity made a real chart unreadable)", () => {
		const r = play("| C | D | x2");
		expect(r.texts).toEqual(["C", "D", "C", "D"]);
	});
	test("a bare repeated heading replays its section (Study 16: three charts in the catalog depend on elision)", () => {
		const p = parseChart("tempo: 100\n\n## V\n| C | D |\n\n## B\n| E |\n\n## V\n");
		expect(p.bars.map((b) => b.index)).toEqual([1, 2, 3, 4, 5]);
		const starts = p.sections.filter((s) => s.firstBar !== null);
		expect(starts.map((s) => [s.name, s.firstBar])).toEqual([
			["V", 1],
			["B", 3],
			["V", 4],
		]);
	});
	test("a Logic parenthetical adds a tone, and a 5 before it keeps the third out (Study 16: the migrated spellings)", () => {
		const g = parseChord("G5(7)");
		expect(g.ok && g.value.pitches).toEqual(["G", "D", "F"]);
		const cs = parseChord("C#(7)");
		expect(cs.ok && cs.value.harte).toBe("C#:7");
	});
	test("a mid-chart key directive changes the key in force (Study 16: the Mop Heart outro)", () => {
		const p = parseChart("key: A, tempo: 224\n\n## A\n| A |\n\nkey: B\n\n## Out\n| B |\n");
		expect(p.bars.map((b) => b.key?.tonic)).toEqual(["A", "B"]);
	});
	test("`?` always warns, so no drafted gap gets published unnoticed (grammar section 2)", () => {
		const p = parseChart("tempo: 100\n\n## A\n| ? |\n");
		expect(p.diagnostics.length).toBeGreaterThan(0);
	});
	test("the legacy escaped-pipe idiom warns instead of reading to silence (barmark#1)", () => {
		const p = parseChart("**I - Intro**\n\n\\| F#(5)(7) \\| Esus4 \\|\n\nStructure: I II I\n");
		expect(p.bars).toHaveLength(0);
		expect(p.diagnostics.length).toBeGreaterThan(0);
		expect(p.diagnostics.some((d) => d.message.includes("escaped pipes"))).toBe(true);
	});
});
