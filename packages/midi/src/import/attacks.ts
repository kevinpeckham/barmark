/**
 * The line test (spec 3): a file is one line of notes when, once short
 * notes are set aside and the rest grouped into attacks, few attacks
 * sound several pitches and few are struck under a ringing note.
 */
import type { Note } from "./notes.js";

/** A short note is shorter than a quarter over this (a 64th). */
const SHORT = 16;
/** An attack's window is a quarter over this (a 32nd). */
const WINDOW = 8;
/** An attack is struck under a note that rings longer than a quarter over this after it starts (a sixteenth). */
const STRUCK = 4;
/** The line test's two shares are at most one in this many attacks. */
const SHARE = 10;
/** More than one short note in this many pitched notes means none is left out. */
const TRIGGERS = 4;

/** One strike: its first note's start, its latest note-off, its pitches ascending, each once. */
export type Attack = { tick: number; end: number; pitches: number[] };

/** Notes shorter than a 64th are left out and counted (spec 4.1), unless they are more than a quarter of the notes. */
export function withoutShort(notes: Note[], ppq: number): { kept: Note[]; short: number } {
	const kept = notes.filter((n) => (n.end - n.start) * SHORT >= ppq);
	const short = notes.length - kept.length;
	return short * TRIGGERS > notes.length ? { kept: notes, short: 0 } : { kept, short };
}

/** The notes, by start, as attacks: a note starting less than a 32nd after an attack's first note joins it. */
export function attacksOf(notes: Note[], ppq: number): Attack[] {
	const attacks: Attack[] = [];
	for (const n of notes) {
		const last = attacks[attacks.length - 1];
		if (last !== undefined && (n.start - last.tick) * WINDOW < ppq) {
			if (!last.pitches.includes(n.pitch)) {
				last.pitches.push(n.pitch);
				last.pitches.sort((a, b) => a - b);
			}
			last.end = Math.max(last.end, n.end);
		} else attacks.push({ tick: n.start, end: n.end, pitches: [n.pitch] });
	}
	return attacks;
}

/** Whether at most one attack in ten has several pitches and at most one in ten is struck under a ringing note. No attacks is no line. */
export function isLine(attacks: Attack[], ppq: number): boolean {
	if (attacks.length === 0) return false;
	let several = 0;
	let under = 0;
	let ringing = Number.NEGATIVE_INFINITY;
	for (const a of attacks) {
		if (a.pitches.length >= 2) several++;
		if ((ringing - a.tick) * STRUCK > ppq) under++;
		ringing = Math.max(ringing, a.end);
	}
	return several * SHARE <= attacks.length && under * SHARE <= attacks.length;
}

/** The short notes set aside, the attacks and the test, in order; null when the notes are not one line. */
export function lineOf(
	pitched: Note[],
	ppq: number,
): { attacks: Attack[]; notes: Note[]; short: number } | null {
	const { kept, short } = withoutShort(pitched, ppq);
	const notes = [...kept].sort((a, b) => a.start - b.start);
	const attacks = attacksOf(notes, ppq);
	return isLine(attacks, ppq) ? { attacks, notes, short } : null;
}
