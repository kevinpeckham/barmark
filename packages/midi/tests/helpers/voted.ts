/**
 * The original's side of the import yardstick (spec 9): what a chart sounds
 * on each beat as the import can hear it. On each line, the slot covering
 * the plurality of the beat wins (pushes from their early attack, holds
 * resolved), ties to the one sounding at the beat's start, as sync votes;
 * the winners are unioned over the lines. Only what the import keeps
 * counts (spec 5.2): chord symbols, voicings and note sets of two or more
 * notes on every line; single-note sets only on the chart's lowest line;
 * a line of single notes that isn't the lowest (a melody, a pedal tone, a
 * left hand over a bass part) not at all, unless every line is one.
 */
import { expect } from "bun:test";
import { type ChartParse, parseChart, printChart, type SimpleSlot } from "barmark";
import { exportMidi, importMidi } from "../../src/index.js";
import { chordVoicing, noteSetPitches } from "../../src/perform/voicing.js";
import {
	beatOnsets,
	chartByBeat,
	EPSILON,
	type Heard,
	heard,
	LISTEN,
	linesOf,
	pushed,
} from "./player.js";

/** A line's slot with what it sounds: MIDI pitches (as the export voices them), whether a single-note set, and whether struck here. */
type Sounding = Heard & { pitches: number[]; single: boolean; struck: boolean };

/** What a slot strikes, as the export voices it; null for a hold. */
function struck(slot: SimpleSlot, bass: boolean): { pitches: number[]; single: boolean } | null {
	if (slot.kind === "hold") return null;
	if (slot.kind !== "chord") return { pitches: [], single: false };
	if (slot.voicing) return { pitches: noteSetPitches(slot.voicing), single: false };
	const record = slot.chord;
	if (record.kind === "notes") {
		const pitches = noteSetPitches(record);
		return { pitches, single: new Set(pitches.map((p) => p % 12)).size === 1 };
	}
	return { pitches: chordVoicing(record, bass), single: false };
}

/** A line's slots with holds resolved: a `/` sounds what sounds before it. */
function sounding(slots: Heard[], bass: boolean): Sounding[] {
	let before = { pitches: [] as number[], single: false };
	return slots.map((h) => {
		const own = struck(h.slot, bass);
		if (own) before = own;
		return { ...h, ...before, struck: own !== null };
	});
}

/** Whether two or more notes sound together for under a tenth of the time any sounds (spec 5.2). */
function monophonic(line: Sounding[]): boolean {
	let sounds = 0;
	let together = 0;
	for (const s of line) {
		if (s.pitches.length >= 1) sounds += s.length;
		if (s.pitches.length >= 2) together += s.length;
	}
	return together < 0.1 * sounds;
}

/** A line's pitches struck, its tenth-percentile pitch and its median (spec 5.2's lowest stream). */
function lowOf(line: Sounding[]): { low: number; median: number } | null {
	const pitches = line
		.filter((s) => s.struck)
		.flatMap((s) => s.pitches)
		.sort((a, b) => a - b);
	if (pitches.length === 0) return null;
	const mid = pitches.length >> 1;
	const median =
		pitches.length % 2 === 1
			? (pitches[mid] ?? 0)
			: ((pitches[mid - 1] ?? 0) + (pitches[mid] ?? 0)) / 2;
	return { low: pitches[Math.floor(pitches.length / 10)] ?? 0, median };
}

/** A part's pedal (grammar 2.9), from the marks on its lines: a press (or change) or a lift at each time. */
function pedalOf(lines: Sounding[][]): { at: number; press: boolean }[] {
	const marks = lines.flatMap((line) =>
		line.flatMap((s) => {
			if (s.slot.kind === "silence") return [{ at: s.at, press: false }];
			if (s.slot.kind === "chord" && s.slot.pedal)
				return [{ at: s.at, press: s.slot.pedal === "press" }];
			return [];
		}),
	);
	return marks.sort((a, b) => a.at - b.at);
}

/**
 * A line's sounds with the pedal's: while it is down, what the line struck
 * since it was pressed (or changed) keeps sounding (the export holds every
 * channel of the part).
 */
function pedalled(line: Heard[], pedal: { at: number; press: boolean }[]): Heard[] {
	let held = new Set<number>();
	let down = false;
	let next = 0;
	return line.map((h) => {
		for (let e = pedal[next]; e !== undefined && e.at <= h.at + EPSILON; e = pedal[++next]) {
			held = new Set();
			down = e.press;
		}
		const own = h.sound ?? [];
		if (!down) return h;
		for (const pc of own) held.add(pc);
		return { ...h, sound: [...held] };
	});
}

/** Each line's sounds as the import keeps them: pitch classes, or nothing where it leaves the slot out. */
function kept(parse: ChartParse): Heard[][] {
	const entries = [...linesOf(parse).entries()].map(([key, { bass, slots }]) => ({
		part: key.slice(0, key.indexOf(".")),
		line: sounding(pushed(slots), bass),
	}));
	const lines = entries.map((e) => e.line);
	const playing = lines.filter((l) => lowOf(l) !== null);
	const allMono = playing.every(monophonic);
	let lowest: Sounding[] | undefined;
	let best: { low: number; median: number } | undefined;
	for (const l of playing) {
		const p = lowOf(l);
		if (p && (!best || p.low < best.low || (p.low === best.low && p.median < best.median))) {
			lowest = l;
			best = p;
		}
	}
	return entries.map(({ part, line }) => {
		const melody = !allMono && line !== lowest && monophonic(line);
		const own = line.map((s) => {
			const left = melody || (!allMono && line !== lowest && s.single);
			return { ...s, sound: left ? [] : s.pitches.map((p) => p % 12) };
		});
		return pedalled(own, pedalOf(entries.filter((e) => e.part === part).map((e) => e.line)));
	});
}

type Cover = { time: number; first: number; atStart: boolean };

/** Each sound's time within a beat on one line, its first onset, and whether it sounds at the beat's start. */
function covers(line: Heard[], start: number, end: number): Map<string, Cover> {
	const covered = new Map<string, Cover>();
	for (const h of line) {
		const time = Math.min(h.at + h.length, end) - Math.max(h.at, start);
		if (time <= EPSILON) continue;
		const key = heard(h.sound ?? []);
		const atStart = h.at <= start + EPSILON && start + EPSILON < h.at + h.length;
		const seen = covered.get(key);
		if (seen) {
			seen.time += time;
			seen.atStart ||= atStart;
		} else covered.set(key, { time, first: h.at, atStart });
	}
	return covered;
}

/** Whether `c` beats `top`: more time, or as much and sounding at the start, then starting earlier. */
const beats = (c: Cover, top: Cover) =>
	c.time > top.time + EPSILON ||
	(Math.abs(c.time - top.time) <= EPSILON &&
		(c.atStart !== top.atStart ? c.atStart : c.first < top.first));

/** A line's vote on one beat: the sound covering most of it, ties to the one sounding at its start, then the earlier. */
function vote(line: Heard[], start: number, end: number): string {
	let best = "";
	let top: Cover | undefined;
	for (const [key, c] of covers(line, start, end))
		if (!top || beats(c, top)) [best, top] = [key, c];
	return best;
}

/** Each beat's start and end in quarters, over the chart's played bars. */
function beatsOf(parse: ChartParse): [number, number][] {
	const out: [number, number][] = [];
	let at = 0;
	for (const bar of parse.bars) {
		const length = (4 * bar.meter.n) / bar.meter.d;
		const onsets = beatOnsets(bar.meter.n, bar.meter.d);
		onsets.forEach((o, i) => {
			out.push([at + o, at + (onsets[i + 1] ?? length)]);
		});
		at += length;
	}
	return out;
}

/** For each beat of the chart, the pitch classes the import should hear: each line's vote, unioned over the lines. */
function votedByBeat(parse: ChartParse): string[] {
	const lines = kept(parse);
	return beatsOf(parse).map(([start, end]) => {
		const pcs = lines.flatMap((line) => vote(line, start, end).split(" ").filter(Boolean));
		return heard(pcs.map(Number));
	});
}

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pitchClassOf = (name: string) => {
	const alter = [...name.slice(1)].reduce((a, c) => a + (c === "#" ? 1 : c === "b" ? -1 : 0), 0);
	return ((((STEPS[name[0] ?? "C"] ?? 0) + alter) % 12) + 12) % 12;
};

/** What an imported (one-line) chart writes at each beat's start: the chord's root as a pitch class (null for none), and whether it is `?`. */
function writtenByBeat(parse: ChartParse): { root: number | null; unknown: boolean }[] {
	const line = [...linesOf(parse).values()][0]?.slots ?? [];
	let before = { root: null as number | null, unknown: false };
	const written = line.map((h) => {
		if (h.slot.kind === "hold") return before;
		const root =
			h.slot.kind === "chord" && h.slot.chord.root ? pitchClassOf(h.slot.chord.root) : null;
		before = { root, unknown: h.slot.kind === "unknown" };
		return before;
	});
	return beatsOf(parse).map(([start]) => {
		const t = start + LISTEN;
		const i = line.findIndex((h) => h.at <= t + EPSILON && t + EPSILON < h.at + h.length);
		return written[i] ?? { root: null, unknown: false };
	});
}

/**
 * The yardstick (spec 9): the beats where an import's chart doesn't sound
 * what the original's voted beat does, as `beat n: heard [..], voted [..]`;
 * it may add only the perfect fifth above its chord's root (`nameNotes`
 * supplies it). Beats the import wrote as `?` are skipped and counted.
 */
export function byEar(
	original: ChartParse,
	imported: ChartParse,
): { misses: string[]; unnamed: number } {
	const voted = votedByBeat(original);
	const heardBeats = chartByBeat(imported);
	const written = writtenByBeat(imported);
	const misses: string[] = [];
	let unnamed = 0;
	if (heardBeats.length !== voted.length)
		misses.push(`${heardBeats.length} beats imported, ${voted.length} played`);
	voted.forEach((want, b) => {
		const got = heardBeats[b] ?? "";
		const { root, unknown } = written[b] ?? { root: null, unknown: false };
		if (unknown) {
			unnamed++;
			return;
		}
		if (got === want) return;
		const fifth = root === null ? "" : String((root + 7) % 12);
		const wanted = want.split(" ").filter(Boolean);
		const extra = got.split(" ").filter((pc) => pc !== "" && !wanted.includes(pc));
		const supplied = extra.length === 1 && extra[0] === fifth;
		if (!supplied || !wanted.every((pc) => got.split(" ").includes(pc)))
			misses.push(`beat ${b + 1}: heard [${got}], voted [${want}]`);
	});
	return { misses, unnamed };
}

/** A chart exported and imported again: the import's text, which must parse with no errors and print unchanged. */
export function throughMidi(text: string): string {
	const out = exportMidi(text);
	if (!out.ok) throw new Error(out.diagnostics.map((d) => d.message).join("; "));
	const { text: back, diagnostics } = importMidi(out.bytes);
	expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	expect(parseChart(back).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	expect(printChart(back)).toBe(back);
	return back;
}
