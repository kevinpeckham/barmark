import type { ChordRecord } from "../chords/types.js";
import type { ClefName, InstrumentName } from "./instruments.js";

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
 * or with a short label, `part: Gtr = Electric Guitar 1`; `instrument:`
 * and `clef:` may follow, and are present only when written.
 */
export type Part = { name: string; label?: string; instrument?: InstrumentName; clef?: ClefName };

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
/** `+` presses the sustain pedal, or changes it when it is down; `*` lifts it (grammar 2.9). */
export type Pedal = "press" | "release";
/** A syllable sung on a note (grammar 4.3). `held` is `:/`. `parts` holds elided syllables (`the~end`). */
export type Syllable = { kind: "sung"; parts: string[]; continues: boolean } | { kind: "held" };
/**
 * A chord slot holds a chord symbol or a note set; `chord.kind` tells
 * which. `voicing` is the exact notes written after a chord's name
 * (`Cmaj7{E3 G3 B3}`, grammar 4.2). `syllable` is sung on a note set
 * (`{G4}:maz-`, grammar 4.3), never on a chord name or a voicing. The
 * optional fields are present only when written.
 */
/**
 * A slot of a lyric row (grammar 7.7): a syllable, `/` holding the one
 * before, `--` a breath (nothing sung), or `_` splitting the slot.
 */
export type LyricSlot =
	| { kind: "syllable"; syllable: Syllable }
	| { kind: "hold" }
	| { kind: "breath" }
	| { kind: "group"; members: LyricSlot[] };
export type SimpleSlot = (
	| {
			kind: "chord";
			chord: ChordRecord;
			voicing?: ChordRecord;
			pedal?: Pedal;
			articulation?: Articulation;
			push?: Push;
			syllable?: Syllable;
	  }
	| { kind: "hold" }
	| { kind: "nc"; push?: Push }
	| { kind: "silence"; push?: Push }
	| { kind: "unknown" }
) & {
	/** A dotted member of a two-member group (grammar 2.2): three quarters of its slot. */
	dotted?: true;
};
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
	| {
			kind: "slots";
			meter: Meter | null;
			slots: Slot[];
			words?: Words[];
			/** A stand-in bar of `N.C.` for a part that is tacet there (grammar 7.4); only a projected part has one. */
			tacet?: true;
	  }
	| { kind: "simile"; words?: Words[] }
	| { kind: "fermata" }
	| { kind: "direction"; direction: Direction }
	/** `@B`: a mark on the bar after it (grammar 2.5). */
	| { kind: "rehearsal"; label: string };
export type Repeat = number | "open" | null;

/** Who a credit line names (grammar 7.5). */
export type CreditRole = "composer" | "lyricist" | "arranger" | "copyright";
/** A chart's credits, each role's entries in written order (grammar 7.5). */
export type Credits = Record<CreditRole, string[]>;

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
			/** The declared label of the part whose line this is (grammar 7.4); absent on a tutti line and in a single-part chart. */
			part?: string;
			/** The part's line this is (`RH` in `Pno.RH`, grammar 7.6), as first spelled; absent on a part's bare line. */
			lineName?: string;
			/** Which system a labelled line is in, from 0 in chart order. */
			system?: number;
			/** Set when the line's bars or structure differ from its system's (an error): its part is tacet there. */
			dropped?: true;
	  }
	/** A text line; `escaped` when written with a leading `\` (grammar 1), which `text` leaves off. */
	| { kind: "text"; line: number; text: string; escaped?: true }
	/** `---` alone (grammar 1, 7.4): ends a system, and means nothing else. */
	| { kind: "break"; line: number }
	/**
	 * `lyrics:` or `lyrics N:` then a bar line (grammar 7.7): syllables on the
	 * beats, one cell per bar. `verse` is N, null when unnumbered. `covers`
	 * holds the source lines of the bar lines it lies under, in order: one,
	 * a system's lines, or under a replay heading the replayed section's
	 * line; empty when it covers none (an error).
	 */
	| {
			kind: "lyrics";
			line: number;
			verse: number | null;
			cells: LyricSlot[][];
			covers: number[];
	  }
	/** `composer: …` and the other credit lines (grammar 7.5). */
	| { kind: "credit"; line: number; role: CreditRole; text: string }
	/**
	 * A bar line dropped for an error, kept as written so its section still
	 * counts as written out; `written` is how many bars its pipes write.
	 */
	| {
			kind: "invalid";
			line: number;
			text: string;
			written: number;
			part?: string;
			lineName?: string;
			system?: number;
	  };

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
	/** Set when the part is tacet in this bar (grammar 7.4): its slots then read `N.C.`. */
	tacet?: true;
	/**
	 * In a chart of several parts, each part's bar, aligned with
	 * `ChartParse.parts`; null where that part is tacet. The top-level
	 * `slots` and `words` are the first part's.
	 */
	parts?: PartBar[];
	/** A single part's lines (grammar 7.6), as on `PartBar`: in a single-part chart or an extracted part that writes lines. */
	lines?: LineBar[];
	/**
	 * The words sung in this bar (grammar 4.3, 7.7), one entry per verse in
	 * verse order: on a repeat's pass N only verse N; absent when none.
	 */
	lyrics?: PlayedLyrics[];
};
/**
 * A syllable as played: `at` is its onset in whole notes from the bar's
 * start; `note` is true when a note of the singing line starts there.
 */
export type PlayedSyllable = { at: number; syllable: Syllable; note: boolean };
/**
 * One verse's syllables in a played bar; `part` is the label of the part
 * singing (absent in a chart with no voice part).
 */
export type PlayedLyrics = { verse: number; part?: string; syllables: PlayedSyllable[] };
/** One part's line's share of a played bar (grammar 7.6): its name, the line it is written on, its slots and words. */
export type LineBar = { name: string; line: number; slots: Slot[]; words?: Words[] };
/**
 * One part's share of a played bar (grammar 7.4): the line it is written
 * on, its slots and words. A part that writes lines (7.6) has `lines`, one
 * per line playing there in score order, and its first playing line's
 * `line`, `slots` and `words`.
 */
export type PartBar = { line: number; slots: Slot[]; words?: Words[]; lines?: LineBar[] } | null;
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

/**
 * A declared part as the parse reports it: `lines` names its lines in score
 * order (grammar 7.6), present only when it writes some. `sings`, on the
 * part that sings (grammar 7.7), names the line whose notes carry the
 * lyrics, or is "" for its bare line; absent when it writes no notes.
 */
export type DeclaredPart = Part & { lines?: string[]; sings?: string };

export type ChartParse = {
	title: string | null;
	/**
	 * The one part a single-part chart names (grammar 7.3); null when it names
	 * none or several.
	 * @deprecated use `parts`.
	 */
	part: DeclaredPart | null;
	/** Every part the chart declares, in score order (grammar 7.4); empty when none. */
	parts: DeclaredPart[];
	/** The credit lines (grammar 7.5); each list empty when none is written. */
	credits: Credits;
	lines: Line[];
	events: ChartEvent[];
	/** `events` flattened, with an open repeat's pass included once. */
	bars: PlayedBar[];
	sections: SectionOccurrence[];
	/** Sorted by line, then errors before warnings. */
	diagnostics: ChartDiagnostic[];
};
