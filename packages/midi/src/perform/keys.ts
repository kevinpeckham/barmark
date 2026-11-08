/** Key signatures (spec 3.7): the count MIDI writes, and where the key changes. */
import type { Key, Mode } from "barmark";
import type { BarAt } from "./swing.js";
import type { MidiLoss, Performance } from "./types.js";

/** The letters and the modes along the circle of fifths, from F and from lydian (one fifth up from major). */
const LETTERS = "FCGDAEB";
const MODES_BY_FIFTHS: Mode[] = [
	"lydian",
	"major",
	"mixolydian",
	"dorian",
	"minor",
	"phrygian",
	"locrian",
];
/** Each mode's offset from its parent major; ionian is major and aeolian minor. */
const modeFifths = (mode: Mode) =>
	1 - MODES_BY_FIFTHS.indexOf(mode === "ionian" ? "major" : mode === "aeolian" ? "minor" : mode);
/** The modes MIDI's key signature can say: major, or minor with its flag. */
const KEPT = new Set<Mode>(["major", "ionian", "minor", "aeolian"]);

/**
 * Sharps (positive) or flats (negative) in a key's signature, as barmark
 * counts them; minor for `minor` and `aeolian`. Another mode is written
 * as its parent major's signature, and `modeLost` says so.
 */
export function keyFifths(key: Key): { fifths: number; minor: boolean; modeLost: boolean } {
	const alter = (key.tonic.match(/#/g)?.length ?? 0) - (key.tonic.match(/b/g)?.length ?? 0);
	return {
		fifths: LETTERS.indexOf(key.tonic[0] ?? "C") - 1 + 7 * alter + modeFifths(key.mode),
		minor: key.mode === "minor" || key.mode === "aeolian",
		modeLost: !KEPT.has(key.mode),
	};
}

const same = (a: Key | null, b: Key | null) => a?.tonic === b?.tonic && a?.mode === b?.mode;

/** A key at the first bar that has one and wherever it changes; one `mode` loss at the first lost mode. */
export function keysOf(bars: BarAt[]): { keys: Performance["keys"]; losses: MidiLoss[] } {
	const keys: Performance["keys"] = [];
	let last: Key | null = null;
	for (const { bar, at } of bars) {
		if (bar.key && !same(bar.key, last)) keys.push({ at, key: bar.key });
		last = bar.key ?? last;
	}
	const lost = bars.find(({ bar }) => bar.key && keyFifths(bar.key).modeLost);
	const losses: MidiLoss[] = lost?.bar.key
		? [
				{
					code: "mode",
					message: `${lost.bar.key.tonic} ${lost.bar.key.mode} is written as its parent major's signature: MIDI's key signature knows only major and minor`,
					bar: lost.bar.index,
				},
			]
		: [];
	return { keys, losses };
}
