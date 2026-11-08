/**
 * The import's diagnostics (spec section 2 and 5.9). Sync's `BuildCode`s
 * join `MidiImportCode` when the import hands its bars to sync's builder
 * (Task 13).
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
	| "lyrics-other-tracks";

export type MidiImportDiagnostic = {
	severity: "error" | "warning" | "info";
	code: MidiImportCode; // section 5.9, plus sync's BuildCode
	message: string;
	/** 1-based track chunk, in file order. */
	track?: number;
	/** The played bar of the chart written. */
	bar?: number;
};
