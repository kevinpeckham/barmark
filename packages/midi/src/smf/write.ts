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

/** `n` itself when it is a whole number from 0 to `max`; a RangeError otherwise (the writer is internal). */
function within(n: number, max: number, what: string): number {
	if (!Number.isInteger(n) || n < 0 || n > max)
		throw new RangeError(`SMF ${what} must be a whole number from 0 to ${max}: ${n}`);
	return n;
}
const data = (n: number) => within(n, 0x7f, "data byte");
const status = (base: number, channel: number) => base | within(channel, 15, "channel");

/** The event's bytes, appended to `out` one by one: a payload is never spread into a call. */
function writeEvent(event: SmfEvent, out: number[]): void {
	switch (event.kind) {
		case "on":
		case "off":
			out.push(
				status(event.kind === "on" ? 0x90 : 0x80, event.channel),
				data(event.pitch),
				data(event.velocity),
			);
			return;
		case "program":
			out.push(status(0xc0, event.channel), data(event.program));
			return;
		case "control":
			out.push(status(0xb0, event.channel), data(event.control), data(event.value));
			return;
		case "meta":
			out.push(0xff, within(event.type, 0x7f, "meta type"));
			for (const byte of writeVlq(event.data.length)) out.push(byte);
			for (const byte of event.data) out.push(byte);
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
		for (const byte of writeVlq(event.tick - tick)) bytes.push(byte);
		writeEvent(event, bytes);
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

/**
 * A tempo in quarters a minute as whole microseconds a quarter, clamped to
 * SMF's 24 bits (1 to 0xffffff); `clamped` says it was out of range. A qpm
 * of 0, below 0 or NaN is clamped to the slowest.
 */
export function tempoMicros(qpm: number): { micros: number; clamped: boolean } {
	if (!(qpm > 0)) return { micros: 0xffffff, clamped: true };
	const exact = Math.round(60_000_000 / qpm);
	const micros = Math.min(0xffffff, Math.max(1, exact));
	return { micros, clamped: micros !== exact };
}

/** A tempo meta event, in quarters a minute (clamped as `tempoMicros` says). */
export function tempoMeta(tick: number, qpm: number): SmfEvent {
	const { micros } = tempoMicros(qpm);
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
