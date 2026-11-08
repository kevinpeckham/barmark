/**
 * `importMidi` (spec 5): read the file; pair its notes and choose the
 * harmony; make the bar grid and the key, meter and tempo; name a chord
 * per segment; take the markers as sections and the title; then hand it
 * all to sync's `chartFromDetections`, which writes the chart; then add
 * the lyrics as lyric rows. Any error stops it with an empty chart. It never throws: a throw from a bug comes
 * back as an error diagnostic too.
 */
import { chartFromDetections } from "@barmark/sync";
import { readSmfInto } from "../smf/read.js";
import { detectionsOf, mapBuild, withWritablePickup } from "./build.js";
import { directivesOf } from "./directives.js";
import { type Grid, gridOf } from "./grid.js";
import { lastLyric, withLyrics } from "./lyrics.js";
import { sectionsOf, titleOf } from "./markers.js";
import { notesOf } from "./notes.js";
import { createReport, type Report } from "./report.js";
import { chordRuns } from "./segments.js";
import { harmonyNotes } from "./streams.js";
import type { MidiImportOptions, MidiImportResult } from "./types.js";

/** The options as given, any that aren't of their type left out. */
function optionsOf(o: unknown): MidiImportOptions {
	if (typeof o !== "object" || o === null) return {};
	const { tracks, lyrics, simile, barsPerLine } = o as Record<string, unknown>;
	const out: MidiImportOptions = {};
	if (Array.isArray(tracks))
		out.tracks = tracks.filter((t) => typeof t === "number" || typeof t === "string");
	if (typeof lyrics === "boolean") out.lyrics = lyrics;
	if (typeof simile === "boolean") out.simile = simile;
	if (typeof barsPerLine === "number") out.barsPerLine = barsPerLine;
	return out;
}

/**
 * Where a note counts for the grid's end: its end, less the 16th a
 * legato release may ring past a bar line (so it adds no bar of N.C.);
 * a note struck in a bar always keeps it.
 */
const lastHeard = (n: { start: number; end: number }, ppq: number) =>
	Math.max(n.start + 1, n.end - ppq / 4);

const failed = (report: Report) => report.list.some((d) => d.severity === "error");

/** Sync's chart from the detections, its diagnostics reported as the import's. */
function built(
	input: Parameters<typeof chartFromDetections>[0],
	grid: Grid,
	options: MidiImportOptions,
	report: Report,
): string {
	const { chart, diagnostics } = chartFromDetections(input, options);
	for (const d of diagnostics) {
		const mapped = mapBuild(d, grid, input);
		if (mapped) report.add(mapped.code, mapped.severity, mapped.message, { bar: mapped.bar });
	}
	return chart;
}

/** The chart, or "" once an error is reported. */
function chartOf(bytes: Uint8Array, options: MidiImportOptions, report: Report): string {
	const { smf, names } = readSmfInto(bytes, report);
	if (smf === null || failed(report)) return "";
	const notes = notesOf(smf, report);
	const harmony = failed(report) ? [] : harmonyNotes(notes, names, options, report);
	if (failed(report)) return "";
	// The grid ends with the last harmony note, or one past the last lyric (spec 5.3).
	const lyric = options.lyrics === false ? -1 : lastLyric(smf);
	const last = harmony.reduce((end, n) => Math.max(end, lastHeard(n, smf.ppq)), lyric + 1);
	const read = gridOf(smf, last, report);
	if (failed(report)) return "";
	const grid = withWritablePickup(read);
	const directives = directivesOf(smf, grid, harmony, report);
	const runs = chordRuns(harmony, grid, directives.keys, report);
	const sections = sectionsOf(smf, grid, report);
	const input = detectionsOf(grid, runs, directives, sections, titleOf(smf, names));
	const chart = built(input, grid, options, report);
	if (failed(report)) return "";
	return options.lyrics === false ? chart : withLyrics(chart, smf, grid, notes, report);
}

/** A chord chart from a Standard MIDI File (format 0 or 1), with its diagnostics. */
export function importMidi(bytes: Uint8Array, options?: MidiImportOptions): MidiImportResult {
	const report = createReport();
	try {
		const text = chartOf(bytes, optionsOf(options), report);
		return { text, diagnostics: report.list };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return {
			text: "",
			diagnostics: [{ severity: "error", code: "not-midi", message: `internal error: ${message}` }],
		};
	}
}
