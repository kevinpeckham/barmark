const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The letter's semitone plus its accidentals, and the octave if one is written. */
function read(note: string): { semitone: number; octave: number | null } | null {
	const m = /^([A-G])([#b♯♭]*)(\d+)?$/.exec(note.trim());
	if (!m) return null;
	let semitone = LETTERS[m[1] ?? ""] ?? 0;
	for (const a of m[2] ?? "") semitone += a === "#" || a === "♯" ? 1 : -1;
	return { semitone, octave: m[3] === undefined ? null : Number(m[3]) };
}

/** A note name's pitch class, 0 to 11 ("C" 0, "F#" 6, "Bb" 10, "Cb" 11, "E#" 5, double accidentals too); the octave, if any, is ignored. */
export function pitchClass(note: string): number {
	const r = read(note);
	return r ? ((r.semitone % 12) + 12) % 12 : 0;
}

/** A note with an octave as MIDI ("E2" 40, "C4" 60); null without an octave. */
export function midiOf(note: string): number | null {
	const r = read(note);
	if (!r || r.octave === null) return null;
	return (r.octave + 1) * 12 + r.semitone;
}

/** Whether the text is a note name, with or without an octave. */
export const isNote = (note: string): boolean => read(note) !== null;
