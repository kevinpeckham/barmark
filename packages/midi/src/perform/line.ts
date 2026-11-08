/** One line's played slots, in order, as notes: attacks and the holds that extend them. */
import type { SimpleSlot } from "barmark";
import { velocityOf } from "./figures.js";
import { add } from "./quarters.js";
import type { Takes } from "./tracks.js";
import type { PerformedNote, Quarters } from "./types.js";
import { chordVoicing, noteSetPitches } from "./voicing.js";

/** A simple slot at its absolute onset, with its length, in quarters. */
export type TimedSlot = { slot: SimpleSlot; at: Quarters; length: Quarters };

/** How a track sounds its line: as a bass instrument or not, and which of its slots (spec 3.3). */
export type Sounding = { bass: boolean; takes: Takes };

/**
 * The pitches a slot attacks; null when it sounds nothing (N.C., `--`,
 * `?`, or a slot the track doesn't take), undefined for a hold.
 */
function attack(slot: SimpleSlot, { bass, takes }: Sounding): number[] | null | undefined {
	if (slot.kind === "hold") return undefined;
	if (slot.kind !== "chord") return null;
	const notes = slot.chord.kind === "notes";
	if (takes === (notes ? "chords" : "notes")) return null;
	if (slot.voicing) return noteSetPitches(slot.voicing);
	if (notes) return noteSetPitches(slot.chord);
	return chordVoicing(slot.chord, bass);
}

/**
 * Every named slot attacks its pitches for its own length; a `/` extends
 * whatever sounds before it, across bar lines, and nothing after a slot
 * that sounds nothing (spec 3.4). An accent or a hit sets its notes'
 * velocity, which a `/` after it keeps (3.6). A track that takes only a
 * melodic line's note sets or only its chord symbols hears the others as
 * nothing, so a `/` after one holds nothing there (3.3).
 */
export function lineNotes(slots: TimedSlot[], how: Sounding): PerformedNote[] {
	const out: PerformedNote[] = [];
	let sounding: PerformedNote[] = [];
	for (const { slot, at, length } of slots) {
		const pitches = attack(slot, how);
		if (pitches === undefined) {
			for (const note of sounding) note.length = add(note.length, length);
			continue;
		}
		const velocity = velocityOf(slot.kind === "chord" ? slot.articulation : undefined);
		sounding = (pitches ?? []).map((pitch) => ({ pitch, at, length, velocity }));
		out.push(...sounding);
	}
	return out;
}
