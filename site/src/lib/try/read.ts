import { speakChord } from "@barmark/render";
import {
	type ChordRecord,
	DIRECTIVE_NAMES,
	harteToBarmark,
	type Interval,
	type ParseResult,
	parseChart,
	parseChord,
	parseNoteSet,
	printChart,
} from "barmark";
import { type GuideQuery, matches } from "../guide/query.ts";
import { ROWS } from "../guide/rows.ts";

/** The chips under the box, in order. */
export const EXAMPLES: readonly string[] = ["Cø", "C7b9/E", "{C E G}", "C:maj7", "| D | % | x2"];

/** Past this the page stops reading, as the home page stops previewing (ChartRender's limit). */
export const MAX_LENGTH = 50_000;

export type Kind = "empty" | "chart" | "notes" | "harte" | "chord";

/** What barmark makes of a chord, all of it from the packages. */
export type ChordReading = {
	/** What was read: the input, or a Harte label's barmark spelling. */
	typed: string;
	canonical: string;
	spoken: string;
	harte: string;
	notes: string[];
	/** The intervals above the root, as degrees: "1", "♭3", "♯11". */
	degrees: string[];
	/** The bass when it isn't the root. */
	bass: string | null;
	warnings: string[];
};

export type Reading =
	| { kind: "empty" }
	| { kind: "text" }
	| { kind: "long"; length: number; limit: number }
	| {
			kind: "chart";
			canonical: string;
			diagnostics: { line: number; severity: "error" | "warning"; message: string }[];
	  }
	| { kind: "chord" | "notes"; chord: ChordReading }
	| { kind: "harte"; label: string; chord: ChordReading }
	| { kind: "error"; message: string; suggestion: string | null };

const DIRECTIVE = new RegExp(`^(?:${DIRECTIVE_NAMES.join("|")})\\s*:`, "i");

export function classify(input: string): Kind {
	const text = input.trim();
	if (!text) return "empty";
	if (/[\n|]/.test(text) || text.startsWith("#") || DIRECTIVE.test(text)) return "chart";
	if (text.startsWith("{")) return "notes";
	if (text.includes(":") && harteToBarmark(text) !== null) return "harte";
	return "chord";
}

const degree = ({ degree, alter }: Interval) =>
	(alter < 0 ? "♭" : "♯").repeat(Math.abs(alter)) + degree;

function chordReading(typed: string, record: ChordRecord, warnings: string[]): ChordReading {
	return {
		typed,
		canonical: record.canonical,
		spoken: speakChord(record),
		harte: record.harte,
		notes: record.pitches,
		degrees: record.intervals.map(degree),
		bass: record.bass && record.bass !== record.root ? record.bass : null,
		warnings,
	};
}

/** A failed parse is an error when the text was trying to be a chord; otherwise just text. */
function readParsed(kind: "chord" | "notes", text: string, r: ParseResult): Reading {
	if (r.ok)
		return {
			kind,
			chord: chordReading(
				text,
				r.value,
				r.warnings.map((w) => w.message),
			),
		};
	if (!/^[A-H{]/.test(text)) return { kind: "text" };
	return { kind: "error", message: r.error.message, suggestion: r.error.suggestion ?? null };
}

/** What barmark makes of the text in the box. Never throws on input. */
export function read(input: string): Reading {
	if (input.length > MAX_LENGTH) return { kind: "long", length: input.length, limit: MAX_LENGTH };
	const text = input.trim();
	const kind = classify(text);
	if (kind === "empty") return { kind };
	// A chart is read as typed, so its line numbers match the box's.
	if (kind === "chart")
		return {
			kind,
			canonical: printChart(input),
			diagnostics: parseChart(input).diagnostics.map(({ line, severity, message }) => ({
				line,
				severity,
				message,
			})),
		};
	if (kind === "notes") return readParsed(kind, text, parseNoteSet(text));
	if (kind === "harte") {
		const spelling = harteToBarmark(text) ?? text;
		// "C:(1,3)" has no chord name in barmark; it is the note set {C E}.
		const reading = spelling.startsWith("{")
			? readParsed("notes", spelling, parseNoteSet(spelling))
			: readParsed("chord", spelling, parseChord(spelling));
		return "chord" in reading ? { kind, label: text, chord: reading.chord } : reading;
	}
	return readParsed(kind, text, parseChord(text));
}

/** Past this many characters a link is too long to share safely, so the text stays out of it. */
export const MAX_LINK = 2_000;

/** The page link's query for the text: "" for the opening example, null when too long to share. */
export function linkQuery(text: string): string | null {
	if (text === EXAMPLES[0]) return "";
	if (text.length > MAX_LINK) return null;
	const search = new URLSearchParams({ q: text }).toString();
	return search.length > MAX_LINK ? null : search;
}

/** Which guide rows to show under a reading; null: none (a chart). */
export function guideQuery(reading: Reading, input: string): GuideQuery | null {
	if (reading.kind === "chart" || reading.kind === "long") return null;
	const words: GuideQuery = { q: input.trim(), cat: null, sort: "category" };
	if (reading.kind === "empty" || reading.kind === "text") return words;
	// "Coda" isn't a chord, but the guide has rows for it.
	if (reading.kind === "error" && ROWS.some((row) => matches(row, words))) return words;
	return { q: "", cat: "chords", sort: "category" };
}

/** The reading in one short line, for a screen reader to hear as it changes. */
export function summarize(reading: Reading): string {
	switch (reading.kind) {
		case "chord":
		case "notes":
			return `${reading.chord.canonical}: ${reading.chord.spoken}`;
		case "harte":
			return `${reading.label} is ${reading.chord.canonical}: ${reading.chord.spoken}`;
		case "chart": {
			const n = reading.diagnostics.length;
			return `a chart, ${n === 0 ? "no problems" : `${n} problem${n === 1 ? "" : "s"}`}`;
		}
		case "error":
			return reading.message;
		case "long":
			return `too long to preview: ${reading.length.toLocaleString("en-US")} characters`;
		case "text":
			return "not a chord or a chart";
		default:
			return "";
	}
}
