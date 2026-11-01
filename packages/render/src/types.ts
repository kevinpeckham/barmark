import type { ChartDiagnostic, Directives, Meter, Repeat, Slot } from "barmark";

export type LayoutOptions = { rehearsalLetters?: boolean };

/** What to draw, with every musical decision already made. */
export type ChartModel = {
	title: string | null;
	/** Directives before the first heading, bar line or text line. */
	header: Directives;
	blocks: SectionBlock[];
	diagnostics: ChartDiagnostic[];
};

export type SectionBlock = {
	/** The heading as written; null for content before the first heading. */
	heading: string | null;
	/** `## Chorus x2` */
	repeat: Repeat;
	form: number | null;
	/** "A", "B", … when rehearsal letters are on. */
	rehearsal: string | null;
	/** The widest row's cell count. */
	columns: number;
	items: BlockItem[];
};

export type BlockItem =
	| {
			kind: "row";
			line: number;
			/** The play-order number of the row's first bar on its first pass. */
			barNumber: number | null;
			opens: boolean;
			closes: boolean;
			repeat: Repeat;
			cells: CellModel[];
	  }
	/** `note` marks a `###` line, whose text is given without the marks. */
	| { kind: "text"; text: string; note: boolean }
	| { kind: "directive"; set: Directives }
	| { kind: "error"; line: number; source: string; messages: string[] };

export type CellModel =
	| {
			kind: "slots";
			meter: Meter | null;
			slots: Slot[];
			cut: boolean;
			/** Set on a bar played inside a rit. or accel. */
			tempoChange?: "rit" | "accel";
	  }
	| { kind: "fermata" };
