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
	return beatsOf(m) === m.n ? { note: m.d, dotted: false } : { note: m.d / 2, dotted: true };
}

/**
 * The beat a tempo counts at each directive line, by line number: that of
 * the `time:` in force there, its own included (grammar 2.1). One-bar
 * meters set no `time:`, so they never change it (grammar 2.4).
 */
export function tempoBeats(lines: Line[]): Map<number, TempoBeat> {
	const beats = new Map<number, TempoBeat>();
	let time = COMMON_TIME;
	for (const l of lines) {
		if (l.kind !== "directive") continue;
		time = l.set.time ?? time;
		beats.set(l.line, tempoBeatOf(time));
	}
	return beats;
}
