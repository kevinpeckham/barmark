import { describe, expect, test } from "bun:test";
import { type Note, notesOf } from "../src/import/notes.js";
import { createReport } from "../src/import/report.js";
import { harmonyNotes } from "../src/import/streams.js";
import type { MidiImportOptions } from "../src/import/types.js";
import { readSmf } from "../src/smf/read.js";
import type { Smf } from "../src/smf/types.js";
import { type Chunk, type Event, smf } from "./helpers/smf.js";

/** The file the helper writes, read back. */
function read(tracks: Chunk[]): { smf: Smf; names: (string | null)[] } {
	const r = readSmf(smf({ tracks }));
	if (r.smf === null) throw new Error(`no file: ${JSON.stringify(r.diagnostics)}`);
	return { smf: r.smf, names: r.names };
}

function notesFrom(tracks: Chunk[]) {
	const report = createReport();
	return { notes: notesOf(read(tracks).smf, report), report };
}

function harmonyFrom(tracks: Chunk[], options: MidiImportOptions = {}) {
	const report = createReport();
	const file = read(tracks);
	const notes = notesOf(file.smf, report);
	return { harmony: harmonyNotes(notes, file.names, options, report), notes, report };
}

const note = (track: number, pitch: number, start: number, end: number, channel = 0): Note => ({
	track,
	channel,
	pitch,
	start,
	end,
});
const codes = (report: ReturnType<typeof createReport>) =>
	report.list.map((d) => [d.severity, d.code, d.track]);
/** The harmony as (track, channel, pitch, start) rows, sorted. */
const rows = (notes: Note[]) =>
	notes
		.map((n) => [n.track, n.channel, n.pitch, n.start])
		.sort((a, b) => String(a).localeCompare(String(b)));

/** An event at an absolute tick. */
type At = { tick: number; e: Event };
const at = (tick: number, e: Omit<Event, "dt">): At => ({ tick, e: { dt: 0, ...e } as Event });

/** Notes on `channel`, `length` ticks apart, each held `overlap` ticks into the next. */
function line(channel: number, pitches: number[], length = 480, overlap = 0): At[] {
	return pitches.flatMap((pitch, i) => [
		at(i * length, { on: [channel, pitch, 80] }),
		at((i + 1) * length + overlap, { off: [channel, pitch] }),
	]);
}

/** Chords on `channel`, each `length` ticks, one after another. */
function chords(channel: number, voicings: number[][], length = 1920): At[] {
	return voicings.flatMap((pitches, i) =>
		pitches.flatMap((pitch) => [
			at(i * length, { on: [channel, pitch, 80] }),
			at((i + 1) * length, { off: [channel, pitch] }),
		]),
	);
}

/** A track of these events, as delta times; offs before ons at one tick. */
function track(...parts: At[][]): Event[] {
	const order = (e: Event) => ("off" in e ? 0 : 1);
	const sorted = parts.flat().sort((a, b) => a.tick - b.tick || order(a.e) - order(b.e));
	let last = 0;
	return sorted.map(({ tick, e }) => {
		const out = { ...e, dt: tick - last };
		last = tick;
		return out;
	});
}

const C_E_G = [60, 64, 67];
const MELODY = [67, 69, 67, 65, 67, 72, 67, 64]; // median G4
const BASS = [36, 36, 43, 36, 31, 36, 38, 36]; // median C2

describe("notesOf", () => {
	test("pairs notes", () => {
		const { notes, report } = notesFrom([
			{
				eot: false,
				events: [
					// on, off
					{ dt: 0, on: [0, 60, 80] },
					{ dt: 480, off: [0, 60] },
					// on, then a zero-velocity on
					{ dt: 0, on: [0, 62, 80] },
					{ dt: 480, on: [0, 62, 0] },
					// two ons of one pitch, then two offs: the second on ends the first
					{ dt: 0, on: [0, 64, 80] },
					{ dt: 240, on: [0, 64, 80] },
					{ dt: 240, off: [0, 64] },
					{ dt: 240, off: [0, 64] },
					// a zero-length note
					{ dt: 0, on: [0, 69, 80] },
					{ dt: 0, off: [0, 69] },
					// an on with no off: it ends at this track's last event (its end-of-track, at 2340)
					{ dt: 0, on: [0, 67, 80] },
					{ dt: 560, text: "end" },
					{ dt: 100, meta: [0x2f, []] },
				],
			},
			// a later track, so the file's last event is later than track 1's
			[{ dt: 5000, text: "later" }],
		]);
		expect(notes).toEqual([
			note(1, 60, 0, 480),
			note(1, 62, 480, 960),
			note(1, 64, 960, 1200),
			note(1, 64, 1200, 1440),
			note(1, 67, 1680, 2340),
		]);
		expect(report.list).toEqual([]);
	});

	test("an unended note on the track's last tick is zero-length, dropped", () => {
		const { notes } = notesFrom([[{ dt: 480, on: [0, 60, 80] }]]);
		expect(notes).toEqual([]);
	});

	test("notes pair by track, channel and pitch", () => {
		const { notes } = notesFrom([
			[
				{ dt: 0, on: [0, 60, 80] },
				{ dt: 0, on: [1, 60, 80] },
				{ dt: 480, off: [1, 60] },
				{ dt: 480, off: [0, 60] },
			],
			[
				{ dt: 0, on: [0, 60, 80] },
				{ dt: 240, off: [0, 60] },
			],
		]);
		expect(notes).toEqual([note(1, 60, 0, 960), note(1, 60, 0, 480, 1), note(2, 60, 0, 240)]);
	});

	test("the sustain pedal holds released notes", () => {
		const { notes } = notesFrom([
			[
				{ dt: 0, control: [0, 64, 127] },
				...track(chords(0, [C_E_G], 480)),
				// a re-strike of E at 960 ends the held E there
				{ dt: 480, on: [0, 64, 80] },
				{ dt: 480, off: [0, 64] },
				{ dt: 480, control: [0, 64, 0] },
				// after the pedal lifts, an off ends its note
				{ dt: 0, on: [0, 72, 80] },
				{ dt: 240, off: [0, 72] },
			],
		]);
		expect(notes).toEqual([
			note(1, 60, 0, 1920),
			note(1, 64, 0, 960),
			note(1, 67, 0, 1920),
			note(1, 64, 960, 1920),
			note(1, 72, 1920, 2160),
		]);
	});

	test("the pedal is down at 64 and above, on its own channel", () => {
		const { notes } = notesFrom([
			[
				{ dt: 0, control: [0, 64, 64] },
				{ dt: 0, control: [1, 64, 127] },
				{ dt: 0, control: [2, 64, 63] },
				{ dt: 0, on: [0, 60, 80] },
				{ dt: 0, on: [2, 62, 80] },
				{ dt: 0, on: [3, 64, 80] },
				{ dt: 480, off: [0, 60] },
				{ dt: 0, off: [2, 62] },
				{ dt: 0, off: [3, 64] },
				// another controller neither lifts it nor presses it
				{ dt: 240, control: [0, 7, 0] },
				{ dt: 0, control: [3, 7, 127] },
				{ dt: 240, control: [0, 64, 0] },
			],
		]);
		expect(notes).toEqual([note(1, 60, 0, 960), note(1, 62, 0, 480, 2), note(1, 64, 0, 480, 3)]);
	});

	test("a pedal never lifted holds to the track's last event", () => {
		const { notes } = notesFrom([
			[
				{ dt: 0, control: [0, 64, 127] },
				{ dt: 0, on: [0, 60, 80] },
				{ dt: 480, off: [0, 60] },
				{ dt: 1000, text: "end" },
			],
		]);
		expect(notes).toEqual([note(1, 60, 0, 1480)]);
	});

	test("past 500,000 notes: too-large, and no notes", () => {
		const events = (count: number) => {
			const track: Smf["tracks"][number] = [];
			for (let i = 0; i < count; i++) {
				track.push({ tick: i, kind: "on", channel: 0, pitch: 60, velocity: 80 });
				track.push({ tick: i + 1, kind: "off", channel: 0, pitch: 60, velocity: 0 });
			}
			return { format: 1, ppq: 480, tracks: [track] } as Smf;
		};
		const ok = createReport();
		expect(notesOf(events(500_000), ok)).toHaveLength(500_000);
		expect(ok.list).toEqual([]);
		const over = createReport();
		expect(notesOf(events(500_001), over)).toEqual([]);
		expect(codes(over)).toEqual([["error", "too-large", undefined]]);
		expect(over.list[0]?.message).toContain("500,000 notes");
	});
});

describe("harmonyNotes", () => {
	test("drums are left out", () => {
		const { harmony, report } = harmonyFrom([
			track(chords(0, [C_E_G])),
			track(line(9, [36, 38, 36, 38])),
			track(line(9, [42, 42])),
		]);
		expect(harmony.every((n) => n.channel !== 9)).toBe(true);
		expect(rows(harmony)).toEqual(rows(C_E_G.map((p) => note(1, p, 0, 1920))));
		expect(codes(report)).toEqual([["info", "drums-left-out", undefined]]);
		expect(report.list[0]?.message).toContain("tracks 2 and 3");
	});

	test("drums on one track name it", () => {
		const { report } = harmonyFrom([track(chords(0, [C_E_G])), track(line(9, [36, 38]))]);
		expect(codes(report)).toEqual([["info", "drums-left-out", 2]]);
	});

	test("melody streams are left out, the bass stays", () => {
		const { harmony, notes, report } = harmonyFrom([
			[{ dt: 0, name: "Voice" }, ...track(line(0, MELODY))],
			track(chords(1, [C_E_G, C_E_G])),
			track(line(2, BASS)),
		]);
		expect(rows(harmony)).toEqual(rows(notes.filter((n) => n.track !== 1)));
		expect(harmony.some((n) => n.pitch === 36)).toBe(true);
		expect(codes(report)).toEqual([["info", "melody-left-out", 1]]);
		expect(report.list[0]?.message).toContain('track 1 ("Voice")');
	});

	test("every melody is named in one diagnostic", () => {
		const { harmony, report } = harmonyFrom([
			track(line(0, MELODY)),
			track(chords(1, [C_E_G, C_E_G]), line(3, [76, 77, 79])),
		]);
		expect(new Set(harmony.map((n) => n.channel))).toEqual(new Set([1]));
		expect(codes(report)).toEqual([["info", "melody-left-out", undefined]]);
		expect(report.list[0]?.message).toContain("track 1");
		expect(report.list[0]?.message).toContain("track 2, channel 4");
	});

	test("MuseScore's slash notes are a melody", () => {
		// Chord playback (F2 C4 E4 F4 A4, section 8) on its own channel beside B4 slash notes, one a beat.
		const { harmony, report } = harmonyFrom([
			track(
				chords(1, [[41, 60, 64, 65, 69]]),
				// MuseScore ends a note one tick early before the next
				[0, 480, 960, 1440].flatMap((t) => [
					at(t, { on: [0, 71, 80] }),
					at(t + 479, { off: [0, 71] }),
				]),
			),
		]);
		expect(harmony.map((n) => n.pitch).sort()).toEqual([41, 60, 64, 65, 69]);
		expect(codes(report)).toEqual([["info", "melody-left-out", 1]]);
	});

	test("the lowest stream is the lowest by median pitch, not by its lowest note", () => {
		// A line at C5 that dips once to C3, beside chords at C4 E4 G4: a melody.
		const { harmony } = harmonyFrom([
			track(chords(0, [C_E_G])),
			track(line(1, [72, 72, 48, 72, 72])),
		]);
		expect(harmony.map((n) => n.pitch).sort()).toEqual(C_E_G);
	});

	test("a monophonic stream above the lowest stream is a melody, with no bass part", () => {
		// A tenor line at C4 over chords in octave 3: the chords are the lowest stream.
		const { harmony } = harmonyFrom([
			track(chords(0, [[48, 52, 55]])),
			track(line(1, [60, 62, 60, 59])),
		]);
		expect(harmony.map((n) => n.pitch).sort()).toEqual([48, 52, 55]);
	});

	test("monophonic is two notes together for under 10% of the sounding time", () => {
		const low = track(
			chords(0, [
				[36, 40, 43],
				[36, 40, 43],
			]),
		);
		// Legato of 40 ticks a 480 tick note: overlap about 8%, a melody.
		const legato = harmonyFrom([low, track(line(1, MELODY, 480, 40))]);
		expect(legato.harmony.some((n) => n.channel === 1)).toBe(false);
		// Of 60 ticks: about 12%, not a melody.
		const blurred = harmonyFrom([low, track(line(1, MELODY, 480, 60))]);
		expect(blurred.harmony.filter((n) => n.channel === 1)).toHaveLength(MELODY.length);
		expect(blurred.report.list).toEqual([]);
	});

	test("only melody: used anyway", () => {
		const { harmony, notes, report } = harmonyFrom([track(line(0, MELODY))]);
		expect(harmony).toEqual(notes);
		expect(codes(report)).toEqual([["warning", "harmony-from-melody", undefined]]);
	});

	test("only monophonic streams: all used, none left out", () => {
		const { harmony, notes, report } = harmonyFrom([track(line(0, MELODY)), track(line(1, BASS))]);
		expect(harmony).toEqual(notes);
		expect(codes(report)).toEqual([["warning", "harmony-from-melody", undefined]]);
	});

	describe("options.tracks", () => {
		const file = (): Chunk[] => [
			[{ dt: 0, name: "Melody" }, ...track(line(0, MELODY))],
			[{ dt: 0, name: "Piano" }, ...track(chords(0, [C_E_G]))],
			[{ dt: 0, name: "Bass" }, ...track(line(0, BASS), line(9, [36, 38]))],
		];
		const tracksOf = (notes: Note[]) => [...new Set(notes.map((n) => n.track))].sort();

		test("numbers and names (any case) choose tracks", () => {
			for (const tracks of [[2], ["piano"], ["PIANO"], [" Piano "]]) {
				const { harmony, report } = harmonyFrom(file(), { tracks });
				expect(tracksOf(harmony)).toEqual([2]);
				expect(report.list.filter((d) => d.code !== "drums-left-out")).toEqual([]);
			}
		});

		test("a chosen melody track is the harmony, with no drums", () => {
			const { harmony } = harmonyFrom(file(), { tracks: [1, "bass"] });
			expect(tracksOf(harmony)).toEqual([1, 3]);
			expect(harmony.some((n) => n.channel === 9)).toBe(false);
		});

		test("an unknown entry warns track-unknown; when none match, the default choice", () => {
			const unknown = harmonyFrom(file(), { tracks: ["nope", 4, 0] });
			expect(tracksOf(unknown.harmony)).toEqual([2, 3]);
			const d = unknown.report.list.find((x) => x.code === "track-unknown");
			expect(d?.severity).toBe("warning");
			expect(d?.message).toContain('"nope", 4 and 0');
			expect(unknown.report.list.filter((x) => x.code === "track-unknown")).toHaveLength(1);
			expect(unknown.report.list.some((x) => x.code === "melody-left-out")).toBe(true);
			const some = harmonyFrom(file(), { tracks: ["nope", 1] });
			expect(tracksOf(some.harmony)).toEqual([1]);
			expect(some.report.list.map((x) => x.code)).toContain("track-unknown");
		});
	});

	test("no notes", () => {
		const drums = harmonyFrom([track(line(9, [36, 38]))]);
		expect(drums.harmony).toEqual([]);
		expect(codes(drums.report)).toEqual([
			["info", "drums-left-out", 1],
			["error", "no-notes", undefined],
		]);
		const empty = harmonyFrom([[{ dt: 0, text: "nothing" }]]);
		expect(codes(empty.report)).toEqual([["error", "no-notes", undefined]]);
		const chosen = harmonyFrom([track(line(0, MELODY)), [{ dt: 0, name: "Empty" }]], {
			tracks: [2],
		});
		expect(chosen.harmony).toEqual([]);
		expect(codes(chosen.report)).toEqual([["error", "no-notes", undefined]]);
	});
});

describe("createReport", () => {
	test("each problem (code, track and message) once, with a count and its first five bars", () => {
		const report = createReport();
		for (const bar of [3, 1, 3, 4, 7, 9, 12])
			report.add("chord-unnamed", "warning", "? written", { bar });
		report.add("bad-event", "warning", "junk", { track: 1 });
		report.add("bad-event", "warning", "junk", { track: 2 });
		report.add("bad-event", "warning", "more junk", { track: 2 });
		report.add("bad-event", "warning", "junk", { track: 2 });
		report.add("key-doubtful", "warning", "doubtful");
		expect(report.list).toEqual([
			{
				severity: "warning",
				code: "chord-unnamed",
				message: "? written (7 times; bars 3, 1, 4, 7, 9 and more)",
				bar: 3,
			},
			{ severity: "warning", code: "bad-event", message: "junk", track: 1 },
			{ severity: "warning", code: "bad-event", message: "junk (2 times)", track: 2 },
			{ severity: "warning", code: "bad-event", message: "more junk", track: 2 },
			{ severity: "warning", code: "key-doubtful", message: "doubtful" },
		]);
	});

	test("a code at a bar or two", () => {
		const report = createReport();
		report.add("tempo-in-bar", "info", "a stretch", { bar: 2 });
		report.add("tempo-in-bar", "info", "a stretch", { bar: 5 });
		report.add("meter-mid-bar", "warning", "cut", { bar: 4 });
		expect(report.list).toEqual([
			{
				severity: "info",
				code: "tempo-in-bar",
				message: "a stretch (2 times; bars 2 and 5)",
				bar: 2,
			},
			{ severity: "warning", code: "meter-mid-bar", message: "cut", bar: 4 },
		]);
	});

	test("the reader reports into a report it is given", () => {
		const report = createReport();
		report.add("key-doubtful", "warning", "before");
		const r = readSmf(smf({ tracks: [[{ dt: 0, key: [9, 0] }]] }), report);
		expect(r.diagnostics).toBe(report.list);
		expect(report.list.map((d) => d.code)).toEqual(["key-doubtful", "meta-invalid"]);
	});

	test("the reader counts through it", () => {
		const r = readSmf(
			smf({
				tracks: [
					[
						{ dt: 0, key: [9, 0] },
						{ dt: 0, key: [10, 0] },
					],
				],
			}),
		);
		expect(r.diagnostics.map((d) => d.message)).toEqual([
			"a key signature outside 7 flats to 7 sharps, major or minor, ignored (2 times)",
		]);
	});
});
