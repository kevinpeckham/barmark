/**
 * Text ChordPro would read as markup (the plan's Review Focus 2). ChordPro
 * has no escape, so what it would read as markup is written otherwise, and
 * each line changed is one `text-changed` loss:
 *
 * - everywhere (titles, credits, labels, lyrics, comments): a `<` with a
 *   `>` after it opens a tag to ChordPro (measured with the reference: `a
 *   < b ->` loses `< b ->`, `<b>la</b>` prints `la`), so such a `<` is
 *   written `(` and such a `>` (one with a `<` before it) `)`; a `<` or `>`
 *   alone stays (`a < b`, `<3`, `->`, `x>y` print as written, and so does
 *   `&amp;`);
 * - in lyrics, words and comments, which ChordPro reads as lyric lines:
 *   `[` `]` `{` `}` are written `(` `)` `(` `)`, and a `#` that would start
 *   a line gets a space before it.
 */
import type { PlayedBar } from "barmark";
import type { Losses } from "./losses.js";

/** Angle brackets that would make a tag, as parentheses; linear in the text's length. */
export function untagged(text: string): string {
	const firstOpen = text.indexOf("<");
	const lastClose = text.lastIndexOf(">");
	if (firstOpen < 0 || lastClose < firstOpen) return text;
	// UTF-16 indexes, as indexOf gives them; `<` and `>` are never half of a pair.
	return text.replace(/[<>]/g, (c, i: number) => {
		if (c === "<") return i < lastClose ? "(" : c;
		return i > firstOpen ? ")" : c;
	});
}

/** Text in a lyric line or a comment as ChordPro shows it unchanged: no brackets, braces or tags, a tab a space. */
export const plain = (text: string) =>
	untagged(text).replace(/[[{]/g, "(").replace(/[\]}]/g, ")").replace(/\t/g, " ");

/** A lyric line as written: a `#` that would start it (a comment to ChordPro) gets a space before it. */
export const unhashed = (line: string) => (line.startsWith("#") ? ` ${line}` : line);

/**
 * A lyric or grid line as written: a final `\` becomes `/`. ChordPro joins
 * a line ending in `\` to the next; `\\` there does the same (dropping one)
 * and `\ ` would leave a trailing space (measured 2026-11-19).
 */
export const unjoined = (line: string) => (line.endsWith("\\") ? `${line.slice(0, -1)}/` : line);

/**
 * A heading as a quoted `label="…"` value shows it: `\` and `"` escaped.
 * ChordPro splits a label into lines at a backslash-n left in it after
 * unescaping, so a word joiner (U+2060, drawn as nothing) goes between
 * such a backslash and its `n`, and the heading stays one line.
 */
export const labelValue = (text: string) =>
	text.replace(/\\(?=n)/g, "\\⁠").replace(/[\\"]/g, (c) => `\\${c}`);

const TEXT_CHANGED =
	"text holding characters ChordPro reads as markup is changed: brackets, braces and tag-like <…> become parentheses, a tab a space, a # starting a lyric line gets a space before it, a backslash ending a line becomes /, a word joiner keeps a label's backslash-n on one line, and words in a grid's margin that read as a count are quoted";

/** One `text-changed` loss for a line written differently from its text. */
export function textChanged(losses: Losses, bar?: PlayedBar): void {
	losses.add("text-changed", TEXT_CHANGED, bar);
}
