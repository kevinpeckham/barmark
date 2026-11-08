/**
 * Notes from a file's events (spec 5.2): a note-on and the next note-off
 * of its pitch on its track and channel. A second note-on of a sounding
 * pitch ends the first there (a re-strike); a note still sounding at the
 * end of its track ends at the track's last event; zero-length notes are
 * dropped. Controller 64 at 64 or more holds a released note on its
 * channel until the pedal lifts or the pitch is struck again. Events are
 * taken in file order, one pass a track.
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

function trackNotes(events: SmfEvent[], track: number, out: Note[]) {
	const p: Pairing = { track, out, sounding: channels(), held: channels(), pedal: [] };
	for (const e of events) step(p, e);
	const last = events[events.length - 1]?.tick ?? 0;
	for (let channel = 0; channel < 16; channel++)
		for (const map of [p.sounding[channel], p.held[channel]])
			for (const pitch of [...(map?.keys() ?? [])]) endPitch(p, channel, pitch, last);
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
