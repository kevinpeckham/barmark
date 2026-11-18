/**
 * What changes between one played bar and the next, written where it
 * happens (spec 4.6): ChordPro applies a key or time "from where it was
 * specified". And the one rule for text ChordPro would read as markup
 * (the plan's Review Focus 2): ChordPro has no escape, so `[` `]` `{` `}`
 * are written as `(` `)` `(` `)`, and a `#` that would start a line gets a
 * space before it; each line changed is one `text-changed` loss.
 */
import type { PlayedBar } from "barmark";
import { directive, keyText } from "./meta.js";
import type { Out } from "./types.js";

/** What a played bar is in: the time in force, not a one-bar meter's. */
type State = Pick<PlayedBar, "key" | "tempo" | "tempoChange" | "feel" | "swingPercent"> & {
	time: string;
};

const stateOf = (bar: PlayedBar): State => {
	const t = bar.time ?? bar.meter;
	return { ...bar, time: `${t.n}/${t.d}` };
};

/** What the header has written before the first bar: its key, time and tempo, a straight feel. */
function opening(first: PlayedBar): State {
	const { swingPercent: _, ...rest } = stateOf(first);
	return { ...rest, tempoChange: null, feel: "straight" };
}

/** The key as `{key}`, a mode it cannot name being a loss. */
function keyLines(from: State, to: State, bar: PlayedBar, out: Out): string[] {
	const same = from.key?.tonic === to.key?.tonic && from.key?.mode === to.key?.mode;
	if (!to.key || same) return [];
	const text = keyText(to.key);
	if (text !== null) return [directive("key", text)];
	out.losses.add(
		"key-mode",
		`ChordPro's {key} cannot name the mode ${to.key.mode}, so it is left out`,
		bar,
	);
	return [];
}

/** A gradual change as it starts, or `a tempo` as one ends. */
function tempoChangeText(from: State, to: State): string | null {
	const a = from.tempoChange;
	const b = to.tempoChange;
	if (b && (a?.kind !== b.kind || a.to !== b.to))
		return `${b.kind === "rit" ? "rit." : "accel."}${b.to === null ? "" : ` to ${b.to}`}`;
	return a && !b ? "a tempo" : null;
}

/** The feel, when it changes: swing, shuffle or swing 16 with any amount, or straight again. */
function feelText(from: State, to: State): string | null {
	if (from.feel === to.feel && from.swingPercent === to.swingPercent) return null;
	return to.swingPercent === undefined ? to.feel : `${to.feel} ${to.swingPercent}%`;
}

/** The directives a bar needs written before it, given the bar played before (none at the chart's start). */
export function changeLines(
	prev: PlayedBar | undefined,
	bar: PlayedBar,
	first: PlayedBar,
	out: Out,
): string[] {
	const from = prev ? stateOf(prev) : opening(first);
	const to = stateOf(bar);
	const lines = keyLines(from, to, bar, out);
	if (from.time !== to.time) lines.push(directive("time", to.time));
	if (to.tempo !== null && from.tempo !== to.tempo)
		lines.push(directive("tempo", String(to.tempo)));
	for (const text of [tempoChangeText(from, to), feelText(from, to)])
		if (text !== null) lines.push(directive("comment", text));
	return lines;
}

/** Text as ChordPro shows it unchanged: brackets and braces as parentheses. */
export const plain = (text: string) => text.replace(/[[{]/g, "(").replace(/[\]}]/g, ")");

/** A line as written: a `#` that would start it (a comment to ChordPro) gets a space before it. */
export const unhashed = (line: string) => (line.startsWith("#") ? ` ${line}` : line);

const TEXT_CHANGED =
	"text holding characters ChordPro reads as markup is changed: brackets and braces become parentheses, and a # starting a lyric line gets a space before it";

/** One `text-changed` loss for a line written differently from its text. */
export function textChanged(out: Out, bar: PlayedBar | undefined): void {
	out.losses.add("text-changed", TEXT_CHANGED, bar);
}

/** A text line as `{comment: …}` (spec 4.6), its markup changed and reported. */
export function comment(text: string, bar: PlayedBar | undefined, out: Out): string {
	const shown = plain(text);
	if (shown !== text) textChanged(out, bar);
	return directive("comment", shown);
}
