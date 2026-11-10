/**
 * The beat a `tempo:` counts, decided from the parse: the meter `time:` set,
 * never a one-bar meter's, so the HTML only draws the note it is given.
 */
import { beatsOf, type Line, type Meter } from "barmark";
import type { TempoBeat } from "./types.js";

/** The meter in force before any `time:` (barmark's grammar, the `time:` default). */
const COMMON_TIME: Meter = { n: 4, d: 4 };

/**
 * The beat of a meter (barmark's grammar 2.1), as barmark counts it: where
 * `beatsOf` counts fewer beats than the top number (6/8, 9/8, 12/8), each is
 * three of the bottom note, a dotted note of twice its length.
 */
export function tempoBeatOf(meter: Meter | undefined): TempoBeat {
	const m = meter ?? COMMON_TIME;
	// barmark admits a bottom number of 2, 4, 8 or 16 only (grammar, `time:`), and only 8 is compound.
	const note = (beatsOf(m) === m.n ? m.d : m.d / 2) as TempoBeat["note"];
	return { note, dotted: beatsOf(m) !== m.n };
}

/**
 * The beat a tempo counts at each directive line, by line number: that of
 * the `time:` in force at the next bar line, as the parser, MIDI and
 * MusicXML count the bar's meter (grammar 2.1), so a `time:` written on a
 * later line before that bar counts too. Directives after the last bar line
 * take the `time:` in force at the chart's end. One-bar meters set no
 * `time:`, so they never change it (grammar 2.4).
 */
export function tempoBeats(lines: Line[]): Map<number, TempoBeat> {
	const beats = new Map<number, TempoBeat>();
	let time = COMMON_TIME;
	let waiting: number[] = [];
	const settle = () => {
		for (const line of waiting) beats.set(line, tempoBeatOf(time));
		waiting = [];
	};
	for (const l of lines) {
		if (l.kind === "bars") settle();
		if (l.kind !== "directive") continue;
		time = l.set.time ?? time;
		waiting.push(l.line);
	}
	settle();
	return beats;
}
