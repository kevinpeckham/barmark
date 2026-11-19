/**
 * What changes between one played bar and the next, written where it
 * happens (spec 4.6): ChordPro applies a key or time "from where it was
 * specified". The reference prints nothing for a `{key}`, `{time}` or
 * `{tempo}` inside a song, so each mid-chart change is also a comment a
 * reader sees, on the line before it (spec 4.6, amended 2026-11-18).
 */
import type { PlayedBar } from "barmark";
import { pushAll } from "./lists.js";
import { directive, keyText } from "./meta.js";
import { plain, textChanged } from "./text.js";
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

/** A mid-chart change: a comment a reader sees (`Key: D`), then the directive itself. */
const shown = (name: string, title: string, value: string) => [
	directive("comment", `${title}: ${value}`),
	directive(name, value),
];

/** The key as `{key}`, a mode it cannot name being a loss. */
function keyLines(from: State, to: State, bar: PlayedBar, out: Out): string[] {
	const same = from.key?.tonic === to.key?.tonic && from.key?.mode === to.key?.mode;
	if (!to.key || same) return [];
	const text = keyText(to.key);
	if (text !== null) return shown("key", "Key", text);
	out.losses.add(
		"key-mode",
		`ChordPro's {key} cannot name the mode ${to.key.mode}, so it is left out`,
		bar,
	);
	return [];
}

/** A gradual change as it starts: `rit.`, `accel. to 140`. */
function gradualText(from: State, to: State): string | null {
	const a = from.tempoChange;
	const b = to.tempoChange;
	if (!b || (a?.kind === b.kind && a.to === b.to)) return null;
	return `${b.kind === "rit" ? "rit." : "accel."}${b.to === null ? "" : ` to ${b.to}`}`;
}

/** A gradual change ending: `a tempo` when the tempo goes back, nothing when a new tempo is written. */
const endText = (from: State, to: State) =>
	from.tempoChange && !to.tempoChange && from.tempo === to.tempo ? "a tempo" : null;

/** The feel, when it changes: swing, shuffle or swing 16 with any amount, or straight again. */
function feelText(from: State, to: State): string | null {
	if (from.feel === to.feel && from.swingPercent === to.swingPercent) return null;
	return to.swingPercent === undefined ? to.feel : `${to.feel} ${to.swingPercent}%`;
}

/**
 * The lines a bar needs written before it, given the bar played before
 * (none at the chart's start): key, time and tempo changes, each with its
 * comment; a rit., an accel., `a tempo` and a feel as comments. The grid
 * writer calls it as the lyric writer does, once per written line.
 */
export function changeLines(
	prev: PlayedBar | undefined,
	bar: PlayedBar,
	first: PlayedBar,
	out: Out,
): string[] {
	const from = prev ? stateOf(prev) : opening(first);
	const to = stateOf(bar);
	const lines = keyLines(from, to, bar, out);
	if (from.time !== to.time) pushAll(lines, shown("time", "Time", to.time));
	if (to.tempo !== null && from.tempo !== to.tempo)
		pushAll(lines, shown("tempo", "Tempo", String(to.tempo)));
	for (const text of [gradualText(from, to) ?? endText(from, to), feelText(from, to)])
		if (text !== null) lines.push(directive("comment", text));
	return lines;
}

/** A text line as `{comment: …}` (spec 4.6), its markup changed and reported. */
export function comment(text: string, bar: PlayedBar | undefined, out: Out): string {
	const written = plain(text);
	if (written !== text) textChanged(out.losses, bar);
	return directive("comment", written);
}
