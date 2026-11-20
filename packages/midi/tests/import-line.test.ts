/** Import: a file that is one line of notes imports as that line (the note-line design, sections 3 to 7). */
import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { importWith } from "../src/import/index.js";
import { exportMidi, importMidi, type MidiImportResult } from "../src/index.js";
import { fixtureBytes, fixtureChart, MIDI_FIXTURES } from "./helpers/fixtures.js";
import { type Event, smf } from "./helpers/smf.js";

const PPQ = 480;
const Q = PPQ;
const BAR = 4 * Q;

type At = { tick: number; e: Omit<Event, "dt"> };
const at = (tick: number, e: object): At => ({ tick, e: e as Omit<Event, "dt"> });

/** Events at absolute ticks as a track: by tick, note-offs first at one tick, else in the order given. */
function track(events: At[]): Event[] {
	const rank = (x: At) => ("off" in x.e ? 0 : 1);
	let last = 0;
	return events
		.map((x, i) => ({ ...x, i }))
		.sort((a, b) => a.tick - b.tick || rank(a) - rank(b) || a.i - b.i)
		.map(({ tick, e }) => {
			const dt = tick - last;
			last = tick;
			return { dt, ...e } as Event;
		});
}

/** A note: pitch, start, length, and its track (2 and on) and channel. */
type N = { p: number; at: number; len: number; track?: number; ch?: number };
const n = (p: number, start: number, len: number, more: Partial<N> = {}): N => ({
	p,
	at: start,
	len,
	...more,
});

/** Notes one after another, each `len` long: `[pitch, ...]` from `start`. */
const run = (pitches: number[], start: number, len: number, more: Partial<N> = {}): N[] =>
	pitches.map((p, i) => n(p, start + i * len, len, more));

/**
 * A format 1 file: track 1 the conductor (`meta`, tempo 120 unless it has
 * one), then a track per note track number, from 2; `extra` events go on
 * track 2.
 */
function file(notes: N[], meta: At[] = [], { ppq = PPQ, extra = [] as At[] } = {}): Uint8Array {
	const conductor = meta.some((m) => "tempo" in m.e) ? meta : [at(0, { tempo: 120 }), ...meta];
	const count = Math.max(2, ...notes.map((x) => x.track ?? 2));
	const tracks: At[][] = Array.from({ length: count - 1 }, () => []);
	(tracks[0] as At[]).push(...extra);
	for (const x of notes) {
		const ch = x.ch ?? 0;
		const t = tracks[(x.track ?? 2) - 2] as At[];
		t.push(at(x.at, { on: [ch, x.p, 80] }), at(x.at + x.len, { off: [ch, x.p] }));
	}
	return smf({ format: 1, ppq, tracks: [track(conductor), ...tracks.map(track)] });
}

const codes = (r: MidiImportResult) => r.diagnostics.map((d) => d.code);
const barLines = (text: string) =>
	text
		.split("\n")
		.map((l) => l.trim().replace(/\s+/g, " "))
		.filter((l) => l.startsWith("|"));
const parses = (text: string) =>
	text !== "" && !parseChart(text).diagnostics.some((d) => d.severity === "error");

/** Sync's codes about chords: none may come from the placeholder harmony. */
const CHORD_CODES = [
	"run-invalid",
	"run-overlap",
	"label-unknown",
	"no-chord-detected",
	"outside-bars",
	"chord-unnamed",
];

const SPEC_LINE = "| {E1} | {E1} {E1} {E1} {E1} | {A1} / {A1} / | {G1} {G1}_{G1} / {B1} |\n";
function specFile(): Uint8Array {
	const out = exportMidi(SPEC_LINE);
	if (!out.ok) throw new Error("export failed");
	return out.bytes;
}

describe("the spec's first example", () => {
	test("comes back as its four bars: held against re-struck, octaves kept", () => {
		expect(importMidi(specFile()).text).toBe(
			"time: 4/4, tempo: 120\n| {E1} | {E1} {E1} {E1} {E1} | {A1} {A1} | {G1} {G1}_{G1} / {B1} |\n",
		);
	});
	test("notes: false reads it as chords, as before", () => {
		const r = importMidi(specFile(), { notes: false });
		expect(r.text).toBe("time: 4/4, tempo: 120\n| {E} | / | {A} | {G} / / {B} |\n");
		expect(codes(r)).toEqual(["harmony-from-melody"]);
	});
	test("a clean line says notes-line and nothing else", () => {
		const r = importMidi(specFile());
		expect(r.diagnostics).toEqual([
			{
				severity: "info",
				code: "notes-line",
				message: expect.stringContaining("notes: false") as unknown as string,
			},
		]);
		for (const code of CHORD_CODES) expect(codes(r)).not.toContain(code);
	});
});

describe("pitches", () => {
	test("in G flat, MIDI 59 is Cb4", () => {
		const r = importMidi(file(run([66, 68, 70, 59], 0, Q), [at(0, { key: [-6, 0] })]));
		expect(r.text).toBe("key: Gb, time: 4/4, tempo: 120\n| {Gb4} {Ab4} {Bb4} {Cb4} |\n");
	});
	test("a line across three tracks and two channels is one line", () => {
		const notes = [
			...run([48, 50, 52, 53], 0, Q, { track: 2, ch: 0 }),
			...run([55, 57, 59, 60], BAR, Q, { track: 3, ch: 1 }),
			...run([62, 64, 65, 67], 2 * BAR, Q, { track: 4, ch: 0 }),
		];
		const r = importMidi(file(notes));
		expect(barLines(r.text)).toEqual([
			"| {C3} {D3} {E3} {F3} | {G3} {A3} {B3} {C4} | {D4} {E4} {F4} {G4} |",
		]);
		expect(r.text).not.toContain("N.C.");
	});
	test("a double stop among single notes is one note set, low to high", () => {
		const notes = [
			...run([48, 50], 0, Q),
			n(55, 2 * Q, Q),
			n(52, 2 * Q, Q),
			...run([53, 55, 57, 59, 60, 62, 64, 65, 67], 3 * Q, Q),
		];
		const r = importMidi(file(notes));
		expect(barLines(r.text)[0]).toBe(
			"| {C3} {D3} {E3 G3} {F3} | {G3} {A3} {B3} {C4} | {D4} {E4} {F4} {G4} |",
		);
	});
	test("MIDI 5 and 125 are left out and counted; the rest are written, a beat's silence a rest", () => {
		const r = importMidi(file(run([60, 5, 62, 64, 65, 67, 125, 69, 71, 72, 74, 76], 0, Q)));
		const d = r.diagnostics.find((x) => x.code === "pitch-range");
		expect(d?.severity).toBe("warning");
		expect(d?.message).toContain("2 pitches");
		expect(barLines(r.text)[0]).toBe(
			"| {C4} -- {D4} {E4} | {F4} {G4} -- {A4} | {B4} {C5} {D5} {E5} |",
		);
	});
});

describe("the grid", () => {
	test("a note 10 ticks before a bar line is the next bar's first", () => {
		const r = importMidi(file([n(60, 0, BAR - 20), n(62, BAR - 10, BAR)]));
		expect(barLines(r.text)).toEqual(["| {C4} | {D4} |"]);
	});
	test("so is one 10 ticks before the first full bar after a pickup", () => {
		const meta = [at(0, { time: [1, 4] }), at(Q, { time: [4, 4] })];
		const r = importMidi(file([n(55, 0, Q - 10), n(60, Q - 10, BAR)], meta));
		expect(r.text).toBe("time: 4/4, tempo: 120\n| [1/4] {G3} | {C4} |\n");
	});
	test("sixteenths, eighths and a triplet each read as a group", () => {
		const notes = [
			...run([60, 62, 64, 65], 0, Q / 4),
			...run([67, 69], Q, Q / 2),
			...run([71, 72, 74], 2 * Q, Q / 3),
			n(76, 3 * Q, Q),
		];
		expect(barLines(importMidi(file(notes)).text)).toEqual([
			"| {C4}_{D4}_{E4}_{F4} {G4}_{A4} {B4}_{C5}_{D5} {E5} |",
		]);
	});
	test("sixteenths in 2/2 are eight parts of the half-note beat (Kevin, 2026-11-20)", () => {
		const notes = [...run([48, 50, 52, 53, 55, 57, 59, 60], 0, Q / 4), n(48, 2 * Q, 2 * Q)];
		const r = importMidi(file(notes, [at(0, { time: [2, 2] })]));
		expect(barLines(r.text)).toEqual(["| {C3}_{D3}_{E3}_{F3}_{G3}_{A3}_{B3}_{C4} {C3} |"]);
		expect(codes(r)).toEqual(["notes-line"]);
	});
	test("a 2/2 chart with sixteenths, eighths and a dotted figure comes back as written", () => {
		const bars =
			"| {C3}_{D3}_{E3}_{F3}_{G3}_{A3}_{B3}_{C4} {C3}_{E3}_{G3}_{C4} | {C3}_/_/_{D3}_/_/_{E3}_/ {C3}._{D3} |";
		const out = exportMidi(`time: 2/2, tempo: 60\n${bars}\n`);
		if (!out.ok) throw new Error("export failed");
		const r = importMidi(out.bytes);
		expect(barLines(r.text)).toEqual([bars]);
		expect(codes(r)).toEqual(["notes-line"]);
	});
	test("a 6/8 bar is two beats of three eighths", () => {
		const r = importMidi(file(run([60, 62, 64, 65, 67, 69], 0, Q / 2), [at(0, { time: [6, 8] })]));
		expect(r.text).toBe("time: 6/8, tempo: 80\n| {C4}_{D4}_{E4} {F4}_{G4}_{A4} |\n");
	});
	test("ppq 24 and 96: quarters and eighths read exactly", () => {
		for (const ppq of [24, 96]) {
			const notes = [n(60, 0, ppq), ...run([62, 64], ppq, ppq / 2), ...run([65, 67], 2 * ppq, ppq)];
			expect(barLines(importMidi(file(notes, [], { ppq })).text)).toEqual([
				"| {C4} {D4}_{E4} {F4} {G4} |",
			]);
		}
	});
});

/** A bar of four quarters whose beat 2 has an attack 200 ticks in: no division fits it. */
const roughBar = (bar: number): N[] => [
	n(60, bar * BAR, Q),
	n(62, bar * BAR + Q, 200),
	n(64, bar * BAR + Q + 200, Q - 200),
	...run([65, 67], bar * BAR + 2 * Q, Q),
];

describe("rhythm-rounded", () => {
	test("a beat that fits nothing is rounded and its bar named", () => {
		const r = importMidi(file([...run([48, 50, 52, 53], 0, Q), ...roughBar(1)]));
		const d = r.diagnostics.filter((x) => x.code === "rhythm-rounded");
		expect(d).toHaveLength(1);
		expect(d[0]?.severity).toBe("warning");
		expect(d[0]?.bar).toBe(2);
		expect(d[0]?.message).toContain("bar 2");
		expect(barLines(r.text)).toEqual(["| {C3} {D3} {E3} {F3} | {C4} {D4}_{E4} {F4} {G4} |"]);
	});
	test("ten such bars: eight named, then two more", () => {
		const notes = Array.from({ length: 10 }, (_, b) => roughBar(b)).flat();
		const d = importMidi(file(notes)).diagnostics.find((x) => x.code === "rhythm-rounded");
		expect(d?.message).toContain("bars 1, 2, 3, 4, 5, 6, 7, 8 and 2 more");
		expect(d?.bar).toBe(1);
	});
	test("after a pickup, the bars are named by their written numbers", () => {
		const meta = [at(0, { time: [1, 4] }), at(Q, { time: [4, 4] })];
		const notes = [n(55, 0, Q), ...roughBar(0).map((x) => ({ ...x, at: x.at + Q }))];
		const r = importMidi(file(notes, meta));
		const d = r.diagnostics.find((x) => x.code === "rhythm-rounded");
		expect(r.text).toContain("[1/4]");
		expect(d?.bar).toBe(1);
		expect(d?.message).toContain("bar 1");
	});
	test("two attacks landing on one point are counted joined", () => {
		// Beat 2's attacks 100 and 175 ticks in fit no division and both round to its second sixteenth.
		const notes = [
			n(60, 0, Q),
			n(62, Q + 100, 75),
			n(64, Q + 175, Q - 175),
			...run([65, 67], 2 * Q, Q),
		];
		const r = importMidi(file([...notes, ...run([48, 50, 52, 53, 55, 57, 59, 60], BAR, Q)]));
		const d = r.diagnostics.find((x) => x.code === "rhythm-rounded");
		expect(d?.message).toContain("1 attack was joined");
		expect(barLines(r.text)[0]).toStartWith("| {C4} /_{D4 E4}_/_/ {F4} {G4} |");
	});
	test("the same pitch twice on one point is one note, once", () => {
		const notes = [n(60, 0, Q), n(62, Q + 100, 60), n(62, Q + 175, Q - 175)];
		const r = importMidi(
			file([...notes, ...run([65, 67, 48, 50, 52, 53, 55, 57, 59, 60], 2 * Q, Q)]),
		);
		expect(codes(r)).toEqual(["notes-line", "rhythm-rounded"]);
		expect(barLines(r.text)[0]).toStartWith("| {C4} /_{D4}_/_/ {F4} {G4} |");
	});
	test("exactly eight bars are all named, with no count after", () => {
		const notes = Array.from({ length: 8 }, (_, b) => roughBar(b)).flat();
		const d = importMidi(file(notes)).diagnostics.find((x) => x.code === "rhythm-rounded");
		expect(d?.message).toEndWith("bars 1, 2, 3, 4, 5, 6, 7 and 8");
	});
});

describe("holds and rests", () => {
	test("a short silence is held, a long one is --", () => {
		const notes = [n(60, 0, 300), n(62, Q, Q), n(64, 2 * Q, Q / 2), n(65, 3 * Q, Q)];
		const rests = [n(60, BAR, Q), n(64, BAR + 3 * Q, Q)];
		expect(barLines(importMidi(file([...notes, ...rests])).text)).toEqual([
			"| {C4} {D4} {E4} {F4} | {C4} -- -- {E4} |",
		]);
	});
	test("silence before the first note and a silent bar are --", () => {
		const notes = [...run([60, 62, 64], Q, Q), n(65, 2 * BAR, BAR)];
		expect(barLines(importMidi(file(notes)).text)).toEqual(["| -- {C4} {D4} {E4} | -- | {F4} |"]);
	});
	test("a note ringing into a new section is / under its heading", () => {
		const notes = [n(64, 0, 2 * Q), n(60, 2 * Q, BAR), n(62, BAR + 2 * Q, 2 * Q)];
		const r = importMidi(file(notes, [at(0, { marker: "Intro" }), at(BAR, { marker: "Verse" })]));
		const lines = r.text.split("\n");
		const heading = lines.findIndex((l) => l.includes("Verse"));
		expect(heading).toBeGreaterThan(0);
		expect(lines[heading + 1]).toBe("| / {D4} |");
	});
});

describe("changes", () => {
	test("a key change and a 4/4 to 6/8 change mid-line", () => {
		const meta = [
			at(0, { key: [0, 0] }),
			at(2 * BAR, { key: [-3, 0] }),
			at(2 * BAR, { time: [6, 8] }),
		];
		const sixEight = (3 * Q) / 2;
		const notes = [
			...run([60, 62, 64, 65, 67, 69, 71, 72], 0, Q),
			...run([63, 70, 63, 70], 2 * BAR, sixEight),
		];
		const r = importMidi(file(notes, meta));
		const bars = barLines(r.text).join(" ").replaceAll(" | |", " |");
		expect(bars).toBe("| {C4} {D4} {E4} {F4} | {G4} {A4} {B4} {C5} | {Eb4} {Bb4} | % |");
		expect(r.text).toContain("key: Eb");
		expect(r.text).toContain("time: 6/8");
	});
});

describe("simile", () => {
	const twice = [...run([60, 62, 64, 65], 0, Q), ...run([60, 62, 64, 65], BAR, Q)];
	test("a repeated bar is %, or its text again with simile: false", () => {
		expect(barLines(importMidi(file(twice)).text)).toEqual(["| {C4} {D4} {E4} {F4} | % |"]);
		expect(barLines(importMidi(file(twice), { simile: false }).text)).toEqual([
			"| {C4} {D4} {E4} {F4} | {C4} {D4} {E4} {F4} |",
		]);
	});
	test("never % for bars of rest", () => {
		const r = importMidi(file([n(60, 0, BAR), n(62, 4 * BAR, BAR)]));
		expect(barLines(r.text).join(" ").replaceAll(" | |", " |")).toBe(
			"| {C4} | -- | -- | -- | {D4} |",
		);
	});
	test("never % after a heading", () => {
		const r = importMidi(file(twice, [at(0, { marker: "A" }), at(BAR, { marker: "B" })]));
		expect(r.text).not.toContain("%");
		expect(barLines(r.text)).toEqual(["| {C4} {D4} {E4} {F4} |", "| {C4} {D4} {E4} {F4} |"]);
	});
	test("never % across a meter change: the time: line between stops it", () => {
		const meta = [at(0, { time: [3, 4] }), at(3 * Q, { time: [6, 8] })];
		const r = importMidi(file([n(60, 0, 3 * Q), n(60, 3 * Q, 3 * Q)], meta));
		expect(r.text).not.toContain("%");
		expect(barLines(r.text)).toEqual(["| {C4} |", "| {C4} |"]);
	});
});

describe("short notes", () => {
	const twenty = (short: number[]) =>
		Array.from({ length: 20 }, (_, i) => n(48 + i, i * Q, short.includes(i) ? 5 : Q));
	test("2 stray 5-tick notes among 20 are left out and counted", () => {
		const r = importMidi(file(twenty([3, 11])));
		const d = r.diagnostics.find((x) => x.code === "notes-short");
		expect(d?.severity).toBe("info");
		expect(d?.message).toContain("2 notes");
		expect(barLines(r.text)).toEqual([
			"| {C3} {C#3} {D3} -- | {E3} {F3} {F#3} {G3} | {Ab3} {A3} {Bb3} -- | {C4} {C#4} {D4} {Eb4} |",
			"| {E4} {F4} {F#4} {G4} |",
		]);
	});
	test("when 6 of 20 are that short, all are read", () => {
		const r = importMidi(file(twenty([1, 3, 5, 7, 9, 11])));
		expect(codes(r)).not.toContain("notes-short");
		expect(r.text.match(/\{/g)).toHaveLength(20);
	});
});

describe("lyrics", () => {
	test("a melody's lyric rows are the rows notes: false writes", () => {
		const words = ["Hap-", "py", "morn-", "ing", "to", "you", "all", "now"];
		const extra = words.map((w, i) => at(i * Q, { lyric: w }));
		const bytes = file(run([60, 62, 64, 65, 67, 65, 64, 62], 0, Q), [], { extra });
		const rows = (text: string) =>
			text
				.split("\n")
				.filter((l) => l.startsWith("lyrics"))
				.map((l) => l.replace(/\s+/g, " "));
		const line = importMidi(bytes).text;
		expect(rows(line)).toHaveLength(1);
		expect(rows(line)).toEqual(rows(importMidi(bytes, { notes: false }).text));
		expect(line).toContain("{C4}");
	});
});

describe("small files", () => {
	test("one long note: a line, held", () => {
		expect(barLines(importMidi(file([n(60, 0, 5 * BAR)])).text)).toEqual([
			"| {C4} | / | / | / |",
			"| / |",
		]);
	});
	test("one short note: a line, then rests", () => {
		expect(barLines(importMidi(file([n(60, 0, 10)])).text)).toEqual(["| {C4} -- -- -- |"]);
	});
	test("two notes at one tick are not a line: the chord reading, no diagnostics", () => {
		const r = importMidi(file([n(60, 0, Q), n(64, 0, Q)]));
		expect(barLines(r.text)).toEqual(["| {C E} N.C. / / |"]);
		expect(r.diagnostics).toEqual([]);
	});
	test("a note with no note-off: a line of its first note", () => {
		// The reader drops the second note: with nothing after it, it ends where it starts (zero length), as it always has.
		const bytes = smf({
			format: 0,
			tracks: [
				track([at(0, { tempo: 120 }), at(0, { on: [0, 60, 80] }), at(Q, { on: [0, 62, 80] })]),
			],
		});
		const r = importMidi(bytes);
		expect(barLines(r.text)).toEqual(["| {C4} -- -- -- |"]);
		expect(parses(r.text)).toBe(true);
	});
});

describe("tracks", () => {
	test("tracks: [4] on band.mid is that track's line as notes; with notes: false, chords", () => {
		const line = importMidi(fixtureBytes("band"), { tracks: [4] });
		expect(codes(line)).toContain("notes-line");
		expect(line.text).toBe(
			"key: G, time: 4/4, tempo: 96\n| {G1} | {C2} | {G1} | {D2} |\n| {B1} | {C2} | {E2} | {D2} |\n",
		);
		expect(importMidi(fixtureBytes("band"), { tracks: [4], notes: false }).text).toBe(
			"key: G, time: 4/4, tempo: 96\n| {G} | {C} | {G} | {D} |\n| {B} | {C} | {E} | {D} |\n",
		);
	});
});

describe("the seven fixtures", () => {
	for (const name of MIDI_FIXTURES)
		test(`${name} imports as its chart, with and without notes: false`, () => {
			const r = importMidi(fixtureBytes(name));
			expect(r).toEqual(importMidi(fixtureBytes(name), { notes: false }));
			expect(r.text).toBe(fixtureChart(name));
		});
});

describe("the fallback", () => {
	test("a line failing its self-check is read as chords, notes-fallback first", () => {
		// The seam rewrites the chart's first note before the check plays it.
		const r = importWith(specFile(), {}, (chart) => chart.replace("{E1}", "{F1}"));
		const chords = importMidi(specFile(), { notes: false });
		expect(r.text).toBe(chords.text);
		expect(r.diagnostics[0]?.code).toBe("notes-fallback");
		expect(r.diagnostics[0]?.severity).toBe("warning");
		expect(r.diagnostics.slice(1)).toEqual(chords.diagnostics);
		expect(codes(r)).not.toContain("notes-line");
	});
	test("the seam leaves a passing line alone", () => {
		expect(importWith(specFile(), {}, (chart) => chart)).toEqual(importMidi(specFile()));
	});
});

describe("options", () => {
	test("a notes that is not a boolean is ignored", () => {
		const bytes = specFile();
		expect(importMidi(bytes, { notes: "no" } as never)).toEqual(importMidi(bytes));
		expect(importMidi(bytes, { notes: 0 } as never)).toEqual(importMidi(bytes));
	});
});

describe("the grid's end", () => {
	test("a short last note 10 ticks early: its bar exists, the line rests after it", () => {
		const r = importMidi(file([n(60, 0, BAR - 20), n(62, BAR - 10, 60)]));
		expect(barLines(r.text)).toEqual(["| {C4} | {D4} -- -- -- |"]);
	});
	test("a legato release past the last bar line adds no bar", () => {
		const r = importMidi(file([...run([60, 62, 64], 0, Q), n(65, 3 * Q, Q + 100)]));
		expect(barLines(r.text)).toEqual(["| {C4} {D4} {E4} {F4} |"]);
	});
	test("at a fractional tolerance (ppq 7) a 1-tick last note adds no bar", () => {
		const notes = [...run([60, 62, 64], 0, 7), n(65, 27, 1)];
		expect(barLines(importMidi(file(notes, [], { ppq: 7 })).text)).toEqual([
			"| {C4} {D4} {E4} /_/_/_/_/_{F4} |",
		]);
	});
	const words = ["one ", "two ", "three ", "four "];
	const late = [...words.map((w, i) => at(i * Q, { lyric: w })), at(3 * BAR, { lyric: "late" })];
	test("the grid runs to the last lyric", () => {
		const r = importMidi(file(run([60, 62, 64, 65], 0, Q), [], { extra: late }));
		const lines = r.text.split("\n");
		expect(barLines(r.text)).toEqual(["| {C4} {D4} {E4} {F4} | -- | -- | -- |"]);
		expect(lines.find((l) => l.startsWith("lyrics"))?.replace(/\s+/g, " ")).toMatch(/\| late \|$/);
	});
	test("lyrics: false: the grid ends with the notes and no row is written", () => {
		const r = importMidi(file(run([60, 62, 64, 65], 0, Q), [], { extra: late }), { lyrics: false });
		expect(r.text).toBe("time: 4/4, tempo: 120\n| {C4} {D4} {E4} {F4} |\n");
	});
});

describe("the chart around the line", () => {
	test("a bar after a pickup is never % of it (another meter)", () => {
		const meta = [at(0, { time: [1, 4] }), at(Q, { time: [4, 4] })];
		const r = importMidi(file([n(55, 0, Q), n(55, Q, BAR)], meta));
		expect(barLines(r.text)).toEqual(["| [1/4] {G3} | {G3} |"]);
	});
	test("key-doubtful is judged on the line's notes", () => {
		const inKey = run([60, 62, 64, 65, 67, 69, 71, 72], 0, Q, { track: 2 });
		const outOfKey = run([61, 63, 66, 68, 70, 61, 63, 66], 0, Q, { track: 3 });
		const r = importMidi(file([...inKey, ...outOfKey], [at(0, { key: [0, 0] })]), { tracks: [2] });
		expect(r.text).toStartWith("key: C,");
		expect(codes(r)).not.toContain("key-doubtful");
	});
	test("the title is the chord reading's", () => {
		const r = importMidi(file(run([60, 62, 64, 65], 0, Q), [at(0, { name: "My Song" })]));
		expect(r.text.split("\n")[0]).toBe("# My Song");
		expect(codes(r)).toEqual(["notes-line"]);
	});
});

describe("what falls back", () => {
	/** The chord reading's result with notes-fallback first. */
	const fellBack = (r: MidiImportResult, bytes: Uint8Array, options = {}) => {
		const chords = importMidi(bytes, { ...options, notes: false });
		expect(r.diagnostics[0]).toMatchObject({ code: "notes-fallback", severity: "warning" });
		expect(r.text).toBe(chords.text);
		expect(r.diagnostics.slice(1)).toEqual(chords.diagnostics);
	};
	test("an error in the line reading (too-large) falls back to chords", () => {
		const notes = Array.from({ length: 10_000 }, (_, i) => n(60 + (i % 5), i * BAR, Q));
		notes.push(n(72, 10_000 * BAR - 10, 40));
		const bytes = file(notes);
		const r = importMidi(bytes);
		fellBack(r, bytes);
		expect(r.text).not.toBe("");
	}, 60_000);
	test("a meter time: cannot write falls back (sync drops it)", () => {
		const bytes = file(
			run(
				Array.from({ length: 16 }, (_, i) => 60 + (i % 8)),
				0,
				Q,
			),
			[at(0, { time: [33, 8] })],
		);
		fellBack(importMidi(bytes), bytes);
	});
	test("a bar in a meter no chart can write costs the line before a beat of it is counted", () => {
		// 255/2 signatures 2,039 ticks apart at ppq 4: each bar is cut to 2039/16, 2,039 beats a bar.
		const bars = 1000;
		const cuts = Array.from({ length: bars }, (_, i) => at(i * 2039, { time: [255, 2] }));
		const bytes = file([n(48, 0, bars * 2039)], cuts, { ppq: 4 });
		const time = (options?: { notes: false }) => {
			const start = performance.now();
			const result = importMidi(bytes, options);
			return { result, ms: performance.now() - start };
		};
		time({ notes: false });
		const chords = time({ notes: false });
		const line = time();
		fellBack(line.result, bytes);
		// Two million beats would be counted first: the line reading must not cost more than a second look.
		expect(line.ms).toBeLessThan(chords.ms * 4 + 250);
	}, 60_000);
	test("a line with no pitch in range falls back", () => {
		const bytes = file(run([0, 2, 4, 5, 7, 9, 11, 0], 0, Q));
		fellBack(importMidi(bytes), bytes);
	});
	test("one pitch out of range is said in the singular", () => {
		const r = importMidi(file(run([60, 5, 62, 64], 0, Q)));
		expect(r.diagnostics.find((d) => d.code === "pitch-range")?.message).toBe(
			"1 pitch outside C0 to B8 left out: a chart cannot write it",
		);
	});
	test("the self-check compares times: an attack moved", () => {
		const r = importWith(specFile(), {}, (c) => c.replace("| {A1} {A1} |", "| {A1} / / {A1} |"));
		fellBack(r, specFile());
	});
	test("the self-check compares the count: an attack removed", () => {
		const r = importWith(specFile(), {}, (c) => c.replace("| {A1} {A1} |", "| {A1} / |"));
		fellBack(r, specFile());
	});
	test("the self-check compares the count: the last attack removed (the rest a prefix)", () => {
		const r = importWith(specFile(), {}, (c) => c.replace("/ {B1} |", "/ / |"));
		fellBack(r, specFile());
	});
	test("the fallback keeps the other options", () => {
		const r = importWith(specFile(), { barsPerLine: 1 }, (c) => c.replace("{A1}", "{B1}"));
		fellBack(r, specFile(), { barsPerLine: 1 });
		expect(barLines(r.text)).toHaveLength(4);
	});
});

/** A line of `pitches`, `step` ticks apart, each note-off `overlap` ticks after the next note-on. */
function legato(pitches: number[], step: number, overlap: number): Uint8Array {
	const events = pitches.flatMap((p, i) => [
		at(i * step, { on: [0, p, 80] }),
		at((i + 1) * step + overlap, { off: [0, p] }),
	]);
	return smf({ format: 1, ppq: PPQ, tracks: [track([at(0, { tempo: 120 })]), track(events)] });
}

/** `count` pitches walking a scale, the pitch before repeated at each index in `repeats`. */
function walk(count: number, repeats: number[]): number[] {
	const scale = [36, 38, 40, 41, 43, 45, 47, 48];
	const out: number[] = [];
	for (let i = 0; i < count; i++)
		out.push(repeats.includes(i) ? (out[i - 1] as number) : (scale[i % scale.length] as number));
	return out;
}

const attacksIn = (text: string) => (text.match(/\{/g) ?? []).length;

describe("a line's overlapping notes of one pitch keep their lengths", () => {
	test("E, A, A, F, each released 5 ticks after the next is struck", () => {
		const r = importMidi(legato([40, 45, 45, 41], Q, 5));
		expect(barLines(r.text)).toEqual(["| {E2} {A2} {A2} {F2} |"]);
		expect(codes(r)).toEqual(["notes-line"]);
	});
	const cases: [string, number, number[]][] = [
		["64 eighths, 8 repeats", Q / 2, [5, 13, 21, 29, 37, 45, 53, 61]],
		["64 quarters, 13 repeats", Q, [3, 8, 13, 18, 23, 28, 33, 38, 43, 48, 53, 58, 63]],
		["64 quarters, 15 repeats", Q, [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51, 55, 59]],
	];
	for (const [name, step, repeats] of cases)
		test(`${name}: every attack written, none left out as short`, () => {
			const r = importMidi(legato(walk(64, repeats), step, 5), { simile: false });
			expect(codes(r)).toEqual(["notes-line"]);
			expect(attacksIn(r.text)).toBe(64);
		});
	test("a line with no overlaps imports as before", () => {
		expect(importMidi(specFile()).text).toBe(
			"time: 4/4, tempo: 120\n| {E1} | {E1} {E1} {E1} {E1} | {A1} {A1} | {G1} {G1}_{G1} / {B1} |\n",
		);
		const groups = [
			...run([60, 62, 64, 65], 0, Q / 4),
			...run([67, 69], Q, Q / 2),
			...run([71, 72, 74], 2 * Q, Q / 3),
			n(76, 3 * Q, Q),
		];
		expect(barLines(importMidi(file(groups)).text)).toEqual([
			"| {C4}_{D4}_{E4}_{F4} {G4}_{A4} {B4}_{C5}_{D5} {E5} |",
		]);
		const rests = [...run([60, 62, 64], Q, Q), n(65, 2 * BAR, BAR)];
		expect(barLines(importMidi(file(rests)).text)).toEqual(["| -- {C4} {D4} {E4} | -- | {F4} |"]);
	});
	test("a chord file re-striking 5 ticks early imports as before", () => {
		const chords = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) =>
			(i < 4 ? [60, 64, 67] : [62, 65, 69]).map((p) => n(p, i * Q, Q + 5)),
		);
		const bytes = file(chords);
		const r = importMidi(bytes);
		expect(r).toEqual({
			text: "time: 4/4, tempo: 120\n| C N.C. / / | Dm N.C. / / |\n",
			diagnostics: [],
		});
		expect(r).toEqual(importMidi(bytes, { notes: false }));
	});
});

/** A one-track file of events at absolute ticks (note-offs first at one tick), at `ppq`. */
const events = (list: At[], ppq = PPQ) =>
	smf({ format: 1, ppq, tracks: [track([at(0, { tempo: 120 })]), track(list)] });

describe("a line is tried on both pairings", () => {
	/** 64 quarters, E2 on every fourth up to the 60th (15 of them), the rest a walk; each 460 ticks long. */
	const SCALE = [36, 38, 41, 43, 45, 47, 48];
	const pitches = Array.from({ length: 64 }, (_, i) =>
		i % 4 === 0 && i < 60 ? 40 : (SCALE[i % 7] as number),
	);
	function stuck({ missing = -1, doubled = -1 }): Uint8Array {
		return events(
			pitches.flatMap((p, i) => [
				at(i * Q, { on: [0, p, 80] }),
				...(i === doubled ? [at(i * Q, { on: [0, p, 80] })] : []),
				...(i === missing ? [] : [at(i * Q + 460, { off: [0, p] })]),
			]),
		);
	}
	// What f9346eb (the line on MIDI 5.2's pairing) gave for both files, `simile: false`.
	const WALK =
		"time: 4/4, tempo: 120\n" +
		"| {E2} {D2} {F2} {G2} | {E2} {B2} {C3} {C2} | {E2} {F2} {G2} {A2} | {E2} {C3} {C2} {D2} |\n" +
		"| {E2} {G2} {A2} {B2} | {E2} {C2} {D2} {F2} | {E2} {A2} {B2} {C3} | {E2} {D2} {F2} {G2} |\n" +
		"| {E2} {B2} {C3} {C2} | {E2} {F2} {G2} {A2} | {E2} {C3} {C2} {D2} | {E2} {G2} {A2} {B2} |\n" +
		"| {E2} {C2} {D2} {F2} | {E2} {A2} {B2} {C3} | {E2} {D2} {F2} {G2} | {A2} {B2} {C3} {C2} |\n";
	test("the first E2's note-off missing: still the line, every attack", () => {
		const r = importMidi(stuck({ missing: 0 }), { simile: false });
		expect(r).toEqual({
			text: WALK,
			diagnostics: [expect.objectContaining({ code: "notes-line" })],
		});
	});
	test("the first E2's note-on doubled with one note-off: still the line", () => {
		const r = importMidi(stuck({ doubled: 0 }), { simile: false });
		expect(r).toEqual({
			text: WALK,
			diagnostics: [expect.objectContaining({ code: "notes-line" })],
		});
	});
	test("one pitch overlapping itself by more than a sixteenth (ppq 960): still the line", () => {
		const list = [
			...[60, 62, 64].flatMap((p, i) => [
				at(i * 960, { on: [0, p, 80] }),
				at(i * 960 + 900, { off: [0, p] }),
			]),
			at(2880, { on: [0, 65, 80] }),
			at(3840, { on: [0, 65, 80] }),
			at(4160, { off: [0, 65] }),
			at(4560, { off: [0, 65] }),
		];
		const r = importMidi(events(list, 960));
		expect(r.text).toBe("time: 4/4, tempo: 120\n| {C4} {D4} {E4} {F4} | {F4} -- -- -- |\n");
		expect(codes(r)).toEqual(["notes-line"]);
	});
	test("a file that is a line under neither pairing is read as chords, as before", () => {
		const chords = [0, 1, 2, 3].flatMap((i) => [60, 64, 67].map((p) => n(p, i * Q, Q)));
		const bytes = file(chords);
		expect(importMidi(bytes)).toEqual({ text: "time: 4/4, tempo: 120\n| C |\n", diagnostics: [] });
		expect(importMidi(bytes)).toEqual(importMidi(bytes, { notes: false }));
	});
});

describe("the line's own notes", () => {
	test("a throw inside the line reading falls back to chords", () => {
		const r = importWith(specFile(), {}, () => {
			throw new Error("x");
		});
		const chords = importMidi(specFile(), { notes: false });
		expect(r.diagnostics[0]).toMatchObject({ code: "notes-fallback", severity: "warning" });
		expect(r.text).toBe(chords.text);
		expect(r.diagnostics.slice(1)).toEqual(chords.diagnostics);
	});
	test("the lyric rows sound under the line's notes (first in, first out)", () => {
		const list = [
			at(0, { on: [0, 40, 80] }),
			at(0, { lyric: "one " }),
			at(Q, { on: [0, 45, 80] }),
			at(Q, { lyric: "two " }),
			at(Q + 5, { off: [0, 40] }),
			at(2 * Q, { on: [0, 45, 80] }),
			at(2 * Q + 5, { off: [0, 45] }),
			at(4 * Q, { off: [0, 45] }),
			at(4 * Q, { on: [0, 41, 80] }),
			at(4 * Q, { lyric: "three " }),
			at(8 * Q, { off: [0, 41] }),
		];
		const lines = importMidi(events(list))
			.text.split("\n")
			.map((l) => l.replace(/\s+/g, " ").trim());
		expect(lines).toContain("| {E2} {A2} {A2} / | {F2} |");
		expect(lines).toContain("lyrics: | one two / / | three |");
	});
});

describe("a pickup in another beat is quantized in the meter the chart writes", () => {
	const clean = (text: string) => parseChart(text).diagnostics;
	test("3/4 before 12/8: the pickup is [6/8], in dotted beats, with no parse diagnostic", () => {
		const notes = [n(47, 0, 470), n(44, 480, 470), n(40, 960, 470)];
		for (let k = 0; k < 4; k++) notes.push(n(40 + k, 3 * Q + k * 720, 700));
		const r = importMidi(file(notes, [at(0, { time: [3, 4] }), at(3 * Q, { time: [12, 8] })]));
		expect(barLines(r.text)).toEqual(["| [6/8] {B2}_/_{Ab2} /_{E2}_/ | {E2} {F2} {F#2} {G2} |"]);
		expect(clean(r.text)).toEqual([]);
		expect(codes(r)).toEqual(["notes-line"]);
	});
	test("6/8 before 4/4: the pickup is [3/4], in quarters, with no parse diagnostic", () => {
		const notes = [0, 1, 2, 3, 4, 5].map((k) => n(50 + k, k * 240, 230));
		for (let k = 0; k < 8; k++) notes.push(n(45 + k, 3 * Q + k * Q, 470));
		const r = importMidi(file(notes, [at(0, { time: [6, 8] }), at(3 * Q, { time: [4, 4] })]));
		expect(barLines(r.text)).toEqual([
			"| [3/4] {D3}_{Eb3} {E3}_{F3} {F#3}_{G3} | {A2} {Bb2} {B2} {C3} | {C#3} {D3} {Eb3} {E3} |",
		]);
		expect(clean(r.text)).toEqual([]);
	});
});

describe("the last attack near the bar line that ends the grid", () => {
	const four = run([60, 62, 64, 65], 0, Q);
	test("16 ticks early (past a 128th): carried to a bar of its own, rounded", () => {
		const r = importMidi(
			file([...four.slice(0, 3), n(65, 3 * Q, (3 * Q) / 4 - 16), n(67, BAR - 16, 100)]),
		);
		expect(barLines(r.text)).toEqual(["| {C4} {D4} {E4} {F4} | {G4} -- -- -- |"]);
		expect(codes(r)).toEqual(["notes-line", "rhythm-rounded"]);
	});
	test("100 ticks early (nearer the last sixteenth): stays in the bar", () => {
		const r = importMidi(file([...four.slice(0, 3), n(65, 3 * Q, Q - 100), n(67, BAR - 100, 100)]));
		expect(barLines(r.text)).toEqual(["| {C4} {D4} {E4} {F4}._{G4} |"]);
	});
	test("15 ticks early (within a 128th): the next bar's, as before", () => {
		const r = importMidi(file([...four.slice(0, 3), n(65, 3 * Q, Q - 15), n(67, BAR - 15, 100)]));
		expect(barLines(r.text)).toEqual(["| {C4} {D4} {E4} {F4} | {G4} -- -- -- |"]);
	});
	test("a long final note is unchanged", () => {
		const r = importMidi(file([...four.slice(0, 3), n(65, 3 * Q, 2 * BAR)]));
		expect(barLines(r.text)).toEqual(["| {C4} {D4} {E4} {F4} | / | / / / -- |"]);
	});
});

describe("a line is read by its keys: the sustain pedal holds nothing (Kevin, 2026-11-20)", () => {
	const pedal = (down: number, up: number): At[] => [
		at(down, { control: [0, 64, 127] }),
		at(up, { control: [0, 64, 0] }),
	];
	const twoBars = run([48, 50, 52, 53, 55, 57, 59, 60], 0, Q);
	test("a 15-tick key press the pedal holds is a short note, left out and counted", () => {
		const notes = [...twoBars, n(72, 2 * BAR + Q, 15), n(48, 3 * BAR, BAR)];
		const extra = pedal(2 * BAR + Q - 10, 3 * BAR - 10);
		const r = importMidi(file(notes, [], { extra }));
		expect(barLines(r.text)).toEqual(["| {C3} {D3} {E3} {F3} | {G3} {A3} {B3} {C4} | -- | {C3} |"]);
		expect(codes(r)).toEqual(["notes-line", "notes-short"]);
		expect(r.diagnostics[1]?.message).toContain("1 note ");
	});
	test("a note released under the pedal ends where its key did: the silence after it is a rest", () => {
		const notes = [...twoBars, n(48, 2 * BAR, Q), n(50, 2 * BAR + 3 * Q, Q)];
		const extra = pedal(2 * BAR + 100, 2 * BAR + 3 * Q - 10);
		const r = importMidi(file(notes, [], { extra }));
		expect(barLines(r.text).at(-1)?.endsWith("| {C3} -- -- {D3} |")).toBe(true);
		expect(codes(r)).toEqual(["notes-line"]);
	});
	test("with no pedal in the file the line is the same line", () => {
		const notes = [...twoBars, n(48, 2 * BAR, Q), n(50, 2 * BAR + 3 * Q, Q)];
		expect(
			barLines(importMidi(file(notes)).text)
				.at(-1)
				?.endsWith("| {C3} -- -- {D3} |"),
		).toBe(true);
	});
	test("notes ringing under one another through the pedal are still harmony, read as chords", () => {
		const r = importMidi(file(twoBars, [], { extra: pedal(0, 2 * BAR) }));
		expect(codes(r)).not.toContain("notes-line");
		expect(r.text).toBe(
			importMidi(file(twoBars, [], { extra: pedal(0, 2 * BAR) }), { notes: false }).text,
		);
	});
	test("a line found on MIDI 5.2's pairing is read by its keys in that pairing", () => {
		// a doubled note-on of the first C3 rings under everything first in, first out; the pedal holds
		// bar 2's C3 a beat past its key, which was down for one beat of the three before D3
		const doubled = at(0, { on: [0, 48, 80] });
		const notes = [
			...run([48, 50, 52, 53], 0, Q),
			n(48, BAR, Q),
			n(50, BAR + 3 * Q, Q),
			...run([52, 53, 55, 57], 2 * BAR, Q),
		];
		const extra = [doubled, ...pedal(BAR + 100, BAR + 2 * Q)];
		const r = importMidi(file(notes, [], { extra }));
		expect(barLines(r.text)).toEqual([
			"| {C3} {D3} {E3} {F3} | {C3} -- -- {D3} | {E3} {F3} {G3} {A3} |",
		]);
	});
	test("a pedalled line whose keys overlap themselves is read first in, first out, by its keys", () => {
		// E, A, A, F, each released 5 ticks after the next is struck, a pedal pressed and lifted inside the first note
		const starts = [0, Q, 2 * Q, 3 * Q];
		const notes = [40, 45, 45, 41].map((p, i) => n(p, starts[i] as number, Q + 5));
		const r = importMidi(
			file([...notes, ...run([43, 45, 47, 48], BAR, Q)], [], { extra: pedal(10, 20) }),
		);
		expect(barLines(r.text)).toEqual(["| {E2} {A2} {A2} {F2} | {G2} {A2} {B2} {C3} |"]);
	});
});
