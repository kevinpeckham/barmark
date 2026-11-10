import type {
	ChartDiagnostic,
	Credits,
	DeclaredPart,
	Direction,
	Directives,
	Key,
	Meter,
	Repeat,
	Slot,
	Syllable,
	Words,
} from "barmark";

/** `part`: draw only the part with this label (barmark's grammar 7.4), as a single-part chart. */
export type LayoutOptions = {
	/**
	 * Letter each section occurrence A, B, C… in play order; none when any
	 * bar in the chart carries its own rehearsal mark (`@A`, barmark's
	 * grammar 2.5), which then stand alone.
	 */
	rehearsalLetters?: boolean;
	part?: string;
};

/** What to draw, with every musical decision already made. */
export type ChartModel = {
	title: string | null;
	/** What `part:` names in a single-part chart; null when the chart names none or several. */
	part: DeclaredPart | null;
	/** Every declared part, in score order (barmark's grammar 7.4), with its lines (7.6). */
	parts: DeclaredPart[];
	/** The chart's credit lines (barmark's grammar 7.5). */
	credits: Credits;
	/** Directives before the first heading, bar line or text line. */
	header: Directives;
	/** The beat the header's tempo counts. */
	tempoBeat: TempoBeat;
	blocks: SectionBlock[];
	diagnostics: ChartDiagnostic[];
};

/**
 * The note a `tempo:` counts (barmark's grammar 2.1), from the `time:` in
 * force, never a one-bar meter's (2.4): the bottom number in a simple meter
 * (`note: 4` is a quarter), a dotted quarter in 6/8, 9/8 and 12/8.
 */
export type TempoBeat = { note: 2 | 4 | 8 | 16; dotted: boolean };

export type SectionBlock = {
	/** The heading as written; null for content before the first heading. */
	heading: string | null;
	/** `## Chorus x2` */
	repeat: Repeat;
	form: number | null;
	/** "A", "B", … when rehearsal letters are on and the chart writes no rehearsal mark of its own. */
	rehearsal: string | null;
	/** The widest row's cell count: fermata, direction and rehearsal cells included. */
	columns: number;
	/** The most bars any row has: its `slots` cells alone, for a drawer that gives the narrow cells their own width. 0 when no row has a bar. */
	bars: number;
	items: BlockItem[];
};

export type RowItem = Extract<BlockItem, { kind: "row" }>;

export type BlockItem =
	| {
			kind: "row";
			line: number;
			/** The written number of the row's first bar (`PlayedBar.written`); a replay shows its section's numbers. Null for a row with no bar. */
			barNumber: number | null;
			opens: boolean;
			closes: boolean;
			repeat: Repeat;
			/** The passes an ending plays on; null for any other row. */
			ending: number[] | null;
			/** On a row an ending continues onto (barmark's grammar 5.1): that ending's passes. Absent on any other row. */
			continues?: number[];
			cells: CellModel[];
			/** Set on a line that sings words (barmark's grammar 7.7): its note sets draw as pitch names over them. */
			sings?: true;
			/** The verses sung on a singing line's bars, in verse order, each syllable under its slot. */
			verses?: Verse[];
			/**
			 * A lyric row on no melody under this row, or under the system whose
			 * last row this is (barmark's grammar 7.7): each verse's syllables in
			 * the bars they cover, spaced by beat.
			 */
			lyrics?: Verse[];
	  }
	/**
	 * A system (barmark's grammar 7.4): a row per declared part, in score
	 * order, sharing bars. A part tacet there has a row of `tacet` bars; a
	 * part whose line has an error has an error item.
	 */
	| {
			kind: "system";
			line: number;
			barNumber: number | null;
			rows: Array<{ label: string; name: string; row: RowItem | ErrorItem }>;
	  }
	/** `note` marks a `###` line, whose text is given without the marks. */
	| { kind: "text"; text: string; note: boolean }
	/** A change written mid-chart; `tempoBeat` is the beat a tempo there counts. */
	| { kind: "directive"; set: Directives; tempoBeat: TempoBeat }
	| ErrorItem;

/**
 * One verse's syllables on a row's bars, as the parser places them: per
 * cell (a cell that isn't a bar has none), per position, the syllables
 * there. Under a singing line the positions are the bar's slots, a group's
 * members each one; in a lyric row they are equal steps of the bar, as fine
 * as its syllables need.
 */
export type Verse = { verse: number; cells: Syllable[][][] };

export type ErrorItem = { kind: "error"; line: number; source: string; messages: string[] };

export type CellModel =
	| {
			kind: "slots";
			meter: Meter | null;
			slots: Slot[];
			cut: boolean;
			/** Set on a bar played inside a rit. or accel. */
			tempoChange?: "rit" | "accel";
			/** The key the bar is played in, when the chart names one. */
			key?: Key;
			/** Words written on the bar (barmark's grammar 2.6), each before slot `at`. */
			words?: Words[];
			/** A bar where the part rests, in a system (barmark's grammar 7.4). */
			tacet?: true;
			/** `%` on a tutti line whose parts each copy a different bar: drawn as `%`, its slots empty (barmark's grammar 7.4). */
			simile?: true;
			/** The error message of each slot written here that can't be read, in order (barmark's grammar 2.3); absent when none. */
			unread?: string[];
	  }
	| { kind: "fermata" }
	/** A segno, coda or jump between bars (barmark's grammar 5.2). */
	| { kind: "direction"; direction: Direction }
	/** A rehearsal mark on the bar after it (barmark's grammar 2.5). */
	| { kind: "rehearsal"; label: string };
