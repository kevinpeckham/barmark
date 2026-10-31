import { describe, expect, test } from "bun:test";
import { parseBarLine } from "../../src/chart/barLine.js";
import { printCell } from "../../src/chart/print.js";
import type { Cell } from "../../src/chart/types.js";

const cell = (text: string): Cell => {
	const r = parseBarLine(`| ${text} |`, 1);
	const c = r.bars?.cells[0];
	if (!c) throw new Error(`${text}: ${r.diagnostics.map((d) => d.message).join("; ")}`);
	return c;
};
const printed = (text: string) => printCell(cell(text));

describe("fewest slots", () => {
	const cases: [string, string][] = [
		["G / D /", "G D"],
		["-- --", "--"],
		["N.C. N.C. N.C. N.C.", "N.C."],
		["/ /", "/"],
		["C / D / E / F /", "C D E F"],
		["G / G /", "G G"],
	];
	for (const [from, to] of cases) test(`${from} → ${to}`, () => expect(printed(from)).toBe(to));
	for (const same of [
		"G G",
		"Am7 Am7 Am7 G7",
		"C / / D",
		"G -- -- --",
		"? ?",
		"D / / /_G",
		"D_E D_E",
	]) {
		test(`${same} stays`, () => expect(printed(same)).toBe(same));
	}
});

describe("canonical spellings", () => {
	const cases: [string, string][] = [
		["F♯m", "F#m"],
		["– —", "--"],
		["NC", "N.C."],
		["n.c.", "N.C."],
		["N.C", "N.C."],
		["{E4 C3}", "{C3 E4}"],
		["{F♯ B♭}", "{F# Bb}"],
		["Bb7b9", "Bb7(b9)"],
		["Caug7", "Caug7"],
		["D_–", "D_--"],
	];
	for (const [from, to] of cases) test(`${from} → ${to}`, () => expect(printed(from)).toBe(to));
});

describe("cells", () => {
	test("a one-bar meter", () => expect(printed("[2/4] G / / /")).toBe("[2/4] G"));
	test("simile", () => expect(printed("%")).toBe("%"));
	test("fermata", () => expect(printed("…")).toBe("..."));
});
