import type { ChartDiagnostic } from "barmark";
import type { Losses } from "./losses.js";

export type LyricsheetOptions = {
	/** Write this part's lines: the part's label, as `extractPart` takes it. */
	part?: string;
	/** The title, when the chart has none. */
	title?: string;
	/** Add guitar chord diagrams. */
	diagrams?: "guitar";
};

/** What the export could not carry. */
export type LyricsheetLossCode =
	/** A church mode other than ionian and aeolian in `key:`: ChordPro's `{key}` names a major or minor key only. */
	| "key-mode"
	/** Parts other than the one written: ChordPro has one chord line per lyric line (spec 4.4). */
	| "other-parts"
	/** The written part's lines other than its first (a melody, a second hand): only their words are sung (spec 4.4). */
	| "other-lines"
	/** Verses stacked on the same bars, written as one pass per verse: ChordPro has no stacking (spec 4.5). */
	| "stacked-verses"
	/** A chord between two syllables of one word, written before the word's next syllable. */
	| "chord-moved"
	/** Text holding characters ChordPro reads as markup (`[`, `]`, `{`, `}`, tag-like `<…>`, a leading `#`, a tab, a line-ending backslash, a label's backslash-n, margin words like a count), changed. */
	| "text-changed"
	/** A chord name ChordPro's chord parser does not know (spec 4.7's gaps), written as barmark spells it. */
	| "chord-names"
	/** A note set, written as its notes' names as text (in a grid, joined by commas): not a chord to readers, octaves and root mark lost (spec 4.3). */
	| "note-sets"
	/** A voicing's exact notes: only the chord's name is written (spec 4.3). */
	| "voicing"
	/** Pushes, accents, hits and pedal marks: the chord is written unmarked (spec 4.3). */
	| "marks"
	/** A one-bar meter in lyric lines, which do not show a bar's own meter; a grid does, by its cells (spec 4.3). */
	| "bar-meter"
	/** A fermata, written as the text `*…`: its hold has no length (spec 4.3). */
	| "fermata"
	/** A rehearsal mark inside a grid line with `x N`, written at the line's start: the count is the whole line's. */
	| "mark-moved";

export type LyricsheetLoss = {
	code: LyricsheetLossCode;
	message: string;
	/** The played bar's position, as `PlayedBar.index`. */
	bar?: number;
	/** The bar's written number (0 is the pickup). */
	written?: number;
};

export type LyricsheetResult =
	| { ok: true; text: string; diagnostics: ChartDiagnostic[]; losses: LyricsheetLoss[] }
	| { ok: false; diagnostics: ChartDiagnostic[] };

/** What every stage writes into: the lines so far and the losses so far. */
export type Out = { lines: string[]; losses: Losses };
