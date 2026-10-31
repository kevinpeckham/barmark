import type { ChordParts } from "./vocabulary.js";
/** A scale degree above a root: `b3` is `{ degree: 3, alter: -1 }`. Degrees above 7 stay as written. */
export type Interval = { degree: number; alter: number };

export type Diagnostic = { message: string; token: string; suggestion?: string };

/** One slot's harmony as a machine reads it (grammar Appendix A.7). */
export type ChordRecord = {
	kind: "chord" | "notes";
	source: string;
	canonical: string;
	root: string | null;
	intervals: Interval[];
	pitches: string[];
	bass: string;
	alteredOpen: boolean;
	harte: string;
	/** The canonical parts a chord symbol is spelled from; null for a note set. */
	parts: ChordParts | null;
};

export type ParseResult =
	| { ok: true; value: ChordRecord; warnings: Diagnostic[] }
	| { ok: false; error: Diagnostic };
