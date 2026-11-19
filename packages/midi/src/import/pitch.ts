/**
 * A line's pitches named for the chart (spec 4.3): the spelling of the
 * key in force, then the octave of the letter, so MIDI 59 spelled C-flat
 * is `Cb4` (grammar 4.1). A pitch below C0 or above B8 has no name.
 */
import { type Key, spellPitch } from "barmark";
import type { Attack } from "./attacks.js";
import type { KeyAt } from "./directives.js";
import { spelledKeys } from "./segments.js";

/** A pitch class's spelling in a key, with the octave of its letter; null when that octave is outside 0–8. */
function spelled(midi: number, key: Key | null): string | null {
	const letter = spellPitch(((midi % 12) + 12) % 12, key);
	const alter = letter.endsWith("#") ? 1 : letter.endsWith("b") ? -1 : 0;
	const octave = Math.floor((midi - alter) / 12) - 1;
	return octave < 0 || octave > 8 ? null : `${letter}${octave}`;
}

/**
 * A pitch's name in a key (null: the chord reading's spelling with no
 * key). At the range's two edges a key may spell a pitch that can be
 * written out of range (B8 as C-flat 9, C0 as B-sharp below it): it then
 * takes its plain name. Null for a pitch nothing can name.
 */
export function pitchName(midi: number, key: Key | null): string | null {
	return spelled(midi, key) ?? (key === null ? null : spelled(midi, null));
}

/** An attack with its pitches' names, `names[i]` for `pitches[i]`. */
export type Named = Attack & { names: string[] };

/**
 * Each attack's pitches named for the key in force at its tick: the last
 * of `keys` at or before it, the first from the start (as the chord
 * reading has it, and the chart's `key:`); no keys: no key. `attacks` are
 * by tick. A pitch with no name is left out and counted; an attack left
 * with no pitch is left out.
 */
export function named(attacks: Attack[], keys: KeyAt[]): { attacks: Named[]; outOfRange: number } {
	const inForce = spelledKeys(keys);
	const out: Named[] = [];
	let outOfRange = 0;
	let k = 0;
	for (const attack of attacks) {
		while ((keys[k + 1]?.tick ?? Number.POSITIVE_INFINITY) <= attack.tick) k++;
		const key = inForce[k] ?? null;
		const pitches: number[] = [];
		const names: string[] = [];
		for (const pitch of attack.pitches) {
			const name = pitchName(pitch, key);
			if (name === null) outOfRange++;
			else {
				pitches.push(pitch);
				names.push(name);
			}
		}
		if (pitches.length > 0) out.push({ ...attack, pitches, names });
	}
	return { attacks: out, outOfRange };
}
