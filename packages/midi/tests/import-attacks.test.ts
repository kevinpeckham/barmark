import { describe, expect, test } from "bun:test";
import { attacksOf, isLine, lineOf, withoutShort } from "../src/import/attacks.js";
import { type Note, notesOf } from "../src/import/notes.js";
import { createReport } from "../src/import/report.js";
import { harmonyNotes, harmonyOf, selectedNotes } from "../src/import/streams.js";
import type { MidiImportOptions } from "../src/import/types.js";
import { readSmfInto } from "../src/smf/read.js";
import { fixtureBytes } from "./helpers/fixtures.js";

const PPQ = 480;
const note = (pitch: number, start: number, end: number, track = 1, channel = 0): Note => ({
	track,
	channel,
	pitch,
	start,
	end,
});

describe("withoutShort", () => {
	test("a 29-tick note is left out, a 30-tick note is kept", () => {
		const notes = [note(60, 0, 29), note(62, 480, 510), ...ten(2)];
		const r = withoutShort(notes, PPQ);
		expect(r.short).toBe(1);
		expect(r.kept).toHaveLength(notes.length - 1);
		expect(r.kept).toContain(notes[1] as Note);
	});
	test("more than a quarter short: none is left out", () => {
		const notes = [note(60, 0, 10), note(60, 100, 110), note(60, 200, 210), ...ten(7)];
		expect(withoutShort(notes, PPQ)).toEqual({ kept: notes, short: 0 });
	});
	test("2 short among 10 are both left out", () => {
		const notes = [note(60, 0, 10), note(60, 100, 110), ...ten(8)];
		const r = withoutShort(notes, PPQ);
		expect(r.short).toBe(2);
		expect(r.kept).toHaveLength(8);
	});
});

/** `n` whole-beat notes, end to end, from 1000. */
function ten(n: number): Note[] {
	return Array.from({ length: n }, (_, i) => note(60 + i, 1000 + i * 480, 1000 + (i + 1) * 480));
}

describe("attacksOf", () => {
	test("0 and 59 are one attack, pitches ascending", () => {
		const a = attacksOf([note(64, 0, 480), note(60, 59, 400)], PPQ);
		expect(a).toEqual([{ tick: 0, end: 480, pitches: [60, 64] }]);
	});
	test("0 and 60 are two attacks", () => {
		expect(attacksOf([note(64, 0, 100), note(60, 60, 200)], PPQ)).toHaveLength(2);
	});
	test("0, 50 and 100 are two attacks: the window runs from the first note", () => {
		const a = attacksOf([note(60, 0, 100), note(62, 50, 100), note(64, 100, 200)], PPQ);
		expect(a.map((x) => x.tick)).toEqual([0, 100]);
	});
	test("one pitch twice in an attack is one pitch", () => {
		const a = attacksOf([note(60, 0, 100), note(60, 10, 200, 2)], PPQ);
		expect(a[0]?.pitches).toEqual([60]);
		expect(a[0]?.end).toBe(200);
	});
});

/** `n` single-note attacks end to end. */
const single = (n: number) =>
	Array.from({ length: n }, (_, i) => ({ tick: i * 480, end: (i + 1) * 480, pitches: [60] }));

describe("isLine", () => {
	test("single notes end to end are a line", () => {
		expect(isLine(single(10), PPQ)).toBe(true);
	});
	test("1 double stop in 10 is a line, 2 are not", () => {
		const a = single(10);
		a[0] = { ...(a[0] as (typeof a)[0]), pitches: [60, 64] };
		expect(isLine(a, PPQ)).toBe(true);
		a[1] = { ...(a[1] as (typeof a)[0]), pitches: [60, 64] };
		expect(isLine(a, PPQ)).toBe(false);
	});
	test("1 attack struck 121 ticks under the last note is a line, 2 are not", () => {
		const a = single(10);
		a[5] = { tick: 5 * 480 - 121, end: 6 * 480, pitches: [60] };
		expect(isLine(a, PPQ)).toBe(true);
		a[7] = { tick: 7 * 480 - 121, end: 8 * 480, pitches: [60] };
		expect(isLine(a, PPQ)).toBe(false);
	});
	test("exactly 120 ticks under the end does not count", () => {
		const a = single(10);
		for (const i of [3, 5, 7]) a[i] = { tick: i * 480 - 120, end: (i + 1) * 480, pitches: [60] };
		expect(isLine(a, PPQ)).toBe(true);
	});
	test("no attacks is not a line", () => {
		expect(isLine([], PPQ)).toBe(false);
	});
});

describe("lineOf", () => {
	test("a line across three tracks and two channels", () => {
		const notes = [
			note(40, 0, 480, 1, 0),
			note(43, 480, 960, 2, 1),
			note(45, 960, 1440, 3, 0),
			note(47, 1440, 1920, 1, 1),
		];
		const r = lineOf([notes[2], notes[0], notes[3], notes[1]] as Note[], PPQ);
		expect(r).not.toBeNull();
		expect(r?.attacks.map((a) => a.tick)).toEqual([0, 480, 960, 1440]);
		expect(r?.notes).toHaveLength(4);
		expect(r?.short).toBe(0);
	});
	test("chords are not a line", () => {
		const notes = [note(60, 0, 480), note(64, 0, 480), note(60, 480, 960), note(64, 480, 960)];
		expect(lineOf(notes, PPQ)).toBeNull();
	});
});

function pitchedOf(name: string, options: MidiImportOptions) {
	const report = createReport();
	const { smf, names } = readSmfInto(fixtureBytes(name), report);
	if (smf === null) throw new Error("no file");
	const notes = notesOf(smf, report);
	return { pitched: selectedNotes(notes, names, options, report).pitched, ppq: smf.ppq };
}

describe("the spec's table", () => {
	test("band.mid track 4 alone is a line of 8 attacks", () => {
		const { pitched, ppq } = pitchedOf("band", { tracks: [4] });
		expect(lineOf(pitched, ppq)?.attacks).toHaveLength(8);
	});
	for (const name of [
		"band",
		"bass-and-chords",
		"comping-guitar",
		"hymn",
		"lead-sheet",
		"piano",
		"piano-comping",
	]) {
		test(`${name} is not a line`, () => {
			const { pitched, ppq } = pitchedOf(name, {});
			expect(lineOf(pitched, ppq)).toBeNull();
		});
	}
});

describe("selectedNotes and harmonyOf", () => {
	for (const options of [{ tracks: ["nobody"] }, { tracks: [4] }, {}] as MidiImportOptions[]) {
		test(`give what harmonyNotes gives for ${JSON.stringify(options)}`, () => {
			const a = createReport();
			const b = createReport();
			const one = readSmfInto(fixtureBytes("band"), a);
			readSmfInto(fixtureBytes("band"), b);
			if (one.smf === null) throw new Error("no file");
			const notes = notesOf(one.smf, a);
			const want = harmonyNotes(notes, one.names, options, a);
			const sel = selectedNotes(notes, one.names, options, b);
			const got = harmonyOf(sel, one.names, b);
			expect(got).toEqual(want);
			expect(b.list).toEqual(a.list);
		});
	}
});
