import type { ChartDiagnostic } from "barmark";
import type { Losses } from "./losses.js";

export type LyricsheetOptions = {
	/** Write this part's lines (the part's label or name). */
	part?: string;
	/** The title, when the chart has none. */
	title?: string;
	/** Add guitar chord diagrams. */
	diagrams?: "guitar";
};

/** What the export could not carry. */
export type LyricsheetLossCode =
	/** A church mode in `key:`: ChordPro's `{key}` names a major or minor key only. */
	"key-mode";

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
