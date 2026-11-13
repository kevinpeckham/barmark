import type { ChordRecord } from "barmark";
import { pitchClass } from "./pitch.js";
import { fingersNeeded, sounding } from "./shape.js";
import { GUITAR, type Shape, type Tuning } from "./types.js";

/** The tones a chord needs and may leave out (spec §4.1), as pitch classes. */
export type Want = {
	required: ReadonlySet<number>;
	optional: ReadonlySet<number>;
	bass: number;
	root: number;
	minStrings: 2 | 3;
	shell: boolean;
};

const has = (chord: ChordRecord, degree: number): boolean =>
	chord.intervals.some((i) => i.degree === degree);

/** The pitch classes of the chord's natural intervals at these degrees. */
function naturals(chord: ChordRecord, degrees: readonly number[]): number[] {
	const out: number[] = [];
	chord.intervals.forEach((iv, i) => {
		const pitch = chord.pitches[i];
		if (iv.alter === 0 && degrees.includes(iv.degree) && pitch !== undefined)
			out.push(pitchClass(pitch));
	});
	return out;
}

/** The tones that may be left out: the fifth in a chord of four or more tones, the ninth and eleventh under a thirteenth. */
function omittable(chord: ChordRecord): number[] {
	const degrees: number[] = [];
	if (chord.intervals.length >= 4) degrees.push(5);
	if (has(chord, 13)) degrees.push(9, 11);
	return chord.alteredOpen ? [] : naturals(chord, degrees);
}

/** A chord with no third, second or fourth: `5`, `5(7)`. */
const isPower = (chord: ChordRecord): boolean => ![2, 3, 4].some((d) => has(chord, d));

/** Null for a note set, or a record with no root. */
export function wantOf(chord: ChordRecord): Want | null {
	if (chord.kind !== "chord" || chord.root === null) return null;
	const root = pitchClass(chord.root);
	const bass = pitchClass(chord.bass);
	const all = new Set(chord.pitches.map(pitchClass));
	const optional = new Set(omittable(chord));
	const required = new Set([...all].filter((p) => !optional.has(p)));
	required.add(bass);
	for (const p of required) optional.delete(p);
	return {
		required,
		optional,
		bass,
		root,
		minStrings: isPower(chord) ? 2 : 3,
		shell: chord.alteredOpen,
	};
}

/** Whether a shape sounds a named chord: the bass lowest, every required tone, nothing outside the chord (spec §8). */
export function soundsChord(shape: Shape, chord: ChordRecord, tuning: Tuning = GUITAR): boolean {
	const want = wantOf(chord);
	const notes = sounding(shape, tuning);
	if (!want || notes.length === 0) return false;
	const classes = new Set(notes.map((n) => n % 12));
	if (Math.min(...notes) % 12 !== want.bass) return false;
	for (const p of want.required) if (!classes.has(p)) return false;
	for (const p of classes) if (!want.required.has(p) && !want.optional.has(p)) return false;
	return true;
}

/** Whether a shape is inside the hand's limits for a named chord: span, fingers, frets 0 to 15, no muted string inside, enough strings. */
export function withinLimits(shape: Shape, minStrings = 3): boolean {
	const frets = shape.frets;
	const played = frets.flatMap((f, i) => (f >= 0 ? [i] : []));
	const first = played[0];
	const last = played[played.length - 1];
	if (first === undefined || last === undefined || played.length < minStrings) return false;
	if (played.length !== last - first + 1) return false;
	if (frets.some((f) => f > 15)) return false;
	const fretted = frets.filter((f) => f > 0);
	if (fretted.length > 0 && Math.max(...fretted) - Math.min(...fretted) > 3) return false;
	return fingersNeeded(frets) <= 4;
}
