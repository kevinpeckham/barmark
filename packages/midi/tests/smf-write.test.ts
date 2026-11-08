import { describe, expect, test } from "bun:test";
import { parseMidi } from "midi-file";
import type { Smf, SmfEvent } from "../src/smf/types.js";
import { writeVlq } from "../src/smf/vlq.js";
import { keyMeta, metaText, tempoMeta, timeMeta, writeSmf } from "../src/smf/write.js";

const LYRIC = 0x05;
const MARKER = 0x06;
const on = (tick: number, pitch: number, velocity = 80): SmfEvent => ({
	tick,
	kind: "on",
	channel: 0,
	pitch,
	velocity,
});
const off = (tick: number, pitch: number): SmfEvent => ({
	tick,
	kind: "off",
	channel: 0,
	pitch,
	velocity: 64,
});
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
/** midi-file decodes text byte by byte: its string, read back as UTF-8. */
const utf8 = (text: string) => Buffer.from(text, "latin1").toString("utf8");

/** Each track's events from midi-file, with absolute ticks in place of delta times. */
function readBack(bytes: Uint8Array) {
	const midi = parseMidi(bytes);
	const tracks = midi.tracks.map((track) => {
		let tick = 0;
		return track.map(({ deltaTime, ...event }) => {
			tick += deltaTime;
			return { tick, ...event };
		});
	});
	return { header: midi.header, tracks };
}

describe("VLQ", () => {
	test("VLQ encodes the spec's examples", () => {
		expect(writeVlq(0)).toEqual([0x00]);
		expect(writeVlq(0x40)).toEqual([0x40]);
		expect(writeVlq(0x7f)).toEqual([0x7f]);
		expect(writeVlq(0x80)).toEqual([0x81, 0x00]);
		expect(writeVlq(0x2000)).toEqual([0xc0, 0x00]);
		expect(writeVlq(0x3fff)).toEqual([0xff, 0x7f]);
		expect(writeVlq(0x0fffffff)).toEqual([0xff, 0xff, 0xff, 0x7f]);
	});
});

describe("writeSmf", () => {
	test("one note, byte for byte", () => {
		const bytes = writeSmf({ format: 1, ppq: 480, tracks: [[on(0, 60), off(480, 60)]] });
		const header = ["4d546864", "00000006", "0001", "0001", "01e0"];
		const track = ["4d54726b", "0000000d", "00903c50", "8360803c40", "00ff2f00"];
		expect(hex(bytes)).toBe([...header, ...track].join(""));
	});

	test("same-tick order", () => {
		const bytes = writeSmf({
			format: 1,
			ppq: 480,
			tracks: [[on(0, 60), on(480, 60), metaText(480, LYRIC, "la"), off(480, 60), off(960, 60)]],
		});
		const events = readBack(bytes).tracks[0] ?? [];
		expect(events.map((e) => [e.tick, e.type])).toEqual([
			[0, "noteOn"],
			[480, "noteOff"],
			[480, "lyrics"],
			[480, "noteOn"],
			[960, "noteOff"],
			[960, "endOfTrack"],
		]);
	});

	test("pedal and controllers sit around the meta events", () => {
		const pedal = (tick: number, value: number): SmfEvent => ({
			tick,
			kind: "control",
			channel: 0,
			control: 64,
			value,
		});
		const bytes = writeSmf({
			format: 1,
			ppq: 480,
			tracks: [
				[
					on(0, 60),
					{ tick: 0, kind: "program", channel: 0, program: 0 },
					pedal(0, 127),
					metaText(0, MARKER, "A"),
					pedal(0, 0),
					off(0, 59),
				],
			],
		});
		const events = readBack(bytes).tracks[0] ?? [];
		expect(events.map((e) => ("value" in e ? `${e.type} ${e.value}` : e.type))).toEqual([
			"noteOff",
			"controller 0",
			"marker",
			"controller 127",
			"programChange",
			"noteOn",
			"endOfTrack",
		]);
	});

	test("midi-file reads it back", () => {
		const smf: Smf = {
			format: 1,
			ppq: 960,
			tracks: [
				[
					metaText(0, 0x03, "Song"),
					tempoMeta(0, 90),
					timeMeta(0, { n: 6, d: 8 }, 36),
					keyMeta(0, -3, true),
					metaText(0, MARKER, "Verse"),
					tempoMeta(2880, 120),
				],
				[
					{ tick: 0, kind: "program", channel: 2, program: 33 },
					{ tick: 0, kind: "control", channel: 2, control: 7, value: 100 },
					metaText(0, LYRIC, "Hap"),
					{ tick: 0, kind: "on", channel: 2, pitch: 40, velocity: 90 },
					{ tick: 960, kind: "off", channel: 2, pitch: 40, velocity: 64 },
				],
			],
		};
		const { header, tracks } = readBack(writeSmf(smf));
		expect(header).toEqual({ format: 1, numTracks: 2, ticksPerBeat: 960 });
		expect(tracks).toHaveLength(2);
		expect(tracks[0]).toEqual([
			{ tick: 0, meta: true, type: "trackName", text: "Song" },
			{ tick: 0, meta: true, type: "setTempo", microsecondsPerBeat: 666_667 },
			{
				tick: 0,
				meta: true,
				type: "timeSignature",
				numerator: 6,
				denominator: 8,
				metronome: 36,
				thirtyseconds: 8,
			},
			{ tick: 0, meta: true, type: "keySignature", key: -3, scale: 1 },
			{ tick: 0, meta: true, type: "marker", text: "Verse" },
			{ tick: 2880, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
			{ tick: 2880, meta: true, type: "endOfTrack" },
		]);
		expect(tracks[1]).toEqual([
			{ tick: 0, type: "lyrics", meta: true, text: "Hap" },
			{ tick: 0, type: "programChange", channel: 2, programNumber: 33 },
			{ tick: 0, type: "controller", channel: 2, controllerType: 7, value: 100 },
			{ tick: 0, type: "noteOn", channel: 2, noteNumber: 40, velocity: 90 },
			{ tick: 960, type: "noteOff", channel: 2, noteNumber: 40, velocity: 64 },
			{ tick: 960, meta: true, type: "endOfTrack" },
		]);
	});

	test("an end-of-track already given is kept, once, and written last", () => {
		const end: SmfEvent = { tick: 1920, kind: "meta", type: 0x2f, data: new Uint8Array() };
		const events =
			readBack(writeSmf({ format: 0, ppq: 480, tracks: [[end, on(0, 60), off(480, 60)]] }))
				.tracks[0] ?? [];
		expect(events.map((e) => [e.tick, e.type])).toEqual([
			[0, "noteOn"],
			[480, "noteOff"],
			[1920, "endOfTrack"],
		]);
	});

	test("a long track writes (no argument-list limits)", () => {
		const track = Array.from({ length: 200_000 }, (_, i) =>
			i % 2 ? off(i * 240, 60) : on(i * 240, 60),
		);
		const events = readBack(writeSmf({ format: 0, ppq: 480, tracks: [track] })).tracks[0] ?? [];
		expect(events).toHaveLength(200_001);
		expect(events.at(-1)).toEqual({ tick: 199_999 * 240, meta: true, type: "endOfTrack" });
	});

	test("text is UTF-8", () => {
		const marker = metaText(0, MARKER, "Café ‿");
		expect(marker.kind === "meta" && Array.from(marker.data)).toEqual(
			Array.from(Buffer.from("Café ‿", "utf8")),
		);
		const events = readBack(writeSmf({ format: 1, ppq: 480, tracks: [[marker]] })).tracks[0] ?? [];
		const read = events[0];
		expect(read?.type).toBe("marker");
		expect(read && "text" in read && utf8(read.text)).toBe("Café ‿");
	});
});
