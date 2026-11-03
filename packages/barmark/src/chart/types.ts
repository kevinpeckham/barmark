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
/**
 * The part a chart is written for (grammar 7.3): `part: Electric Guitar 1`,
 * or with a short label, `part: Gtr = Electric Guitar 1`.
 */
export type Part = { name: string; label?: string };

export type Directives = {
	key?: Key;
	time?: Meter;
	tempo?: number;
	tempoChange?: TempoChange;
	feel?: Feel;
	/**
	 * How far a swing or shuffle swings: where the swung note lands, as a
	 * percentage of its pair (50 to 75). Absent for the bare word, which
	 * means 66.7 (the triplet feel), and for straight.
	 */
	swingPercent?: number;
};

/** `>` accents a chord; `^` makes it a hit, short and accented (grammar 2.7). */
export type Articulation = "accent" | "hit";
/**
 * How early a slot arrives (grammar 2.8): `<` an eighth note, `<<` a
 * sixteenth, taken from the slot played just before it.
 */
export type Push = "eighth" | "sixteenth";
/**
 * A chord slot holds a chord symbol or a note set; `chord.kind` tells
 * which. `voicing` is the exact notes written after a chord's name
 * (`Cmaj7{E3 G3 B3}`, grammar 4.2). The optional fields are present only
 * when written.
 */
export type SimpleSlot =
	| {
			kind: "chord";
			chord: ChordRecord;
			voicing?: ChordRecord;
			articulation?: Articulation;
			push?: Push;
	  }
	| { kind: "hold" }
	| { kind: "nc"; push?: Push }
	| { kind: "silence"; push?: Push }
	| { kind: "unknown" };
export type Slot = SimpleSlot | { kind: "group"; members: SimpleSlot[] };
/**
 * A mark between bars (grammar 5.2). A jump goes back to the chart's first
 * bar (`D.C.`) or to the segno (`D.S.`), then plays to the end, to `Fine`
 * (`al Fine`) or to `To Coda` (`al Coda`).
 */
export type Direction =
	| { kind: "segno" }
	| { kind: "coda" }
	| { kind: "to coda" }
	| { kind: "fine" }
	| { kind: "jump"; to: "start" | "segno"; al: "fine" | "coda" | null };
/**
 * Quoted words on a bar (grammar 2.6), placed before the slot numbered
 * `at` (0-based); `at` equal to the slot count places them after the last
 * slot. They carry no musical meaning.
 */
export type Words = { text: string; at: number };
/**
 * `meter` is a one-bar `[n/d]` override. `...`, a direction and a
 * rehearsal mark are not bars. `words` is present only when written.
 */
export type Cell =
	| { kind: "slots"; meter: Meter | null; slots: Slot[]; words?: Words[] }
	| { kind: "simile"; words?: Words[] }
	| { kind: "fermata" }
	| { kind: "direction"; direction: Direction }
	/** `@B`: a mark on the bar after it (grammar 2.5). */
	| { kind: "rehearsal"; label: string };
export type Repeat = number | "open" | null;

export type Line =
	| { kind: "title"; line: number; text: string }
	| { kind: "section"; line: number; name: string; repeat: Repeat; elided: boolean }
	| { kind: "directive"; line: number; set: Directives }
	| ({ kind: "part"; line: number } & Part)
	| {
			kind: "bars";
			line: number;
			opens: boolean;
			closes: boolean;
			cells: Cell[];
			repeat: Repeat;
			/** The passes an ending plays on (grammar 5.1), in order; null for any other bar line. */
			ending: number[] | null;
	  }
	| { kind: "text"; line: number; text: string }
	/**
	 * A bar line dropped for an error, kept as written so its section still
	 * counts as written out; `written` is how many bars its pipes write.
	 */
	| { kind: "invalid"; line: number; text: string; written: number };

export type PlayedBar = {
	/** 1-based measure number in play order; fermatas are not counted. */
	index: number;
	/**
	 * 1-based number of the bar as written, counting each written bar once
	 * (`%` included, fermatas not) in written order: a repeat or replay plays
	 * its bars under the numbers they were written with.
	 */
	written: number;
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
	/** The swing amount in force (Directives.swingPercent); absent when the feel has none. */
	swingPercent?: number;
	/** `%` resolved to the copied slots; holds stay holds. */
	slots: Slot[];
	/** The rehearsal mark written just before this bar (`@B` gives "B"); absent when none. */
	rehearsal?: string;
	/** Words written on this bar; absent when none. `%` copies chords, not words. */
	words?: Words[];
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
	/** What `part:` names (grammar 7.3); null when the chart names none. */
	part: Part | null;
	lines: Line[];
	events: ChartEvent[];
	/** `events` flattened, with an open repeat's pass included once. */
	bars: PlayedBar[];
	sections: SectionOccurrence[];
	/** Sorted by line, then errors before warnings. */
	diagnostics: ChartDiagnostic[];
};
