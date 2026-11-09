import type { Seconds, TimingMap } from "../timing/index.js";

/** A value from a detector, bare or with its confidence (0..1). */
export type Detected<T> = T | { value: T; confidence?: number };

/** Bar starts; one more entry than bars, the last is where the last bar ends. */
export type BarGrid = { bars: Seconds[] };
/** The seam: `BeatGrid` joins this union when SS ships a beat grid. */
export type Grid = BarGrid;

export type ChordRun = {
	/** In seconds, or in frames when the runs give `frameSec`; `end` is exclusive. */
	start: number;
	end: number;
	/** A Harte label ("A:min7", "N", "X"). */
	label?: string;
	/** Or a barmark slot symbol ("Am7", "N.C.", "{C E G}"), when the source has no Harte. */
	symbol?: string;
	confidence?: number;
};
/** SS's `ChordminiRuns` fits as is: extra fields are ignored. */
export type ChordRuns = { runs: ChordRun[]; frameSec?: number };

/** SS's `SongChange` fits as is. A tempo value counts grammar 2.1's beat. */
export type Change = {
	kind: "key" | "meter" | "tempo";
	start: Seconds;
	value: string | number;
	confidence?: number;
};

export type Detections = {
	title?: string;
	grid: Grid;
	chords: ChordRuns;
	key?: Detected<string> | null; // "F♯ minor", "D major", "Bm"
	meter?: Detected<string>; // "4/4", "6/8"
	/** bpm in grammar 2.1's beat; omitted: derived from the grid; null: no tempo line. */
	tempo?: Detected<number> | null;
	changes?: Change[];
	sections?: { name: string; start: Seconds; confidence?: number }[];
	/** Where a pickup before bar 1 begins, when the host knows there is one. */
	pickup?: { start: Seconds };
	recording?: { id?: string; duration?: Seconds };
};

export type BuildOptions = {
	/** Write a repeated bar as `%` (default true). */
	simile?: boolean;
	/** Bars per line (default 4). */
	barsPerLine?: number;
};

export type BuildCode =
	| "grid-unusable"
	| "grid-unsorted"
	| "meter-unreadable"
	| "meter-assumed"
	| "key-unreadable"
	| "key-respelled"
	| "tempo-unreadable"
	| "tempo-grid-disagree"
	| "run-invalid"
	| "run-overlap"
	| "label-unknown"
	| "no-chord-detected"
	| "outside-bars"
	| "pickup-ignored"
	| "section-unnamed"
	| "section-marks-stripped"
	| "section-collision"
	| "after-last-bar"
	| "change-collision"
	| "change-unreadable";

export type BuildDiagnostic = {
	severity: "error" | "warning" | "info";
	code: BuildCode;
	message: string;
	/** Where in the input: "chords.runs[12]", "changes[3]", "grid.bars". */
	path?: string;
	at?: Seconds;
	/** The bar's written number in the chart built (a pickup is 0, the next bar 1). */
	bar?: number;
};

/**
 * Experimental. One per played bar, in order; `slots` lines up with that
 * bar's `PlayedBar.slots`.
 */
export type ConfidenceRecord = {
	format: "barmark-confidence";
	version: 1;
	bars: { bar: number; confidence: number; slots: number[] }[];
	key?: number;
	meter?: number;
	tempo?: number;
	sections?: { bar: number; confidence: number }[];
};

export type BuildResult = {
	/** `printChart` output; "" when the grid is unusable. */
	chart: string;
	/** Null exactly when `chart` is "". */
	timing: TimingMap | null;
	confidence: ConfidenceRecord | null;
	diagnostics: BuildDiagnostic[];
};
