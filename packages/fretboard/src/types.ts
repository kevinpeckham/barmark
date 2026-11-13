/** An instrument's open strings as MIDI notes, low to high. */
export type Tuning = { name: "guitar"; strings: readonly number[] };

/** Standard guitar tuning: E2 A2 D3 G3 B3 E4. */
export const GUITAR: Tuning = Object.freeze({
	name: "guitar",
	strings: Object.freeze([40, 45, 50, 55, 59, 64]),
});

/** A barre: one finger across strings `from` to `to` (indexes, low string 0) at `fret`. */
export type Barre = { fret: number; from: number; to: number };

/** A fingering. `frets`: absolute, low string first, -1 muted, 0 open. `base`: the first fret a diagram draws. */
export type Shape = { frets: number[]; base: number; barre?: Barre };
