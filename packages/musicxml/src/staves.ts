/**
 * A keyboard bar on two staves (the notation design, section 5): each
 * note set split at middle C, the upper staff taking slashes and chord
 * symbols, and a staff with nothing to play resting.
 */
import type { MeasureEvents, SoundEvent } from "./events.js";
import { slotHarmonyXml } from "./harmony.js";
import { belowMiddleC, soundOf } from "./notes.js";
import { plus } from "./rhythm.js";

/** A rest in the event's place, with nothing written on it. */
const silence = (e: SoundEvent): SoundEvent => ({
	slot: { kind: "silence" },
	length: e.length,
	words: [],
	harmony: false,
	tie: { start: false, stop: false },
});

/** Whether an event writes anything besides its notes: words, a `?`, a chord symbol. */
const marked = (e: SoundEvent) =>
	e.words.length > 0 || e.slot.kind === "unknown" || (e.harmony && slotHarmonyXml(e.slot) !== "");

/** One event as each staff plays it: the upper keeps its marks, even as a rest. */
function split(e: SoundEvent): [SoundEvent, SoundEvent] {
	const sound = soundOf(e);
	if (sound.kind !== "notes") return [e, silence(e)];
	const low = sound.pitches.filter(belowMiddleC);
	const high = sound.pitches.filter((p) => !belowMiddleC(p));
	// The lower staff's share writes no marks: words, harmony and the pedal stay with the upper.
	const { pedal: _p, lyrics: _l, ...unmarked } = e;
	const lower =
		low.length > 0 ? { ...unmarked, words: [], harmony: false, notes: low } : silence(e);
	return sungOn({ ...e, notes: high }, lower);
}

/** The syllables go on the staff that sounds the note: the upper when it has one, else the lower. */
function sungOn(upper: SoundEvent, lower: SoundEvent): [SoundEvent, SoundEvent] {
	const { lyrics, ...rest } = upper;
	if (!lyrics || upper.notes?.length) return [upper, lower];
	return [rest, { ...lower, lyrics }];
}

/** A rest followed by rests that write nothing is one rest. */
function joinRests(events: SoundEvent[]): SoundEvent[] {
	const out: SoundEvent[] = [];
	for (const e of events) {
		const last = out[out.length - 1];
		const rests = last && soundOf(last).kind === "rest" && soundOf(e).kind === "rest";
		if (last && rests && !marked(e)) last.length = plus(last.length, e.length);
		else out.push({ ...e });
	}
	return out;
}

/** A keyboard bar's events, staff by staff. */
export function splitStaves(bar: MeasureEvents): { upper: SoundEvent[]; lower: SoundEvent[] } {
	const pairs = bar.events.map(split);
	return {
		upper: joinRests(pairs.map(([upper]) => upper)),
		lower: joinRests(pairs.map(([, lower]) => lower)),
	};
}
