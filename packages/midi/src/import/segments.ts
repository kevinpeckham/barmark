/**
 * Chords from the notes sounding (spec 5.5). The harmony is cut into
 * segments, each one chord. Chords come from the harmony voices, not the
 * bass line (Claude's ruling, 2026-11-08, fix round 1):
 *
 * - **Stretches:** where every note has stopped, a segment of no
 *   harmony, `N.C.`, begins; a note struck as the last stops is no gap.
 * - **The bass line** is the stream (track and channel) that never
 *   strikes two notes at once, lowest on average, when it lies below
 *   every stream that plays chords. Its movement never starts a chord.
 * - **An attack** is two or more harmony-voice notes struck within a 32nd
 *   of the first. A stretch's first chord starts with the stretch (the
 *   bass leading in belongs to it); a later attack starts a new chord
 *   when it adds a pitch class to the chord's sound, unless only its top
 *   note over the chord still sounding (a melody note on a re-strike). A
 *   single note never does. So a chord carries through rests in the
 *   harmony voices; a change first heard after such a rest starts at the
 *   last bar line in the rest, where the bass moved to it.
 * - A stretch with no attack at all (single lines only) cuts where two
 *   notes are struck together or one starts as all stop: note by note.
 * - Each pitch class of the harmony voices weighs the time it sounds in
 *   the segment (the bass line counts only as each chord's bass); one
 *   under `PASSING` of the strongest is a passing tone, left out.
 * - The **bass** is the lowest note struck within a 32nd of the
 *   segment's start, or held into it from before when it sounds at least
 *   until the first struck note stops (a pedal, a bass held under a
 *   stab): so the tail of the last chord played legato is not the bass
 *   (Claude's ruling, 2026-11-08). Its pitch class is always kept.
 * - The name is barmark's `nameNotes`, spelled for the key sync writes
 *   (its `conventionalKey`), once for each key in force over the chord;
 *   with none, a note set of at most three pitch classes (bass first,
 *   then upward), else `?` (`chord-unnamed`). At most `MAX_NAMES`
 *   different sounds are named an import; past it, `?`.
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
	/** The bass pitch; set for every harmony segment by `findBasses`. */
	bass: number;
};

type Cut = { at: number; harmony: boolean };

/** Two or more harmony-voice notes struck together: what sounds above the bass line after them. */
type Attack = { mask: number; top: number; end: number };

/** The notes starting within a 32nd of the first: `[from, to)` in the sorted notes. */
type Group = { start: number; from: number; to: number; end: number; attack: Attack | null };

const streamOf = (n: Note) => n.track * 16 + n.channel;
const bit = (pitch: number) => 1 << (pitch % 12);

function groupsOf(notes: Note[], window: number): Group[] {
	const groups: Group[] = [];
	for (let i = 0; i < notes.length; ) {
		const start = (notes[i] as Note).start;
		let end = start;
		let j = i;
		for (let n = notes[j]; n !== undefined && n.start < start + window; n = notes[++j])
			end = Math.max(end, n.end);
		groups.push({ start, from: i, to: j, end, attack: null });
		i = j;
	}
	return groups;
}

/**
 * The bass line: the stream (track and channel) that never strikes two
 * notes at once, lowest on average, when it lies below every stream that
 * plays chords; else none, and every note is a harmony voice.
 */
function bassStreamOf(notes: Note[], groups: Group[]): number | null {
	const stats = new Map<number, { sum: number; count: number; chordal: boolean }>();
	for (const g of groups) {
		const seen = new Set<number>();
		for (const n of notes.slice(g.from, g.to)) {
			const id = streamOf(n);
			const st = stats.get(id) ?? { sum: 0, count: 0, chordal: false };
			st.sum += n.pitch;
			st.count++;
			st.chordal ||= seen.has(id);
			seen.add(id);
			stats.set(id, st);
		}
	}
	let bass: number | null = null;
	let low = Number.POSITIVE_INFINITY;
	let chordLow = Number.POSITIVE_INFINITY;
	for (const [id, st] of stats) {
		const mean = st.sum / st.count;
		if (st.chordal) chordLow = Math.min(chordLow, mean);
		else if (mean < low) [bass, low] = [id, mean];
	}
	return low < chordLow ? bass : null;
}

/**
 * Marks each group whose harmony voices strike two or more notes. Its
 * sound is the pitch classes struck and those held (to at least the first
 * struck note's end), its top the highest struck.
 */
function markAttacks(notes: Note[], groups: Group[], bass: number | null) {
	const latest = new Array<number>(128).fill(Number.NEGATIVE_INFINITY);
	for (const g of groups) {
		const upper = notes.slice(g.from, g.to).filter((n) => streamOf(n) !== bass);
		if (upper.length >= 2) {
			const firstStop = Math.min(...upper.map((n) => n.end));
			let mask = 0;
			for (const n of upper) mask |= bit(n.pitch);
			latest.forEach((end, pitch) => {
				if (end >= firstStop) mask |= bit(pitch);
			});
			const top = Math.max(...upper.map((n) => n.pitch));
			g.attack = { mask, top: top % 12, end: Math.max(...upper.map((n) => n.end)) };
		}
		for (const n of upper) latest[n.pitch] = Math.max(latest[n.pitch] ?? 0, n.end);
	}
}

/**
 * Whether an attack changes the chord whose sound is `chord`: it adds a
 * pitch class, unless that is only its top note over the chord still
 * sounding (a melody note on a re-strike).
 */
function changes(chord: number, a: Attack): boolean {
	const added = a.mask & ~chord;
	if (added === 0) return false;
	return !(added === 1 << a.top && (chord & ~a.mask) === 0);
}

/**
 * Where a change at `tick` starts: at the last bar line since the
 * harmony voices' last chord stopped (`reach`), when one falls in that
 * rest, since the change sounded there in the bass; else at `tick`.
 */
function changeAt(grid: Grid, reach: number, tick: number): number {
	const line = grid.bars[barAt(grid, tick) - 1]?.start;
	return line !== undefined && line >= reach ? line : tick;
}

/** A stretch with attacks: a chord from its start, a new one where an attack changes it. */
function voiceCuts(stretch: Group[], grid: Grid, cuts: Cut[]) {
	let chord: number | null = null;
	let reach = Number.NEGATIVE_INFINITY;
	for (const { attack: a, start } of stretch) {
		if (a === null) continue;
		if (chord === null || changes(chord, a)) {
			if (chord !== null) cuts.push({ at: changeAt(grid, reach, start), harmony: true });
			chord = a.mask;
		}
		reach = Math.max(reach, a.end);
	}
}

/** A stretch of single lines only: a cut at two notes struck together, or a note struck as all stop. */
function lineCuts(stretch: Group[], cuts: Cut[]) {
	let reach = Number.NEGATIVE_INFINITY;
	for (const [i, g] of stretch.entries()) {
		if (i > 0 && (g.to - g.from >= 2 || reach <= g.start))
			cuts.push({ at: g.start, harmony: true });
		reach = Math.max(reach, g.end);
	}
}

/**
 * Where segments start, by stretches of sound (silence between them is
 * no harmony), and the notes weighed: a stretch whose harmony voices
 * strike chords changes chord only where they do (the bass line is
 * weighed only as each chord's bass); a stretch of single lines cuts as
 * they start.
 */
function cutsOf(notes: Note[], window: number, grid: Grid) {
	const groups = groupsOf(notes, window);
	const bass = bassStreamOf(notes, groups);
	markAttacks(notes, groups, bass);
	const cuts: Cut[] = [];
	const weighed: Note[] = [];
	for (let g = 0; g < groups.length; ) {
		const { stretch, reach } = stretchFrom(groups, g);
		const voiced = stretch.some((x) => x.attack !== null);
		cuts.push({ at: (stretch[0] as Group).start, harmony: true });
		if (voiced) voiceCuts(stretch, grid, cuts);
		else lineCuts(stretch, cuts);
		cuts.push({ at: reach, harmony: false });
		for (const n of notes.slice(stretch[0]?.from, stretch.at(-1)?.to))
			if (!voiced || streamOf(n) !== bass) weighed.push(n);
		g += stretch.length;
	}
	return { cuts, weighed };
}

/** The groups from `g` sounding without a gap, and where the last of their notes stops. */
function stretchFrom(groups: Group[], g: number) {
	let h = g;
	let reach = (groups[g] as Group).start;
	for (let x = groups[h]; x !== undefined && x.start <= reach; x = groups[++h])
		reach = Math.max(reach, x.end);
	return { stretch: groups.slice(g, h), reach };
}

/** The segments covering the grid: no harmony before the first cut, a later cut at one tick winning. */
function segmentsOf(cuts: Cut[], from: number, to: number): Segment[] {
	const starts = [{ at: from, harmony: false }, ...cuts].filter((c) => c.at >= from && c.at < to);
	const segments: Segment[] = [];
	for (const [i, c] of starts.entries()) {
		const end = starts[i + 1]?.at ?? to;
		if (end > c.at)
			segments.push({
				start: c.at,
				end,
				harmony: c.harmony,
				weights: new Array<number>(12).fill(0),
				bass: 0,
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
		// nothing struck (a key change inside a chord): the lowest still sounding
		const held = latest.findIndex((end) => end >= (low < 128 ? firstStop : s.start + 1));
		s.bass = held >= 0 && held < low ? held : low;
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
	const upward = [...kept].sort((a, b) => ((a - bass + 12) % 12) - ((b - bass + 12) % 12));
	return `{${upward.map((pc) => spellPitch(pc, key)).join(" ")}}`;
}

/** The most different sounds an import names (`nameNotes` costs up to a millisecond each). */
const MAX_NAMES = 20_000;

/** Each distinct sound's symbol (a chart repeats its chords), and how many more may be named. */
type Names = { cache: Map<number, string | null>; left: number };

/** A segment's symbol; null when nothing names it, undefined past `MAX_NAMES`. */
function nameOf(s: Segment, key: Key | null, keyId: number, names: Names) {
	const bass = s.bass % 12;
	const kept = keptOf(s, bass);
	let mask = 0;
	for (const pc of kept) mask |= 1 << pc;
	const id = (keyId * 12 + bass) * 4096 + mask;
	if (names.cache.has(id)) return names.cache.get(id) ?? null;
	if (names.left === 0) return undefined;
	names.left--;
	const symbol = symbolOf(kept, bass, key);
	names.cache.set(id, symbol);
	return symbol;
}

/**
 * A harmony segment's runs, one for each key in force over it from
 * `keys[k]` (the first from bar 1), each spelled for its key as `key:`
 * will read (sync's `conventionalKey`): a chord carried over a key
 * change is spelled anew, its sound unchanged.
 */
function spansOf(
	s: Segment,
	keys: KeyAt[],
	k: number,
): { start: number; end: number; k: number }[] {
	const spans: { start: number; end: number; k: number }[] = [];
	for (let start = s.start; start < s.end; k++) {
		const end = Math.min(s.end, keys[k + 1]?.tick ?? Number.POSITIVE_INFINITY);
		spans.push({ start, end, k });
		start = end;
	}
	return spans;
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

/** A `?` written: nothing names the sound (null), or past `MAX_NAMES` (undefined). */
function unnamed(report: Report, symbol: null | undefined, bar: number) {
	const message =
		symbol === null
			? "notes no chord symbol names are written as ?"
			: "past 20,000 different sounds, the chords are written as ?";
	report.add("chord-unnamed", "warning", message, { bar });
}

/**
 * The chord runs of `harmony` (sorted by start), in ticks, covering the
 * grid; `keys` as directives kept them.
 */
export function chordRuns(harmony: Note[], grid: Grid, keys: KeyAt[], report: Report): ChordRun[] {
	const window = grid.ppq * ATTACK;
	const { cuts, weighed } = cutsOf(harmony, window, grid);
	const segments = segmentsOf(cuts, grid.bars[0]?.start ?? 0, grid.end);
	weigh(weighed, segments);
	findBasses(harmony, segments, window);
	return merged(namedRuns(segments, keys, grid, report));
}

/** What naming needs: the keys, spelled; the names given so far; where to report. */
type Naming = { keys: KeyAt[]; spelled: (Key | null)[]; names: Names; grid: Grid; report: Report };

/** A harmony segment's runs: its chord named under each key in force over it from `keys[k]`. */
function chordRunsOf(s: Segment, k: number, n: Naming): ChordRun[] {
	return spansOf(s, n.keys, k).map((span) => {
		const symbol = nameOf(s, n.spelled[span.k] ?? null, span.k, n.names);
		if (typeof symbol !== "string") unnamed(n.report, symbol, barAt(n.grid, span.start));
		return { start: span.start, end: span.end, symbol: symbol ?? "?" };
	});
}

/** Each segment's runs: `N.C.`, or its chord named under each key in force over it. */
function namedRuns(segments: Segment[], keys: KeyAt[], grid: Grid, report: Report): ChordRun[] {
	const spelled = keys.map((k) => {
		const key = keyFromText(k.name);
		return key && conventionalKey(key);
	});
	const naming: Naming = {
		keys,
		spelled,
		names: { cache: new Map(), left: MAX_NAMES },
		grid,
		report,
	};
	let k = 0;
	return segments.flatMap((s) => {
		while ((keys[k + 1]?.tick ?? Number.POSITIVE_INFINITY) <= s.start) k++;
		return s.harmony ? chordRunsOf(s, k, naming) : [{ start: s.start, end: s.end, symbol: "N.C." }];
	});
}
