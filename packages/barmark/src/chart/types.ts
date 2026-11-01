import type { ChordRecord } from "../chords/types.js";

export type Severity = "error" | "warning";
export type ChartDiagnostic = {
	line: number;
	severity: Severity;
	message: string;
	token: string;
	suggestion?: string;
};

export type Meter = { n: number; d: number };
export type Mode =
	| "major"
	| "minor"
	| "ionian"
	| "dorian"
	| "phrygian"
	| "lydian"
	| "mixolydian"
	| "aeolian"
	| "locrian";
/** The tonic is spelled with ASCII `#` and `b`. */
export type Key = { tonic: string; mode: Mode };
export type Feel = "straight" | "swing" | "shuffle" | "swing 16";
/** A gradual change of tempo (rit., accel.) to an optional target, or the return from one (a tempo). */
export type TempoChange = { kind: "rit" | "accel"; to: number | null } | { kind: "a tempo" };
/** `tempo:` gives either `tempo` (a steady tempo) or `tempoChange`, never both. */
export type Directives = {
	key?: Key;
	time?: Meter;
	tempo?: number;
	tempoChange?: TempoChange;
	feel?: Feel;
};

/** A chord slot holds a chord symbol or a note set; `chord.kind` tells which. */
export type SimpleSlot =
	| { kind: "chord"; chord: ChordRecord }
	| { kind: "hold" }
	| { kind: "nc" }
	| { kind: "silence" }
	| { kind: "unknown" };
export type Slot = SimpleSlot | { kind: "group"; members: SimpleSlot[] };
/** `meter` is a one-bar `[n/d]` override. */
export type Cell =
	| { kind: "slots"; meter: Meter | null; slots: Slot[] }
	| { kind: "simile" }
	| { kind: "fermata" };
export type Repeat = number | "open" | null;

export type Line =
	| { kind: "title"; line: number; text: string }
	| { kind: "section"; line: number; name: string; repeat: Repeat; elided: boolean }
	| { kind: "directive"; line: number; set: Directives }
	| { kind: "bars"; line: number; opens: boolean; closes: boolean; cells: Cell[]; repeat: Repeat }
	| { kind: "text"; line: number; text: string }
	/** A bar line dropped for an error, kept as written so its section still counts as written out. */
	| { kind: "invalid"; line: number; text: string };

export type PlayedBar = {
	/** 1-based measure number in play order; fermatas are not counted. */
	index: number;
	line: number;
	/** Heading text of the section occurrence, as written. */
	section: string | null;
	meter: Meter;
	key: Key | null;
	/** The steady tempo: where a change starts from, and what `a tempo` returns to. */
	tempo: number | null;
	/** Set on every bar inside a rit. or accel.; `from` is the steady tempo, `to` the target if written. */
	tempoChange: { kind: "rit" | "accel"; from: number | null; to: number | null } | null;
	feel: Feel;
	/** `%` resolved to the copied slots; holds stay holds. */
	slots: Slot[];
};
/** An open repeat shows one pass; the number of passes is unknown. */
export type ChartEvent =
	| { kind: "bar"; bar: PlayedBar }
	| { kind: "fermata"; line: number }
	| { kind: "open"; line: number; events: ChartEvent[] };
export type SectionOccurrence = {
	name: string;
	line: number;
	replayOf: number | null;
	/** Null when the occurrence plays no bars. */
	firstBar: number | null;
	lastBar: number | null;
	elided: boolean;
	/**
	 * Which distinct section this plays, numbered in first-appearance order
	 * from 0: every replay shares its written section's number.
	 */
	form: number;
};

export type ChartParse = {
	title: string | null;
	lines: Line[];
	events: ChartEvent[];
	/** `events` flattened, with an open repeat's pass included once. */
	bars: PlayedBar[];
	sections: SectionOccurrence[];
	/** Sorted by line, then errors before warnings. */
	diagnostics: ChartDiagnostic[];
};
