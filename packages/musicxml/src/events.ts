/**
 * A measure's sounds as events: each simple slot (a group's members one by
 * one) with its length, its words, and what a push moved. Pushes are applied
 * over a part's whole list of measures, so one can take its time from the
 * bar before.
 */
import type { Articulation, Push, SimpleSlot, Slot } from "barmark";
import type { Measure } from "./measures.js";
import { noteSetOf, type Pitch, soundOf } from "./notes.js";
import {
	barLength,
	dyadic,
	type Frac,
	frac,
	memberLength,
	minus,
	plus,
	slotLengths,
} from "./rhythm.js";

export type SoundEvent = {
	slot: SimpleSlot;
	length: Frac;
	/** Words written before this event. */
	words: string[];
	/** False when a push moved the slot's harmony to its early note. */
	harmony: boolean;
	articulation?: Articulation;
	tie: { start: boolean; stop: boolean };
	/** What a hold sounds (grammar 2.3): the note set or silence it continues; absent when it holds a chord. */
	held?: SimpleSlot;
	/** A keyboard staff's share of the notes (`splitStaves`); none for a rest. */
	notes?: Pitch[];
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

/** Whether a push went in: an early note inserted, or not. */
type Pushed = "inserted" | null;

/**
 * Starts the pushed event at `at` early, taking the time from the event at
 * `giver`: an early note carries its harmony and articulation and ties into
 * it. A giver no longer than the push can't give (taking all of it would
 * drop its chord), and nothing changes.
 */
function push(out: MeasureEvents[], giver: Place, at: Place, by: Frac): Pushed {
	const from = out[giver.bar]?.events[giver.index];
	const event = out[at.bar]?.events[at.index];
	if (!from || !event || !longer(from.length, by)) return null;
	const tied = event.slot.kind !== "silence";
	out[at.bar]?.events.splice(at.index, 1, {
		slot: event.slot,
		length: event.length,
		words: event.words,
		harmony: false,
		tie: { start: false, stop: tied },
	});
	const early = { ...simple(event.slot, by, []), tie: { start: tied, stop: false } };
	from.length = minus(from.length, by);
	out[giver.bar]?.events.splice(giver.index + 1, 0, early);
	return "inserted";
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
 * in its own bar, or the last of the bar before, a tacet bar's rest
 * included (grammar 2.8, 7.4).
 */
export function applyPushes(bars: MeasureEvents[]): MeasureEvents[] {
	const out = bars.map((b) => ({ ...b, events: b.events.map((e) => ({ ...e })) }));
	let prev = null as Place | null;
	for (let bar = 0; bar < out.length; bar++) {
		const events = (out[bar] as MeasureEvents).events;
		// A tacet bar has no events: its rest gives, if a push needs it.
		if (events.length === 0) prev = { bar, index: TACET };
		for (let index = 0; index < events.length; index++) {
			// The early note went in before this event when the giver is in this bar.
			if (prev && pushAt(out, prev, { bar, index }) === "inserted" && prev.bar === bar) index++;
			prev = { bar, index };
		}
	}
	return out;
}

const TACET = -1;

/** A tacet bar's rest as an event, so a push can take its end. */
function restOf(bar: MeasureEvents): Place["index"] {
	bar.events = [simple({ kind: "silence" }, barLength(bar.measure.meter), [])];
	return 0;
}

/** Pushes the event at `at` if it is pushed; a push that can't be written early is marked. */
function pushAt(out: MeasureEvents[], giver: Place, at: Place): Pushed {
	const events = (out[at.bar] as MeasureEvents).events;
	const by = pushOf((events[at.index] as SoundEvent).slot);
	if (by === undefined) return null;
	const from = out[giver.bar] as MeasureEvents;
	const crossing =
		giver.bar !== at.bar && crosses(from.measure, (out[at.bar] as MeasureEvents).measure);
	const index = !crossing && giver.index === TACET ? restOf(from) : giver.index;
	const pushed = crossing ? null : push(out, { bar: giver.bar, index }, at, PUSH[by]);
	if (!pushed) events[at.index] = marked(events[at.index] as SoundEvent);
	return pushed;
}

/** The slot an event sounds: a hold sounds what it holds. */
const sounding = (e: SoundEvent): SimpleSlot => e.held ?? e.slot;

/** What a hold continues, if not a chord: a note set (tied on) or silence. */
function heldBy(before: SoundEvent): SimpleSlot | undefined {
	const slot = sounding(before);
	if (slot.kind === "silence") return slot;
	const set = noteSetOf(slot);
	return set ? { kind: "chord", chord: set } : undefined;
}

/**
 * A hold after `before` sounds what it continues. In the same bar it
 * lengthens `before` (unless words are written before it) and is dropped;
 * across a bar line a note set ties over.
 */
function hold(before: SoundEvent, e: SoundEvent, sameBar: boolean): "merged" | null {
	const held = e.slot.kind === "hold" ? heldBy(before) : undefined;
	if (!held) return null;
	if (sameBar && e.words.length === 0 && joins(before, e)) {
		before.length = plus(before.length, e.length);
		return "merged";
	}
	e.held = held;
	if (held.kind === "chord") tie(before, e);
	return null;
}

/**
 * Whether a hold can lengthen the sound before it into one value: not a
 * plain hold after a tuplet's value, which would carry the tuplet past its
 * beat. It ties on instead.
 */
const joins = (before: SoundEvent, e: SoundEvent) => dyadic(before.length) || !dyadic(e.length);

function tie(before: SoundEvent, e: SoundEvent): void {
	before.tie = { ...before.tie, start: true };
	e.tie = { ...e.tie, stop: true };
}

/** A chord's hold that opens a bar ties from the slash ending the bar before, if play goes straight on. */
function tieOver(previous: MeasureEvents | undefined, bar: MeasureEvents, e: SoundEvent): void {
	const last = previous?.events[previous.events.length - 1];
	if (!previous || !last || crosses(previous.measure, bar.measure)) return;
	if (soundOf(last).kind === "slash") tie(last, e);
}

/**
 * In a bar that shows its rhythm, a chord's holds lengthen the sound
 * before them, as a note set's do: the bar is written as it sounds. A hold
 * that opens the bar ties from the bar before; one after a tuplet's value
 * ties on; one with words before it stays a slash of its own.
 */
export function joinHolds(bars: MeasureEvents[], rhythmic: boolean[]): MeasureEvents[] {
	const out: MeasureEvents[] = [];
	for (const [i, bar] of bars.entries()) out.push(rhythmic[i] ? joinBar(bar, out[i - 1]) : bar);
	return out;
}

/** A plain chord's hold: one a rhythmic bar joins or ties (words before it keep it a slash of its own). */
const plainHold = (e: SoundEvent) => e.slot.kind === "hold" && !e.held && e.words.length === 0;

/** One rhythmic bar's holds, joined or tied; `previous` is the bar before as written. */
function joinBar(bar: MeasureEvents, previous: MeasureEvents | undefined): MeasureEvents {
	const events: SoundEvent[] = [];
	for (const e of bar.events) {
		const before = events[events.length - 1];
		if (!plainHold(e)) events.push(e);
		else if (!before) {
			tieOver(previous, bar, e);
			events.push(e);
		} else if (joins(before, e)) before.length = plus(before.length, e.length);
		else {
			tie(before, e);
			events.push(e);
		}
	}
	return { ...bar, events };
}

/**
 * Each hold sounds whatever was sounding before it (grammar 2.3), in
 * written order across bar lines: a note set's notes sound on, a silence
 * stays a rest, and a chord's hold stays a slash. A tacet bar ends it.
 */
export function applyHolds(bars: MeasureEvents[]): MeasureEvents[] {
	let before: SoundEvent | null = null;
	for (const bar of bars) {
		if (bar.events.length === 0) before = null;
		const kept: SoundEvent[] = [];
		for (const e of bar.events) {
			if (before && hold(before, e, kept.includes(before)) === "merged") continue;
			kept.push(e);
			before = e;
		}
		bar.events = kept;
	}
	return bars;
}
