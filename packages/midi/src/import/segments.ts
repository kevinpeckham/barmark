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
import type { Note } from "./notes.js";
import type { Report } from "./report.js";
import { bassLine } from "./streams.js";

/** Notes starting within this many quarters (a 16th) of the first are one attack: a chord whose notes are each played up to a 32nd early or late (Claude's ruling, 2026-11-08, from Task 13b's jitter test). */
const ATTACK = 1 / 4;
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

/**
 * Two or more harmony-voice notes struck together. `mask` is what the
 * voices sound after them: the pitch classes struck and those held (to
 * at least the first struck note's end); `held` the held ones alone;
 * `lows` each stream's lowest pitch struck, `top` the highest's pitch
 * class, `end` where the last struck stops.
 */
type Attack = { mask: number; held: number; lows: Map<number, number>; top: number; end: number };

/** The notes starting within the window of the first: `[from, to)` in the sorted notes; `bass` the pitch class of a bass note struck there. */
type Group = {
	start: number;
	from: number;
	to: number;
	end: number;
	attack: Attack | null;
	bass: number | null;
};

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
		groups.push({ start, from: i, to: j, end, attack: null, bass: null });
		i = j;
	}
	return groups;
}

/** The pitch classes of the pitches whose `latest` end reaches `stop`. */
function heldMask(latest: number[], stop: number): number {
	let mask = 0;
	latest.forEach((end, pitch) => {
		if (end >= stop) mask |= bit(pitch);
	});
	return mask;
}

function attackOf(upper: Note[], latest: number[]): Attack {
	const firstStop = Math.min(...upper.map((n) => n.end));
	const held = heldMask(latest, firstStop);
	const mask = upper.reduce((m, n) => m | bit(n.pitch), held);
	const lows = new Map<number, number>();
	for (const n of upper) lows.set(streamOf(n), Math.min(lows.get(streamOf(n)) ?? 128, n.pitch));
	const top = Math.max(...upper.map((n) => n.pitch)) % 12;
	return { mask, held, lows, top, end: Math.max(...upper.map((n) => n.end)) };
}

/**
 * The bass note a group strikes: the bass line's lowest, or with no bass
 * line an attack's lowest; none when a lower note still sounds (to at
 * least the first struck note's end).
 */
function bassOf(struck: Note[], line: number | null, latest: number[], attack: Attack | null) {
	const candidates =
		line === null ? (attack ? struck : []) : struck.filter((n) => streamOf(n) === line);
	if (candidates.length === 0) return null;
	const low = Math.min(...candidates.map((n) => n.pitch));
	const firstStop = Math.min(...struck.map((n) => n.end));
	return latest.slice(0, low).some((end) => end >= firstStop) ? null : low % 12;
}

/**
 * Marks each group's attack (two or more harmony-voice notes, the bass
 * line's left out) and the bass note it strikes. `latest[p]` is the
 * latest end of pitch `p` among notes started before, `upperLatest`
 * the same for the harmony voices.
 */
function markGroups(notes: Note[], groups: Group[], line: number | null) {
	const latest = new Array<number>(128).fill(Number.NEGATIVE_INFINITY);
	const upperLatest = new Array<number>(128).fill(Number.NEGATIVE_INFINITY);
	for (const g of groups) {
		const struck = notes.slice(g.from, g.to);
		const upper = struck.filter((n) => streamOf(n) !== line);
		if (upper.length >= 2) g.attack = attackOf(upper, upperLatest);
		g.bass = bassOf(struck, line, latest, g.attack);
		for (const n of struck) latest[n.pitch] = Math.max(latest[n.pitch] ?? 0, n.end);
		for (const n of upper) upperLatest[n.pitch] = Math.max(upperLatest[n.pitch] ?? 0, n.end);
	}
}

/** The chord being read: its attack's sound, each stream's lowest voice in it, and its bass's pitch class. */
type Chord = { mask: number; lows: Map<number, number>; bass: number | null };

/** Whether every stream striking `a` struck in the chord and now strikes above its lowest voice there. */
const thinner = (chord: Chord, a: Attack) =>
	[...a.lows].every(([id, low]) => low > (chord.lows.get(id) ?? 128));

/**
 * Whether an attack changes the chord (Claude's ruling, 2026-11-08, fix
 * round 2): any pitch class added or dropped. Two carry: a re-strike
 * inside a bar that only drops notes, each stream striking above its own
 * lowest voice in the chord (a thinner voicing), and a lone new top note
 * over a chord all held from before (a melody note on a re-strike).
 */
function changes(chord: Chord, a: Attack, atLine: boolean): boolean {
	const added = a.mask & ~chord.mask;
	const dropped = chord.mask & ~a.mask;
	if (added === 0) return dropped !== 0 && (atLine || !thinner(chord, a));
	// all held means nothing dropped, since what is held sounds
	const melody = added === 1 << a.top && (chord.mask & ~a.held) === 0;
	return !melody;
}

/** Whether a bar line falls within `window` of `tick`. */
function atBarLine(grid: Grid, tick: number, window: number): boolean {
	const line = grid.bars[barAt(grid, tick + window) - 1]?.start;
	return line !== undefined && line > tick - window;
}

/**
 * The cuts of a stretch with attacks. A bass leading in across a bar
 * line reads alone (`leadIn`); the chord starts at the first attack's
 * bar line, or with the stretch. Then a new chord where an attack
 * changes it (`changes`), or where the bass moves to a new pitch class at
 * a bar line under it; a change first heard after the voices rest
 * starts where the bass so moved in the rest, else at its attack.
 */
function voiceCuts(stretch: Group[], grid: Grid, window: number, cuts: Cut[]): number {
	const begin = leadIn(stretch, grid, window, cuts);
	const read: Reading = {
		chord: null,
		reach: Number.NEGATIVE_INFINITY,
		moved: Number.NEGATIVE_INFINITY,
	};
	for (const g of stretch) {
		const line = atBarLine(grid, g.start, window);
		if (line) bassMove(read, g, cuts);
		if (g.attack !== null) attack(read, g, g.attack, line, cuts);
	}
	return begin;
}

/** The chord being read, where its voices last stop, and where the bass last moved under it. */
type Reading = { chord: Chord | null; reach: number; moved: number };

/** At a bar line: the bass struck on a new pitch class under the chord cuts there. */
function bassMove(read: Reading, g: Group, cuts: Cut[]) {
	const bass = read.chord?.bass;
	if (read.chord === null || bass == null || g.bass === null || g.bass === bass) return;
	cuts.push({ at: g.start, harmony: true });
	read.moved = g.start;
	read.chord.bass = g.bass;
}

/** An attack: a new chord when it changes the one read (cut where the bass moved in a rest before it, else at it). */
function attack(read: Reading, g: Group, a: Attack, line: boolean, cuts: Cut[]) {
	const chord = read.chord;
	if (chord !== null && !changes(chord, a, line)) keepLows(chord, a);
	else {
		if (chord !== null)
			cuts.push({ at: read.moved >= read.reach ? read.moved : g.start, harmony: true });
		read.chord = { mask: a.mask, lows: new Map(a.lows), bass: g.bass ?? chord?.bass ?? null };
	}
	read.reach = Math.max(read.reach, a.end);
}

/** A stream first striking in a carried chord: its lowest voice there is its own. */
function keepLows(chord: Chord, a: Attack) {
	for (const [id, low] of a.lows) if (!chord.lows.has(id)) chord.lows.set(id, low);
}

/**
 * When a bar line falls after the stretch's start and at or before its
 * first attack (or within the window after it), the chord starts there
 * and what leads in before it reads note by note (13b's ruling: `| {D2}
 * | / | / | / | D |`; an attack struck early, before the line, still cuts
 * where struck); returns where the chord starts.
 */
function leadIn(stretch: Group[], grid: Grid, window: number, cuts: Cut[]): number {
	const first = stretch.find((g) => g.attack !== null) as Group;
	const start = (stretch[0] as Group).start;
	const line = grid.bars[barAt(grid, first.start + window) - 1]?.start ?? start;
	if (line <= start) return start;
	lineCuts(
		stretch.filter((g) => g.start < line),
		cuts,
	);
	cuts.push({ at: line, harmony: true });
	return line;
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

/** How a note is weighed: always, only while the chord's attack notes sound (`gated`), or as their gate. */
type Weighed = { note: Note; gated: boolean; gate: boolean };

/**
 * The notes weighed in a stretch. Single lines (a stretch without
 * attacks, or a lead-in) always. Past a lead-in, the harmony voices only
 * while two or more notes struck in its attacks sound: so a fill after
 * a stab, or a pedal under it, doesn't rename the chord; the bass line
 * not at all (each chord keeps its bass's pitch class).
 */
function weighedIn(
	notes: Note[],
	stretch: Group[],
	begin: number | null,
	line: number | null,
): Weighed[] {
	const out: Weighed[] = [];
	for (const g of stretch)
		for (const note of notes.slice(g.from, g.to)) {
			if (begin === null || g.start < begin) out.push({ note, gated: false, gate: false });
			else if (streamOf(note) !== line) out.push({ note, gated: true, gate: g.attack !== null });
		}
	return out;
}

/** Where segments start, by stretches of sound (silence between them is no harmony), and the notes weighed. */
function cutsOf(notes: Note[], window: number, grid: Grid) {
	const groups = groupsOf(notes, window);
	const found = bassLine(notes);
	const line = found && found.track * 16 + found.channel;
	markGroups(notes, groups, line);
	const cuts: Cut[] = [];
	const weighed: Weighed[] = [];
	for (let g = 0; g < groups.length; ) {
		const { stretch, reach } = stretchFrom(groups, g);
		const voiced = stretch.some((x) => x.attack !== null);
		cuts.push({ at: (stretch[0] as Group).start, harmony: true });
		const begin = voiced ? voiceCuts(stretch, grid, window, cuts) : null;
		if (!voiced) lineCuts(stretch, cuts);
		cuts.push({ at: reach, harmony: false });
		weighed.push(...weighedIn(notes, stretch, begin, line));
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

type Point = { at: number; pc: number; step: number; gated: boolean; gate: boolean };

function pointsOf(weighed: Weighed[]): Point[] {
	return weighed
		.flatMap(({ note: n, gated, gate }) => [
			{ at: n.start, pc: n.pitch % 12, step: 1, gated, gate },
			{ at: n.end, pc: n.pitch % 12, step: -1, gated, gate },
		])
		.sort((a, b) => a.at - b.at);
}

/**
 * Each segment's time per pitch class: one sweep over the weighed notes'
 * starts and ends; gated notes count while two or more gate notes sound.
 * A segment with nothing weighed (the bass moved under a chord whose
 * voices rest) takes the sound of the segment before it.
 */
function weigh(weighed: Weighed[], segments: Segment[]) {
	const sweep: Sweep = {
		always: new Array<number>(12).fill(0),
		gated: new Array<number>(12).fill(0),
		gate: 0,
		last: segments[0]?.start ?? 0,
	};
	let k = 0;
	for (const p of pointsOf(weighed)) {
		k = sweepTo(segments, k, sweep, p.at);
		const counts = p.gated ? sweep.gated : sweep.always;
		counts[p.pc] = (counts[p.pc] as number) + p.step;
		sweep.gate += p.gate ? p.step : 0;
	}
	carryWeights(segments);
}

/** Weighs every segment up to `at`, from segment `k`; returns the segment holding `at`. */
function sweepTo(segments: Segment[], k: number, sweep: Sweep, at: number): number {
	let i = k;
	for (let s = segments[i]; s !== undefined && s.end <= at; s = segments[++i])
		addTo(s, sweep, s.end);
	const s = segments[i];
	if (s !== undefined && at > sweep.last) addTo(s, sweep, at);
	return i;
}

/** What sounds in the sweep: per pitch class, notes always weighed and gated ones; gate notes sounding; the tick weighed to. */
type Sweep = { always: number[]; gated: number[]; gate: number; last: number };

/** Adds to `s` what sounds from the sweep's last tick to `to`; gated notes only while the gate is open. */
function addTo(s: Segment, sweep: Sweep, to: number) {
	const open = sweep.gate >= 2 ? 1 : 0;
	const span = to - sweep.last;
	s.weights = s.weights.map(
		(w, pc) => w + ((sweep.always[pc] as number) + open * (sweep.gated[pc] as number)) * span,
	);
	sweep.last = to;
}

/** A harmony segment with nothing weighed takes the weights of the harmony segment just before it. */
function carryWeights(segments: Segment[]) {
	for (const [i, s] of segments.entries()) {
		const before = segments[i - 1];
		if (s.harmony && before?.harmony && s.weights.every((w) => w === 0))
			s.weights = [...before.weights];
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
