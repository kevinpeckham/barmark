/**
 * The Standard MIDI File reader (spec 5.1). It never throws: every problem
 * is a diagnostic. Every read is checked against the end of its chunk, and
 * nothing is allocated from a length field before that length is checked
 * against the bytes left, so a hostile file costs time linear in its size.
 */
import { createReport, type Report } from "../import/report.js";
import type { MidiImportCode, MidiImportDiagnostic } from "../import/types.js";
import { decodeText } from "./text.js";
import type { Smf, SmfEvent } from "./types.js";

export const LIMITS = { bytes: 16 * 1024 * 1024, tracks: 1024, events: 2_000_000 } as const;

export type SmfRead = {
	smf: Smf | null;
	/** Each track's first track name, decoded; null for a track with none. */
	names: (string | null)[];
	diagnostics: MidiImportDiagnostic[];
};

const TRACK_NAME = 0x03;
const END_OF_TRACK = 0x2f;
const TEMPO = 0x51;
const TIME = 0x58;
const KEY = 0x59;
/** The meta events import reads (spec 5.1): text, copyright, track name, lyric, marker, end of track, tempo, time and key. */
const KEPT_META = new Set([0x01, 0x02, TRACK_NAME, 0x05, 0x06, END_OF_TRACK, TEMPO, TIME, KEY]);

/** A position in the file that reads nothing at or past `end`. */
type Cursor = { view: DataView; at: number; end: number };

/** A read past the end of the chunk. */
const OVERRUN = -1;
/** A variable-length quantity longer than SMF's four bytes. */
const TOO_LONG = -2;

function byte(c: Cursor): number {
	return c.at < c.end ? c.view.getUint8(c.at++) : OVERRUN;
}

function vlq(c: Cursor): number {
	let n = 0;
	for (let i = 0; i < 4; i++) {
		const b = byte(c);
		if (b < 0) return OVERRUN;
		n = n * 128 + (b & 0x7f);
		if (b < 0x80) return n;
	}
	return TOO_LONG;
}

/** `length` bytes on from the cursor, copied: the caller has checked they are there. */
function take(c: Cursor, length: number): Uint8Array {
	const bytes = new Uint8Array(c.view.buffer, c.view.byteOffset + c.at, length).slice();
	c.at += length;
	return bytes;
}

/** Why a track stopped early: a message for `bad-event`, or null for the end of a truncated file. */
type Stop = { stop: string | null };
const overrun = (truncated: boolean): Stop => ({
	stop: truncated ? null : "an event runs past the end of its track",
});
const tooLong: Stop = { stop: "a variable-length number is longer than four bytes" };

const signed = (byte: number) => (byte > 127 ? byte - 256 : byte);

/** For the meta events barmark reads a value from: what makes one unusable, or null when it is usable. */
const META_CHECKS: Record<number, (data: Uint8Array) => string | null> = {
	[TEMPO]: (data) => {
		const [a = 0, b = 0, c = 0] = data;
		return data.length === 3 && (a | b | c) !== 0 ? null : "a tempo of 0, or not three bytes";
	},
	[TIME]: (data) => {
		const [n = 0, power = 0] = data;
		return data.length >= 2 && n >= 1 && power >= 1 && power <= 4
			? null
			: "a time signature of no beats, or not over 2, 4, 8 or 16";
	},
	[KEY]: (data) => {
		const [sharps = 0, minor = 0] = data;
		return data.length === 2 && Math.abs(signed(sharps)) <= 7 && minor <= 1
			? null
			: "a key signature outside 7 flats to 7 sharps, major or minor";
	},
};

/** One track's reading: its events so far, its running status and where its problems go. */
type Track = {
	c: Cursor;
	number: number;
	truncated: boolean;
	tick: number;
	status: number;
	events: SmfEvent[];
	name: string | null;
	report: Report;
};

/** A length at the cursor, checked against the bytes left in the chunk: the length, or why the track stops. */
function payloadLength(t: Track): number | Stop {
	const length = vlq(t.c);
	if (length === TOO_LONG) return tooLong;
	if (length < 0 || length > t.c.end - t.c.at) return overrun(t.truncated);
	return length;
}

/** A meta event import reads: kept, or dropped as invalid; "end" for the end of the track. */
function keepMeta(t: Track, type: number, data: Uint8Array): "end" | null {
	const invalid = META_CHECKS[type]?.(data) ?? null;
	if (invalid !== null) {
		t.report.add("meta-invalid", "warning", `${invalid}, ignored`, { track: t.number });
		return null;
	}
	if (type === TRACK_NAME && t.name === null) t.name = decodeText(data);
	t.events.push({ tick: t.tick, kind: "meta", type, data });
	return type === END_OF_TRACK ? "end" : null;
}

/** A meta event after its `FF`: kept, dropped, or the end of the track. */
function readMeta(t: Track): Stop | "end" | null {
	const type = byte(t.c);
	if (type < 0) return overrun(t.truncated);
	const length = payloadLength(t);
	if (typeof length !== "number") return length;
	if (KEPT_META.has(type)) return keepMeta(t, type, take(t.c, length));
	t.c.at += length;
	return null;
}

/** A sysex (`F0`) or escape (`F7`) after its status byte, skipped. */
function skipSysex(t: Track): Stop | null {
	const length = payloadLength(t);
	if (typeof length !== "number") return length;
	t.c.at += length;
	return null;
}

/** Data bytes a channel message takes, by its high nibble. */
const DATA_BYTES: Record<number, number> = { 8: 2, 9: 2, 10: 2, 11: 2, 12: 1, 13: 1, 14: 2 };

/** A channel event from its status and data bytes, or null for one import doesn't read. */
function channelEvent(tick: number, status: number, d: number[]): SmfEvent | null {
	const channel = status & 0x0f;
	const [x = 0, y = 0] = d;
	switch (status >> 4) {
		case 8:
			return { tick, kind: "off", channel, pitch: x, velocity: y };
		case 9:
			return { tick, kind: y === 0 ? "off" : "on", channel, pitch: x, velocity: y };
		case 11:
			return { tick, kind: "control", channel, control: x, value: y };
		case 12:
			return { tick, kind: "program", channel, program: x };
		default:
			return null;
	}
}

/** A channel event, `first` being its status byte or (running status) its first data byte. */
function readChannel(t: Track, first: number): Stop | null {
	if (first >= 0x80) t.status = first;
	else if (t.status === 0) return { stop: "a data byte with no status before it" };
	const data = first >= 0x80 ? [] : [first];
	while (data.length < (DATA_BYTES[t.status >> 4] ?? 0)) {
		const b = byte(t.c);
		if (b < 0) return overrun(t.truncated);
		if (b >= 0x80) return { stop: `a status byte (${hex(b)}) where a data byte belongs` };
		data.push(b);
	}
	const event = channelEvent(t.tick, t.status, data);
	if (event !== null) t.events.push(event);
	return null;
}

const hex = (b: number) => `0x${b.toString(16).toUpperCase().padStart(2, "0")}`;

/** One event at the cursor. */
function readEvent(t: Track): Stop | "end" | null {
	const delta = vlq(t.c);
	if (delta === TOO_LONG) return tooLong;
	const first = delta < 0 ? OVERRUN : byte(t.c);
	if (first < 0) return overrun(t.truncated);
	t.tick += delta;
	if (first === 0xff) return readMeta(t);
	if (first === 0xf0 || first === 0xf7) return skipSysex(t);
	if (first > 0xf0) return { stop: `a status byte (${hex(first)}) that can't appear in a file` };
	return readChannel(t, first);
}

/** The event budget left, shared by every track. */
type Budget = { events: number };

/** A track chunk's events, to its end-of-track or the chunk's end; false when the file has too many events. */
function readTrack(t: Track, budget: Budget): boolean {
	while (t.c.at < t.c.end) {
		if (--budget.events < 0) return false;
		const result = readEvent(t);
		if (result === "end") break;
		if (result === null) continue;
		if (result.stop !== null)
			t.report.add("bad-event", "warning", `${result.stop}; the rest of the track is skipped`, {
				track: t.number,
			});
		break;
	}
	return true;
}

const fail = (report: Report, code: MidiImportCode, message: string): SmfRead => {
	report.add(code, "error", message);
	return { smf: null, names: [], diagnostics: report.list };
};

/** What in the header's format and division stops the read, or null. */
function headerError(format: number, division: number): [MidiImportCode, string] | null {
	if (format === 2) return ["format-2", "a format 2 file (independent sequences) can't be read"];
	if (format > 2) return ["not-midi", `not a MIDI file: format ${format}`];
	if (division & 0x8000)
		return ["smpte", "the file counts time in SMPTE frames, not beats, so it has no bars"];
	if (division === 0) return ["not-midi", "not a MIDI file: a division of 0 ticks a quarter"];
	return null;
}

type Header = { format: 0 | 1; ntracks: number; ppq: number; at: number };

/** The header's fields and where the chunks start, or the error that stops the read. */
function readHeader(view: DataView, report: Report): Header | SmfRead {
	const hasId = view.byteLength >= 4 && view.getUint32(0) === 0x4d546864;
	if (!hasId)
		return fail(report, "not-midi", "not a MIDI file: it doesn't begin with an MThd header");
	if (view.byteLength < 14 || view.getUint32(4) < 6)
		return fail(report, "not-midi", "not a MIDI file: its MThd header is incomplete");
	const length = view.getUint32(4);
	const format = view.getUint16(8);
	const division = view.getUint16(12);
	const error = headerError(format, division);
	if (error !== null) return fail(report, ...error);
	const end = 8 + length;
	if (end > view.byteLength) report.add("truncated", "warning", "the file ends inside its header");
	return {
		format: format as 0 | 1,
		ntracks: view.getUint16(10),
		ppq: division,
		at: Math.min(end, view.byteLength),
	};
}

const MTRK = 0x4d54726b;

/** The read so far: the file, its tracks and their names, the event budget left and the report. */
type Reading = {
	view: DataView;
	tracks: SmfEvent[][];
	names: (string | null)[];
	budget: Budget;
	report: Report;
};

/** A track chunk, read into `r`; the error that stops the read, or null. */
function readTrackChunk(r: Reading, c: Cursor, truncated: boolean): SmfRead | null {
	if (r.tracks.length === LIMITS.tracks)
		return fail(
			r.report,
			"too-large",
			"the file has more than 1,024 tracks, the most import reads",
		);
	const t: Track = {
		c,
		number: r.tracks.length + 1,
		truncated,
		tick: 0,
		status: 0,
		events: [],
		name: null,
		report: r.report,
	};
	if (!readTrack(t, r.budget))
		return fail(
			r.report,
			"too-large",
			"the file has more than 2,000,000 events, the most import reads",
		);
	r.tracks.push(t.events);
	r.names.push(t.name);
	return null;
}

/** The chunk at `at`, a track read or another skipped: where the next starts, or the error that stops the read. */
function readChunk(r: Reading, at: number): number | SmfRead {
	const { view, report } = r;
	const track = r.tracks.length + 1;
	if (view.byteLength - at < 8) {
		report.add("truncated", "warning", "the file ends inside a chunk's header");
		return view.byteLength;
	}
	const start = at + 8;
	const truncated = view.getUint32(at + 4) > view.byteLength - start;
	const end = truncated ? view.byteLength : start + view.getUint32(at + 4);
	const isTrack = view.getUint32(at) === MTRK;
	if (truncated)
		report.add(
			"truncated",
			"warning",
			"a chunk runs past the end of the file",
			isTrack ? { track } : {},
		);
	if (isTrack) return readTrackChunk(r, { view, at: start, end }, truncated) ?? end;
	report.add("unknown-chunk", "info", "a chunk that isn't a track was skipped");
	return end;
}

/** The file's tracks; its diagnostics go to `report` (the import's, when it passes one), which `diagnostics` is. */
export function readSmf(bytes: Uint8Array, report: Report = createReport()): SmfRead {
	if (bytes.length > LIMITS.bytes)
		return fail(report, "too-large", "the file is larger than 16 MiB, the most import reads");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const header = readHeader(view, report);
	if ("smf" in header) return header;
	const r: Reading = { view, tracks: [], names: [], budget: { events: LIMITS.events }, report };
	for (let at = header.at; at < view.byteLength; ) {
		const next = readChunk(r, at);
		if (typeof next !== "number") return next;
		at = next;
	}
	if (r.tracks.length !== header.ntracks)
		report.add(
			"track-count",
			"warning",
			`the header says ${header.ntracks} tracks; the file has ${r.tracks.length}`,
		);
	return {
		smf: { format: header.format, ppq: header.ppq, tracks: r.tracks },
		names: r.names,
		diagnostics: report.list,
	};
}
