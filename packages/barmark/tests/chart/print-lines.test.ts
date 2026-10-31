import { describe, expect, test } from "bun:test";
import { readDocument } from "../../src/chart/document.js";
import { printLine } from "../../src/chart/print.js";

const printed = (text: string) => {
	const l = readDocument(text).lines[0];
	if (!l) throw new Error(`no line: ${text}`);
	return printLine(l);
};

describe("canonical lines", () => {
	const cases: [string, string][] = [
		["|:D|A:|X3", "|: D | A :| x3"],
		["| E7 | / | × …", "| E7 | / | x ..."],
		["| D | A", "| D | A |"],
		["|: D | A |", "|: D | A |"],
		["##   Chorus   Two  x2 →", "## Chorus Two x2 ->"],
		["## Out x …", "## Out x ..."],
		["## Verse", "## Verse"],
		["FEEL: Swing 16, Key: E♭", "key: Eb, feel: swing 16"],
		["key: B minor", "key: Bm"],
		["key: A Mixolydian", "key: A mixolydian"],
		["tempo: 145 bpm", "tempo: 145"],
		["time: 6/8, tempo: 92.5", "time: 6/8, tempo: 92.5"],
		["#  Example Song ", "# Example Song"],
		["just some words", "just some words"],
	];
	for (const [from, to] of cases) test(`${from} → ${to}`, () => expect(printed(from)).toBe(to));
	test("an invalid bar line prints as written", () =>
		expect(printed("| D | Hm |")).toBe("| D | Hm |"));
});
