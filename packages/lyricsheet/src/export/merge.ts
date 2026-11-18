/**
 * One written line's chords and sung syllables as one ChordPro lyric line
 * (spec 4.2), merged by time. ChordPro keeps order, not duration, so the
 * merge is exact about order and drops only timing.
 */
import type { Syllable } from "barmark";

/**
 * A chord (its text as written between brackets: a name, or `*…` for an
 * annotation) or a syllable, at `at` whole notes from the line's start.
 * A chord marked `alone` (a fermata after its bar) never claims the
 * syllable that starts at its time: it stands alone before it.
 */
export type Piece =
	| { at: number; chord: string; alone?: true }
	| { at: number; syllable: Syllable };

/** Times equal within this many whole notes are a tie, as `@barmark/musicxml`'s lyrics compare them. */
const EPSILON = 1e-9;

/** A time as a whole number of EPSILONs, so ties sort and match exactly. */
const tick = (at: number) => Math.round(at / EPSILON);

type Sung = { at: number; syllable: Extract<Syllable, { kind: "sung" }> };
const isSung = (p: Piece): p is Sung => "syllable" in p && p.syllable.kind === "sung";

/** The pieces in time order, each with its index; on a tie a chord comes first, otherwise the order given. */
function inOrder(pieces: Piece[]): { p: Piece; i: number }[] {
	const rank = (p: Piece) => ("chord" in p ? 0 : 1);
	return pieces
		.map((p, i) => ({ p, i, t: tick(p.at) }))
		.sort((a, b) => a.t - b.t || rank(a.p) - rank(b.p) || a.i - b.i);
}

/** The line being written, and where the merge stands in it. */
type State = {
	text: string;
	/** The last sung syllable continues its word (`riv-`). */
	inWord: boolean;
	/** Chords to write directly before the next sung syllable. */
	pending: string[];
};

const bracketed = (chord: string) => `[${chord}]`;

/** A chord that lands on no syllable: alone in time order, a space between it and any neighbour. */
function standAlone(s: State, chord: string): void {
	s.text += `${s.text === "" ? "" : " "}${bracketed(chord)}`;
}

/** A sung syllable, after the chords that land on it; a space before it unless it continues a word. */
function sing(s: State, { syllable }: Sung, last: boolean): void {
	const space = s.text === "" || s.inWord ? "" : " ";
	const word = syllable.parts.join(" ");
	// A word that runs on past the line's end keeps its hyphen, so it reads as unfinished.
	const hyphen = syllable.continues && last ? "-" : "";
	s.text += `${space}${s.pending.map(bracketed).join("")}${word}${hyphen}`;
	s.pending = [];
	s.inWord = syllable.continues;
}

/**
 * One line's chords and syllables as ChordPro (spec 4.2). A chord that
 * attacks where a syllable starts goes directly before it (`[C]riv`); one
 * where none starts stands alone in time order (`waiting [D] for`). A
 * chord that attacks between two syllables of one word (a design call the
 * spec leaves open) cannot stand alone without splitting the word, so it
 * is written before the word's next syllable (`wait[D]ing`), and `moved`
 * is told its index in `pieces`. Continued syllables join with no hyphen;
 * an elision (`~`) is a space; a held syllable writes nothing.
 */
export function lyricLine(pieces: Piece[], moved?: (index: number) => void): string {
	const starts = new Set(pieces.filter(isSung).map((p) => tick(p.at)));
	const ordered = inOrder(pieces);
	const sungLeft = pieces.filter(isSung).length;
	let sung = 0;
	const s: State = { text: "", inWord: false, pending: [] };
	for (const { p, i } of ordered) {
		if (isSung(p)) {
			sung += 1;
			sing(s, p, sung === sungLeft);
		} else if ("chord" in p) {
			const later = sung < sungLeft;
			if (!p.alone && starts.has(tick(p.at))) s.pending.push(p.chord);
			else if (s.inWord && later) {
				s.pending.push(p.chord);
				moved?.(i);
			} else standAlone(s, p.chord);
		}
	}
	for (const chord of s.pending) standAlone(s, chord);
	return s.text;
}
