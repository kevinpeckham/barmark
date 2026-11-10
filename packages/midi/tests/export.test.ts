import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChart } from "barmark";
import { type MidiEvent, parseMidi } from "midi-file";
import { midiOf } from "../src/export/index.js";
import { exportMidi, type MidiExportResult, VERSION } from "../src/index.js";
import type { SmfEvent } from "../src/smf/types.js";
import { ordered } from "../src/smf/write.js";
import { CHARTS } from "./helpers/charts.js";
import { chartByBeat, heardByBeat } from "./helpers/player.js";

const MORNING_SONG = readFileSync(
	new URL("../../../examples/morning-song.chart.md", import.meta.url),
	"utf8",
);

const bytesOf = (r: MidiExportResult) => {
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
	return r.bytes;
};
const lossesOf = (r: MidiExportResult) => (r.ok ? r.losses.map((l) => l.code) : []);

/** Each track's events from midi-file, at absolute ticks. */
function read(bytes: Uint8Array) {
	const midi = parseMidi(bytes);
	return {
		header: midi.header,
		tracks: midi.tracks.map((track) => {
			let tick = 0;
			return track.map(({ deltaTime, ...e }) => {
				tick += deltaTime;
				return { tick, ...e } as { tick: number } & MidiEvent;
			});
		}),
	};
}
const read1 = (text: string, options = {}) => read(bytesOf(exportMidi(text, options)));
const named = (track: ({ tick: number } & MidiEvent)[]) =>
	track.find((e) => e.type === "trackName")?.text;
const channelsOf = (track: ({ tick: number } & MidiEvent)[]) =>
	new Set(track.flatMap((e) => ("channel" in e ? [e.channel] : [])));

describe("exportMidi", () => {
	test("the version is the package's", () => {
		const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"));
		expect(VERSION).toBe(pkg.version);
	});

	test("a chart with errors writes nothing", () => {
		const r = exportMidi("| C |x|");
		expect(r.ok).toBe(false);
		expect(r).not.toHaveProperty("bytes");
		expect(r.diagnostics).toEqual(parseChart("| C |x|").diagnostics);
		expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
	});

	test("no bars, or an unknown part", () => {
		const empty = exportMidi("# Song\n");
		expect(empty.ok).toBe(false);
		expect(empty.diagnostics[0]).toMatchObject({
			line: 0,
			severity: "error",
			message: "the chart has no bars to export",
		});
		const nope = exportMidi(MORNING_SONG, { part: "Nope" });
		expect(nope.ok).toBe(false);
		expect(nope.diagnostics[0]).toMatchObject({
			line: 0,
			severity: "error",
			message: "no part labelled Nope",
		});
		expect(nope.diagnostics.slice(1)).toEqual(parseChart(MORNING_SONG).diagnostics);
		const gtr = read1(MORNING_SONG, { part: "gtr" });
		expect(gtr.tracks.map(named)).toEqual(["Morning Song", "Electric Guitar 1"]);
	});

	test("the conductor track", () => {
		const { tracks } = read1("# Song\nkey: D, time: 3/4, tempo: 90\n| D | G |");
		const [conductor, chart] = tracks;
		expect(named(conductor ?? [])).toBe("Song");
		expect(conductor?.find((e) => e.type === "setTempo")).toMatchObject({
			tick: 0,
			microsecondsPerBeat: 666_667,
		});
		expect(conductor?.find((e) => e.type === "timeSignature")).toMatchObject({
			tick: 0,
			numerator: 3,
			denominator: 4,
			metronome: 24,
			thirtyseconds: 8,
		});
		expect(conductor?.find((e) => e.type === "keySignature")).toMatchObject({
			tick: 0,
			key: 2,
			scale: 0,
		});
		expect(conductor?.some((e) => e.type === "noteOn")).toBe(false);
		expect(tracks).toHaveLength(2);
		expect(named(chart ?? [])).toBe("Chart");
		// Every track ends at the chart's end: two bars of 3/4.
		for (const t of tracks)
			expect(t.at(-1)).toMatchObject({ type: "endOfTrack", tick: 2 * 3 * 480 });
	});

	test("credits, markers, meter changes and clicks", () => {
		const { tracks } = read1(
			"# Song\ncomposer: Ann\nlyricist: Bo\ncopyright: © 2026 Ann\ntime: 6/8\n## Verse\n| C | [2/4] G |\n## Chorus\n| D |",
		);
		const conductor = tracks[0] ?? [];
		expect(conductor.filter((e) => e.type === "copyrightNotice").map((e) => e.text)).toEqual([
			Buffer.from("© 2026 Ann", "utf8").toString("latin1"),
		]);
		expect(conductor.filter((e) => e.type === "text").map((e) => e.text)).toEqual([
			"Composer: Ann",
			"Lyricist: Bo",
		]);
		expect(conductor.filter((e) => e.type === "marker").map((e) => [e.tick, e.text])).toEqual([
			[0, "Verse"],
			[1440 + 960, "Chorus"],
		]);
		expect(
			conductor
				.filter((e) => e.type === "timeSignature")
				.map((e) => [e.tick, e.numerator, e.denominator, e.metronome]),
		).toEqual([
			[0, 6, 8, 36],
			[1440, 2, 4, 24],
			[1440 + 960, 6, 8, 36],
		]);
	});

	test("a key beyond seven sharps or flats is written as its enharmonic", () => {
		const key = (text: string) => read1(text).tracks[0]?.find((e) => e.type === "keySignature");
		expect(key("key: B#\n| C |")).toMatchObject({ key: 0, scale: 0 });
		// Cb locrian is Dbb major's twelve flats, C major's none; Fb locrian's thirteen are Bb's one.
		expect(key("key: Cb locrian\n| C |")).toMatchObject({ key: 0, scale: 0 });
		expect(key("key: Fb locrian\n| C |")).toMatchObject({ key: -1, scale: 0 });
		expect(key("key: Fb\n| C |")).toMatchObject({ key: 4, scale: 0 });
		expect(key("key: Ebm\n| C |")).toMatchObject({ key: -6, scale: 1 });
	});

	test("division", () => {
		expect(read1("| C D E F |").header.ticksPerBeat).toBe(480);
		expect(read1("| C_D_E_F_G_A_B |").header.ticksPerBeat).toBe(3360);
		// Sevenths, elevenths and thirteenths of a slot need 480 × 1001 ticks a quarter.
		const fine = "| C_D_E_F_G_A_B C_D_E_F_G_A_B_C_D_E_F C_D_E_F_G_A_B_C_D_E_F_G_A |";
		const r = exportMidi(fine);
		expect(read(bytesOf(r)).header.ticksPerBeat).toBe(480);
		expect(r.ok && r.losses).toEqual([
			expect.objectContaining({ code: "tempo-assumed" }),
			{
				code: "ticks-rounded",
				message:
					"a rhythm needs more ticks a quarter than the file can have (32,640, fewer in a long chart): it plays at 480, rounded to the nearest tick",
				bar: 1,
				written: 1,
			},
		]);
		expect(heardByBeat(bytesOf(r))).toEqual(chartByBeat(parseChart(fine)));
	});

	test("ticks stay within what SMF can hold", () => {
		// A long chart of sevenths can't have 3,360 ticks a quarter: 480, rounded.
		const long = `time: 32/2, tempo: 60\n|: C_D_E_F_G_A_B :| x 2000\n`;
		const r = exportMidi(long);
		expect(read(bytesOf(r)).header.ticksPerBeat).toBe(480);
		expect(lossesOf(r)).toContain("ticks-rounded");
		// One too long for any division is refused.
		const tooLong = exportMidi(`time: 32/2, tempo: 60\n|: C :| x 9000\n`);
		expect(tooLong.ok).toBe(false);
		expect(tooLong.diagnostics[0]).toMatchObject({
			line: 0,
			severity: "error",
			message: "the chart is too long for a MIDI file to hold",
		});
	});

	test("a tempo MIDI can't hold is clamped, with a loss", () => {
		const r = exportMidi("tempo: 2\n| C |");
		expect(read(bytesOf(r)).tracks[0]?.find((e) => e.type === "setTempo")).toMatchObject({
			microsecondsPerBeat: 0xffffff,
		});
		expect(r.ok && r.losses).toEqual([
			{ code: "tempo-range", message: expect.any(String), bar: 1, written: 1 },
		]);
	});

	test("a pitch beyond MIDI's range is folded by octaves", () => {
		// Each note the next above the one before, from C4: the last, A##, would be 131.
		const set = "C E G B D F A Cb Eb Gb Bb Db Fb Ab C## E## G## B## D## F## A##";
		const { tracks } = read1(`| {${set}} |`);
		const pitches = (tracks[1] ?? []).flatMap((e) => (e.type === "noteOn" ? [e.noteNumber] : []));
		expect(pitches.sort((a, b) => a - b)).toEqual([
			60, 64, 67, 71, 74, 77, 81, 83, 87, 90, 94, 97, 100, 104, 110, 114, 117, 119, 121, 124, 127,
		]);
	});

	test("channels skip 10", () => {
		const labels = ["A", "B", "C", "D", "E", "F"];
		const big = [
			...labels.map((l) => `part: ${l} = Piano`),
			"",
			...labels.flatMap((l) => [1, 2, 3, 4].map((n) => `${l}.L${n} | {C${n}} |`)),
		].join("\n");
		const r = exportMidi(big);
		const { tracks } = read(bytesOf(r));
		expect(tracks).toHaveLength(25);
		const used = new Set(tracks.flatMap((t) => [...channelsOf(t)]));
		expect(used.has(9)).toBe(false);
		// A part's lines share their part's channel.
		expect(tracks.slice(1).map((t) => [...channelsOf(t)])).toEqual(
			[0, 1, 2, 3, 4, 5].flatMap((c) => [[c], [c], [c], [c]]),
		);
		expect(lossesOf(r).filter((c) => c === "channels-shared")).toHaveLength(1);

		const fifteen = [
			...Array.from({ length: 15 }, (_, i) => `part: P${i} = Piano`),
			"",
			...Array.from({ length: 15 }, (_, i) => `P${i} | C |`),
		].join("\n");
		const each = exportMidi(fifteen);
		expect(
			read(bytesOf(each))
				.tracks.slice(1)
				.map((t) => [...channelsOf(t)]),
		).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15].map((c) => [c]));
		expect(lossesOf(each)).not.toContain("channels-shared");
	});

	test("channels group by part label, not name", () => {
		// Four parts named alike, four lines each: sixteen tracks on four channels, not one.
		const labels = ["G1", "G2", "G3", "G4"];
		const text = [
			...labels.map((l) => `part: ${l} = Guitar`),
			"",
			...labels.flatMap((l) => [1, 2, 3, 4].map((n) => `${l}.L${n} | {C${n + 1}} |`)),
		].join("\n");
		const { tracks } = read1(text);
		expect(tracks.slice(1).map((t) => [...channelsOf(t)])).toEqual(
			[0, 1, 2, 3].flatMap((c) => [[c], [c], [c], [c]]),
		);
	});

	test("programs at tick 0", () => {
		const programs = (text: string) =>
			read1(text)
				.tracks.slice(1)
				.map((t) => {
					const p = t.find((e) => e.type === "programChange");
					return p && [p.tick, p.programNumber];
				});
		expect(programs(MORNING_SONG)).toEqual([
			[0, 0],
			[0, 0],
		]);
		expect(
			programs(
				"part: Tp = Trumpet, instrument: trumpet in Bb\npart: Bs = Bass, instrument: electric bass\nTp | {C4} G |\nBs | C |",
			),
		).toEqual([
			[0, 56],
			[0, 0],
			[0, 33],
		]);
	});

	test("the title option", () => {
		expect(named(read1("| C |", { title: "x" }).tracks[0] ?? [])).toBe("x");
		expect(named(read1("# Own\n| C |", { title: "x" }).tracks[0] ?? [])).toBe("Own");
		expect(named(read1("| C |").tracks[0] ?? [])).toBeUndefined();
	});

	test("the player hears holds, pushes, silence and bass instruments", () => {
		// D pushed onto beat 2 from the dotted half before it; N.C. and -- silent; G held. A bass sounds only its root.
		const text =
			"part: P = Piano\npart: B = Bass, instrument: electric bass\ntime: 3/4\nP | C <D | N.C. G / |\nB | C | -- G / |";
		const expected = ["0 4 7", "0 2 6 9", "0 2 6 9", "", "2 7 11", "2 7 11"];
		expect(parseChart(text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(chartByBeat(parseChart(text))).toEqual(expected);
		expect(heardByBeat(bytesOf(exportMidi(text)))).toEqual(expected);
	});

	test("the file plays the chart", () => {
		expect(CHARTS.length).toBeGreaterThan(200);
		for (const [name, text] of CHARTS) {
			const heard = heardByBeat(bytesOf(exportMidi(text)));
			const written = chartByBeat(parseChart(text));
			if (JSON.stringify(heard) !== JSON.stringify(written))
				expect({ name, heard }).toEqual({ name, heard: written });
		}
	});

	test("our files read the same in midi-file", () => {
		for (const [name, text] of CHARTS) {
			const midi = midiOf(text);
			if (!midi.ok) throw new Error(name);
			const ours = midi.smf.tracks.map((t) => ordered(t).map(ourEvent));
			const theirs = read(bytesOf(exportMidi(text))).tracks.map((t) => t.map(theirEvent));
			if (JSON.stringify(ours) !== JSON.stringify(theirs))
				expect({ name, theirs }).toEqual({ name, theirs: ours });
		}
	});
});

/** Each event type's fields, in the order compared; text events' text is decoded as UTF-8. */
type Read = { tick: number } & MidiEvent;
/** A track's events of some types, as `[tick, …fields]`. */
const pick = (track: Read[] | undefined, type: string, ...fields: string[]) =>
	(track ?? [])
		.filter((e) => e.type === type)
		.map((e) => [e.tick, ...fields.map((f) => (e as unknown as Record<string, unknown>)[f])]);

describe("exportMidi: what the file carries", () => {
	// Two bars: a pressed pedal, a sung note set, words, an accent and a hit; then a new key and tempo, the pedal lifted.
	const FIGURES =
		'# Song\nkey: G, tempo: 100\n| +{G4}:Hel- {A4}:lo "solo" >C ^D |\nkey: D, tempo: 80\n| *G |\n';

	test("a second tempo and a second key", () => {
		const conductor = read1(FIGURES).tracks[0];
		expect(pick(conductor, "setTempo", "microsecondsPerBeat")).toEqual([
			[0, 600_000],
			[1920, 750_000],
		]);
		expect(pick(conductor, "keySignature", "key", "scale")).toEqual([
			[0, 1, 0],
			[1920, 2, 0],
		]);
	});

	test("pedal, lyrics, words and velocities", () => {
		const chart = read1(FIGURES).tracks[1];
		expect(pick(chart, "controller", "channel", "controllerType", "value")).toEqual([
			[0, 0, 64, 127],
			[1920, 0, 64, 0],
		]);
		expect(pick(chart, "lyrics", "text")).toEqual([
			[0, "Hel"],
			[480, "lo "],
		]);
		expect(pick(chart, "text", "text")).toEqual([[960, "solo"]]);
		const velocities = pick(chart, "noteOn", "velocity").map(([tick, v]) => `${tick}:${v}`);
		expect([...new Set(velocities)]).toEqual(["0:80", "480:80", "960:100", "1440:112", "1920:80"]);
	});

	test("a one-bar meter plays at the time: meter's tempo (grammar 2.4)", () => {
		// 60 dotted quarters a minute is 90 quarters: 666,667 µs a quarter, the [2/8] pickup and the [3/4] bar included.
		for (const text of [
			"time: 6/8, tempo: 60\n| [2/8] E7 | Am | Dm |",
			"time: 6/8, tempo: 60\n| Am | [3/4] E7 | Am |",
		]) {
			const r = exportMidi(text);
			expect(pick(read(bytesOf(r)).tracks[0], "setTempo", "microsecondsPerBeat")).toEqual([
				[0, 666_667],
			]);
			expect(heardByBeat(bytesOf(r))).toEqual(chartByBeat(parseChart(text)));
		}
	});

	test("the tempo option", () => {
		const conductor = read1("| C |", { tempo: 90 }).tracks[0];
		expect(pick(conductor, "setTempo", "microsecondsPerBeat")).toEqual([[0, 666_667]]);
	});

	test("a note shorter than a tick still sounds, its off after its on", () => {
		// An eighth-note bar of four slots, the last split 400 ways: notes of 0.15 tick at 480.
		const members = (n: number) => Array.from({ length: n }, (_, i) => "CDEFGAB"[i % 7]).join("_");
		const text = `time: 1/8\n| ${members(7)} ${members(11)} ${members(13)} ${members(400)} |`;
		const r = exportMidi(text);
		const { header, tracks } = read(bytesOf(r));
		expect(header.ticksPerBeat).toBe(480);
		const ons = new Map<string, number[]>();
		let offs = 0;
		for (const e of tracks[1] ?? []) {
			if (e.type !== "noteOn" && e.type !== "noteOff") continue;
			const key = `${e.channel}:${e.noteNumber}`;
			if (e.type === "noteOn") ons.set(key, [...(ons.get(key) ?? []), e.tick]);
			else {
				const on = ons.get(key)?.shift();
				expect(on).toBeDefined();
				expect(e.tick).toBeGreaterThan(on ?? Number.POSITIVE_INFINITY);
				offs++;
			}
		}
		expect(offs).toBeGreaterThan(1500);
	});

	test("ticks round to the nearest", () => {
		// Sevenths of a quarter beside elevenths and thirteenths: 480, so the second member starts at 68.57, tick 69.
		const text = "| C_D_E_F_G_A_B C_D_E_F_G_A_B_C_D_E_F C_D_E_F_G_A_B_C_D_E_F_G_A C |";
		const ticks = [...new Set(pick(read1(text).tracks[1], "noteOn").map(([tick]) => tick))];
		expect(ticks.slice(0, 3)).toEqual([0, 69, 137]);
	});

	test("channels repeat in turn past 15 groups", () => {
		const text = [
			...Array.from({ length: 17 }, (_, i) => `part: P${i} = Piano`),
			"",
			...Array.from({ length: 17 }, (_, i) => `P${i} | C |`),
		].join("\n");
		const r = exportMidi(text);
		expect(
			read(bytesOf(r))
				.tracks.slice(1)
				.map((t) => [...channelsOf(t)]),
		).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 0, 1].map((c) => [c]));
		expect(lossesOf(r)).toContain("channels-shared");
	});
});

const FIELDS: Record<string, string[]> = {
	noteOn: ["channel", "noteNumber", "velocity"],
	noteOff: ["channel", "noteNumber", "velocity"],
	programChange: ["channel", "programNumber"],
	controller: ["channel", "controllerType", "value"],
	setTempo: ["microsecondsPerBeat"],
	timeSignature: ["numerator", "denominator", "metronome", "thirtyseconds"],
	keySignature: ["key", "scale"],
};
const TEXTS: Record<number, string> = {
	1: "text",
	2: "copyrightNotice",
	3: "trackName",
	5: "lyrics",
	6: "marker",
};
const utf8 = (text: string) => Buffer.from(text, "latin1").toString("utf8");

/** One of midi-file's events as a line of text: its tick, type and fields. */
function theirEvent(e: { tick: number } & MidiEvent): string {
	const fields = e as unknown as Record<string, number | string>;
	const values = "text" in e ? [utf8(e.text)] : (FIELDS[e.type] ?? []).map((f) => fields[f]);
	return [e.tick, e.type, ...values].join(" ");
}

/** A meta event's data as midi-file reads it: text, tempo, time or key signature, end of track. */
function metaFields(type: number, data: Uint8Array): (string | number)[] {
	const text = TEXTS[type];
	if (text) return [text, Buffer.from(data).toString("utf8")];
	const [a = 0, b = 0, c = 0, d = 0] = data;
	const shapes: Record<number, (string | number)[]> = {
		81: ["setTempo", (a << 16) | (b << 8) | c],
		88: ["timeSignature", a, 2 ** b, c, d],
		89: ["keySignature", (a << 24) >> 24, b],
		47: ["endOfTrack"],
	};
	return shapes[type] ?? [`meta ${type}`];
}

/** One of our events as a line of text, as `theirEvent` writes midi-file's. */
function ourEvent(e: SmfEvent): string {
	const fields: Record<SmfEvent["kind"], () => (string | number)[]> = {
		on: () => (e.kind === "on" ? ["noteOn", e.channel, e.pitch, e.velocity] : []),
		off: () => (e.kind === "off" ? ["noteOff", e.channel, e.pitch, e.velocity] : []),
		program: () => (e.kind === "program" ? ["programChange", e.channel, e.program] : []),
		control: () => (e.kind === "control" ? ["controller", e.channel, e.control, e.value] : []),
		meta: () => (e.kind === "meta" ? metaFields(e.type, e.data) : []),
	};
	return [e.tick, ...fields[e.kind]()].join(" ");
}
