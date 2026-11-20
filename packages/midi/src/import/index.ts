/**
 * `importMidi` (spec 5): read the file; pair its notes; when they are one
 * line (the note-line design), write that line (`line.ts`), else choose
 * the harmony; make the bar grid and the key, meter and tempo; name a chord
 * per segment; take the markers as sections and the title; then hand it
 * all to sync's `chartFromDetections`, which writes the chart; then add
 * the lyrics as lyric rows. Anything that stops the line (an error it
 * raises, a throw, no pitch in range, a failed self-check) reads the file
 * again as chords, on a fresh report that opens with `notes-fallback`.
 * Any other error stops it with an empty chart. It never throws: a throw from a bug comes
 * back as an error diagnostic too.
 */
import { readSmfInto } from "../smf/read.js";
import type { Smf } from "../smf/types.js";
import { type Line, lineFrom, lineOf } from "./attacks.js";
import { built, detectionsOf, failed, writable } from "./build.js";
import { directivesOf } from "./directives.js";
import { gridOf, lastHeard } from "./grid.js";
import { type LineSeam, lineChart } from "./line.js";
import { lastLyric, withLyrics } from "./lyrics.js";
import { sectionsOf, titleOf } from "./markers.js";
import { type Note, notesOf, type Overlaps } from "./notes.js";
import { createReport, type Report } from "./report.js";
import { chordRuns } from "./segments.js";
import { harmonyOf, selectedNotes } from "./streams.js";
import type { MidiImportOptions, MidiImportResult } from "./types.js";

/** The options as given, any that aren't of their type left out. */
function optionsOf(o: unknown): MidiImportOptions {
	if (typeof o !== "object" || o === null) return {};
	const { tracks, lyrics, simile, barsPerLine, notes } = o as Record<string, unknown>;
	const out: MidiImportOptions = {};
	if (Array.isArray(tracks))
		out.tracks = tracks.filter((t) => typeof t === "number" || typeof t === "string");
	if (typeof lyrics === "boolean") out.lyrics = lyrics;
	if (typeof simile === "boolean") out.simile = simile;
	if (typeof barsPerLine === "number") out.barsPerLine = barsPerLine;
	if (typeof notes === "boolean") out.notes = notes;
	return out;
}

/** The chord reading's chart from the harmony notes, or "" once an error is reported. */
function chordChart(
	smf: Smf,
	names: (string | null)[],
	notes: Note[],
	harmony: Note[],
	options: MidiImportOptions,
	report: Report,
): string {
	// The grid ends with the last harmony note, or one past the last lyric (spec 5.3).
	const lyric = options.lyrics === false ? -1 : lastLyric(smf);
	const last = harmony.reduce((end, n) => Math.max(end, lastHeard(n, smf.ppq)), lyric + 1);
	const read = gridOf(smf, last, report);
	if (failed(report)) return "";
	const grid = writable(read, report);
	const directives = directivesOf(smf, grid, harmony, report);
	const runs = chordRuns(harmony, grid, directives.keys, report);
	const sections = sectionsOf(smf, grid, report);
	const input = detectionsOf(grid, runs, directives, sections, titleOf(smf, names));
	const chart = built(input, grid, options, report);
	if (failed(report)) return "";
	return options.lyrics === false ? chart : withLyrics(chart, smf, grid, notes, report);
}

type LineRead = { line: Line; notes: Note[] };

/**
 * A line's notes, read by its keys (Kevin, 2026-11-20: a line has no
 * sustain pedal holds): the file paired again with the pedal unread, so
 * every note is as long as its key was down, and the short notes and the
 * attacks taken from those. The test is not run again: the file is a line
 * by the notes as they sound, and its keys are how that line is written.
 * (The keys are not the tested notes made shorter: more of them can be
 * short and leave, or so many that none is left out, and a key press with
 * no length that the pedal held is no note at all; a file left with no
 * note falls back to chords.)
 */
function byKeys(
	smf: Smf,
	names: (string | null)[],
	options: MidiImportOptions,
	overlaps: Overlaps,
): LineRead {
	const scratch = createReport();
	const notes = notesOf(smf, scratch, { overlaps, pedal: false });
	const { pitched } = selectedNotes(notes, names, options, scratch);
	return { line: lineFrom(pitched, smf.ppq), notes };
}

/**
 * The line test (spec 3): on the notes paired first in, first out; when
 * they are not one line, on MIDI 5.2's (`classic`, already paired and
 * selected), so a stuck or doubled note-on, which first in, first out
 * never recovers from, does not cost the line. The test reads the sustain
 * pedal, so notes ringing under one another through it are harmony; the
 * line it finds is then read by its keys, in the pairing that passed. The
 * line and the notes it was read from, or null when neither pairing is one
 * line. These pairings and their choice of tracks report into scratch
 * reports: the file's `notesOf` and `selectedNotes` have reported the same
 * already (their bounds, drums and unknown tracks), so nothing is said
 * twice.
 */
function lineReading(
	smf: Smf,
	names: (string | null)[],
	options: MidiImportOptions,
	classic: Note[],
): LineRead | null {
	const scratch = createReport();
	const kept = notesOf(smf, scratch, { overlaps: "keep" });
	const first = lineOf(selectedNotes(kept, names, options, scratch).pitched, smf.ppq);
	if (first !== null) return byKeys(smf, names, options, "keep");
	return lineOf(classic, smf.ppq) === null ? null : byKeys(smf, names, options, "end");
}

/** The chart, "" once an error is reported, or null when the line reading asks to read chords instead. */
function chartOf(
	bytes: Uint8Array,
	options: MidiImportOptions,
	report: Report,
	seam?: LineSeam,
): string | null {
	const { smf, names } = readSmfInto(bytes, report);
	if (smf === null || failed(report)) return "";
	const notes = notesOf(smf, report);
	if (failed(report)) return "";
	const selected = selectedNotes(notes, names, options, report);
	const line = options.notes === false ? null : lineReading(smf, names, options, selected.pitched);
	if (line !== null) return lineChart(line.line, smf, names, line.notes, options, report, seam);
	const harmony = harmonyOf(selected, names, report);
	if (failed(report)) return "";
	return chordChart(smf, names, notes, harmony, options, report);
}

/** `chartOf`, a throw counting as null (read chords) unless chords were asked for: the chord reading then reports its own. */
function firstReading(
	bytes: Uint8Array,
	options: MidiImportOptions,
	report: Report,
	seam?: LineSeam,
): string | null {
	if (options.notes === false) return chartOf(bytes, options, report, seam);
	try {
		return chartOf(bytes, options, report, seam);
	} catch {
		return null;
	}
}

/** The import, its report its own: a line that asks for chords is read again with `notes: false` after `notes-fallback`. */
function imported(
	bytes: Uint8Array,
	options: MidiImportOptions,
	seam?: LineSeam,
): MidiImportResult {
	const report = createReport();
	const text = firstReading(bytes, options, report, seam);
	if (text !== null) return { text, diagnostics: report.list };
	const again = createReport();
	again.add(
		"notes-fallback",
		"warning",
		"the notes are one line but the line could not be written, so chords are read from them instead",
	);
	return {
		text: chartOf(bytes, { ...options, notes: false }, again) ?? "",
		diagnostics: again.list,
	};
}

/**
 * `importMidi` with a seam on the line reading's chart, applied before its
 * self-check (tests). Not part of the package's API.
 */
export function importWith(
	bytes: Uint8Array,
	options?: MidiImportOptions,
	seam?: LineSeam,
): MidiImportResult {
	try {
		return imported(bytes, optionsOf(options), seam);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return {
			text: "",
			diagnostics: [{ severity: "error", code: "not-midi", message: `internal error: ${message}` }],
		};
	}
}

/**
 * A chart from a Standard MIDI File (format 0 or 1), with its
 * diagnostics: a file whose notes are one line is written as that line,
 * its notes with their octaves and rhythm (`notes: false` reads chords
 * from it instead); any other file as chords.
 */
export function importMidi(bytes: Uint8Array, options?: MidiImportOptions): MidiImportResult {
	return importWith(bytes, options);
}
