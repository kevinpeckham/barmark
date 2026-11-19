/**
 * `importMidi` (spec 5): read the file; pair its notes; when they are one
 * line (the note-line design), write that line (`line.ts`), else choose
 * the harmony; make the bar grid and the key, meter and tempo; name a chord
 * per segment; take the markers as sections and the title; then hand it
 * all to sync's `chartFromDetections`, which writes the chart; then add
 * the lyrics as lyric rows. A line that fails its self-check is read
 * again as chords, on a fresh report that opens with `notes-fallback`.
 * Any error stops it with an empty chart. It never throws: a throw from a bug comes
 * back as an error diagnostic too.
 */
import { readSmfInto } from "../smf/read.js";
import type { Smf } from "../smf/types.js";
import { lineOf } from "./attacks.js";
import { built, detectionsOf, failed, writable } from "./build.js";
import { directivesOf } from "./directives.js";
import { gridOf } from "./grid.js";
import { type LineSeam, lineChart } from "./line.js";
import { lastLyric, withLyrics } from "./lyrics.js";
import { sectionsOf, titleOf } from "./markers.js";
import { type Note, notesOf } from "./notes.js";
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

/**
 * Where a note counts for the grid's end: its end, less the 16th a
 * legato release may ring past a bar line (so it adds no bar of N.C.);
 * a note struck in a bar always keeps it.
 */
const lastHeard = (n: { start: number; end: number }, ppq: number) =>
	Math.max(n.start + 1, n.end - ppq / 4);

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
	const line = options.notes === false ? null : lineOf(selected.pitched, smf.ppq);
	if (line !== null) return lineChart(line, smf, names, notes, options, report, seam);
	const harmony = harmonyOf(selected, names, report);
	if (failed(report)) return "";
	return chordChart(smf, names, notes, harmony, options, report);
}

/** The import, its report its own: a line that asks for chords is read again with `notes: false` after `notes-fallback`. */
function imported(
	bytes: Uint8Array,
	options: MidiImportOptions,
	seam?: LineSeam,
): MidiImportResult {
	const report = createReport();
	const text = chartOf(bytes, options, report, seam);
	if (text !== null) return { text, diagnostics: report.list };
	const again = createReport();
	again.add(
		"notes-fallback",
		"warning",
		"the notes read as one line failed the import's check, so chords are read from them instead",
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

/** A chord chart from a Standard MIDI File (format 0 or 1), with its diagnostics. */
export function importMidi(bytes: Uint8Array, options?: MidiImportOptions): MidiImportResult {
	return importWith(bytes, options);
}
