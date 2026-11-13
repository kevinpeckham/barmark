import type { ChordRecord } from "barmark";
import { exactShapes, orderedShapes } from "./exact.js";
import { findShapes } from "./finder.js";
import { tableShape } from "./lookup.js";
import { isNote, midiOf, pitchClass } from "./pitch.js";
import { shapeText } from "./shape.js";
import { wantOf } from "./sounds.js";
import { GUITAR, type Shape, type Tuning } from "./types.js";

/** What `shapeFor` answers: a shape (`notes` says how it stands for the written chord) or why there is none. */
export type ShapeResult =
	| { ok: true; shape: Shape; notes: "shell" | "voicing-replaced" | null }
	| { ok: false; reason: "single-note" | "not-playable" };

const NOT_PLAYABLE: ShapeResult = { ok: false, reason: "not-playable" };
const same = (t: Tuning): boolean => t.strings.join() === GUITAR.strings.join();

/** The shapes the table and the finder hold for a named chord, best first; only standard tuning has them. */
function named(chord: ChordRecord, tuning: Tuning, limit: number): Shape[] {
	const want = wantOf(chord);
	if (!want || !same(tuning)) return [];
	return [tableShape(chord), ...findShapes(want, limit)].filter((s): s is Shape => s !== null);
}

/** A note set's notes placed exactly (every note has an octave) or in written order (none has). */
function placed(set: ChordRecord, tuning: Tuning): ShapeResult {
	const notes = set.pitches;
	if (!notes.every(isNote)) return NOT_PLAYABLE;
	if (notes.length === 1) return { ok: false, reason: "single-note" };
	const midi = notes.map(midiOf);
	const found = midi.every((m) => m === null)
		? orderedShapes(notes.map(pitchClass), tuning)
		: midi.includes(null)
			? []
			: exactShapes(midi as number[], tuning);
	const shape = found[0];
	return shape ? { ok: true, shape, notes: null } : NOT_PLAYABLE;
}

/** The part of `shapeFor` that may throw on a record that is not well formed. */
function pick(slot: ChordRecord, voicing: ChordRecord | undefined, tuning: Tuning): ShapeResult {
	if (slot.kind === "notes") return placed(slot, tuning);
	let result = NOT_PLAYABLE;
	try {
		if (voicing?.kind === "notes") result = placed(voicing, tuning);
	} catch {}
	if (result.ok) return result;
	const shape = named(slot, tuning, 1)[0];
	if (!shape) return NOT_PLAYABLE;
	return {
		ok: true,
		shape,
		notes: voicing ? "voicing-replaced" : slot.alteredOpen ? "shell" : null,
	};
}

/** The shape a diagram shows for a slot: a chord name, a note set, or a name with a written voicing (spec §4). Never throws. */
export function shapeFor(
	slot: ChordRecord,
	voicing?: ChordRecord,
	tuning: Tuning = GUITAR,
): ShapeResult {
	try {
		return pick(slot, voicing, tuning);
	} catch {
		return NOT_PLAYABLE;
	}
}

/** Ranked alternatives for a named chord: the table's, then the finder's, without repeats. [] for a note set. */
export function shapesFor(slot: ChordRecord, tuning: Tuning = GUITAR): Shape[] {
	try {
		return [...new Map(named(slot, tuning, 10).map((s) => [shapeText(s), s])).values()];
	} catch {
		return [];
	}
}
