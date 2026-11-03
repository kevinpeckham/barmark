/**
 * A measure's sounds as events: each simple slot (a group's members one by
 * one) with its length, its words, and what a push moved. Pushes are applied
 * over a part's whole list of measures, so one can take its time from the
 * bar before.
 */
import type { Articulation, Push, SimpleSlot, Slot } from "barmark";
import type { Measure } from "./measures.js";
import { type Frac, frac, memberLength, minus, slotLengths } from "./rhythm.js";

export type SoundEvent = {
	slot: SimpleSlot;
	length: Frac;
	/** Words written before this event. */
	words: string[];
	/** False when a push moved the slot's harmony to its early note. */
	harmony: boolean;
	articulation?: Articulation;
	tie: { start: boolean; stop: boolean };
};

export type MeasureEvents = { measure: Measure; events: SoundEvent[]; after: string[] };

const PUSH: Record<Push, Frac> = { eighth: frac(1, 2), sixteenth: frac(1, 4) };

const NO_TIE = { start: false, stop: false };

function simple(slot: SimpleSlot, length: Frac, words: string[]): SoundEvent {
	const articulation = slot.kind === "chord" ? slot.articulation : undefined;
	return {
		slot,
		length,
		words,
		harmony: true,
		...(articulation ? { articulation } : {}),
		tie: NO_TIE,
	};
}

/** A measure's events in order; a tacet measure has none. */
export function eventsOf(m: Measure): MeasureEvents {
	const wordsAt = (at: number) => m.words.filter((w) => w.at === at).map((w) => w.text);
	const lengths = m.tacet ? [] : slotLengths(m.slots, m.meter);
	const events = lengths.flatMap((len, i) => {
		const slot = m.slots[i] as Slot;
		if (slot.kind !== "group") return [simple(slot, len, wordsAt(i))];
		const each = memberLength(len, slot.members.length);
		return slot.members.map((s, j) => simple(s, each, j === 0 ? wordsAt(i) : []));
	});
	return { measure: m, events, after: m.tacet ? [] : wordsAt(m.slots.length) };
}

const pushOf = (slot: SimpleSlot) =>
	slot.kind === "hold" || slot.kind === "unknown" ? undefined : slot.push;
const longer = (a: Frac, b: Frac) => a.n * b.d > b.n * a.d;

type Place = { bar: number; index: number };

/**
 * Starts the pushed event at `at` early, taking the time from the event at
 * `giver`: an early note carries its harmony and articulation and ties into
 * it. Returns false, changing nothing, when the giver is too short to give.
 */
function push(out: MeasureEvents[], giver: Place, at: Place, by: Frac): boolean {
	const from = out[giver.bar]?.events[giver.index];
	const event = out[at.bar]?.events[at.index];
	if (!from || !event || !longer(from.length, by)) return false;
	const tied = event.slot.kind !== "silence";
	from.length = minus(from.length, by);
	out[at.bar]?.events.splice(at.index, 1, {
		slot: event.slot,
		length: event.length,
		words: event.words,
		harmony: false,
		tie: { start: false, stop: tied },
	});
	const early = { ...simple(event.slot, by, []), tie: { start: tied, stop: false } };
	out[giver.bar]?.events.splice(giver.index + 1, 0, early);
	return true;
}

/**
 * Play doesn't always reach `to` from `from`: a repeat, an ending or a jump
 * sits between them. A written bar sounds the same on every pass, so an
 * early note there would sound on the wrong pass.
 */
function crosses(from: Measure, to: Measure): boolean {
	const f = from.marks;
	const t = to.marks;
	const leaves = f.repeatEnd !== null || f.ending?.stop || f.end.length > 0;
	return Boolean(leaves || t.repeatStart || t.ending?.start || t.start.length > 0);
}

/** A push that can't be written early stays on the beat, and says so. */
function marked(event: SoundEvent): SoundEvent {
	return { ...event, words: [...event.words, "push"] };
}

/**
 * Each pushed slot starts early, taking its time from the event before it:
 * in its own bar, or the last of the bar before (grammar 2.8). The parser
 * reports a push with nothing before it, so a tacet bar is the only gap.
 */
export function applyPushes(bars: MeasureEvents[]): MeasureEvents[] {
	const out = bars.map((b) => ({ ...b, events: [...b.events] }));
	let prev = null as Place | null;
	for (let bar = 0; bar < out.length; bar++) {
		const events = (out[bar] as MeasureEvents).events;
		if (events.length === 0) prev = null;
		for (let index = 0; index < events.length; index++) {
			// The early note went in before this event when the giver is in this bar.
			if (prev && pushAt(out, prev, { bar, index }) && prev.bar === bar) index++;
			prev = { bar, index };
		}
	}
	return out;
}

/** Pushes the event at `at` if it is pushed and can be: true when an early note went in. */
function pushAt(out: MeasureEvents[], giver: Place, at: Place): boolean {
	const events = (out[at.bar] as MeasureEvents).events;
	const by = pushOf((events[at.index] as SoundEvent).slot);
	if (by === undefined) return false;
	const from = (out[giver.bar] as MeasureEvents).measure;
	if (giver.bar !== at.bar && crosses(from, (out[at.bar] as MeasureEvents).measure)) {
		events[at.index] = marked(events[at.index] as SoundEvent);
		return false;
	}
	return push(out, giver, at, PUSH[by]);
}
