import { intervalBetween } from "../chords/intervals.js";
import type { Interval } from "../chords/types.js";
import type { Key } from "./types.js";

const NOTE = /^[A-G](?:#*|b*)$/;

/**
 * A root's scale degree in a key: the interval above the tonic, measured
 * against the major scale for every key and mode, so in A minor C is b3 and
 * in A mixolydian G is b7. Null if either isn't a note.
 */
export function degreeOf(root: string, key: Key): Interval | null {
	if (!NOTE.test(root) || !NOTE.test(key.tonic)) return null;
	return intervalBetween(key.tonic, root);
}
