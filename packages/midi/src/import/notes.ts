/**
 * Notes from a file's events (spec 5.2): a note-on and the next note-off
 * of its pitch on its track and channel. A second note-on of a sounding
 * pitch ends the first there (a re-strike); a note still sounding at the
 * end of its track ends at the track's last event; zero-length notes are
 * dropped. Controller 64 at 64 or more holds a released note on its
 * channel until the pedal lifts or the pitch is struck again. Events are
 * taken in file order, one pass a track, except that at one tick a
 * note-off comes before a re-strike of its pitch.
 */
import type { Smf, SmfEvent } from "../smf/types.js";
import type { Report } from "./report.js";

/** A note, in ticks; `track` is the 1-based track chunk. */
export type Note = { track: number; channel: number; pitch: number; start: number; end: number };

/** The most notes import reads (spec 5.1). */
const MAX_NOTES = 500_000;

const SUSTAIN = 64;

/** One track's notes so far: per channel, the start of each pitch sounding, and of each held by the pedal. */
type Pairing = {
	track: number;
	out: Note[];
	sounding: Map<number, number>[];
	held: Map<number, number>[];
	pedal: boolean[];
};

const channels = () => Array.from({ length: 16 }, () => new Map<number, number>());

function end(p: Pairing, channel: number, pitch: number, start: number, tick: number) {
	if (tick > start) p.out.push({ track: p.track, channel, pitch, start, end: tick });
}

/** Ends what still sounds of `pitch` (struck again, or at the end), from both maps. */
function endPitch(p: Pairing, channel: number, pitch: number, tick: number) {
	for (const map of [p.sounding[channel], p.held[channel]]) {
		const start = map?.get(pitch);
		if (start === undefined) continue;
		end(p, channel, pitch, start, tick);
		map?.delete(pitch);
	}
}

function release(p: Pairing, channel: number, pitch: number, tick: number) {
	const start = p.sounding[channel]?.get(pitch);
	if (start === undefined) return;
	p.sounding[channel]?.delete(pitch);
	if (p.pedal[channel]) p.held[channel]?.set(pitch, start);
	else end(p, channel, pitch, start, tick);
}

function sustain(p: Pairing, channel: number, down: boolean, tick: number) {
	p.pedal[channel] = down;
	if (down) return;
	const held = p.held[channel];
	for (const [pitch, start] of held ?? []) end(p, channel, pitch, start, tick);
	held?.clear();
}

function step(p: Pairing, e: SmfEvent) {
	if (e.kind === "on") {
		endPitch(p, e.channel, e.pitch, e.tick);
		p.sounding[e.channel]?.set(e.pitch, e.tick);
	} else if (e.kind === "off") release(p, e.channel, e.pitch, e.tick);
	else if (e.kind === "control" && e.control === SUSTAIN)
		sustain(p, e.channel, e.value >= 64, e.tick);
}

const keyOf = (e: { channel: number; pitch: number }) => e.channel * 128 + e.pitch;

/** Whether `pitch` sounds, or is held by the pedal, on its channel. */
const isSounding = (p: Pairing, e: { channel: number; pitch: number }) =>
	(p.sounding[e.channel]?.has(e.pitch) ?? false) || (p.held[e.channel]?.has(e.pitch) ?? false);

/**
 * One tick's events in order, except that a re-strike
 * (a note-on of a pitch still sounding) comes right after the last
 * note-off of its channel and pitch at that tick when the file wrote it
 * before (Claude's ruling, 2026-11-08): the off ends the old note and both
 * notes are kept. A note-on of a silent pitch doesn't move, so an on and
 * an off at one tick stay a zero-length note, dropped; nothing else moves,
 * so a pedal keeps its place among the note-offs.
 */
function stepTick(p: Pairing, tick: SmfEvent[]) {
	const lastOff = new Map<number, number>();
	for (const [i, e] of tick.entries()) if (e.kind === "off") lastOff.set(keyOf(e), i);
	const deferred: SmfEvent[][] = [];
	for (const [i, e] of tick.entries()) {
		const after = movedTo(p, e, lastOff);
		if (after > i) {
			const list = deferred[after] ?? [];
			list.push(e);
			deferred[after] = list;
		} else step(p, e);
		for (const d of deferred[i] ?? []) step(p, d);
	}
}

/** Where at its tick a re-strike moves: after the last note-off of its channel and pitch, or -1 to stay. */
function movedTo(p: Pairing, e: SmfEvent, lastOff: Map<number, number>): number {
	if (e.kind !== "on" || !isSounding(p, e)) return -1;
	return lastOff.get(keyOf(e)) ?? -1;
}

/** A track's events, grouped by tick. */
function ticksOf(events: SmfEvent[]): SmfEvent[][] {
	const ticks: SmfEvent[][] = [];
	let current: SmfEvent[] = [];
	for (const e of events) {
		if (current.length > 0 && current[0]?.tick !== e.tick) {
			ticks.push(current);
			current = [];
		}
		current.push(e);
	}
	if (current.length > 0) ticks.push(current);
	return ticks;
}

/** Ends every note still sounding or held at `last`. */
function endAll(p: Pairing, last: number) {
	for (let channel = 0; channel < 16; channel++)
		for (const map of [p.sounding[channel], p.held[channel]])
			for (const pitch of [...(map?.keys() ?? [])]) endPitch(p, channel, pitch, last);
}

function trackNotes(events: SmfEvent[], track: number, out: Note[]) {
	const p: Pairing = { track, out, sounding: channels(), held: channels(), pedal: [] };
	for (const tick of ticksOf(events)) stepTick(p, tick);
	endAll(p, events[events.length - 1]?.tick ?? 0);
}

const byStart = (a: Note, b: Note) =>
	a.start - b.start || a.track - b.track || a.channel - b.channel || a.pitch - b.pitch;

/** Every note of the file, by start, then track, channel and pitch; none past `MAX_NOTES` (`too-large`). */
export function notesOf(smf: Smf, report: Report): Note[] {
	const notes: Note[] = [];
	for (const [i, events] of smf.tracks.entries()) trackNotes(events, i + 1, notes);
	if (notes.length > MAX_NOTES) {
		report.add("too-large", "error", "the file has more than 500,000 notes, the most import reads");
		return [];
	}
	return notes.sort(byStart);
}

/** Each note's start (step 1) and end (step -1) by pitch class, by tick: for sweeps over what sounds. */
export function pitchClassPoints(notes: Note[]): { at: number; pc: number; step: number }[] {
	return notes
		.flatMap((n) => [
			{ at: n.start, pc: n.pitch % 12, step: 1 },
			{ at: n.end, pc: n.pitch % 12, step: -1 },
		])
		.sort((a, b) => a.at - b.at);
}
