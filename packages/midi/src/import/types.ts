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
	| BuildCode;

export type MidiImportDiagnostic = {
	severity: "error" | "warning" | "info";
	code: MidiImportCode; // section 5.9, plus sync's BuildCode
	message: string;
	/** 1-based track chunk, in file order. */
	track?: number;
	/** The played bar of the chart written. */
	bar?: number;
};

export type MidiImportOptions = {
	/** The tracks that carry the harmony: 1-based numbers or track names (any case). Default: chosen (5.2). */
	tracks?: (number | string)[];
	/** Read lyric events into lyric rows (default true). */
	lyrics?: boolean;
	/** As sync's BuildOptions. */
	simile?: boolean;
	barsPerLine?: number;
};

export type MidiImportResult = { text: string; diagnostics: MidiImportDiagnostic[] };
