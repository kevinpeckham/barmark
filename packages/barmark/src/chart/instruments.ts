/**
 * The instruments a part may name (grammar 7.3): a closed list, each with
 * what a converter needs to notate it. A chart is always at concert pitch;
 * `written` only says how far above it a converter writes the part.
 */
export type ClefName = "treble" | "bass" | "treble 8vb" | "alto";
export const CLEF_NAMES: readonly ClefName[] = ["treble", "bass", "treble 8vb", "alto"];

export type InstrumentName =
	| "piano"
	| "electric piano"
	| "organ"
	| "synth"
	| "acoustic guitar"
	| "electric guitar"
	| "electric bass"
	| "double bass"
	| "trumpet in Bb"
	| "alto sax"
	| "tenor sax"
	| "trombone"
	| "flute"
	| "violin"
	| "cello"
	| "voice";

/** How far above sounding pitch a part is written, in scale steps and semitones. */
export type WrittenInterval = { diatonic: number; chromatic: number };

export type InstrumentInfo = {
	name: InstrumentName;
	/** The clef of its (upper) staff; a two-staff instrument's lower staff is bass. */
	clef: ClefName;
	staves: 1 | 2;
	written: WrittenInterval;
	/** Its General MIDI program, 1–128. */
	program: number;
};

const SOUNDING: WrittenInterval = { diatonic: 0, chromatic: 0 };
const OCTAVE_UP: WrittenInterval = { diatonic: 7, chromatic: 12 };
const row = (
	name: InstrumentName,
	clef: ClefName,
	staves: 1 | 2,
	program: number,
	written = SOUNDING,
): InstrumentInfo => ({ name, clef, staves, written, program });

export const INSTRUMENTS: readonly InstrumentInfo[] = [
	row("piano", "treble", 2, 1),
	row("electric piano", "treble", 2, 5),
	row("organ", "treble", 2, 17),
	row("synth", "treble", 2, 81),
	// A guitar's treble 8vb clef carries its octave: written where it sounds.
	row("acoustic guitar", "treble 8vb", 1, 26),
	row("electric guitar", "treble 8vb", 1, 28),
	row("electric bass", "bass", 1, 34, OCTAVE_UP),
	row("double bass", "bass", 1, 33, OCTAVE_UP),
	row("trumpet in Bb", "treble", 1, 57, { diatonic: 1, chromatic: 2 }),
	row("alto sax", "treble", 1, 66, { diatonic: 5, chromatic: 9 }),
	row("tenor sax", "treble", 1, 67, { diatonic: 8, chromatic: 14 }),
	row("trombone", "bass", 1, 58),
	row("flute", "treble", 1, 74),
	row("violin", "treble", 1, 41),
	row("cello", "bass", 1, 43),
	row("voice", "treble", 1, 53),
];

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The listed instrument with this name, in any case; null when there is none. */
export function instrumentInfo(name: string): InstrumentInfo | null {
	return INSTRUMENTS.find((i) => key(i.name) === key(name)) ?? null;
}

/** Levenshtein distance, for near names. */
function distance(a: string, b: string): number {
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const next = [i];
		for (let j = 1; j <= b.length; j++)
			next[j] = Math.min(
				(prev[j] ?? 0) + 1,
				(next[j - 1] ?? 0) + 1,
				(prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		prev = next;
	}
	return prev[b.length] ?? 0;
}

/** The listed names an unknown one is near: those holding all its words, or else within two edits. */
export function nearInstruments(name: string): InstrumentName[] {
	const words = key(name).split(" ");
	const holding = INSTRUMENTS.filter((i) => words.every((w) => key(i.name).split(" ").includes(w)));
	const near = holding.length
		? holding
		: INSTRUMENTS.filter((i) => distance(key(i.name), key(name)) <= 2);
	return near.map((i) => i.name);
}
