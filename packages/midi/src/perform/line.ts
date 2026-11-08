/** One line's played slots, in order, as notes: attacks and the holds that extend them. */
import type { SimpleSlot } from "barmark";
import { velocityOf } from "./figures.js";
import { add, cmp, ZERO } from "./quarters.js";
import type { PerformedNote, Quarters } from "./types.js";
import { chordVoicing, noteSetPitches } from "./voicing.js";

/** A simple slot at its absolute onset, with its length, in quarters. */
export type TimedSlot = { slot: SimpleSlot; at: Quarters; length: Quarters };

/** The pitches a slot attacks; null when it sounds nothing (N.C., `--`, `?`), undefined for a hold. */
function attack(slot: SimpleSlot, bassInstrument: boolean): number[] | null | undefined {
	if (slot.kind === "hold") return undefined;
	if (slot.kind !== "chord") return null;
	if (slot.voicing) return noteSetPitches(slot.voicing);
	if (slot.chord.kind === "notes") return noteSetPitches(slot.chord);
	return chordVoicing(slot.chord, bassInstrument);
}

/**
 * Every named slot attacks its pitches for its own length; a `/` extends
 * whatever sounds before it, across bar lines, and nothing after a slot
 * that sounds nothing (spec 3.4). An accent or a hit sets its notes'
 * velocity, which a `/` after it keeps (3.6). A note left with no length
 * (swing can do that, 3.6) isn't played.
 */
export function lineNotes(slots: TimedSlot[], bassInstrument = false): PerformedNote[] {
	const out: PerformedNote[] = [];
	let sounding: PerformedNote[] = [];
	for (const { slot, at, length } of slots) {
		const pitches = attack(slot, bassInstrument);
		if (pitches === undefined) {
			for (const note of sounding) note.length = add(note.length, length);
			continue;
		}
		const velocity = velocityOf(slot.kind === "chord" ? slot.articulation : undefined);
		sounding = (pitches ?? []).map((pitch) => ({ pitch, at, length, velocity }));
		out.push(...sounding);
	}
	return out.filter((note) => cmp(note.length, ZERO) > 0);
}
