/**
 * Instruments from the part's name (the notation design, section 4),
 * matched on whole words in any case: a bass and a guitar have their own
 * clefs, a keyboard two staves, and each a playback sound.
 */
import type { Part } from "barmark";
import type { Clef } from "./clefs.js";

export type Instrument = {
	kind: "bass" | "guitar" | "keyboard";
	/** The playback instrument's name, and its General MIDI program (1–128). */
	sound: string;
	program: number;
	/** The instrument's clef; null for one chosen by bars. */
	clef: Clef | null;
	/** Written an octave above where it sounds, with a `<transpose>`. */
	octaveUp: boolean;
	staves: 1 | 2;
};

const BASS: Instrument = {
	kind: "bass",
	sound: "Electric Bass",
	program: 34,
	clef: "F",
	octaveUp: true,
	staves: 1,
};
/** A guitar's treble 8vb clef carries its octave: its notes are written where they sound. */
const GUITAR: Instrument = {
	kind: "guitar",
	sound: "Electric Guitar",
	program: 28,
	clef: "G8vb",
	octaveUp: false,
	staves: 1,
};
const KEYBOARD: Instrument = {
	kind: "keyboard",
	sound: "Piano",
	program: 1,
	clef: null,
	octaveUp: false,
	staves: 2,
};

/** The words a bass guitar goes by besides "bass". */
const BASS_WORDS = new Set(["guitar", "electric", "upright", "acoustic", "double", "fretless"]);
const KEYBOARD_WORDS = new Set([
	"piano",
	"keys",
	"keyboard",
	"keyboards",
	"organ",
	"rhodes",
	"wurlitzer",
	"synth",
]);

/** The instrument a part's name names, or null. */
export function instrumentOf(part: Part | null): Instrument | null {
	const words: string[] = (part?.name ?? "").toLowerCase().match(/[a-z]+/g) ?? [];
	if (words.includes("bass"))
		return words.every((w) => w === "bass" || BASS_WORDS.has(w)) ? BASS : null;
	if (words.includes("guitar")) return GUITAR;
	return words.some((w) => KEYBOARD_WORDS.has(w)) ? KEYBOARD : null;
}
