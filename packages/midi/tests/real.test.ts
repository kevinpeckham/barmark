import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { parseChart, printChart } from "barmark";
import type { MidiImportCode } from "../src/import/types.js";
import { importMidi } from "../src/index.js";
import { fixtureBytes, fixtureChart, MIDI_FIXTURES } from "./helpers/fixtures.js";

/**
 * MuseScore 4's own files (spec 9, Review Focus 4): what each imports to
 * was read over by hand against its score once, then checked in. The
 * reader's agreement with midi-file on each is in smf-read.test.ts.
 *
 * Two charts differ from their score's own symbols on purpose: the lead
 * sheet's `{F}` for its `FTristan`, a symbol MuseScore can't parse and so
 * sounds as F2 and F4 alone (there is no chord to hear), and the hymn's
 * `/ / G7` for its `G / G7`, the G of bar 2 carried into bar 3 as sync
 * writes a chord that goes on. Both are in FINDINGS ("MuseScore pedals
 * one staff's track, and its slash notes sound only when a file asks").
 */

/** What each file reports: MuseScore's slash notes and melodies left out, its drums too. */
const CODES: Record<(typeof MIDI_FIXTURES)[number], MidiImportCode[]> = {
	"lead-sheet": ["melody-left-out"],
	band: [],
	hymn: ["melody-left-out"],
	"comping-guitar": [],
	piano: [],
	"piano-comping": [],
	"bass-and-chords": ["drums-left-out", "melody-left-out"],
};

describe("MuseScore's files", () => {
	test("the fixtures are exactly the listed ones", () => {
		const dir = new URL("fixtures/", import.meta.url);
		const files = readdirSync(dir).filter((f) => f.endsWith(".mid") || f.endsWith(".chart.md"));
		const want = MIDI_FIXTURES.flatMap((name) => [`${name}.chart.md`, `${name}.mid`]);
		expect(files.sort()).toEqual(want.sort());
	});

	for (const name of MIDI_FIXTURES)
		test(`${name} imports to its checked-in chart`, () => {
			const r = importMidi(fixtureBytes(name));
			expect(r.text).toBe(fixtureChart(name));
			expect(r.diagnostics.map((d) => d.code)).toEqual(CODES[name]);
			expect(parseChart(r.text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
			expect(printChart(r.text)).toBe(r.text);
		});

	test("the lead sheet's chords are its symbols, its melody left out", () => {
		expect(fixtureChart("lead-sheet")).toContain("| Fmaj7 | C7 | Fmaj7     | Gm7 C7     |");
	});

	test("the hymn's pickup is a quarter, its verses under it", () => {
		expect(fixtureChart("hymn")).toContain("| [1/4] N.C. | G ");
	});

	test("the band's two parts are one chord line", () => {
		expect(fixtureChart("band")).toContain("| G/B | C | Em7 | D |");
	});

	test("the comping guitar's push lands on the beat", () => {
		expect(fixtureChart("comping-guitar")).toContain("| Em7 | A7 | D7 | G6 |");
	});

	test("the pedalled piano's chords come from its notes alone", () => {
		expect(fixtureChart("piano-comping")).toContain("| Am7 | D7 | Gm7 C7 | Fmaj7 |\n| F6 |");
	});

	test("the left hand's pedal holds the right hand's arpeggio, a track away", () => {
		// bar 8: F3 A3 C4 E4 … one at a time on track 1; the pedal only on track 2, one channel
		const r = importMidi(fixtureBytes("piano-comping"));
		expect(r.text.split("\n")[2]).toBe("| Am7 | D7 | Gm7 C7 | Fmaj7 |");
	});

	test("the band's bass gives the slash chord and its rehearsal marks the headings", () => {
		expect(fixtureChart("bass-and-chords")).toContain("## A\n| C | C/E | F | G7 |");
		expect(fixtureChart("bass-and-chords")).toContain("## B\n| Am | F | Dm7 G7 | C |");
	});
});
