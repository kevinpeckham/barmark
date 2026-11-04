/**
 * A part's instrument: the one its `instrument:` names (barmark's grammar
 * 7.3), or else one guessed from its name (the notation design, section
 * 4), matched on whole words in any case: a bass and a guitar have their
 * own clefs, a keyboard two staves, and each a playback sound. A `clef:`
 * fixes a one-staff part's clef over either.
 */
import {
	type ClefName,
	type InstrumentInfo,
	instrumentInfo,
	type Part,
	type WrittenInterval,
} from "barmark";
import type { Clef } from "./clefs.js";

export type Instrument = {
	/** A guessed instrument's kind; `listed` for one `instrument:` names. */
	kind: "bass" | "guitar" | "keyboard" | "listed";
	/** The playback instrument's name, and its General MIDI program (1–128). */
	sound: string;
	program: number;
	/** The instrument's clef (a keyboard's upper staff's); null for one chosen by bars. */
	clef: Clef | null;
	/** How far above where it sounds it is written, with a `<transpose>`. */
	written: WrittenInterval;
	staves: 1 | 2;
};

const SOUNDING: WrittenInterval = { diatonic: 0, chromatic: 0 };
const OCTAVE_UP: WrittenInterval = { diatonic: 7, chromatic: 12 };

const BASS: Instrument = {
	kind: "bass",
	sound: "Electric Bass",
	program: 34,
	clef: "F",
	written: OCTAVE_UP,
	staves: 1,
};
/** A guitar's treble 8vb clef carries its octave: its notes are written where they sound. */
const GUITAR: Instrument = {
	kind: "guitar",
	sound: "Electric Guitar",
	program: 28,
	clef: "G8vb",
	written: SOUNDING,
	staves: 1,
};
const KEYBOARD: Instrument = {
	kind: "keyboard",
	sound: "Piano",
	program: 1,
	clef: "G",
	written: SOUNDING,
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

const CLEFS: Record<ClefName, Clef> = { treble: "G", bass: "F", "treble 8vb": "G8vb", alto: "C" };

/** "Trumpet in Bb", "Electric bass": a listed name as a sound's name. */
const soundName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

const listed = (info: InstrumentInfo): Instrument => ({
	kind: "listed",
	sound: soundName(info.name),
	program: info.program,
	clef: CLEFS[info.clef],
	written: info.written,
	staves: info.staves,
});

/**
 * The part's instrument: the one `instrument:` names, or the one its name
 * suggests, or null. A `clef:` makes it one staff in that clef.
 */
export function instrumentOf(part: Part | null): Instrument | null {
	const info = part?.instrument ? instrumentInfo(part.instrument) : null;
	const instrument = info ? listed(info) : guessed(part);
	if (!part?.clef) return instrument;
	const clef = CLEFS[part.clef];
	return instrument
		? { ...instrument, clef, staves: 1 }
		: { kind: "listed", sound: "", program: 0, clef, written: SOUNDING, staves: 1 };
}

/** The instrument a part's name names, or null. */
function guessed(part: Part | null): Instrument | null {
	const words: string[] = (part?.name ?? "").toLowerCase().match(/[a-z]+/g) ?? [];
	if (words.includes("bass"))
		return words.every((w) => w === "bass" || BASS_WORDS.has(w)) ? BASS : null;
	if (words.includes("guitar")) return GUITAR;
	return words.some((w) => KEYBOARD_WORDS.has(w)) ? KEYBOARD : null;
}
