/**
 * Chords from the notes sounding (spec 5.5). The harmony is cut into
 * segments, each one chord:
 *
 * - A segment starts at an **attack**: two or more notes starting within
 *   a 32nd of the first of them (a block chord, a strum), or a note
 *   starting while none sounds (a fresh start). A single note under held
 *   notes (a melody note, a walking bass) doesn't cut. Where every note
 *   has stopped, a segment of no harmony, `N.C.`, begins.
 * - Each pitch class weighs the time it sounds in the segment; one under
 *   `PASSING` of the strongest is a passing tone, left out.
 * - The **bass** is the lowest note struck within a 32nd of the
 *   segment's start, or held into it from before when it sounds at least
 *   until the first struck note stops (a pedal, a bass held under a
 *   stab): so the tail of the last chord played legato is not the bass
 *   (Claude's ruling, 2026-11-08). Its pitch class is always kept.
 * - The name is barmark's `nameNotes`, spelled for the key sync writes
 *   (its `conventionalKey`); with none, a note set of at most three pitch
 *   classes (bass first, then upward), else `?` (`chord-unnamed`).
 *
 * Runs are in ticks and cover the grid from its first bar to its end,
 * equal neighbours merged. One sort, then linear sweeps.
 */
import { conventionalKey, type Key, keyFromText, nameNotes, spellPitch } from "barmark";
import type { KeyAt } from "./directives.js";
import { barAt, type Grid } from "./grid.js";
import { type Note, pitchClassPoints } from "./notes.js";
import type { Report } from "./report.js";

/** Notes starting within this many quarters (a 32nd) of each other are one attack. */
const ATTACK = 1 / 8;
/** A pitch class under this share of the strongest one's weight is a passing tone. */
const PASSING = 0.25;
/** The most pitch classes a note set names when no chord does. */
const MAX_SET = 3;

export type ChordRun = { start: number; end: number; symbol: string };

/** A segment: `harmony` false is no harmony. Weights and bass are filled by the sweeps. */
type Segment = {
	start: number;
	end: number;
	harmony: boolean;
	weights: number[];
	bass: number | null;
};

/** Where segments start: the attacks, and where every note has stopped. */
function cutsOf(notes: Note[], window: number): { at: number; harmony: boolean }[] {
	const cuts: { at: number; harmony: boolean }[] = [];
	let reach = Number.NEGATIVE_INFINITY;
	let i = 0;
	while (i < notes.length) {
		const first = (notes[i] as Note).start;
		let j = i;
		let groupReach = reach;
		for (let n = notes[j]; n !== undefined && n.start < first + window; n = notes[++j])
			groupReach = Math.max(groupReach, n.end);
		if (reach < first && cuts.length > 0) cuts.push({ at: reach, harmony: false });
		if (j - i >= 2 || reach <= first) cuts.push({ at: first, harmony: true });
		reach = groupReach;
		i = j;
	}
	if (cuts.length > 0) cuts.push({ at: reach, harmony: false });
	return cuts;
}

/** The segments covering `[from, to)`: no harmony before the first cut, a later cut at one tick winning. */
function segmentsOf(notes: Note[], window: number, from: number, to: number): Segment[] {
	const starts = [{ at: from, harmony: false }, ...cutsOf(notes, window)].filter(
		(c) => c.at >= from && c.at < to,
	);
	const segments: Segment[] = [];
	for (const [i, c] of starts.entries()) {
		const end = starts[i + 1]?.at ?? to;
		if (end > c.at)
			segments.push({
				start: c.at,
				end,
				harmony: c.harmony,
				weights: new Array<number>(12).fill(0),
				bass: null,
			});
	}
	return segments;
}

/** Each segment's time per pitch class: one sweep over note starts and ends. */
function weigh(notes: Note[], segments: Segment[]) {
	const points = pitchClassPoints(notes);
	const counts = new Array<number>(12).fill(0);
	let k = 0;
	let last = segments[0]?.start ?? 0;
	const add = (to: number) => {
		const weights = segments[k]?.weights;
		if (weights === undefined) return;
		for (let pc = 0; pc < 12; pc++)
			weights[pc] = (weights[pc] ?? 0) + (counts[pc] ?? 0) * (to - last);
		last = to;
	};
	for (const p of points) {
		for (let s = segments[k]; s !== undefined && s.end <= p.at; s = segments[++k]) add(s.end);
		if (p.at > last) add(p.at);
		counts[p.pc] = (counts[p.pc] ?? 0) + p.step;
	}
}

/** The lowest of the notes from index `i` starting before `until`, and the first of them to stop (by `end`). */
function struck(notes: Note[], i: number, until: number, end: number) {
	let low = 128;
	let firstStop = end;
	for (let n = notes[i]; n !== undefined && n.start < until; n = notes[++i]) {
		low = Math.min(low, n.pitch);
		firstStop = Math.min(firstStop, n.end);
	}
	return { low, firstStop };
}

/**
 * Each harmony segment's bass: the lowest note struck within `window` of
 * its start, or held into it until at least the first struck note stops.
 * `latest[p]` is the latest end of pitch `p` among notes started earlier.
 */
function findBasses(notes: Note[], segments: Segment[], window: number) {
	const latest = new Array<number>(128).fill(Number.NEGATIVE_INFINITY);
	let next = 0;
	for (const s of segments) {
		for (let n = notes[next]; n !== undefined && n.start < s.start; n = notes[++next])
			latest[n.pitch] = Math.max(latest[n.pitch] ?? 0, n.end);
		if (!s.harmony) continue;
		const { low, firstStop } = struck(notes, next, s.start + window, s.end);
		const held = latest.findIndex((end) => end >= firstStop);
		const bass = held >= 0 && held < low ? held : low;
		s.bass = bass < 128 ? bass : null;
	}
}

/** The kept pitch classes: none under `PASSING` of the strongest, the bass's always. */
function keptOf(s: Segment, bass: number): number[] {
	const strongest = Math.max(...s.weights);
	const kept = s.weights.flatMap((w, pc) => (w >= PASSING * strongest ? [pc] : []));
	return kept.includes(bass) ? kept : [...kept, bass];
}

/** The symbol for kept pitch classes over a bass, or null when nothing names them. */
function symbolOf(kept: number[], bass: number, key: Key | null): string | null {
	const name = nameNotes(kept, bass, key);
	if (name !== null) return name;
	if (kept.length > MAX_SET) return null;
	const upward = kept.sort((a, b) => ((a - bass + 12) % 12) - ((b - bass + 12) % 12));
	return `{${upward.map((pc) => spellPitch(pc, key)).join(" ")}}`;
}

/** A segment's symbol, or null; `cache` holds each distinct sound's (a chart repeats its chords). */
function nameOf(s: Segment, key: Key | null, cache: Map<string, string | null>): string | null {
	const bass = (s.bass ?? 0) % 12;
	const kept = keptOf(s, bass);
	const id = `${kept.join(",")} ${bass} ${key ? `${key.tonic} ${key.mode}` : ""}`;
	if (!cache.has(id)) cache.set(id, symbolOf(kept, bass, key));
	return cache.get(id) ?? null;
}

/**
 * The key spelling each segment, as `key:` will read (sync's
 * `conventionalKey`): the last at or before its start, the first from bar 1.
 */
function keysFor(segments: Segment[], keys: KeyAt[]): (Key | null)[] {
	const spelled = keys.map((k) => {
		const key = keyFromText(k.name);
		return key && conventionalKey(key);
	});
	let k = 0;
	return segments.map((s) => {
		while ((keys[k + 1]?.tick ?? Number.POSITIVE_INFINITY) <= s.start) k++;
		return spelled[k] ?? null;
	});
}

/** Equal neighbours merged (segments are contiguous). */
function merged(runs: ChordRun[]): ChordRun[] {
	const out: ChordRun[] = [];
	for (const run of runs) {
		const last = out.at(-1);
		if (last?.symbol === run.symbol) last.end = run.end;
		else out.push({ ...run });
	}
	return out;
}

/**
 * The chord runs of `harmony` (sorted by start), in ticks, covering the
 * grid; `keys` as directives kept them.
 */
export function chordRuns(harmony: Note[], grid: Grid, keys: KeyAt[], report: Report): ChordRun[] {
	const from = grid.bars[0]?.start ?? 0;
	const window = grid.ppq * ATTACK;
	const segments = segmentsOf(harmony, window, from, grid.end);
	weigh(harmony, segments);
	findBasses(harmony, segments, window);
	const spelled = keysFor(segments, keys);
	const cache = new Map<string, string | null>();
	const runs = segments.map((s, i) => {
		if (!s.harmony) return { start: s.start, end: s.end, symbol: "N.C." };
		const symbol = nameOf(s, spelled[i] ?? null, cache);
		if (symbol === null)
			report.add("chord-unnamed", "warning", "notes no chord symbol names are written as ?", {
				bar: barAt(grid, s.start),
			});
		return { start: s.start, end: s.end, symbol: symbol ?? "?" };
	});
	return merged(runs);
}
