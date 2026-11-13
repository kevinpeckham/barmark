import { type ChordRecord, parseChord } from "barmark";
import { type Want, wantOf } from "../../src/sounds.js";
import { chord } from "./chord.js";

export { chord };

/** The spec's §2.2 families and the forms in each; slash forms are written on `R` and spelled per root. */
export const FORMS: Record<string, string[]> = {
	triads: ["", "m", "dim", "aug", "sus2", "sus4"],
	power: ["5", "5(7)"],
	sixths: ["6", "m6", "6/9", "m6/9"],
	sevenths: ["7", "maj7", "m7", "mmaj7", "dim7", "m7(b5)", "aug7", "augmaj7", "7sus4", "7sus2"],
	extensions: [
		"9",
		"maj9",
		"m9",
		"11",
		"m11",
		"13",
		"maj13",
		"m13",
		"9sus4",
		"13sus4",
		"mmaj9",
		"(9)",
		"m(9)",
		"(11)",
	],
	alterations: [
		"7(b9)",
		"7(#9)",
		"7(#11)",
		"7(b13)",
		"7(b5)",
		"7(#5)",
		"7alt",
		"9(#11)",
		"13(b9)",
		"7(b9,#11)",
		"maj7(#11)",
	],
};

/** The slash forms: the chord that is written, the chord its bass is read from, and which of that chord's pitches. */
const SLASH: { chord: string; from: string; pitch: number }[] = [
	{ chord: "", from: "", pitch: 1 },
	{ chord: "", from: "", pitch: 2 },
	{ chord: "m", from: "m", pitch: 1 },
	{ chord: "m", from: "m", pitch: 2 },
	{ chord: "", from: "7", pitch: 3 },
	{ chord: "7", from: "7", pitch: 1 },
	{ chord: "m7", from: "m7", pitch: 3 },
	{ chord: "", from: "(9)", pitch: 3 },
];

/** The twelve roots, flats but F#. */
export const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function read(name: string): ChordRecord | null {
	const r = parseChord(name);
	return r.ok ? r.value : null;
}

/** The chord a slash form makes on a root, or null when it does not read. */
function slashOn(
	root: string,
	s: (typeof SLASH)[number],
): { name: string; chord: ChordRecord } | null {
	const bass = read(`${root}${s.from}`)?.pitches[s.pitch];
	if (!bass) return null;
	const name = `${root}${s.chord}/${bass}`;
	const c = read(name);
	return c ? { name, chord: c } : null;
}

/** Every form on every root that `parseChord` reads, slash basses spelled from the chord's own pitches. */
export function vocabulary(): { name: string; family: string; chord: ChordRecord }[] {
	const out: { name: string; family: string; chord: ChordRecord }[] = [];
	for (const root of ROOTS) {
		const plain = Object.entries(FORMS).flatMap(([family, forms]) =>
			forms.map((form) => ({ family, name: `${root}${form}` })),
		);
		for (const { family, name } of plain) {
			const c = read(name);
			if (c) out.push({ name, family, chord: c });
		}
		for (const s of SLASH) {
			const found = slashOn(root, s);
			if (found) out.push({ ...found, family: "slash" });
		}
	}
	return out;
}

/** The wanted tones of a named chord; throws, naming it, when it has none. */
export function wantNamed(name: string): Want {
	const want = wantOf(chord(name));
	if (!want) throw new Error(`chord "${name}" has no wanted tones`);
	return want;
}
