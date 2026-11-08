import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type MidiEvent, parseMidi } from "midi-file";
import type { MidiImportCode } from "../src/import/types.js";
import { exportMidi } from "../src/index.js";
import { LIMITS, readSmf } from "../src/smf/read.js";
import { decodeText } from "../src/smf/text.js";
import type { SmfEvent } from "../src/smf/types.js";
import { CHARTS } from "./helpers/charts.js";
import { type Event, smf } from "./helpers/smf.js";

const END = { kind: "meta", type: 0x2f, data: new Uint8Array() };
const on = (tick: number, pitch: number, velocity = 80, channel = 0) => ({
	tick,
	kind: "on",
	channel,
	pitch,
	velocity,
});
const off = (tick: number, pitch: number, velocity = 64, channel = 0) => ({
	tick,
	kind: "off",
	channel,
	pitch,
	velocity,
});
const codes = (r: ReturnType<typeof readSmf>) => r.diagnostics.map((d) => d.code);
const tracksOf = (r: ReturnType<typeof readSmf>) => {
	if (r.smf === null) throw new Error(`no file: ${JSON.stringify(r.diagnostics)}`);
	return r.smf.tracks;
};
const metas = (track: SmfEvent[], type: number) =>
	track.flatMap((e) => (e.kind === "meta" && e.type === type ? [Array.from(e.data)] : []));
/** A track chunk of these bytes, as written. */
const mtrk = (bytes: number[]) => ({ id: "MTrk", bytes });
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** The one error a file gives: no file, no names, one diagnostic. */
function failsWith(bytes: Uint8Array, code: MidiImportCode) {
	const r = readSmf(bytes);
	expect(r.smf).toBeNull();
	expect(r.names).toEqual([]);
	expect(r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code)).toEqual([code]);
	return r;
}

describe("readSmf: events", () => {
	test("note events, programs and controllers at absolute ticks", () => {
		const r = readSmf(
			smf({
				ppq: 96,
				tracks: [
					[
						{ dt: 0, program: [3, 40] },
						{ dt: 0, control: [3, 64, 127] },
						{ dt: 10, on: [3, 60, 90] },
						{ dt: 200, off: [3, 60] },
					],
				],
			}),
		);
		expect(r.diagnostics).toEqual([]);
		expect(r.smf?.format).toBe(1);
		expect(r.smf?.ppq).toBe(96);
		expect(tracksOf(r)).toEqual([
			[
				{ tick: 0, kind: "program", channel: 3, program: 40 },
				{ tick: 0, kind: "control", channel: 3, control: 64, value: 127 },
				on(10, 60, 90, 3),
				off(210, 60, 64, 3),
				{ tick: 210, ...END },
			] as SmfEvent[],
		]);
	});

	test("running status, kept across a meta event and a sysex", () => {
		const r = readSmf(
			smf({
				running: true,
				tracks: [
					[
						{ dt: 0, on: [0, 60, 80] },
						{ dt: 0, on: [0, 64, 81] },
						{ dt: 0, marker: "A" },
						{ dt: 0, on: [0, 67, 82] },
						{ dt: 0, sysex: [0x7e, 0x7f, 0xf7] },
						{ dt: 480, on: [0, 72, 83] },
					],
				],
			}),
		);
		expect(r.diagnostics).toEqual([]);
		const notes = tracksOf(r)[0]?.filter((e) => e.kind === "on");
		expect(notes).toEqual([
			on(0, 60, 80),
			on(0, 64, 81),
			on(0, 67, 82),
			on(480, 72, 83),
		] as SmfEvent[]);
	});

	test("a zero-velocity note-on is a note-off", () => {
		const r = readSmf(
			smf({
				tracks: [
					[
						{ dt: 0, on: [2, 60, 80] },
						{ dt: 480, raw: [0x92, 60, 0] },
					],
				],
			}),
		);
		expect(tracksOf(r)[0]?.slice(0, 2)).toEqual([
			on(0, 60, 80, 2),
			off(480, 60, 0, 2),
		] as SmfEvent[]);
	});

	test("format 0", () => {
		const r = readSmf(
			smf({
				format: 0,
				tracks: [
					[
						{ dt: 0, tempo: 100 },
						{ dt: 0, on: [0, 60, 80] },
					],
				],
			}),
		);
		expect(r.diagnostics).toEqual([]);
		expect(r.smf?.format).toBe(0);
		expect(tracksOf(r)[0]?.map((e) => e.kind)).toEqual(["meta", "on", "meta"]);
	});

	test("a sysex F0 and an F7 escape are skipped", () => {
		const r = readSmf(
			smf({
				tracks: [
					[
						{ dt: 0, on: [0, 60, 80] },
						{ dt: 10, sysex: [0x43, 0x10, 0x4c, 0xf7] },
						{ dt: 10, raw: [0xf7, 0x03, 0x90, 0x3e, 0x40] },
						{ dt: 10, on: [0, 64, 80] },
					],
				],
			}),
		);
		expect(r.diagnostics).toEqual([]);
		expect(tracksOf(r)[0]).toEqual([on(0, 60), on(30, 64), { tick: 30, ...END }] as SmfEvent[]);
	});

	test("meta events: the ones import reads are kept as bytes, the rest dropped", () => {
		const r = readSmf(
			smf({
				tracks: [
					[
						{ dt: 0, name: "Piano" },
						{ dt: 0, text: "t" },
						{ dt: 0, meta: [0x02, [0x63]] },
						{ dt: 0, meta: [0x04, [0x69]] },
						{ dt: 0, lyric: "la" },
						{ dt: 0, marker: "V" },
						{ dt: 0, meta: [0x07, [0x63]] },
						{ dt: 0, meta: [0x21, [0]] },
						{ dt: 0, tempo: 120 },
						{ dt: 0, time: [3, 4] },
						{ dt: 0, key: [-2, 1] },
						{ dt: 0, meta: [0x7f, [1, 2, 3]] },
					],
				],
			}),
		);
		expect(r.diagnostics).toEqual([]);
		const track = tracksOf(r)[0] ?? [];
		expect(track.map((e) => (e.kind === "meta" ? e.type : e.kind))).toEqual([
			0x03, 0x01, 0x02, 0x05, 0x06, 0x51, 0x58, 0x59, 0x2f,
		]);
		expect(metas(track, 0x51)).toEqual([[0x07, 0xa1, 0x20]]);
		expect(metas(track, 0x58)).toEqual([[3, 2, 24, 8]]);
		expect(metas(track, 0x59)).toEqual([[0xfe, 1]]);
	});

	test("aftertouch, channel pressure and pitch bend are read past and dropped", () => {
		const r = readSmf(
			smf({
				tracks: [
					[
						{ dt: 0, raw: [0xa0, 60, 10] },
						{ dt: 0, raw: [0xd0, 10] },
						{ dt: 0, raw: [0xe0, 0, 64] },
						{ dt: 0, on: [0, 60, 80] },
					],
				],
			}),
		);
		expect(r.diagnostics).toEqual([]);
		expect(tracksOf(r)[0]).toEqual([on(0, 60), { tick: 0, ...END }] as SmfEvent[]);
	});

	test("reading a track stops at its end-of-track", () => {
		const r = readSmf(
			smf({
				tracks: [
					{
						events: [
							{ dt: 0, on: [0, 60, 80] },
							{ dt: 0, meta: [0x2f, []] },
							{ dt: 0, raw: [0xf4] },
						],
						eot: false,
					},
				],
			}),
		);
		expect(r.diagnostics).toEqual([]);
		expect(tracksOf(r)[0]).toEqual([on(0, 60), { tick: 0, ...END }] as SmfEvent[]);
	});
});

describe("readSmf: errors", () => {
	test("not-midi", () => {
		failsWith(Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 4, ...ascii("RMID")]), "not-midi");
		failsWith(new Uint8Array(), "not-midi");
		failsWith(Uint8Array.from(ascii("MThd")), "not-midi");
		failsWith(smf({ division: 0, tracks: [[]] }), "not-midi");
		// A RIFF MIDI file (RMID) wrapping a whole MThd: still not one.
		failsWith(
			Uint8Array.from([
				...ascii("RIFF"),
				0,
				0,
				0,
				30,
				...ascii("RMIDdata"),
				0,
				0,
				0,
				22,
				...smf({ tracks: [[]] }),
			]),
			"not-midi",
		);
		// A file that begins with a track chunk whose bytes would read as a good header.
		failsWith(Uint8Array.from([...ascii("MTrk"), 0, 0, 0, 6, 0, 1, 0, 0, 1, 0xe0]), "not-midi");
		// A header shorter than six bytes, in a file long enough to read six.
		failsWith(Uint8Array.from([...ascii("MThd"), 0, 0, 0, 4, 0, 1, 0, 0, 1, 0xe0]), "not-midi");
		// A header that claims six bytes but the file ends first.
		failsWith(Uint8Array.from([...ascii("MThd"), 0, 0, 0, 6, 0, 1, 0, 1, 1]), "not-midi");
		// It does begin with MThd: the message says the header is cut short.
		const cut = readSmf(Uint8Array.from([...ascii("MThd"), 0, 0, 0, 6, 0, 1, 0, 1, 1]));
		expect(cut.diagnostics[0]?.message).toContain("incomplete");
		expect(cut.diagnostics[0]?.message).not.toContain("doesn't begin");
		failsWith(smf({ format: 3, tracks: [[]] }), "not-midi");
	});

	test("format-2", () => {
		failsWith(smf({ format: 2, tracks: [[]] }), "format-2");
	});

	test("smpte", () => {
		failsWith(smf({ division: 0xe250, tracks: [[]] }), "smpte");
	});

	test("too-large: past 16 MiB", () => {
		const header = smf({ tracks: [] });
		const big = new Uint8Array(17 * 1024 * 1024);
		big.set(header);
		const r = failsWith(big, "too-large");
		expect(r.diagnostics[0]?.message).toContain("16 MiB");
		const atLimit = new Uint8Array(LIMITS.bytes);
		atLimit.set(header);
		expect(codes(readSmf(atLimit))).not.toContain("too-large");
	});

	test("too-large: past 1,024 tracks", () => {
		const tracks = (n: number) => smf({ tracks: Array.from({ length: n }, () => []) });
		const r = failsWith(tracks(1025), "too-large");
		expect(r.diagnostics[0]?.message).toContain("1,024 tracks");
		const ok = readSmf(tracks(1024));
		expect(ok.diagnostics).toEqual([]);
		expect(ok.smf?.tracks.length).toBe(1024);
	});

	test("too-large: past 2,000,000 events", () => {
		/** One track of `n` events (end-of-track counted): a note-on, then running-status note-ons. */
		const events = (n: number) => {
			const body = new Uint8Array(4 + (n - 2) * 3 + 4);
			body.set([0x00, 0x90, 60, 80]);
			for (let i = 0; i < n - 2; i++) body.set([0x00, 60, 80], 4 + i * 3);
			body.set([0x00, 0xff, 0x2f, 0x00], body.length - 4);
			const head = smf({ tracks: [] });
			head[11] = 1;
			const file = new Uint8Array(head.length + 8 + body.length);
			file.set(head);
			file.set(
				[...ascii("MTrk"), ...[24, 16, 8, 0].map((s) => (body.length >>> s) & 0xff)],
				head.length,
			);
			file.set(body, head.length + 8);
			return file;
		};
		const r = failsWith(events(LIMITS.events + 1), "too-large");
		expect(r.diagnostics[0]?.message).toContain("2,000,000 events");
		const ok = readSmf(events(LIMITS.events));
		expect(ok.diagnostics).toEqual([]);
		expect(ok.smf?.tracks[0]?.length).toBe(LIMITS.events);
	});

	test("the limits", () => {
		expect(LIMITS).toEqual({ bytes: 16 * 1024 * 1024, tracks: 1024, events: 2_000_000 });
	});
});

describe("readSmf: warnings keep what was read", () => {
	const notes = (n: number): Event[] =>
		Array.from({ length: n }, (_, i): Event[] => [
			{ dt: 0, on: [0, 60 + (i % 12), 80] },
			{ dt: 120, off: [0, 60 + (i % 12)] },
		]).flat();

	test("truncated: a chunk 100 bytes short", () => {
		const whole = readSmf(smf({ tracks: [[{ dt: 0, name: "x" }], notes(100)] }));
		const r = readSmf(smf({ tracks: [[{ dt: 0, name: "x" }], notes(100)], cut: 100 }));
		expect(r.diagnostics).toEqual([
			expect.objectContaining({ severity: "warning", code: "truncated", track: 2 }),
		]);
		const [full, cut] = [tracksOf(whole)[1] ?? [], tracksOf(r)[1] ?? []];
		expect(cut.length).toBeGreaterThan(150);
		expect(cut.length).toBeLessThan(full.length - 20);
		expect(cut).toEqual(full.slice(0, cut.length));
		expect(r.names).toEqual(["x", null]);
	});

	test("truncated: a file cut inside an event warns once, truncated, and keeps the events before it", () => {
		const whole = tracksOf(readSmf(smf({ tracks: [notes(10)] })))[0] ?? [];
		// The last off (3 data bytes after its delta) loses its velocity, and the end-of-track goes.
		const r = readSmf(smf({ tracks: [notes(10)], cut: 5 }));
		expect(codes(r)).toEqual(["truncated"]);
		expect(tracksOf(r)[0]).toEqual(whole.slice(0, 19));
	});

	test("truncated: a chunk length of 0xFFFFFFFF reads to the end of the file", () => {
		const r = readSmf(smf({ tracks: [{ events: notes(3), length: 0xffffffff }] }));
		expect(codes(r)).toEqual(["truncated"]);
		expect(tracksOf(r)[0]?.length).toBe(7);
	});

	test("truncated: the file ends inside a chunk header", () => {
		const r = readSmf(smf({ tracks: [notes(1), notes(1)], cut: 2 + 12 }));
		expect(codes(r)).toEqual(["truncated", "track-count"]);
		expect(tracksOf(r).length).toBe(1);
		expect(r.diagnostics[0]?.track).toBeUndefined();
	});

	test("truncated: bytes after the last track name no track", () => {
		const r = readSmf(Uint8Array.from([...smf({ tracks: [notes(1)] }), 0, 0, 0]));
		expect(r.diagnostics).toEqual([expect.objectContaining({ code: "truncated" })]);
		expect(r.diagnostics[0]?.track).toBeUndefined();
		expect(tracksOf(r).length).toBe(1);
	});

	test("track-count: the header says 3, the file has 2", () => {
		const r = readSmf(smf({ ntracks: 3, tracks: [notes(1), notes(2)] }));
		expect(r.diagnostics).toEqual([
			expect.objectContaining({ severity: "warning", code: "track-count" }),
		]);
		expect(tracksOf(r).map((t) => t.length)).toEqual([3, 5]);
	});

	test("track-count: the header says 1, the file has 2", () => {
		expect(codes(readSmf(smf({ ntracks: 1, tracks: [notes(1), notes(1)] })))).toEqual([
			"track-count",
		]);
	});

	/** Track 1 of these bytes, then a good track 2: the bad event ends track 1 only. */
	function badTrack(bytes: number[]) {
		const r = readSmf(smf({ ntracks: 2, tracks: [mtrk(bytes), notes(1)] }));
		expect(r.diagnostics).toEqual([
			expect.objectContaining({ severity: "warning", code: "bad-event", track: 1 }),
		]);
		expect(tracksOf(r)[1]?.length).toBe(3);
		return tracksOf(r)[0];
	}

	test("bad-event: a five-byte VLQ", () => {
		expect(badTrack([0x00, 0x90, 60, 80, 0x81, 0x80, 0x80, 0x80, 0x00, 0x80, 60, 0])).toEqual([
			on(0, 60),
		] as SmfEvent[]);
		// Four bytes is the most, and is read.
		const four = readSmf(
			smf({ tracks: [mtrk([0x00, 0x90, 60, 80, 0x81, 0x80, 0x80, 0x00, 0x80, 60, 0])] }),
		);
		expect(four.diagnostics).toEqual([]);
		expect(tracksOf(four)[0]?.[1]).toEqual(off(0x200000, 60, 0) as SmfEvent);
	});

	test("bad-event: a five-byte VLQ as a meta event's length", () => {
		expect(badTrack([0x00, 0x90, 60, 80, 0x00, 0xff, 0x01, 0x81, 0x80, 0x80, 0x80, 0x00])).toEqual([
			on(0, 60),
		] as SmfEvent[]);
	});

	test("bad-event: a data byte with no status", () => {
		expect(badTrack([0x00, 0x3c, 0x40, 0x00, 0x90, 60, 80])).toEqual([]);
	});

	test("bad-event: F4, and every status byte from F1 to FE but F7", () => {
		expect(badTrack([0x00, 0x90, 60, 80, 0x00, 0xf4, 0x00, 0x80, 60, 0])).toEqual([
			on(0, 60),
		] as SmfEvent[]);
		for (let status = 0xf1; status <= 0xfe; status++) {
			if (status === 0xf7) continue;
			expect(codes(readSmf(smf({ tracks: [mtrk([0x00, status, 0x00, 0x00])] })))).toEqual([
				"bad-event",
			]);
		}
	});

	test("bad-event: a status byte where a data byte belongs", () => {
		expect(badTrack([0x00, 0x90, 60, 80, 0x00, 0x90, 0x90, 0x40])).toEqual([
			on(0, 60),
		] as SmfEvent[]);
	});

	test("bad-event: an event that runs past the end of its chunk", () => {
		expect(badTrack([0x00, 0x90, 60, 80, 0x00, 0xff, 0x03, 0x10, 0x41])).toEqual([
			on(0, 60),
		] as SmfEvent[]);
		expect(badTrack([0x00, 0x90, 60, 80, 0x00, 0x90, 62])).toEqual([on(0, 60)] as SmfEvent[]);
	});

	test("a sysex longer than its chunk is a bad event, read without its bytes", () => {
		expect(badTrack([0x00, 0x90, 60, 80, 0x00, 0xf0, 0x85, 0x80, 0x80, 0x00, 0x01])).toEqual([
			on(0, 60),
		] as SmfEvent[]);
	});

	test("unknown-chunk: info, once, and the tracks around it read", () => {
		const r = readSmf(
			smf({
				ntracks: 2,
				tracks: [notes(1), { id: "XFIH", bytes: [1, 2, 3] }, { id: "MTrc", bytes: [] }, notes(1)],
			}),
		);
		expect(r.diagnostics).toEqual([
			expect.objectContaining({ severity: "info", code: "unknown-chunk" }),
		]);
		expect(tracksOf(r).map((t) => t.length)).toEqual([3, 3]);
	});

	test("truncated: a header longer than the file", () => {
		const r = readSmf(Uint8Array.from([...ascii("MThd"), 0, 0, 0, 100, 0, 1, 0, 0, 1, 0xe0, 7, 7]));
		expect(codes(r)).toEqual(["truncated"]);
		expect(r.smf).toEqual({ format: 1, ppq: 480, tracks: [] });
	});

	test("extra header bytes are skipped", () => {
		const bytes = smf({ tracks: [notes(1)] });
		const longer = Uint8Array.from([
			...bytes.slice(0, 7),
			8,
			...bytes.slice(8, 14),
			0xaa,
			0xbb,
			...bytes.slice(14),
		]);
		const r = readSmf(longer);
		expect(r.diagnostics).toEqual([]);
		expect(tracksOf(r)[0]?.length).toBe(3);
	});
});

describe("readSmf: meta-invalid", () => {
	/** A file of one track: a good tempo, then `event`. */
	function invalid(event: Event, valid: boolean) {
		const r = readSmf(smf({ tracks: [[{ dt: 0, tempo: 120 }, event]] }));
		const track = tracksOf(r)[0] ?? [];
		if (valid) {
			expect(r.diagnostics).toEqual([]);
			expect(track.length).toBe(3);
		} else {
			expect(r.diagnostics).toEqual([
				expect.objectContaining({ severity: "warning", code: "meta-invalid", track: 1 }),
			]);
			expect(track.map((e) => (e.kind === "meta" ? e.type : e.kind))).toEqual([0x51, 0x2f]);
		}
	}

	test("a tempo of 0", () => {
		invalid({ dt: 0, meta: [0x51, [0, 0, 0]] }, false);
		invalid({ dt: 0, meta: [0x51, [0, 0, 1]] }, true);
		invalid({ dt: 0, meta: [0x51, [0x07, 0xa1]] }, false);
	});

	test("a time signature of 7/32, or 7/1, or 0/4", () => {
		invalid({ dt: 0, time: [7, 32] }, false);
		invalid({ dt: 0, time: [7, 1] }, false);
		invalid({ dt: 0, time: [0, 4] }, false);
		invalid({ dt: 0, meta: [0x58, [4]] }, false);
		for (const d of [2, 4, 8, 16]) invalid({ dt: 0, time: [7, d] }, true);
		invalid({ dt: 0, meta: [0x58, [6, 3]] }, true);
	});

	test("a key signature of 9 sharps, or a mode of 2", () => {
		invalid({ dt: 0, key: [9, 0] }, false);
		invalid({ dt: 0, key: [-8, 0] }, false);
		invalid({ dt: 0, key: [0, 2] }, false);
		invalid({ dt: 0, meta: [0x59, [0]] }, false);
		for (const sf of [-7, 0, 7]) for (const mi of [0, 1]) invalid({ dt: 0, key: [sf, mi] }, true);
	});

	test("each distinct problem on a track, counted", () => {
		const r = readSmf(
			smf({
				tracks: [
					[
						{ dt: 0, meta: [0x51, [0, 0, 0]] },
						{ dt: 0, meta: [0x58, [7, 5, 24, 8]] },
						{ dt: 0, key: [9, 0] },
						{ dt: 0, key: [10, 0] },
						{ dt: 0, meta: [0x58, [0, 2, 24, 8]] },
					],
				],
			}),
		);
		expect(r.diagnostics.map((d) => [d.code, d.track])).toEqual([
			["meta-invalid", 1],
			["meta-invalid", 1],
			["meta-invalid", 1],
		]);
		const [tempo, time, key] = r.diagnostics.map((d) => d.message);
		expect(tempo).toContain("tempo");
		expect(time).toContain("time signature");
		expect(time).toContain("(2 times)");
		expect(key).toContain("key signature");
		expect(key).toContain("(2 times)");
	});

	test("reported once a track", () => {
		const r = readSmf(
			smf({
				tracks: [
					[
						{ dt: 0, key: [9, 0] },
						{ dt: 0, key: [10, 0] },
					],
					[{ dt: 0, key: [9, 0] }],
				],
			}),
		);
		expect(r.diagnostics.map((d) => [d.code, d.track])).toEqual([
			["meta-invalid", 1],
			["meta-invalid", 2],
		]);
	});
});

describe("text", () => {
	test("UTF-8", () => {
		expect(decodeText(new TextEncoder().encode("Café"))).toBe("Café");
	});

	test("windows-1252 when the bytes aren't UTF-8", () => {
		expect(decodeText(Uint8Array.from([0x43, 0x61, 0x66, 0xe9]))).toBe("Café");
		// 0x80-0x9F are windows-1252's quotes, dashes and euro, as Windows DAWs write them
		expect(decodeText(Uint8Array.from([0x64, 0x6f, 0x6e, 0x92, 0x74]))).toBe("don’t");
		expect(decodeText(Uint8Array.from([0x93, 0x41, 0x94, 0x96, 0x80, 0x85]))).toBe("“A”–€…");
	});

	test("control characters removed", () => {
		expect(decodeText(new TextEncoder().encode("a\u0007b"))).toBe("ab");
		expect(decodeText(new TextEncoder().encode("\u001b[31mred\u007f\u0085x"))).toBe("[31mredx");
		// 0x81 has no windows-1252 character: it decodes as the C1 control U+0081, removed
		expect(decodeText(Uint8Array.from([0x61, 0x81, 0x62, 0xe9]))).toBe("abé");
	});

	test("a newline or a tab is a space before the other control characters go", () => {
		expect(decodeText(new TextEncoder().encode("Intro\n| C |"))).toBe("Intro | C |");
		expect(decodeText(new TextEncoder().encode("a\tb\r\nc\u000bd\u000ce"))).toBe("a b  c d e");
	});

	test("separators, bidi controls and zero-width spaces removed", () => {
		const hidden = [0x2028, 0x2029, 0x202a, 0x202e, 0x2066, 0x2069, 0x200b]
			.map((c) => `x${String.fromCharCode(c)}`)
			.join("");
		expect(decodeText(new TextEncoder().encode(hidden))).toBe("xxxxxxx");
		// a joiner inside an emoji sequence stays
		const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469);
		expect(decodeText(new TextEncoder().encode(family))).toBe(family);
	});

	test("cut at 200 characters with …", () => {
		const long = decodeText(new TextEncoder().encode("x".repeat(300)));
		expect(long).toBe(`${"x".repeat(199)}…`);
		expect(decodeText(new TextEncoder().encode("x".repeat(200)))).toBe("x".repeat(200));
		expect(decodeText(new TextEncoder().encode("😀".repeat(201)))).toBe(`${"😀".repeat(199)}…`);
		// 200 code points in 400 code units: kept whole
		expect(decodeText(new TextEncoder().encode("😀".repeat(200)))).toBe("😀".repeat(200));
		// the cut counts what is left after control characters go
		expect(decodeText(new TextEncoder().encode(`${"\u0007".repeat(50)}${"x".repeat(200)}`))).toBe(
			"x".repeat(200),
		);
	});

	test("the cut never splits a character from its combining marks", () => {
		const accent = String.fromCharCode(0x0301);
		// code points 199 and 200 are an e and its accent: both go
		const text = `${"x".repeat(198)}e${accent}${"y".repeat(10)}`;
		expect(decodeText(new TextEncoder().encode(text))).toBe(`${"x".repeat(198)}…`);
		// a flag is two code points, one character
		const flag = String.fromCodePoint(0x1f1eb, 0x1f1f7);
		const flags = decodeText(new TextEncoder().encode(`x${flag.repeat(150)}`));
		expect(flags).toBe(`x${flag.repeat(99)}…`);
	});

	test("track names", () => {
		const r = readSmf(
			smf({
				tracks: [
					[
						{ dt: 0, name: "Café" },
						{ dt: 0, name: "second" },
					],
					[{ dt: 0, meta: [0x03, [0x43, 0x61, 0x66, 0xe9]] }],
					[{ dt: 0, name: "a\u0007b" }],
					[{ dt: 0, name: "y".repeat(300) }],
					[{ dt: 0, text: "not a name" }],
				],
			}),
		);
		expect(r.names).toEqual(["Café", "Café", "ab", `${"y".repeat(199)}…`, null]);
		// The event keeps its bytes.
		expect(metas(tracksOf(r)[1] ?? [], 0x03)).toEqual([[0x43, 0x61, 0x66, 0xe9]]);
	});
});

/** midi-file's event, its fields by name. */
type Loose = Record<string, number>;
const TEXT_TYPES: Record<string, number> = {
	text: 1,
	copyrightNotice: 2,
	trackName: 3,
	lyrics: 5,
	marker: 6,
};
const metaOf = (type: number, data: number[]) => ({ kind: "meta", type, data });
/** midi-file's events of the kinds the reader keeps, in ours' shape (but the tick). */
const THEIRS: Record<string, (e: Loose) => object> = {
	noteOn: (e) => ({ kind: "on", channel: e.channel, pitch: e.noteNumber, velocity: e.velocity }),
	noteOff: (e) => ({ kind: "off", channel: e.channel, pitch: e.noteNumber, velocity: e.velocity }),
	programChange: (e) => ({ kind: "program", channel: e.channel, program: e.programNumber }),
	controller: (e) => ({
		kind: "control",
		channel: e.channel,
		control: e.controllerType,
		value: e.value,
	}),
	setTempo: ({ microsecondsPerBeat: m = 0 }) =>
		metaOf(0x51, [(m >> 16) & 0xff, (m >> 8) & 0xff, m & 0xff]),
	timeSignature: (e) =>
		metaOf(0x58, [
			e.numerator ?? 0,
			Math.log2(e.denominator ?? 0),
			e.metronome ?? 0,
			e.thirtyseconds ?? 0,
		]),
	keySignature: ({ key = 0, scale = 0 }) => metaOf(0x59, [key & 0xff, scale]),
	endOfTrack: () => metaOf(0x2f, []),
};
/** midi-file decodes text byte by byte: its string's char codes are the bytes. */
const latin1 = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

function as(e: MidiEvent, tick: number): object[] {
	const type = TEXT_TYPES[e.type];
	if (type !== undefined) return [{ tick, ...metaOf(type, latin1((e as { text: string }).text)) }];
	const f = THEIRS[e.type];
	return f ? [{ tick, ...f(e as unknown as Loose) }] : [];
}

/** midi-file's events as ours: the kinds the reader keeps, in order, at absolute ticks. */
function theirs(bytes: Uint8Array): object[][] {
	return parseMidi(bytes).tracks.map((track) => {
		let tick = 0;
		return track.flatMap((e) => {
			tick += e.deltaTime;
			return as(e, tick);
		});
	});
}
const ours = (bytes: Uint8Array) =>
	(readSmf(bytes).smf?.tracks ?? []).map((track) =>
		track.map((e) => (e.kind === "meta" ? { ...e, data: Array.from(e.data) } : e)),
	);

describe("agrees with midi-file", () => {
	test("the helper writes what midi-file reads", () => {
		const bytes = smf({
			running: true,
			tracks: [
				[
					{ dt: 0, name: "Café" },
					{ dt: 0, tempo: 90 },
					{ dt: 0, time: [6, 8] },
					{ dt: 0, key: [-3, 1] },
					{ dt: 0, program: [1, 5] },
					{ dt: 0, on: [1, 60, 80] },
					{ dt: 0, on: [1, 64, 80] },
					{ dt: 0, lyric: "la" },
					{ dt: 200_000, off: [1, 60] },
					{ dt: 0, raw: [0x91, 64, 0] },
					{ dt: 0, control: [1, 64, 0] },
					{ dt: 0, marker: "B" },
				],
			],
		});
		expect(theirs(bytes)).toEqual([
			[
				{ tick: 0, kind: "meta", type: 3, data: [0x43, 0x61, 0x66, 0xc3, 0xa9] },
				{ tick: 0, kind: "meta", type: 0x51, data: [0x0a, 0x2c, 0x2b] },
				{ tick: 0, kind: "meta", type: 0x58, data: [6, 3, 24, 8] },
				{ tick: 0, kind: "meta", type: 0x59, data: [0xfd, 1] },
				{ tick: 0, kind: "program", channel: 1, program: 5 },
				{ tick: 0, kind: "on", channel: 1, pitch: 60, velocity: 80 },
				{ tick: 0, kind: "on", channel: 1, pitch: 64, velocity: 80 },
				{ tick: 0, kind: "meta", type: 5, data: [0x6c, 0x61] },
				{ tick: 200_000, kind: "off", channel: 1, pitch: 60, velocity: 64 },
				{ tick: 200_000, kind: "off", channel: 1, pitch: 64, velocity: 0 },
				{ tick: 200_000, kind: "control", channel: 1, control: 64, value: 0 },
				{ tick: 200_000, kind: "meta", type: 6, data: [0x42] },
				{ tick: 200_000, kind: "meta", type: 0x2f, data: [] },
			],
		]);
		expect(ours(bytes)).toEqual(theirs(bytes) as never);
	});

	test("every exported chart reads as midi-file reads it", () => {
		expect(CHARTS.length).toBeGreaterThan(200);
		for (const [name, text] of CHARTS) {
			const r = exportMidi(text);
			if (!r.ok) continue;
			const read = readSmf(r.bytes);
			expect({ name, diagnostics: read.diagnostics }).toEqual({ name, diagnostics: [] });
			expect({ name, events: ours(r.bytes) }).toEqual({ name, events: theirs(r.bytes) as never });
		}
	});

	test("every MuseScore fixture reads as midi-file reads it", () => {
		const dir = join(import.meta.dir, "fixtures");
		const files = existsSync(dir)
			? readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".mid"))
			: [];
		for (const file of files) {
			const bytes = new Uint8Array(readFileSync(join(dir, file)));
			expect({ file, events: ours(bytes) }).toEqual({ file, events: theirs(bytes) as never });
		}
	});
});
