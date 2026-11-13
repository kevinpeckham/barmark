import type { ChordRecord } from "barmark";
import { exactShapes, orderedShapes } from "./exact.js";
import { findShapes } from "./finder.js";
import { tableShape } from "./lookup.js";
import { isNote, midiOf, pitchClass } from "./pitch.js";
import { shapeText } from "./shape.js";
import { wantOf } from "./sounds.js";
import { GUITAR, type Shape } from "./types.js";

/** What `shapeFor` answers: a shape (`caveat` says how it stands for the written chord) or why there is none. */
export type ShapeResult =
	| { ok: true; shape: Shape; caveat: "shell" | "voicing-replaced" | null }
	| { ok: false; reason: "single-note" | "not-playable" };

const notPlayable = (): ShapeResult => ({ ok: false, reason: "not-playable" });

/** The first shape the table, else the finder, holds for a named chord. */
function firstFor(chord: ChordRecord): Shape | undefined {
	const want = wantOf(chord);
	return want ? (tableShape(chord) ?? findShapes(want, 1)[0]) : undefined;
}

/** A note set's notes placed exactly (every note has an octave) or in written order (none has). */
function placed(set: ChordRecord): ShapeResult {
	const notes = set.pitches;
	if (notes.length > GUITAR.strings.length || !notes.every(isNote)) return notPlayable();
	if (notes.length === 1) return { ok: false, reason: "single-note" };
	const midi = notes.map(midiOf);
	const found = midi.every((m) => m === null)
		? orderedShapes(notes.map(pitchClass))
		: midi.includes(null)
			? []
			: exactShapes(midi as number[]);
	const shape = found[0];
	return shape ? { ok: true, shape, caveat: null } : notPlayable();
}

/** The part of `shapeFor` that may throw on a record that is not well formed. */
function pick(slot: ChordRecord, voicing: ChordRecord | undefined): ShapeResult {
	if (slot.kind === "notes") return placed(slot);
	let result = notPlayable();
	try {
		if (voicing?.kind === "notes") result = placed(voicing);
	} catch {}
	if (result.ok) return result;
	const shape = firstFor(slot);
	if (!shape) return notPlayable();
	return {
		ok: true,
		shape,
		caveat: voicing ? "voicing-replaced" : slot.alteredOpen ? "shell" : null,
	};
}

/** The shape a diagram shows for a slot: a chord name, a note set, or a name with a written voicing (spec §4). Never throws. */
export function shapeFor(slot: ChordRecord, voicing?: ChordRecord): ShapeResult {
	try {
		return pick(slot, voicing);
	} catch {
		return notPlayable();
	}
}

/** Ranked alternatives for a named chord: the table's, then the finder's, without repeats. [] for a note set. */
export function shapesFor(slot: ChordRecord): Shape[] {
	try {
		const want = wantOf(slot);
		const all = want ? [tableShape(slot), ...findShapes(want, 10)] : [];
		return [...new Map(all.flatMap((s) => (s ? [[shapeText(s), s] as const] : []))).values()];
	} catch {
		return [];
	}
}
