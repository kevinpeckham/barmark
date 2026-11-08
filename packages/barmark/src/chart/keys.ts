import { noteSemitone, transpose } from "../chords/intervals.js";
import type { Interval } from "../chords/types.js";
import type { Key, Mode } from "./types.js";

export const MODES: Mode[] = [
	"major",
	"minor",
	"ionian",
	"dorian",
	"phrygian",
	"lydian",
	"mixolydian",
	"aeolian",
	"locrian",
];

export const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
/** A chart with no key spells each root from this table. */
const TABLE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
/** Each letter's place on the circle of fifths, and each mode's offset from its parent major. */
const FIFTHS: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
const MODE_FIFTHS: Record<Mode, number> = {
	lydian: 1,
	major: 0,
	ionian: 0,
	mixolydian: -1,
	dorian: -2,
	minor: -3,
	aeolian: -3,
	phrygian: -4,
	locrian: -5,
};

const mod = (n: number, m: number) => ((n % m) + m) % m;
export const alterOf = (note: string) => (note.includes("#") ? 1 : -1) * (note.length - 1);

/** Double sharps and flats are written as the plain note: Fx is G, Ebb is D. */
export function plain(note: string): string {
	if (!/##|bb/.test(note)) return note;
	return (note.includes("#") ? SHARPS : FLATS)[noteSemitone(note)] ?? note;
}

/** Sharps (positive) or flats (negative) in a key's signature. */
export const signature = (tonic: string, mode: Mode) =>
	(FIFTHS[tonic[0] ?? "C"] ?? 0) + 7 * alterOf(tonic) + MODE_FIFTHS[mode];

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
/** The major-scale degree each mode starts on (0 = ionian). */
const ROTATION: Record<Mode, number> = {
	major: 0,
	ionian: 0,
	dorian: 1,
	phrygian: 2,
	lydian: 3,
	mixolydian: 4,
	minor: 5,
	aeolian: 5,
	locrian: 6,
};
/** A mode's semitone offsets from its tonic, by scale degree. */
const scaleOf = (mode: Mode) => {
	const start = ROTATION[mode];
	const root = MAJOR_SCALE[start] ?? 0;
	return MAJOR_SCALE.map((_, i) => mod((MAJOR_SCALE[(start + i) % 7] ?? 0) - root, 12));
};

/** Whether a pitch class is one of the key's seven. */
export const inScale = (pitchClass: number, key: Key) =>
	scaleOf(key.mode).includes(mod(pitchClass - noteSemitone(key.tonic), 12));

/** Notes outside the mode: the major-scale map (bII, bIII, #IV, bVI, bVII). */
const OUTSIDE: Record<number, Interval> = {
	0: { degree: 1, alter: 0 },
	1: { degree: 2, alter: -1 },
	2: { degree: 2, alter: 0 },
	3: { degree: 3, alter: -1 },
	4: { degree: 3, alter: 0 },
	5: { degree: 4, alter: 0 },
	6: { degree: 4, alter: 1 },
	7: { degree: 5, alter: 0 },
	8: { degree: 6, alter: -1 },
	9: { degree: 6, alter: 0 },
	10: { degree: 7, alter: -1 },
	11: { degree: 7, alter: 0 },
};

/** A pitch class spelled in a key (or, with no key, from transposeChart's table). */
export function spellPitch(pitchClass: number, key: Key | null): string {
	const pc = mod(pitchClass, 12);
	if (!key) return TABLE[pc] ?? "C";
	const s = mod(pc - noteSemitone(key.tonic), 12);
	const degree = scaleOf(key.mode).indexOf(s);
	const interval =
		degree >= 0
			? { degree: degree + 1, alter: s - (MAJOR_SCALE[degree] ?? 0) }
			: (OUTSIDE[s] ?? { degree: 1, alter: 0 });
	return plain(transpose(key.tonic, interval));
}

/** The same key spelled with the fewest accidentals; a tie keeps the spelling given. */
export function conventionalKey(key: Key): Key {
	const pc = noteSemitone(key.tonic);
	let best = key.tonic;
	for (const t of [SHARPS[pc], FLATS[pc]])
		if (t && Math.abs(signature(t, key.mode)) < Math.abs(signature(best, key.mode))) best = t;
	return { tonic: best, mode: key.mode };
}

/** A key as `key:` writes it: `D`, `F#m`, `A mixolydian`. */
export function printKey(k: Key): string {
	if (k.mode === "major") return k.tonic;
	if (k.mode === "minor") return `${k.tonic}m`;
	return `${k.tonic} ${k.mode}`;
}

const WORDS = /^(?:maj|min|major|minor|ionian|dorian|phrygian|lydian|mixolydian|aeolian|locrian)$/i;
const WORD_MODE: Record<string, Mode> = { maj: "major", min: "minor" };

/** A key as people and detectors write it: `F♯ minor`, `Bb Maj`, `C#m`, `A Mixolydian`; null otherwise. */
export function keyFromText(text: string): Key | null {
	const m = /^([A-Ga-g])([#b♯♭]?)(m|\s*[A-Za-z]{3,})?$/.exec(text.trim().replace(/\s+/g, " "));
	if (!m?.[1]) return null;
	const tonic = `${m[1].toUpperCase()}${(m[2] ?? "").replace("♯", "#").replace("♭", "b")}`;
	if (m[3] === undefined) return { tonic, mode: "major" };
	if (m[3] === "m") return { tonic, mode: "minor" };
	const word = m[3].trim().toLowerCase();
	if (!WORDS.test(word)) return null;
	return { tonic, mode: WORD_MODE[word] ?? (word as Mode) };
}
