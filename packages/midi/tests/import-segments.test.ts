import { describe, expect, test } from "bun:test";
import type { KeyAt } from "../src/import/directives.js";
import type { Grid } from "../src/import/grid.js";
import type { Note } from "../src/import/notes.js";
import { notesOf } from "../src/import/notes.js";
import { createReport, type Report } from "../src/import/report.js";
import { chordRuns } from "../src/import/segments.js";
import { harmonyNotes } from "../src/import/streams.js";
import { exportMidi } from "../src/index.js";
import { readSmf } from "../src/smf/read.js";

const PPQ = 480;
const BAR = 1920;
/** A 16th note: the attack window. */
const ATTACK = PPQ / 4;

const C2 = 36;
const E2 = 40;
const G2 = 43;
const A2 = 45;
const B2 = 47;
const C3 = 48;
const G3 = 55;
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

/** The 1-based 4/4 bar holding `tick`. */
const barOf = (tick: number) => Math.floor(tick / BAR) + 1;

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

	test("a strum is one attack, its bass the lowest note struck within a 16th", () => {
		// struck from the top: the bass, C4, comes last
		expect(runs([note(G4, 0, BAR), note(E4, 20, BAR), note(C4, 40, BAR)])).toEqual([
			{ start: 0, end: BAR, symbol: "C" },
		]);
	});

	test("two notes starting within a 16th are an attack; a 16th apart, they are not", () => {
		// C2 C4 E4 G4 held two bars; F4 and A4 enter in bar 2 (C E F G A over C)
		const enter = (gap: number) =>
			symbols(
				[
					...chord([C2, C4, E4, G4], 0, 2 * BAR),
					note(F4, BAR, 2 * BAR),
					note(A4, BAR + gap, 2 * BAR),
				],
				2,
			);
		expect(enter(ATTACK - 1)).toEqual(["C", "Fmaj9/C"]);
		// each enters alone over the held chord: no new chord, one name for the two bars (F for
		// 1,920 and A for 1,800 of C's 3,840 are no passing tones)
		expect(enter(ATTACK)).toEqual(["Fmaj9/C"]);
	});

	test("a melody note doesn't cut; a passing tone is dropped", () => {
		const harmony = [...chord([C4, E4, G4], 0, BAR), note(D5, 0, 240), note(E5, 240, BAR)];
		expect(runs(harmony)).toEqual([{ start: 0, end: BAR, symbol: "C" }]);
	});

	test("a pitch class at a quarter of the strongest weight stays; under it, it is passing", () => {
		// C, E and G for a bar, G in two octaves (still 1,920: a pitch class weighs its time
		// once); A for 480 is a quarter
		const withA = (length: number) =>
			symbols([...chord([C4, E4, G4, G4 + 12], 0, BAR), note(A4, BAR - length, BAR)]);
		expect(withA(480)).toEqual(["C6"]);
		expect(withA(479)).toEqual(["C"]);
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

	test("a lone note as a chord stops carries the chord; after silence it starts again", () => {
		// E4 struck as C stops is a single line: the chord carries (Claude's ruling, fix round 1)
		expect(runs([...chord([C4, E4, G4], 0, 960), note(E4, 960, BAR)])).toEqual([
			{ start: 0, end: BAR, symbol: "C" },
		]);
		// a gap is silence: what follows starts afresh
		expect(runs([...chord([C4, E4, G4], 0, 900), note(E4, 960, BAR)])).toEqual([
			{ start: 0, end: 900, symbol: "C" },
			{ start: 900, end: 960, symbol: "N.C." },
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
		// the same notes over another bass, in one chart (apart, so the second starts afresh)
		const twice = [
			...chord([C3, E4, G4], 0, BAR - 1),
			note(E2, BAR, 2 * BAR),
			...chord([C4, E4, G4], BAR, 2 * BAR),
		];
		expect(symbols(twice, 2)).toEqual(["C", "N.C.", "C/E"]);
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

	describe("chords from the harmony voices, not the bass line (fix round 1)", () => {
		/** The harmony an exported chart's import reads. */
		function fromChart(body: string): Note[] {
			const out = exportMidi(
				`part: Pno = Piano\npart: Bs = Bass, instrument: electric bass\n${body}\n`,
			);
			if (!out.ok) throw new Error("export failed");
			const smf = readSmf(out.bytes).smf;
			if (smf === null) throw new Error("read failed");
			const report = createReport();
			return harmonyNotes(notesOf(smf, report), [], {}, report);
		}
		/** A note of the bass line, on its own track. */
		const bassNote = (pitch: number, start: number, end: number): Note => ({
			...note(pitch, start, end),
			track: 2,
		});
		/** Bass quarters over a bar from `bar`. */
		const walk = (pitches: number[], bar = 0) =>
			pitches.map((p, i) => bassNote(p, bar * BAR + i * 480, bar * BAR + (i + 1) * 480));
		/** Eighth stabs on beats 2 and 4 of `bar`. */
		const stabs = (pitches: number[], bar = 0) =>
			[1, 3].flatMap((beat) =>
				chord(pitches, bar * BAR + beat * 480, bar * BAR + beat * 480 + 240),
			);

		test("a walking bass under comping is one chord", () => {
			// `Pno | Cmaj7 -- Cmaj7 -- |` over `Bs | {C2} {E2} {G2} {A2} |`
			expect(symbols(fromChart("Pno | Cmaj7 -- Cmaj7 -- |\nBs | {C2} {E2} {G2} {A2} |"))).toEqual([
				"Cmaj7",
			]);
			// the piano enters on beat 2: the bass leading in belongs to its chord, so the bar is Fmaj7
			expect(symbols(fromChart("Pno | -- Fmaj7 -- Fmaj7 |\nBs | {F2} {A2} {C3} {D3} |"))).toEqual([
				"Fmaj7",
			]);
		});

		test("stabs on 2 and 4 over a walking bass", () => {
			// E G B stabs over C E G A: Cmaj7, the bass at the start giving the root
			expect(symbols([...walk([C2, E2, G2, A2]), ...stabs([E4, G4, B3 + 12])])).toEqual(["Cmaj7"]);
			// Dm7 then G7, the same shape: the change sounds in the stabs' rest, so it is at the bar line
			const twoFive = [
				...walk([38, 41, 45, 48]),
				...stabs([F4, A4, 72]),
				...walk([43, 47, 50, 53], 1),
				...stabs([B3 + 12, 74, 77], 1),
			];
			expect(runs(twoFive, 2)).toEqual([
				{ start: 0, end: BAR, symbol: "Dm7" },
				{ start: BAR, end: 2 * BAR, symbol: "G7" },
			]);
		});

		test("a melody note on top of a re-strike is no new chord (MuseScore piano.mscx bar 2)", () => {
			// 3/4 at 480: chord playback E2 E4 G4 B4 held; the left hand E2, then G2 B2 twice; melody G4, A4
			const bar2: Note[] = [
				{ track: 1, channel: 0, pitch: 67, start: 0, end: 959 },
				{ track: 1, channel: 0, pitch: 69, start: 960, end: 1439 },
				...[40, 64, 67, 71].map((pitch) => ({ track: 1, channel: 1, pitch, start: 0, end: 1440 })),
				{ track: 2, channel: 0, pitch: 40, start: 0, end: 479 },
				...[43, 47].flatMap((pitch) => [
					{ track: 2, channel: 0, pitch, start: 480, end: 959 },
					{ track: 2, channel: 0, pitch, start: 960, end: 1439 },
				]),
			].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
			const waltz: Grid = {
				ppq: PPQ,
				bars: [{ start: 0, meter: { n: 3, d: 4 } }],
				end: 1440,
				pickup: false,
			};
			expect(chordRuns(bar2, waltz, [], createReport()).map((r) => r.symbol)).toEqual(["Em"]);
		});

		test("a new note under the top is a new chord, and a re-strike that drops the chord is too", () => {
			// C E G held; then F A struck together below the held G: a change (C E F G A over C)
			const below = [...chord([C3, E4, G4 + 12], 0, 2 * BAR), ...chord([F4, A4], BAR, 2 * BAR)];
			expect(symbols(below, 2)).toEqual(["C", "Fmaj9/C"]);
			// a single new top note over the chord still sounding is melody, and weighs nothing
			const over = [...chord([C3, E4, G4], 0, 2 * BAR), ...chord([C4, E4, A4], BAR, 2 * BAR)];
			expect(symbols(over, 2)).toEqual(["C"]);
		});

		test("a re-strike of fewer voices is no new chord", () => {
			// Cmaj7 struck on beat 1, then only E and G on beat 3 (alone, C E G), over a held C2
			const thinned = [
				bassNote(C2, 0, BAR),
				...chord([C4, E4, G4, 71], 0, 480),
				...chord([E4, G4], 960, 1440),
			];
			expect(symbols(thinned)).toEqual(["Cmaj7"]);
		});

		test("a change after a rest moves to the bar line only where the bass moved there", () => {
			// G2 enters on beat 4 and is held to bar 2 beat 3: nothing moves at the bar line, so G7
			// starts at its stab on beat 2, over the held G2
			const tied = [
				...walk([38, 41, 45]),
				bassNote(G2, 1440, BAR + 960),
				...stabs([F4, A4, 72]),
				bassNote(B2, BAR + 960, BAR + 1440),
				bassNote(53, BAR + 1440, 2 * BAR),
				...stabs([B3 + 12, 74, 77], 1),
			];
			expect(runs(tied, 2)).toEqual([
				{ start: 0, end: BAR + 480, symbol: "Dm7" },
				{ start: BAR + 480, end: 2 * BAR, symbol: "G7" },
			]);
			// a pedal C2 under a C stab (bar 1, beat 1) and a G stab (bar 2, beat 3): G/C on beat 3
			const pedal = [
				bassNote(C2, 0, 2 * BAR),
				...chord([C4, E4, G4], 0, 480),
				...chord([G3, B3, D4], BAR + 960, BAR + 1440),
			];
			expect(runs(pedal, 2)).toEqual([
				{ start: 0, end: BAR + 960, symbol: "C" },
				{ start: BAR + 960, end: 2 * BAR, symbol: "G(11)/C" },
			]);
		});

		test("single lines with no chord struck cut where they strike together or start afresh", () => {
			// a melody over a bass line, no chords: a cut where both strike at once
			const duet = [
				bassNote(C2, 0, 1000),
				...[E4, G4].map((p, i) => note(p, i * 480, (i + 1) * 480)),
				bassNote(41, 960, BAR),
				note(A4, 960, BAR),
			];
			expect(symbols(duet)).toEqual(["C", "{F A}"]);
			// a broken chord from silence reads note by note (spec 5.5's known limit)
			const broken = [C3, E4, G4].map((p, i) => note(p, i * 480, (i + 1) * 480));
			expect(symbols(broken)).toEqual(["{C}", "{E}", "{G}", "N.C."]);
		});

		test("a re-strike that changes the voicing in any way is a new chord (fix round 2)", () => {
			// Task 13b's: each chord struck from its bass, D5 and C5 after D7sus4
			expect(symbols(fromChart("Pno | D7sus4 | D5 | C5 |"), 3)).toEqual(["D7sus4", "D5", "C5"]);
			expect(symbols(fromChart("Pno | Am7 | C | G7 | G |"), 4)).toEqual(["Am7", "C", "G7", "G"]);
			// a new top note, all struck again: C then C7, whatever the octave of the Bb
			const top = [
				...chord([C3, C4, E4, G4], 0, BAR),
				...chord([C3, C4, E4, G4, 70], BAR, 2 * BAR),
			];
			expect(symbols(top, 2)).toEqual(["C", "C7"]);
			// dropping only, struck from the bottom inside a bar: Cmaj7 then C
			const inside = [...chord([C3, E4, G4, 71], 0, 960), ...chord([C3, E4, G4], 960, BAR)];
			expect(symbols(inside)).toEqual(["Cmaj7", "C"]);
			// Task 13b's: a guitar's dyad struck from its own lowest note over the piano's held D/F#
			const piano = chord([42, 62, 66, 69], 0, BAR);
			const guitar = (pitches: number[], start: number) =>
				pitches.map((p) => ({ ...note(p, start, start + 480), track: 3 }));
			const dyads = [...piano, ...guitar([E4, 71], 960), ...guitar([D4, A4], 1440)];
			expect(runs(dyads)).toEqual([
				{ start: 0, end: 960, symbol: "D/F#" },
				{ start: 960, end: 1440, symbol: "D6/9/F#" },
				{ start: 1440, end: BAR, symbol: "D/F#" },
			]);
		});

		test("the bass moving to a new pitch class at a bar line under the same voicing is a new chord", () => {
			// one track: C/E then C/G
			const slash = [...chord([E2, C4, E4, G4], 0, BAR), ...chord([G2, C4, E4, G4], BAR, 2 * BAR)];
			expect(symbols(slash, 2)).toEqual(["C/E", "C/G"]);
			// a held pad over a bass line C | F: the slash at bar 2
			const pad = [
				...chord([C4, E4, G4], 0, 2 * BAR),
				bassNote(C2, 0, BAR),
				bassNote(41, BAR, 2 * BAR),
			];
			expect(runs(pad, 2).map((r) => [r.start, r.symbol])).toEqual([
				[0, "C"],
				[BAR, "C(11)/F"],
			]);
			// inside a bar the walking bass moves nothing (as above): one chord
			expect(symbols([...walk([C2, E2, G2, A2]), ...chord([E4, G4, B3 + 12], 0, BAR)])).toEqual([
				"Cmaj7",
			]);
		});

		test("a stab's chord is named from what sounds with it, not a fill after it", () => {
			// C stab a quarter, then C5 B4 A4 single notes (one track; then over a bass line)
			const fill = [
				...chord([C3, E4, G4], 0, 480),
				note(72, 480, 960),
				note(71, 960, 1440),
				note(A4, 1440, BAR),
			];
			expect(symbols(fill)).toEqual(["C"]);
			expect(symbols([bassNote(C2, 0, BAR), ...fill])).toEqual(["C"]);
			// a pedal C2 on the chord's own track, under a quarter stab: still C
			expect(symbols([note(C2, 0, BAR), ...chord([C4, E4, G4], 0, 480)])).toEqual(["C"]);
		});

		test("a bass leading in across a bar line reads alone (Task 13b)", () => {
			// `| {D2} | / | / | / | D |`: the chord starts at its bar, the pedal before it reads alone
			const intro = [note(38, 0, 4 * BAR), ...chord([50, 62, 66, 69], 4 * BAR, 5 * BAR)];
			expect(runs(intro, 5)).toEqual([
				{ start: 0, end: 4 * BAR, symbol: "{D}" },
				{ start: 4 * BAR, end: 5 * BAR, symbol: "D" },
			]);
			// the voices entering on beat 2: the chord still starts at the bar line, over the held D2
			const late = [note(38, 0, 5 * BAR), ...chord([62, 66, 69], 4 * BAR + 480, 5 * BAR)];
			expect(runs(late, 5)).toEqual([
				{ start: 0, end: 4 * BAR, symbol: "{D}" },
				{ start: 4 * BAR, end: 5 * BAR, symbol: "D" },
			]);
		});

		test("a grace note doesn't lose the bass line", () => {
			// C2 E2, an F2 grace 30 ticks into G2 (two starts within the window), A2
			const grace = [
				bassNote(C2, 0, 480),
				bassNote(E2, 480, 930),
				bassNote(41, 930, 960),
				bassNote(G2, 960, 1440),
				bassNote(A2, 1440, BAR),
			];
			expect(symbols([...grace, ...chord([E4, G4, 71], 0, BAR)])).toEqual(["Cmaj7"]);
			expect(symbols([...grace, ...stabs([E4, G4, 71])])).toEqual(["Cmaj7"]);
		});

		test("a thinner re-strike at a bar line is a new chord", () => {
			// C3 held two bars; E4 G4 B4 then E4 G4 at bar 2, above the chord's lowest voice
			const thin = [
				note(C3, 0, 2 * BAR),
				...chord([E4, G4, 71], 0, BAR),
				...chord([E4, G4], BAR, 2 * BAR),
			];
			expect(symbols(thin, 2)).toEqual(["Cmaj7", "C"]);
		});

		test("a thinner voicing is judged per stream", () => {
			// a guitar first strikes G4 B4 in the piano's carried Cmaj7, then B4 E5 above its own G4
			// as the piano stops: carried. A guitar never heard in the chord striking E4 G4: a new one
			const gtr = (pitches: number[], start: number, end: number) =>
				pitches.map((p) => ({ ...note(p, start, end), track: 3 }));
			const carried = [
				...chord([C3, E4, G4, 71], 0, 960),
				...gtr([G4, 71], 480, 960),
				...gtr([71, E5], 960, BAR),
			];
			expect(symbols(carried)).toEqual(["Cmaj7"]);
			const fresh = [...chord([C3, E4, G4, 71], 0, 960), ...gtr([E4, G4], 960, BAR)];
			expect(runs(fresh).map((r) => r.start)).toEqual([0, 960]);
		});

		test("a bass struck a little off the bar line still moves the chord there", () => {
			// a held C E G over E2, then G2 struck 40 ticks late
			const late = [
				...chord([C4, E4, G4], 0, 2 * BAR),
				bassNote(E2, 0, BAR + 40),
				bassNote(G2, BAR + 40, 2 * BAR),
			];
			expect(runs(late, 2).map((r) => [r.start, r.symbol])).toEqual([
				[0, "C/E"],
				[BAR + 40, "C/G"],
			]);
		});

		test("a bass moving at a bar line while the voices rest starts no chord (fix round 3)", () => {
			// a C stab, then the bass C2 to F2 at bar 2: the chord carries
			const rest = [
				...chord([C4, E4, G4], 0, 480),
				bassNote(C2, 0, BAR),
				bassNote(41, BAR, 2 * BAR),
			];
			expect(symbols(rest, 2)).toEqual(["C"]);
			// the voices back on the same chord over the new bass: the slash from the bar line
			const back = [...rest, ...chord([C4, E4, G4], BAR + 480, BAR + 960)];
			expect(runs(back, 2).map((r) => [r.start, r.symbol])).toEqual([
				[0, "C"],
				[BAR, "C(11)/F"],
			]);
		});

		test("a change after a rest starts at the last bar line where the bass moved", () => {
			// a C/G stab; the bass walks C E G A | G B D F; a G stab on bar 3 beat 3: G from bar 3,
			// where the bass came back to G, not from bar 2
			const walk = [C2, E2, G2, A2, G2, B2, 50, 53].map((p, i) =>
				bassNote(p, BAR + i * 480, BAR + (i + 1) * 480),
			);
			const back = [
				bassNote(G2, 0, BAR),
				...chord([C4, E4, G4], 0, 240),
				...walk,
				...chord([G3, B3, D4], 2 * BAR + 960, 2 * BAR + 1200),
			];
			expect(runs(back, 3).map((r) => [r.start, r.symbol])).toEqual([
				[0, "C/G"],
				[2 * BAR, "G"],
			]);
		});

		test("a bass re-struck on its pitch class under a chord struck after it moves nothing", () => {
			// C2 whole notes, re-struck at bar 2; C E G from the and of 1 for two bars, B only in bar 1
			const held = [
				bassNote(C2, 0, BAR),
				bassNote(C2, BAR, 2 * BAR),
				...chord([C4, E4, G4], 240, 2 * BAR),
				note(71, 240, BAR),
			];
			expect(symbols(held, 2)).toEqual(["Cmaj7"]);
		});

		test("one track: a new bass note at the bar line under a held chord starts nothing", () => {
			const pad = [...chord([C4, E4, G4], 0, 2 * BAR), note(C2, 0, BAR), note(G2, BAR, 2 * BAR)];
			expect(symbols(pad, 2)).toEqual(["C"]);
		});

		test("a bass anticipating its move and struck again on the bar line moved there", () => {
			// a C stab; the bass C2, then G2 on the and of 4 and again on bar 2; a G stab on bar 2 beat 2
			const early = [
				bassNote(C2, 0, 1680),
				bassNote(G2, 1680, BAR),
				bassNote(G2, BAR, 2 * BAR),
				...chord([C4, E4, G4], 0, 240),
				...chord([G3, B3, D4], BAR + 480, BAR + 720),
			];
			expect(runs(early, 2).map((r) => r.start)).toEqual([0, BAR]);
		});

		test("the bass moving under one voice still sounding keeps the chord's sound", () => {
			// C E G struck; only C4 held into bar 2, where the bass moves C2 to F2
			const thin = [
				...chord([E4, G4], 0, BAR),
				note(C4, 0, 2 * BAR),
				bassNote(C2, 0, BAR),
				bassNote(41, BAR, 2 * BAR),
			];
			expect(symbols(thin, 2)).toEqual(["C", "C(11)/F"]);
		});

		test("the bass re-struck on its own pitch class moves nothing", () => {
			// C2 struck each bar under a C stab, then a G stab on bar 2 beat 3: G starts there
			const same = [
				bassNote(C2, 0, BAR),
				bassNote(C2, BAR, 2 * BAR),
				...chord([C4, E4, G4], 0, 480),
				...chord([G3, B3, D4], BAR + 960, BAR + 1440),
			];
			expect(runs(same, 2).map((r) => r.start)).toEqual([0, BAR + 960]);
		});

		test("a bass line note under a lower held note is no bass move", () => {
			// the piano holds C2 and C E G, and B into bar 2; the bass line C1, then F2 at bar 2
			// above the held C2: no move, one Cmaj7 (a cut at bar 2 would read B as passing there)
			const piano = [
				note(C2, 0, 2 * BAR),
				...chord([C4, E4, G4], 0, 2 * BAR),
				note(71, 0, BAR + 480),
			];
			const low = [...piano, bassNote(24, 0, BAR), bassNote(41, BAR, 2 * BAR)];
			expect(symbols(low, 2)).toEqual(["Cmaj7"]);
		});

		test("a chord struck just before the bar line after a lead-in starts where struck", () => {
			const early = [note(38, 0, 4 * BAR), ...chord([50, 62, 66, 69], 4 * BAR - 60, 5 * BAR)];
			expect(runs(early, 5)).toEqual([
				{ start: 0, end: 4 * BAR - 60, symbol: "{D}" },
				{ start: 4 * BAR - 60, end: 5 * BAR, symbol: "D" },
			]);
		});

		test("a written sustain pedal doesn't stop a chord changing", () => {
			const pedalled = fromChart("Pno | +C | F | G | *C |");
			expect(runs(pedalled, 4).map((r) => r.start)).toEqual([0, BAR, 2 * BAR, 3 * BAR]);
		});

		test("a single line above the chords is not the bass line", () => {
			const melody = [...chord([C3, E4, G4], 0, BAR), { ...note(D5, 0, BAR), track: 2 }];
			expect(symbols(melody)).toEqual(["C(9)"]);
		});

		test("a key change re-spells a carried chord", () => {
			const fSharp = chord([66, 70, 73], 0, 2 * BAR);
			expect(symbols(fSharp, 2, [keyAt(0, "D"), keyAt(BAR, "Db")])).toEqual(["F#", "Gb"]);
			// spelled the same in both keys: one run
			expect(runs(fSharp, 2, [keyAt(0, "D"), keyAt(BAR, "E")])).toEqual([
				{ start: 0, end: 2 * BAR, symbol: "F#" },
			]);
		});

		test("at most 20,000 different names an import", () => {
			// one C held while the key changes 20,001 times: each key a different sound to name
			const names = ["C", "G", "D", "A", "E", "F", "Bb", "Eb"];
			const keys = Array.from({ length: 20_001 }, (_, i) => keyAt(i * 12, names[i % 8] as string));
			const end = 20_001 * 12;
			const report = createReport();
			const bars = Math.ceil(end / BAR);
			const out = runs(chord([C4], 0, end), bars, keys, report);
			// the first 20,000 named ({C}, merged), the last written ?
			expect(out.slice(0, 2)).toEqual([
				{ start: 0, end: 20_000 * 12, symbol: "{C}" },
				{ start: 20_000 * 12, end, symbol: "?" },
			]);
			const capped = report.list.filter((d) => d.message.includes("20,000"));
			expect(capped.map((d) => [d.code, d.bar, d.message.includes("times")])).toEqual([
				["chord-unnamed", barOf(20_000 * 12), false],
			]);
		});
	});
});
