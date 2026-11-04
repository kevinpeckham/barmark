/** Clefs by bars (spec 3): the part's clef by its bars, and clef changes for runs on the other side of middle C. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { measures, notes, xmlOf } from "./helpers.js";

/** Each measure's clef change, "" when it writes none. */
const clefs = (text: string) =>
	measures(xmlOf(text)).map((m) => /<clef><sign>([GF])<\/sign>/.exec(m)?.[1] ?? "");

const grammar = readFileSync(
	new URL("../../../docs/grammar-v0.1-draft.md", import.meta.url),
	"utf8",
);
const exampleSong = /```[a-z]*\n(# Example Song[\s\S]*?)\n```/.exec(grammar)?.[1] ?? "";

describe("clefs", () => {
	test("a part of low note sets is bass", () => {
		expect(clefs("| {E2 B2} | {A2 E3} |")).toEqual(["F", ""]);
	});
	test("Example Song is treble, with bass for its pedal bars", () => {
		const shown = clefs(exampleSong);
		expect(shown.slice(0, 5)).toEqual(["F", "", "", "", "G"]);
		expect(shown.slice(5).every((c) => c === "")).toBe(true);
	});
	test("one long low note doesn't make a chart of slashes bass", () => {
		expect(clefs("| {D2} | / | C | D | E | F | G | A |")).toEqual([
			"F",
			"",
			"G",
			"",
			"",
			"",
			"",
			"",
		]);
	});
	test("a bass part keeps its clef for one high bar that needs few ledger lines", () => {
		expect(clefs("| {E2} | {A2} | {G4} | {D2} |")).toEqual(["F", "", "", ""]);
	});
	test("one bar that needs more than three ledger lines changes clef for that bar", () => {
		expect(clefs("| {E2} | {A2} | {C6} | {D2} |")).toEqual(["F", "", "G", "F"]);
	});
	test("two high bars in a bass part change clef and change back", () => {
		expect(clefs("| {E2} | {A2} | {E4} | {G4} | {D2} | {G2} | {A2} |")).toEqual([
			"F",
			"",
			"G",
			"",
			"F",
			"",
			"",
		]);
	});
	test("a part of slashes is treble, with no clef after the first measure", () => {
		expect(clefs("| C | D | E | F |")).toEqual(["G", "", "", ""]);
	});
	test("a slash in a bass clef sits on the bass staff's middle line", () => {
		const [, , m = ""] = measures(xmlOf("| {E2} | {A2} | C |"));
		expect(notes(m)[0]).toContain("<step>D</step><octave>3</octave>");
	});
});
