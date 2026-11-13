import { type ChordRecord, parseChord, parseNoteSet } from "barmark";

/** The record a chord name or a brace note set reads as; throws, naming the text, when it does not read. */
export function chord(name: string): ChordRecord {
	const r = name.startsWith("{") ? parseNoteSet(name) : parseChord(name);
	if (!r.ok) throw new Error(`chord "${name}" does not read: ${r.error.message}`);
	return r.value;
}
