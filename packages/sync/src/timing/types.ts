/** Seconds from the start of the recording. */
export type Seconds = number;

export type TimingMap = {
	format: "barmark-timing";
	version: 1;
	/** The chart it was made for: its played-bar count, its hash, and a reference the host may set. */
	chart: { bars: number; hash: string; ref?: string };
	recording?: { id?: string; duration?: Seconds };
	/** How it was made: "detected", "aligned", "tapped", "tempo", or the host's word. */
	source?: string;
	/** In recording order; never empty. */
	bars: TimedBar[];
	/** Where the last entry ends. */
	end: Seconds;
};

export type TimedBar = {
	/** `PlayedBar.index` of the chart. */
	bar: number;
	start: Seconds;
	/** Where the bar stops sounding, when a pause or fermata follows it. */
	end?: Seconds;
	/** Onsets of the bar's grammar 2.1 beats after `start`, when known. */
	beats?: Seconds[];
};

export type TimingDiagnostic = {
	severity: "error" | "warning";
	code?: "chart-hash-mismatch";
	message: string;
	path: string;
};
