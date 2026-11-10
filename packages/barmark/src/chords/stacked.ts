/**
 * Stacked spellings (grammar 3, Appendix A.5): notation programs print a
 * chord's alterations one after another with no separator ("D6 add9
 * omit5"), so a chart arrives as `D6(omit5add9)` or `Gadd9omit3`. These
 * read as their comma-separated form. Every scan here is one pass over the
 * text, so a long symbol costs its length.
 */
import type { Diagnostic } from "./types.js";

/** The shape of one parenthesis item; the tokenizer judges what it names. */
const ITEM = /^(?:add\d+|(?:omit\s*|no)\d+|[b#]?\d+)$/;
/** Where an item run together with the one before it starts. */
const ITEM_START = /(?=add|omit|no|[b#])/;
/** A slash bass at the end of the text after the root. */
const BASS = /\/[A-G][#b]?$/;

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
/**
 * A bare `omit`/`no` at the end of the chord's name as written (grammar 3):
 * after the quality, extension, alterations, sus and bare adds, before any
 * parenthesis or slash bass. Aliases are not a name as written: `CΔno3`
 * stays an error.
 */
const BARE_OMISSION =
	/^((?:m(?!aj)|dim|aug|5)?(?:7alt|maj13|maj9|maj7|6\/9|13|11|9|7|6)?(?:b5|#5|b9|#9|#11|b13)*(?:sus[24])?(?:add(?:2|4|9|11))*)((?:omit\s*|no)\d+)(?=[(/]|$)/;

export type Separated = { text: string; runTogether: boolean; bareOmission: boolean };

/**
 * The text after a root with items run together in a parenthesis separated
 * by commas, and a bare `omit`/`no` ending the chord's name moved into the
 * last group (or a new one): `6(omit5add9)` is `6(omit5,add9)`, `add9omit3` is
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
	const bare = BARE_OMISSION.exec(text);
	if (!bare) return { text, runTogether, bareOmission: false };
	const [whole, head = "", omission = ""] = bare;
	const moved = intoGroup(head + text.slice(whole.length), [omission]);
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

/** An altered fifth straight after the root (and `m`), with no extension: `F#b5(omit3)`. */
const ALTERED_FIFTH = /^([A-G][#b]?)(m?)([b#]5)(?:\(([^()]*)\))?(\/[A-G][#b]?)?$/;
/** A root whose accidental a following `5` could be read with: `Gb5`, `G#5`. */
const SWALLOWED = /^([A-G])([#b])5(?:\(([^()]*)\))?(\/[A-G][#b]?)?$/;

/**
 * The error for a symbol that can't be read, with a suggestion when it
 * writes an altered fifth before the parenthesis on a chord with no
 * extension (grammar 3 keeps `Ab5` the A♭ power chord). `reads` says
 * whether a suggestion reads. Where the root's own accidental could be the
 * fifth's (`Gb5(omit3)`), the message says it is ambiguous, with no
 * suggestion; only when that fifth reading would itself read.
 */
export function alteredFifth(
	symbol: string,
	text: string,
	error: Diagnostic,
	reads: (symbol: string) => boolean,
): Diagnostic {
	const s = SWALLOWED.exec(text);
	if (s) {
		const [, letter = "", accidental = "", inner, bass = ""] = s;
		const items = inner?.trim() ? `,${inner}` : "";
		const fifth = letter + separate(`(${accidental}5${items})${bass}`).text;
		if (!reads(fifth)) return error;
		const power = `${letter}${accidental}5`;
		return {
			...error,
			message: `${error.message}; ambiguous: ${power} is always the ${letter}${accidental} power chord (grammar 3); a ${letter} chord with a ${accidental}5 writes it in the parentheses`,
		};
	}
	const m = ALTERED_FIFTH.exec(text);
	if (!m) return error;
	const [, root = "", minor = "", fifth = "", inner, bass = ""] = m;
	const items = inner?.trim() ? `,${inner}` : "";
	const suggestion = root + separate(`${minor}(${fifth}${items})${bass}`).text;
	if (!reads(suggestion)) return error;
	return {
		message: `${symbol}: an altered 5th goes in the parentheses unless it follows an extension (grammar 3)`,
		token: symbol,
		suggestion,
	};
}
