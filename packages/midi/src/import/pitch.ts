/**
 * A line's pitches named for the chart (spec 4.3): the spelling of the
 * key in force, then the octave of the letter, so MIDI 59 spelled C-flat
 * is `Cb4` (grammar 4.1). A pitch below C0 or above B8 has no name.
 */
import { type Key, spellPitch } from "barmark";
import type { Attack } from "./attacks.js";
import type { KeyAt } from "./directives.js";
import { spelledKeys } from "./segments.js";

/** A pitch's name in a key (null: the chord reading's spelling with no key), or null out of range. */
export function pitchName(midi: number, key: Key | null): string | null {
	const letter = spellPitch(((midi % 12) + 12) % 12, key);
	const alter = letter.endsWith("#") ? 1 : letter.endsWith("b") ? -1 : 0;
	const octave = Math.floor((midi - alter) / 12) - 1;
	return octave < 0 || octave > 8 ? null : `${letter}${octave}`;
}

/** An attack with its pitches' names, `names[i]` for `pitches[i]`. */
export type Named = Attack & { names: string[] };

/**
 * Each attack's pitches named for the key in force at its tick (the last
 * of `keys` at or before it; none: no key). A pitch with no name is left
 * out and counted; an attack left with no pitch is left out.
 */
export function named(attacks: Attack[], keys: KeyAt[]): { attacks: Named[]; outOfRange: number } {
	const spelled = spelledKeys(keys);
	const out: Named[] = [];
	let outOfRange = 0;
	for (const attack of attacks) {
		let k = -1;
		while ((keys[k + 1]?.tick ?? Number.POSITIVE_INFINITY) <= attack.tick) k++;
		const key = spelled[k] ?? null;
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
