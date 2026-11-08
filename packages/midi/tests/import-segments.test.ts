import { describe, expect, test } from "bun:test";
import type { KeyAt } from "../src/import/directives.js";
import type { Grid } from "../src/import/grid.js";
import type { Note } from "../src/import/notes.js";
import { createReport, type Report } from "../src/import/report.js";
import { chordRuns } from "../src/import/segments.js";

const PPQ = 480;
const BAR = 1920;
/** A 32nd note: the attack window. */
const ATTACK = PPQ / 8;

const C2 = 36;
const E2 = 40;
const G2 = 43;
const A2 = 45;
const C3 = 48;
const F3 = 53;
const G3 = 55;
const A3 = 57;
const B3 = 59;
const C4 = 60;
const D4 = 62;
const E4 = 64;
const F4 = 65;
const G4 = 67;
const A4 = 69;
const D5 = 74;
const E5 = 76;

/** `bars` bars of 4/4 from tick 0. */
const grid = (bars: number): Grid => ({
	ppq: PPQ,
	bars: Array.from({ length: bars }, (_, i) => ({ start: i * BAR, meter: { n: 4, d: 4 } })),
	end: bars * BAR,
	pickup: false,
});

const note = (pitch: number, start: number, end: number): Note => ({
	track: 1,
	channel: 0,
	pitch,
	start,
	end,
});
const chord = (pitches: number[], start: number, end: number): Note[] =>
	pitches.map((p) => note(p, start, end));

/** A key in force from `tick` (its scale isn't read here). */
const keyAt = (tick: number, name: string): KeyAt => ({ tick, name, scale: new Set() });

/** The runs over `bars` bars, by the harmony's start order. */
function runs(harmony: Note[], bars = 1, keys: KeyAt[] = [], report: Report = createReport()) {
	const sorted = [...harmony].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
	return chordRuns(sorted, grid(bars), keys, report);
}
const symbols = (...args: Parameters<typeof runs>) => runs(...args).map((r) => r.symbol);

describe("chordRuns", () => {
	test("block chords", () => {
		expect(runs([...chord([C4, E4, G4], 0, BAR), ...chord([G3, B3, D4], BAR, 2 * BAR)], 2)).toEqual(
			[
				{ start: 0, end: BAR, symbol: "C" },
				{ start: BAR, end: 2 * BAR, symbol: "G" },
			],
		);
	});

	test("a strum is one attack, its bass the lowest note struck within a 32nd", () => {
		// struck from the top: the bass, C4, comes last
		expect(runs([note(G4, 0, BAR), note(E4, 20, BAR), note(C4, 40, BAR)])).toEqual([
			{ start: 0, end: BAR, symbol: "C" },
		]);
	});

	test("two notes starting within a 32nd are an attack; a 32nd apart, they are not", () => {
		// C2 held two bars; F3 and A3 enter in bar 2
		const enter = (gap: number) =>
			symbols([note(C2, 0, 2 * BAR), note(F3, BAR, 2 * BAR), note(A3, BAR + gap, 2 * BAR)], 2);
		expect(enter(ATTACK - 1)).toEqual(["{C}", "F/C"]);
		// each enters alone under the held C2: no cut, one segment of C, F and A
		expect(enter(ATTACK)).toEqual(["F/C"]);
	});

	test("a melody note doesn't cut; a passing tone is dropped", () => {
		const harmony = [...chord([C4, E4, G4], 0, BAR), note(D5, 0, 240), note(E5, 240, BAR)];
		expect(runs(harmony)).toEqual([{ start: 0, end: BAR, symbol: "C" }]);
	});

	test("a pitch class at a quarter of the strongest weight stays; under it, it is passing", () => {
		// C, E and G for a bar (G the strongest: two octaves, 3840); A for 960 is a quarter
		const withA = (length: number) =>
			symbols([...chord([C4, E4, G4, G4 + 12], 0, BAR), note(A4, BAR - length, BAR)]);
		expect(withA(960)).toEqual(["C6"]);
		expect(withA(959)).toEqual(["C"]);
	});

	test("the bass's pitch class is kept, however short", () => {
		// E2 for an eighth under C4 and C5 held a bar: E weighs 240 of C's 3840
		expect(symbols([note(E2, 0, 240), ...chord([C4, C4 + 12], 0, BAR)])).toEqual(["{E C}"]);
	});

	test("a walking bass under a held chord gives the bass at the start", () => {
		const walk = [C2, E2, G2, A2].map((p, i) => note(p, i * 480, (i + 1) * 480));
		expect(runs([...chord([C4, E4, G4], 0, BAR), ...walk])).toEqual([
			{ start: 0, end: BAR, symbol: "C" },
		]);
	});

	test("a push cuts", () => {
		expect(
			runs([...chord([C4, E4, G4], 0, 1680), ...chord([G3, B3, D4], 1680, 2 * BAR)], 2),
		).toEqual([
			{ start: 0, end: 1680, symbol: "C" },
			{ start: 1680, end: 2 * BAR, symbol: "G" },
		]);
	});

	test("a fresh start cuts", () => {
		expect(runs([...chord([C4, E4, G4], 0, 960), note(E4, 960, BAR)])).toEqual([
			{ start: 0, end: 960, symbol: "C" },
			{ start: 960, end: BAR, symbol: "{E}" },
		]);
	});

	test("silence is N.C.", () => {
		expect(runs(chord([C4, E4, G4], 0, BAR), 2)).toEqual([
			{ start: 0, end: BAR, symbol: "C" },
			{ start: BAR, end: 2 * BAR, symbol: "N.C." },
		]);
		// before the first note too: the runs cover the grid from its first bar
		expect(runs(chord([C4, E4, G4], BAR, 1.5 * BAR), 2)).toEqual([
			{ start: 0, end: BAR, symbol: "N.C." },
			{ start: BAR, end: 1.5 * BAR, symbol: "C" },
			{ start: 1.5 * BAR, end: 2 * BAR, symbol: "N.C." },
		]);
	});

	test("equal neighbours merge", () => {
		// C struck on every beat, then again after a rest of an eighth
		const beats = [0, 1, 2].flatMap((b) => chord([C4, E4, G4], b * 480, (b + 1) * 480));
		expect(runs([...beats, ...chord([C4, E4, G4], 1680, BAR)])).toEqual([
			{ start: 0, end: 1440, symbol: "C" },
			{ start: 1440, end: 1680, symbol: "N.C." },
			{ start: 1680, end: BAR, symbol: "C" },
		]);
	});

	test("inversions and the key", () => {
		expect(symbols([note(E2, 0, BAR), ...chord([C4, E4, G4], 0, BAR)])).toEqual(["C/E"]);
		// the same notes over another bass, in one chart
		const twice = [
			...chord([C3, E4, G4], 0, BAR),
			note(E2, BAR, 2 * BAR),
			...chord([C4, E4, G4], BAR, 2 * BAR),
		];
		expect(symbols(twice, 2)).toEqual(["C", "C/E"]);
		const bFlat = chord([70, 74, 77], 0, BAR); // A# D F
		expect(symbols(bFlat, 1, [keyAt(0, "F")])).toEqual(["Bb"]);
		expect(symbols(bFlat, 1, [keyAt(0, "B")])).toEqual(["A#"]);
	});

	test("the key in force at the segment's start spells it; the first key from bar 1", () => {
		const fSharp = (bar: number) => chord([66, 70, 73], bar * BAR, (bar + 1) * BAR);
		const keys = [keyAt(0, "D"), keyAt(BAR, "Db")];
		expect(symbols([...fSharp(0), ...fSharp(1)], 2, keys)).toEqual(["F#", "Gb"]);
		// a first key written after the start is the chart's key from bar 1 (spec 5.4)
		expect(symbols(fSharp(0), 1, [keyAt(BAR / 2, "Db")])).toEqual(["Gb"]);
	});

	test("chords are spelled for the key sync writes, the conventional one", () => {
		// a key signature of seven flats, Cb, is written as B (sync's conventionalKey)
		expect(symbols(chord([71, 75, 78], 0, BAR), 1, [keyAt(0, "Cb")])).toEqual(["B"]);
	});

	test("a held note is the bass; the tail of the last chord is not", () => {
		// a pedal C2 under C then F
		const pedal = [
			note(C2, 0, 2 * BAR),
			...chord([C4, E4, G4], 0, BAR),
			...chord([C4, F4, A4], BAR, 2 * BAR),
		];
		expect(symbols(pedal, 2)).toEqual(["C", "F/C"]);
		// G played legato into C: G2 sounds a 16th into the C chord
		const legato = [
			note(G2, 0, BAR + PPQ / 4),
			...chord([G3, B3, D4], 0, BAR),
			note(C3, BAR, 2 * BAR),
			...chord([E4, G4, C4 + 12], BAR, 2 * BAR),
		];
		expect(symbols(legato, 2)).toEqual(["G", "C"]);
	});

	test("unnamed", () => {
		const report = createReport();
		const cluster = (bar: number) => chord([60, 61, 62, 63, 64], bar * BAR, (bar + 1) * BAR);
		const harmony = [...cluster(0), ...chord([C4, E4, G4], BAR, 2 * BAR), ...cluster(2)];
		expect(symbols(harmony, 3, [], report)).toEqual(["?", "C", "?"]);
		expect(report.list.map((d) => [d.severity, d.code, d.bar])).toEqual([
			["warning", "chord-unnamed", 1],
		]);
		// the message gives the bars, never the notes (a value read from the file)
		const [d] = report.list;
		expect(d?.message).toContain("(2 times; bars 1 and 3)");
		expect(d?.message).not.toMatch(/C#|Db|\{/);
		// at most three pitch classes: a note set, bass first then upward, spelled for the key
		expect(symbols(chord([C4, D4], 0, BAR))).toEqual(["{C D}"]);
		expect(symbols([note(E2, 0, BAR), note(C4, 0, BAR)])).toEqual(["{E C}"]);
		expect(symbols(chord([60, 61, 62], 0, BAR))).toEqual(["{C C# D}"]);
		expect(symbols(chord([60, 61, 62], 0, BAR), 1, [keyAt(0, "F")])).toEqual(["{C Db D}"]);
		expect(symbols(chord([70], 0, BAR), 1, [keyAt(0, "F")])).toEqual(["{Bb}"]);
		// four pitch classes nothing names: ?
		expect(symbols(chord([60, 61, 62, 63], 0, BAR))).toEqual(["?"]);
	});

	test("MuseScore's chord playback reads as written", () => {
		expect(symbols(chord([41, C4, E4, F4, A4], 0, BAR))).toEqual(["Fmaj7"]);
	});

	test("a rootless voicing over the bass line names the chord", () => {
		// spec 5.6's residual {E Bb D} is Bb(b5)/E alone; over a C bass it is C9
		expect(symbols([note(C2, 0, BAR), ...chord([52, 58, 62], 0, BAR)])).toEqual(["C9"]);
		expect(symbols([note(C2, 0, BAR), ...chord([58, 64, 69], 0, BAR)])).toEqual(["C7(13)"]);
	});

	test("no harmony and no grid", () => {
		expect(runs([], 2)).toEqual([{ start: 0, end: 2 * BAR, symbol: "N.C." }]);
		const empty: Grid = { ppq: PPQ, bars: [], end: 0, pickup: false };
		expect(chordRuns(chord([C4], 0, BAR), empty, [], createReport())).toEqual([]);
	});
});
