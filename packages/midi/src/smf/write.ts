/**
 * The Standard MIDI File writer (spec 3.2): events sorted by tick and, at
 * one tick, in a fixed order; delta times; no running status; an
 * end-of-track at the end of every track.
 */
import type { Meter } from "barmark";
import type { Smf, SmfEvent } from "./types.js";
import { writeVlq } from "./vlq.js";

/** The build's `lib` is ESNext alone, so the platform's TextEncoder is typed here (FINDINGS, 2026-11-05). */
const platform = globalThis as unknown as {
	TextEncoder: new () => { encode(text: string): Uint8Array };
};
const utf8 = new platform.TextEncoder();

const END_OF_TRACK = 0x2f;
const SUSTAIN = 64;

/**
 * Where an event goes among those at its tick: note-offs, pedal up, meta
 * events, pedal down, program changes and other controllers, note-ons.
 */
function rank(event: SmfEvent): number {
	switch (event.kind) {
		case "off":
			return 0;
		case "meta":
			return 2;
		case "program":
			return 4;
		case "on":
			return 5;
		case "control":
			if (event.control !== SUSTAIN) return 4;
			return event.value < 64 ? 1 : 3;
	}
}

function eventBytes(event: SmfEvent): number[] {
	switch (event.kind) {
		case "on":
			return [0x90 | event.channel, event.pitch, event.velocity];
		case "off":
			return [0x80 | event.channel, event.pitch, event.velocity];
		case "program":
			return [0xc0 | event.channel, event.program];
		case "control":
			return [0xb0 | event.channel, event.control, event.value];
		case "meta":
			return [0xff, event.type, ...writeVlq(event.data.length), ...event.data];
	}
}

const isEnd = (event: SmfEvent) => event.kind === "meta" && event.type === END_OF_TRACK;

/** One track's events in order, ending with one end-of-track (at the latest tick given). */
function ordered(track: SmfEvent[]): SmfEvent[] {
	const events = track
		.filter((event) => !isEnd(event))
		.sort((a, b) => a.tick - b.tick || rank(a) - rank(b));
	const end = track.reduce((last, event) => Math.max(last, event.tick), 0);
	return [...events, { tick: end, kind: "meta", type: END_OF_TRACK, data: new Uint8Array() }];
}

function trackBytes(track: SmfEvent[]): number[] {
	const bytes: number[] = [];
	let tick = 0;
	for (const event of ordered(track)) {
		bytes.push(...writeVlq(event.tick - tick), ...eventBytes(event));
		tick = event.tick;
	}
	return bytes;
}

const ascii = (id: string) => Array.from(id, (c) => c.charCodeAt(0));
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const chunk = (id: string, body: number[]) => [...ascii(id), ...u32(body.length), ...body];

export function writeSmf(smf: Smf): Uint8Array {
	const header = [...u16(smf.format), ...u16(smf.tracks.length), ...u16(smf.ppq)];
	const chunks = [
		chunk("MThd", header),
		...smf.tracks.map((track) => chunk("MTrk", trackBytes(track))),
	];
	const bytes = new Uint8Array(chunks.reduce((length, c) => length + c.length, 0));
	let at = 0;
	for (const c of chunks) {
		bytes.set(c, at);
		at += c.length;
	}
	return bytes;
}

const meta = (tick: number, type: number, data: number[] | Uint8Array): SmfEvent => ({
	tick,
	kind: "meta",
	type,
	data: Uint8Array.from(data),
});

/** A text meta event (track name, marker, lyric, text…), its text in UTF-8. */
export function metaText(tick: number, type: number, text: string): SmfEvent {
	return meta(tick, type, utf8.encode(text));
}

/** A tempo, in quarters a minute, as whole microseconds a quarter within SMF's 24 bits. */
export function tempoMeta(tick: number, qpm: number): SmfEvent {
	const micros = Math.min(0xffffff, Math.max(1, Math.round(60_000_000 / qpm)));
	return meta(tick, 0x51, [(micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff]);
}

/** A time signature: the denominator as a power of two, `clicks` MIDI clocks a click, 8 32nds a quarter. */
export function timeMeta(tick: number, meter: Meter, clicks: number): SmfEvent {
	return meta(tick, 0x58, [meter.n, Math.log2(meter.d), clicks, 8]);
}

/** A key signature: sharps (positive) or flats (negative), and major or minor. */
export function keyMeta(tick: number, fifths: number, minor: boolean): SmfEvent {
	return meta(tick, 0x59, [fifths & 0xff, minor ? 1 : 0]);
}
