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
/** A 32nd note: the attack window. */
const ATTACK = PPQ / 8;

const C2 = 36;
const E2 = 40;
const G2 = 43;
const A2 = 45;
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

/** `count` different sounds: a bass and two to seven pitch classes above it. */
function differentSounds(count: number): number[][] {
	const sounds: number[][] = [];
	for (let mask = 1; mask < 4096; mask++) {
		const pcs = [...Array(12).keys()].filter((pc) => mask & (1 << pc));
		if (pcs.length < 2 || pcs.length > 7) continue;
		for (let bass = 0; bass < 12; bass++)
			if (!pcs.includes(bass)) sounds.push([24 + bass, ...pcs.map((pc) => 60 + pc)]);
		if (sounds.length >= count) break;
	}
	return sounds.slice(0, count);
}

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
		// each enters alone over the held chord, a melody note: no new chord, and over the two
		// bars A (1,860 of C's 7,680) is passing
		expect(enter(ATTACK)).toEqual(["C(11)"]);
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
			// a single new top note over the chord still sounding is melody
			const over = [...chord([C3, E4, G4], 0, 2 * BAR), ...chord([C4, E4, A4], BAR, 2 * BAR)];
			expect(symbols(over, 2)).toEqual(["C6"]);
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

		test("a bass tied over the bar line is the bass of a change placed there", () => {
			// as Dm7 to G7 above, but G2 enters on beat 4 and is held into bar 2
			const tied = [
				...walk([38, 41, 45]),
				bassNote(G2, 1440, BAR + 480),
				...stabs([F4, A4, 72]),
				...walk([47, 50, 53], 1).map((n) => ({ ...n, start: n.start + 480, end: n.end + 480 })),
				...stabs([B3 + 12, 74, 77], 1),
			].filter((n) => n.end <= 2 * BAR);
			expect(symbols(tied, 2)).toEqual(["Dm7", "G7"]);
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
			// 20,001 sounds, each apart
			const sounds = differentSounds(20_001);
			const harmony = sounds.flatMap((pitches, i) => chord(pitches, i * 120, i * 120 + 100));
			const report = createReport();
			const bars = Math.ceil((sounds.length * 120) / BAR);
			const out = runs(harmony, bars, [], report).filter((r) => r.symbol !== "N.C.");
			expect(out.length).toBe(20_001);
			const capped = report.list.filter((d) => d.message.includes("20,000"));
			expect(capped.map((d) => [d.code, d.bar])).toEqual([["chord-unnamed", bars]]);
			expect(out.at(-1)?.symbol).toBe("?");
			// one run capped, the last: the first 20,000 were named
			expect(capped[0]?.message).not.toContain("times");
		}, 60_000);
	});
});
