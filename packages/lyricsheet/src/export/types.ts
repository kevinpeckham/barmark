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
	/** Verses stacked on bars that play once, written as one pass per verse: ChordPro has no stacking (spec 4.5). */
	| "stacked-verses"
	/** A chord between two syllables of one word, written before the word's next syllable. */
	| "chord-moved"
	/** Lyrics or text holding characters ChordPro reads as markup (`[`, `]`, `{`, `}`, a leading `#`), changed. */
	| "text-changed"
	/** A chord name ChordPro's chord parser does not know (spec 4.7's gaps), written as barmark spells it. */
	| "chord-names"
	/** Where in its bar each chord falls: lyric lines keep the chords' order only (spec 4.3). */
	| "chord-timing"
	/** A stop (`--`), written as the text `*Stop` (spec 4.3). */
	| "stop"
	/** A note set, written as its notes' names as text: not a chord to readers, octaves and root mark lost (spec 4.3). */
	| "note-sets"
	/** A voicing's exact notes: only the chord's name is written (spec 4.3). */
	| "voicing"
	/** Pushes, accents, hits and pedal marks: the chord is written unmarked (spec 4.3). */
	| "marks"
	/** A one-bar meter: lyric lines do not show a bar's own meter (spec 4.3). */
	| "bar-meter"
	/** A fermata, written as the text `*…`: its hold has no length (spec 4.3). */
	| "fermata";

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
