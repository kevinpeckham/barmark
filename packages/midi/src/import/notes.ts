/**
 * Notes from a file's events (spec 5.2): a note-on and the next note-off
 * of its pitch on its track and channel. A second note-on of a sounding
 * pitch ends the first there (a re-strike); a note still sounding at the
 * end of its track ends at the track's last event; zero-length notes are
 * dropped. Controller 64 at 64 or more holds a released note on its
 * channel, on every track (a controller belongs to the channel; tracks
 * are the file's filing: MuseScore writes a piano's pedal in one staff's
 * track), until the pedal lifts or the pitch is struck again. Events are
 * taken in one pass over the tracks merged by tick, then track, then file
 * order, except that at one tick a note-off comes before a re-strike of
 * its pitch.
 */
import type { Smf, SmfEvent } from "../smf/types.js";
import type { Report } from "./report.js";

/** A note, in ticks; `track` is the 1-based track chunk. */
export type Note = { track: number; channel: number; pitch: number; start: number; end: number };

/** The most notes import reads (spec 5.1). */
const MAX_NOTES = 500_000;

const SUSTAIN = 64;

/** An event and its 1-based track. */
type Placed = { track: number; e: SmfEvent };

/**
 * The notes so far: per channel, the start of each note sounding and of
 * each held by the pedal, by `voiceKey`; the pedal per channel; each
 * track's last tick.
 */
type Pairing = {
	out: Note[];
	sounding: Map<number, number>[];
	held: Map<number, number>[];
	pedal: boolean[];
	last: number[];
};

const channels = () => Array.from({ length: 16 }, () => new Map<number, number>());

/** A track's pitch, as a key in one channel's maps. */
const voiceKey = (track: number, pitch: number) => track * 128 + pitch;

function end(p: Pairing, channel: number, key: number, start: number, tick: number) {
	if (tick > start)
		p.out.push({ track: Math.floor(key / 128), channel, pitch: key % 128, start, end: tick });
}

/** Ends what still sounds of a track's pitch (struck again, or at the end), from both maps. */
function endVoice(p: Pairing, channel: number, key: number, tick: number) {
	for (const map of [p.sounding[channel], p.held[channel]]) {
		const start = map?.get(key);
		if (start === undefined) continue;
		end(p, channel, key, start, tick);
		map?.delete(key);
	}
}

function release(p: Pairing, channel: number, key: number, tick: number) {
	const start = p.sounding[channel]?.get(key);
	if (start === undefined) return;
	p.sounding[channel]?.delete(key);
	if (p.pedal[channel]) p.held[channel]?.set(key, start);
	else end(p, channel, key, start, tick);
}

/** The pedal pressed or lifted on a channel; lifting ends what it held on every track. */
function sustain(p: Pairing, channel: number, down: boolean, tick: number) {
	p.pedal[channel] = down;
	if (down) return;
	const held = p.held[channel];
	for (const [key, start] of held ?? []) end(p, channel, key, start, tick);
	held?.clear();
}

function step(p: Pairing, { track, e }: Placed) {
	if (e.kind === "on") {
		const key = voiceKey(track, e.pitch);
		endVoice(p, e.channel, key, e.tick);
		p.sounding[e.channel]?.set(key, e.tick);
	} else if (e.kind === "off") release(p, e.channel, voiceKey(track, e.pitch), e.tick);
	else if (e.kind === "control" && e.control === SUSTAIN)
		sustain(p, e.channel, e.value >= 64, e.tick);
}

/** A note event's track, channel and pitch as one number. */
const keyOf = (track: number, e: { channel: number; pitch: number }) =>
	(track * 16 + e.channel) * 128 + e.pitch;

/** Whether a track's `pitch` sounds, or is held by the pedal, on its channel. */
function isSounding(p: Pairing, track: number, e: { channel: number; pitch: number }) {
	const key = voiceKey(track, e.pitch);
	return (p.sounding[e.channel]?.has(key) ?? false) || (p.held[e.channel]?.has(key) ?? false);
}

/**
 * One tick's events in order, except that a re-strike
 * (a note-on of a pitch still sounding) comes right after the last
 * note-off of its track, channel and pitch at that tick when the file
 * wrote it before (Claude's ruling, 2026-11-08): the off ends the old note
 * and both notes are kept. A note-on of a silent pitch doesn't move, so an
 * on and an off at one tick stay a zero-length note, dropped; nothing else
 * moves, so a pedal keeps its place among the note-offs.
 */
function stepTick(p: Pairing, tick: Placed[]) {
	const lastOff = new Map<number, number>();
	for (const [i, { track, e }] of tick.entries())
		if (e.kind === "off") lastOff.set(keyOf(track, e), i);
	const deferred: Placed[][] = [];
	for (const [i, placed] of tick.entries()) {
		const after = movedTo(p, placed, lastOff);
		if (after > i) {
			const list = deferred[after] ?? [];
			list.push(placed);
			deferred[after] = list;
		} else step(p, placed);
		for (const d of deferred[i] ?? []) step(p, d);
	}
}

/** Where at its tick a re-strike moves: after the last note-off of its track, channel and pitch, or -1 to stay. */
function movedTo(p: Pairing, { track, e }: Placed, lastOff: Map<number, number>): number {
	if (e.kind !== "on" || !isSounding(p, track, e)) return -1;
	return lastOff.get(keyOf(track, e)) ?? -1;
}

/** The merged events, grouped by tick. */
function ticksOf(events: Placed[]): Placed[][] {
	const ticks: Placed[][] = [];
	let current: Placed[] = [];
	for (const placed of events) {
		if (current.length > 0 && current[0]?.e.tick !== placed.e.tick) {
			ticks.push(current);
			current = [];
		}
		current.push(placed);
	}
	if (current.length > 0) ticks.push(current);
	return ticks;
}

/** Every track's events in one list, by tick, then track, then file order (a stable sort). */
function merged(smf: Smf): Placed[] {
	const all = smf.tracks.flatMap((events, i) => events.map((e) => ({ track: i + 1, e })));
	return all.sort((a, b) => a.e.tick - b.e.tick || a.track - b.track);
}

/** Ends every note still sounding or held at its track's last event. */
function endAll(p: Pairing) {
	for (let channel = 0; channel < 16; channel++)
		for (const map of [p.sounding[channel], p.held[channel]])
			for (const key of [...(map?.keys() ?? [])])
				endVoice(p, channel, key, p.last[Math.floor(key / 128)] ?? 0);
}

const byStart = (a: Note, b: Note) =>
	a.start - b.start || a.track - b.track || a.channel - b.channel || a.pitch - b.pitch;

/** Every note of the file, by start, then track, channel and pitch; none past `MAX_NOTES` (`too-large`). */
export function notesOf(smf: Smf, report: Report): Note[] {
	const notes: Note[] = [];
	const last = [0, ...smf.tracks.map((events) => events[events.length - 1]?.tick ?? 0)];
	const p: Pairing = { out: notes, sounding: channels(), held: channels(), pedal: [], last };
	for (const tick of ticksOf(merged(smf))) stepTick(p, tick);
	endAll(p);
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
