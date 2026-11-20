import type { BuildCode } from "@barmark/sync";

/**
 * The import's diagnostics (spec section 2 and 5.9), and sync's
 * `BuildCode`s as its builder raises them.
 */
export type MidiImportCode =
	| "not-midi"
	| "format-2"
	| "smpte"
	| "too-large"
	| "no-notes"
	| "truncated"
	| "track-count"
	| "bad-event"
	| "meta-invalid"
	| "meter-mid-bar"
	| "key-doubtful"
	| "harmony-from-melody"
	| "track-unknown"
	| "chord-unnamed"
	| "lyrics-dropped"
	| "unknown-chunk"
	| "drums-left-out"
	| "melody-left-out"
	| "tempo-ramp"
	| "tempo-in-bar"
	| "marker-dropped"
	| "lyrics-other-tracks"
	| "lyrics-verses-uncertain"
	| "notes-line"
	| "notes-short"
	| "rhythm-rounded"
	| "pitch-range"
	| "notes-fallback"
	| BuildCode;

export type MidiImportDiagnostic = {
	severity: "error" | "warning" | "info";
	code: MidiImportCode; // section 5.9, plus sync's BuildCode
	message: string;
	/** 1-based track chunk, in file order. */
	track?: number;
	/** The written number of the chart's bar: a pickup is bar 0, the first full bar 1 (with no pickup, the first bar is 1). */
	bar?: number;
};

export type MidiImportOptions = {
	/**
	 * The tracks read: 1-based numbers or track names (any case). They are
	 * what the line test reads, and when the notes are not one line, the
	 * tracks that carry the harmony. Default: every track for the line test,
	 * and the harmony chosen (5.2).
	 */
	tracks?: (number | string)[];
	/** Read lyric events into lyric rows (default true). */
	lyrics?: boolean;
	/** As sync's BuildOptions. */
	simile?: boolean;
	barsPerLine?: number;
	/** Write a file that is one line of notes as its notes (default true); false: read chords from it, as before 0.4. */
	notes?: boolean;
};

export type MidiImportResult = { text: string; diagnostics: MidiImportDiagnostic[] };
