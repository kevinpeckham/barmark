import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractPart, parseChart } from "barmark";
import { perform } from "../src/perform/index.js";
import { toNumber } from "../src/perform/quarters.js";
import type { Performance, PerformedTrack } from "../src/perform/types.js";
import { notesOf } from "./helpers/notes.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const MORNING_SONG = read("../../../examples/morning-song.chart.md");
const PIANO_LINES = read("../../musicxml/tests/fixtures/piano-lines.chart.md");
const LEAD_SHEET = read("../../musicxml/tests/fixtures/import/lead-sheet.chart.md");

const play = (text: string) => perform(parseChart(text));
const plan = (p: Performance) => p.tracks.map((t) => [t.name, t.part, t.line, t.role, t.program]);
const track = (p: Performance, name: string) => p.tracks.find((t) => t.name === name);
const pedal = (t?: PerformedTrack) => t?.pedal.map((e) => [toNumber(e.at), e.down]);
/** A track's notes as `[pitch, at, length]`. */
const notes = (p: Performance, name: string) =>
	notesOf(
		p,
		p.tracks.findIndex((t) => t.name === name),
	).map(([pitch, at, length]) => [pitch, at, length]);

describe("perform: parts, lines, programs and harmony tracks", () => {
	test("one track per part line, in score order", () => {
		expect(plan(play(MORNING_SONG))).toEqual([
			["Electric Guitar 1", "Gtr", null, "line", 1],
			["Piano", "Pno", null, "line", 1],
		]);
		const lines = play(PIANO_LINES);
		expect(plan(lines)).toEqual([
			["Piano RH", "Pno", "RH", "line", 1],
			["Piano LH", "Pno", "LH", "line", 1],
			["Piano RH2", "Pno", "RH2", "line", 1],
			["Bass", "Bs", null, "line", 34],
		]);
		// Each line its own notes: the left hand's first bar is G2, the bass's G1.
		expect(notes(lines, "Piano LH")[0]).toEqual([43, 0, 4]);
		expect(notes(lines, "Bass")[0]).toEqual([31, 0, 4]);
		expect(notes(lines, "Piano RH").slice(0, 3)).toEqual([
			[59, 0, 4],
			[62, 0, 4],
			[67, 0, 4],
		]);
		// A bass instrument's chord symbol is its bass alone.
		const bass = play("part: Bs = Bass, instrument: electric bass\n| G |");
		expect(notes(bass, "Bass")).toEqual([[31, 0, 4]]);
	});

	test("a part with no instrument is piano", () => {
		const p = play("part: Gtr = Guitar\n| C |");
		expect(plan(p)).toEqual([["Guitar", "Gtr", null, "line", 1]]);
		expect(plan(play("part: Piano\n| C |"))).toEqual([["Piano", "Piano", null, "line", 1]]);
	});

	test("a melodic instrument's chords sound on piano in their own track", () => {
		const p = play(LEAD_SHEET);
		expect(plan(p)).toEqual([
			["Voice", "Vo", "Mel", "line", 53],
			["Voice chords", "Vo", null, "harmony", 1],
		]);
		// The melody's notes only: A4 then C5 in the first verse bar (bar 3, at 8).
		expect(notes(p, "Voice").slice(0, 2)).toEqual([
			[69, 8, 2],
			[72, 10, 2],
		]);
		// The chords' voicings only: Fmaj7 is F2 under C4 E4 F4 A4.
		expect(notes(p, "Voice chords").slice(0, 5)).toEqual([
			[41, 0, 4],
			[60, 0, 4],
			[64, 0, 4],
			[65, 0, 4],
			[69, 0, 4],
		]);
		expect(notes(p, "Voice chords").every(([, at]) => at !== 10)).toBe(true);
		// The lyrics are the singing line's; the chords' line keeps its words.
		expect(track(p, "Voice")?.lyrics.length).toBeGreaterThan(0);
		expect(track(p, "Voice chords")?.lyrics).toEqual([]);
		expect(track(p, "Voice chords")?.words.map((w) => [w.text, toNumber(w.at)])).toEqual([
			["FTristan", 16],
		]);
		// A note set on a melodic part's line stays on the line's track; a line with no notes has none.
		const both = play("part: Tpt = Trumpet, instrument: trumpet in Bb\n| C {E4} |");
		expect(plan(both)).toEqual([
			["Trumpet", "Tpt", null, "line", 57],
			["Trumpet chords", "Tpt", null, "harmony", 1],
		]);
		expect(notes(both, "Trumpet")).toEqual([[64, 2, 2]]);
		expect(notes(both, "Trumpet chords").map(([pitch]) => pitch)).toEqual([48, 60, 64, 67]);
		const chordsOnly = play("part: Vn = Violin, instrument: violin\n| C |");
		expect(plan(chordsOnly)).toEqual([["Violin chords", "Vn", null, "harmony", 1]]);
	});

	test("tacet and resting lines sound nothing", () => {
		const tacet = play("part: A = Piano\npart: B = Bass\nA | C | D |\nB | E | F |\nB | G |");
		expect(notes(tacet, "Piano").map(([, at]) => at)).not.toContain(8);
		expect(notes(tacet, "Bass").filter(([, at]) => at === 8)).toEqual([
			[43, 8, 4],
			[62, 8, 4],
			[67, 8, 4],
			[71, 8, 4],
		]);
		// RH2 plays only in the Bridge (bars 5 and 6, from 16).
		const lines = play(PIANO_LINES);
		expect(notes(lines, "Piano RH2")).toEqual([
			[59, 16, 4],
			[55, 20, 4],
		]);
		// A hold after a tacet bar holds nothing.
		const held = play(
			"part: A = Piano\npart: B = Bass\nA | C |\nB | E |\n---\nB | G |\n---\nA | / |\nB | / |",
		);
		expect(notes(held, "Piano").map(([, at, length]) => [at, length])).toEqual(
			Array(4).fill([0, 4]),
		);
	});

	test("the part option", () => {
		const gtr = extractPart(MORNING_SONG, "Gtr");
		if (!gtr) throw new Error("no part Gtr");
		expect(plan(perform(gtr))).toEqual([["Electric Guitar 1", "Gtr", null, "line", 1]]);
		const pno = extractPart(PIANO_LINES, "Pno");
		if (!pno) throw new Error("no part Pno");
		expect(plan(perform(pno)).map(([name]) => name)).toEqual(["Piano RH", "Piano LH", "Piano RH2"]);
	});

	test("pedal belongs to the part", () => {
		const lines = play(PIANO_LINES);
		const rh = pedal(track(lines, "Piano RH"));
		expect(rh?.slice(0, 3)).toEqual([
			[0, true],
			[4, false],
			[4, true],
		]);
		expect(pedal(track(lines, "Piano LH"))).toEqual(rh);
		expect(pedal(track(lines, "Piano RH2"))).toEqual(rh);
		expect(pedal(track(lines, "Bass"))).toEqual([]);
		// A melodic part's pedal is on its harmony track too.
		const melodic = play(
			"part: Vn = Violin, instrument: violin\nVn | +C | *G |\nVn.Mel | {E4} | {D4} |",
		);
		expect(plan(melodic).map(([name]) => name)).toEqual(["Violin", "Violin chords"]);
		expect(pedal(track(melodic, "Violin"))).toEqual([
			[0, true],
			[4, false],
		]);
		expect(pedal(track(melodic, "Violin chords"))).toEqual(pedal(track(melodic, "Violin")));
		// A second part's pedal, from its own bars.
		const second = play("part: A = Bass\npart: B = Piano\nA | C | D |\nB | +E | *F |");
		expect(pedal(track(second, "Bass"))).toEqual([]);
		expect(pedal(track(second, "Piano"))).toEqual([
			[0, true],
			[4, false],
		]);
	});

	test("a push after a tacet bar takes its time from the tacet bar, notes and pedal alike", () => {
		const p = play(
			"part: A = Piano\npart: B = Bass\nA | C C C C C C C C |\nB | E |\n---\nB | E |\n---\nA | +<G |\nB | E |",
		);
		// G attacks an eighth early, in the tacet bar, though the eighth before the tacet bar can't give a push.
		expect(notes(p, "Piano").filter(([, at]) => (at ?? 0) >= 4)).toEqual([
			[43, 7.5, 4.5],
			[62, 7.5, 4.5],
			[67, 7.5, 4.5],
			[71, 7.5, 4.5],
		]);
		expect(pedal(track(p, "Piano"))).toEqual([
			[7.5, true],
			[12, false],
		]);
	});

	test("lyrics and words move with their pushed notes", () => {
		const p = play(
			'part: Vo = Voice, instrument: voice\nVo | C "x" <G |\nVo.Mel | {C4}:a <{D4}:b |',
		);
		const voice = track(p, "Voice");
		expect(voice?.lyrics.map((l) => [l.text, toNumber(l.at)])).toEqual([
			["a ", 0],
			["b ", 1.5],
		]);
		expect(track(p, "Voice chords")?.words.map((w) => [w.text, toNumber(w.at)])).toEqual([
			["x", 1.5],
		]);
		expect(notes(p, "Voice")).toEqual([
			[60, 0, 1.5],
			[62, 1.5, 2.5],
		]);
	});
});
