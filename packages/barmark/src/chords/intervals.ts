import type { Interval } from "./types.js";

const LETTERS = "CDEFGAB";
/** Semitones above the root for each step's major or perfect interval. */
const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

const mod = (n: number, m: number) => ((n % m) + m) % m;
const accidentals = (alter: number) => (alter < 0 ? "b".repeat(-alter) : "#".repeat(alter));

export function parseInterval(s: string): Interval | null {
	const m = /^(b*|#*)([1-9]|1[0-3])$/.exec(s);
	if (!m) return null;
	const acc = m[1] ?? "";
	return { degree: Number(m[2]), alter: acc.startsWith("#") ? acc.length : -acc.length };
}

export function formatInterval(i: Interval): string {
	return `${accidentals(i.alter)}${i.degree}`;
}

/** A spelled note's letter index (C = 0) and its alteration, or null. */
function readNote(note: string): { step: number; alter: number } | null {
	const m = /^([A-G])(b*|#*)$/.exec(note);
	if (!m) return null;
	const acc = m[2] ?? "";
	return {
		step: LETTERS.indexOf(m[1] ?? ""),
		alter: acc.startsWith("#") ? acc.length : -acc.length,
	};
}

/** Semitones above C (0–11) of a spelled note. */
export function noteSemitone(note: string): number {
	const n = readNote(note);
	if (!n) throw new Error(`not a note: ${note}`);
	return mod((LETTER_SEMITONES[n.step] ?? 0) + n.alter, 12);
}

/** The note `i` above `root`, spelled on the letter the degree names. */
export function transpose(root: string, i: Interval): string {
	const r = readNote(root);
	if (!r) throw new Error(`not a note: ${root}`);
	const step = (i.degree - 1) % 7;
	const letter = mod(r.step + step, 7);
	const target = noteSemitone(root) + (STEP_SEMITONES[step] ?? 0) + i.alter;
	const alter = mod(target - (LETTER_SEMITONES[letter] ?? 0) + 6, 12) - 6;
	return `${LETTERS[letter]}${accidentals(alter)}`;
}

/** The spelled pitch class an interval names: 2 and 9 share a key, b3 and #9 do not. */
export function intervalKey(i: Interval): string {
	const step = (i.degree - 1) % 7;
	return `${step}:${mod((STEP_SEMITONES[step] ?? 0) + i.alter, 12)}`;
}

/** The simple interval (degree 1–7) from one spelled note up to another. */
export function intervalBetween(from: string, to: string): Interval {
	const a = readNote(from);
	const b = readNote(to);
	if (!a || !b) throw new Error(`not notes: ${from}, ${to}`);
	const step = mod(b.step - a.step, 7);
	const semis = mod(noteSemitone(to) - noteSemitone(from), 12);
	return { degree: step + 1, alter: mod(semis - (STEP_SEMITONES[step] ?? 0) + 6, 12) - 6 };
}
