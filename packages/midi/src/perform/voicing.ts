/** What a chord symbol or a note set sounds (spec 3.4, 3.5), as MIDI pitches. */
import type { ChordRecord } from "barmark";

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE = /^([A-G])(#{1,2}|b{1,2})?(\d)?$/;

/** A spelled note (`F#`, `Bb3`): its semitone above C, alterations included, and its octave if written. */
function readNote(name: string): { semitone: number; octave: number | null } {
	const m = NOTE.exec(name);
	const alter = m?.[2] ? (m[2].startsWith("#") ? 1 : -1) * m[2].length : 0;
	return {
		semitone: (STEPS[m?.[1] ?? "C"] ?? 0) + alter,
		octave: m?.[3] ? Number(m[3]) : null,
	};
}

const pitchClass = (name: string) => ((readNote(name).semitone % 12) + 12) % 12;
/** The pitch class at its lowest from `floor` (E2 is 40, C4 60, E1 28). */
const fromFloor = (name: string, floor: number) => floor + ((pitchClass(name) - floor + 120) % 12);

/**
 * A chord symbol's default voicing (spec 3.5): its bass in E2–D#3 under
 * each pitch class of its pitches once in C4–B4, so a slash bass is
 * doubled above; on a bass instrument the bass alone, in E1–D#2.
 */
export function chordVoicing(record: ChordRecord, bassInstrument: boolean): number[] {
	if (bassInstrument) return [fromFloor(record.bass, 28)];
	const upper = new Set(record.pitches.map((p) => fromFloor(p, 60)));
	return [fromFloor(record.bass, 40), ...[...upper].sort((a, b) => a - b)];
}

/**
 * A note set's or voicing's pitches, exactly: written octaves kept
 * (octave 4 holds middle C, 60); without them, from octave 4, each note
 * the next above the one before (spec 3.4).
 */
export function noteSetPitches(record: ChordRecord): number[] {
	const out: number[] = [];
	for (const name of record.pitches) {
		const { semitone, octave } = readNote(name);
		const prev = out.at(-1);
		if (octave !== null) out.push(12 * (octave + 1) + semitone);
		else if (prev === undefined) out.push(60 + semitone);
		else out.push(prev + 1 + ((semitone - prev - 1 + 120) % 12));
	}
	return out;
}
