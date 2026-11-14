/**
 * Stacked spellings (grammar 3, Appendix A.5): notation programs print a
 * chord's alterations one after another with no separator ("D6 add9
 * omit5"), so a chart arrives as `D6(omit5add9)` or `Gadd9omit3`. These
 * read as their comma-separated form. Every scan here is one pass over the
 * text, so a long symbol costs its length.
 */
import type { Diagnostic } from "./types.js";
import { TONES } from "./vocabulary.js";

/** The shape of one parenthesis item; the tokenizer judges what it names. */
const ITEM = /^(?:add[b#]?\d+|(?:omit\s*|no)\d+|[b#]?\d+)$/;
/** Where an item run together with the one before it starts: never between `add` and its tone's accidental. */
const ITEM_START = /(?=add|omit|no|(?<!add)[b#])/;
/** A slash bass at the end of the text after the root. */
const BASS = /\/[A-G][#b]?$/;
/** Where the chord's name ends: its first parenthesis or slash bass. */
const NAME_END = /\(|\/[A-G]/;

/** The items run together in one parenthesis item, or the item alone when it isn't a run of valid items. */
function splitItem(item: string): string[] {
	const pieces = item.split(ITEM_START).map((p) => p.trim());
	return pieces.length > 1 && pieces.every((p) => ITEM.test(p)) ? pieces : [item];
}

/** A scan for a whole group or a bare match of `bare`: one pass, never a lookahead per match. */
export const bareScan = (bare: string) => new RegExp(String.raw`\((?<inner>[^()]*)\)|${bare}`, "g");

/**
 * The text with every match of `scan`'s bare pattern outside a parenthesis
 * taken out (and each group's items passed through `group`), and what was
 * taken.
 */
export function pullBare(
	rest: string,
	scan: RegExp,
	group: (inner: string) => string = (inner) => inner,
): { text: string; taken: string[] } {
	const taken: string[] = [];
	const text = rest.replace(scan, (match: string, ...args: unknown[]) => {
		const { inner } = args.at(-1) as { inner?: string };
		if (inner !== undefined) return `(${group(inner)})`;
		taken.push(match);
		return "";
	});
	return { text, taken };
}

/** The text with `items` added to its last group, or in a new group before any slash bass. */
export function intoGroup(rest: string, items: string[]): string {
	if (!items.length) return rest;
	const close = rest.lastIndexOf(")");
	if (close >= 0) return `${rest.slice(0, close)},${items.join(",")}${rest.slice(close)}`;
	const at = BASS.exec(rest)?.index ?? rest.length;
	return `${rest.slice(0, at)}(${items.join(",")})${rest.slice(at)}`;
}

/** A parenthesis and its items. */
const GROUP = /\((?<inner>[^()]*)\)/g;
/** A bare `omit`/`no` ending the chord's name. */
const TRAILING_OMISSION = /(?:omit\s*|no)\d+$/;

export type Separated = { text: string; runTogether: boolean; bareOmission: boolean };

/**
 * The text after a root with items run together in a parenthesis separated
 * by commas, and a bare `omit`/`no` ending the chord's name (after the
 * quality however it is spelled, before any parenthesis or slash bass)
 * moved into the last group (or a new one): `6(omit5add9)` is `6(omit5,add9)`, `add9omit3` is
 * `add9(omit3)`.
 */
export function separate(rest: string): Separated {
	let runTogether = false;
	const split = (inner: string) => {
		const items = inner.split(",");
		const out = items.flatMap(splitItem);
		if (out.length > items.length) runTogether = true;
		return out.join(",");
	};
	const text = rest.replace(GROUP, (_, inner: string) => `(${split(inner)})`);
	// The chord's name: what comes before the first parenthesis or slash bass
	// (a slash before a letter; `6/9` is an extension), whatever follows it.
	const end = NAME_END.exec(text)?.index ?? text.length;
	const name = text.slice(0, end);
	const bare = TRAILING_OMISSION.exec(name);
	if (!bare) return { text, runTogether, bareOmission: false };
	const moved = intoGroup(name.slice(0, bare.index) + text.slice(end), [bare[0]]);
	return { text: moved, runTogether, bareOmission: true };
}

/** The warning a stacked spelling reads with, suggesting `suggestion`; null when it isn't one. */
export function stackedWarning(
	symbol: string,
	separated: Separated,
	suggestion: string,
): Diagnostic | null {
	const why = [
		...(separated.runTogether ? ["items in a parenthesis are separated by commas"] : []),
		...(separated.bareOmission ? ["an omission goes in parentheses"] : []),
	];
	if (!why.length) return null;
	return { message: `${symbol}: ${why.join("; ")}`, token: symbol, suggestion };
}

/** The altered tones, which may follow an extension with no parenthesis (grammar 3). */
export const ALTERATIONS = TONES.filter((t) => /^[b#]/.test(t)).join("|");
const GROUP_AND_BASS = String.raw`(?:\(([^()]*)\))?(\/[A-G][#b]?)?$`;
/** An alteration straight after the root (and its quality or sus), with no extension: `F#b5(omit3)`, `Cmb6`. */
const ALTERED = new RegExp(
	`^([A-G][#b]?)(m|dim|aug|5|sus2|sus4)?(${ALTERATIONS})${GROUP_AND_BASS}`,
);
/** A root whose accidental a following number could be read with: `Gb5`, `G#5`, `Ab6`. */
const SWALLOWED = new RegExp(`^([A-G])(${ALTERATIONS})${GROUP_AND_BASS}`);
/** What a root's accidental and the number after it always are (grammar 3). */
const CHORD_KIND: Record<string, string> = {
	"5": "power",
	"6": "sixth",
	"9": "ninth",
	"11": "eleventh",
	"13": "thirteenth",
};

/**
 * The error for a symbol that can't be read, with a suggestion when it
 * writes an alteration (an altered fifth, `b6`, `b9`, …) before the
 * parenthesis on a chord with no extension (grammar 3 keeps `Ab5` the A♭
 * power chord and `Cb6` the C♭ sixth chord). `reads` says whether a
 * symbol reads, `offers` whether it reads as a suggestion may (its root and
 * bass as written). Where the root's own accidental could be the
 * alteration's (`Gb5(omit3)`), the message says it is ambiguous, with no
 * suggestion; only when that reading would itself read.
 */
export function bareAlteration(
	symbol: string,
	text: string,
	error: Diagnostic,
	reads: (symbol: string) => boolean,
	offers: (suggestion: string) => boolean,
): Diagnostic {
	const s = SWALLOWED.exec(text);
	if (s) {
		const [, letter = "", alteration = "", inner, bass = ""] = s;
		const items = inner?.trim() ? `,${inner}` : "";
		const altered = letter + separate(`(${alteration}${items})${bass}`).text;
		if (!reads(altered)) return error;
		const [accidental, n] = [alteration.slice(0, 1), alteration.slice(1)];
		return {
			...error,
			message: `${error.message}; ambiguous: ${letter}${alteration} is always the ${letter}${accidental} ${CHORD_KIND[n]} chord (grammar 3); a ${letter} chord with a ${alteration} writes it in the parentheses`,
		};
	}
	const m = ALTERED.exec(text);
	if (!m) return error;
	const [, root = "", quality = "", alteration = "", inner, bass = ""] = m;
	const items = inner?.trim() ? `,${inner}` : "";
	const suggestion = root + separate(`${quality}(${alteration}${items})${bass}`).text;
	if (!offers(suggestion)) return error;
	return {
		message: `${symbol}: an altered ${alteration.slice(1)}th goes in the parentheses unless it follows an extension (grammar 3)`,
		token: symbol,
		suggestion,
	};
}
