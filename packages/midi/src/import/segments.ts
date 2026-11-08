/**
 * Chords from the notes sounding (spec 5.5; Claude's rulings, 2026-11-08,
 * fix rounds 1-5). The harmony is cut into segments, each one chord:
 *
 * - **Stretches:** where every note has stopped, a segment of no
 *   harmony, `N.C.`, begins; a note struck as the last stops is no gap.
 * - **The bass line** is `streams.ts`'s lowest stream when it is a single
 *   line (`bassLine`); with none, every note is a harmony voice, and a
 *   single note struck below a chord's voices is its bass (a lone bass).
 *   The voices are the notes an attack struck above its widest gap, when
 *   that is a fifth or more with two or more notes above it (a bass and
 *   its octave or double stop under the chord), else all it struck. Two
 *   notes struck alone, under the voices or an octave apart, their chord
 *   following in the bar, are a bass figure, read like a lone note; with
 *   no chord following in the bar they begin one (an octave under a
 *   pedalled arpeggio).
 * - **An attack** is two or more harmony-voice notes struck within a 16th
 *   of the first. Its sound is what it strikes and what the voices hold.
 *   A stretch's first chord starts with it, or at the bar line its first
 *   attack falls at when a bass leads in (the lead-in reads note by note).
 *   A later attack starts a new chord when its sound differs in any way;
 *   inside a bar, a re-strike only dropping notes carries when each stream
 *   strikes above its lowest voice in the chord's voicing (struck or
 *   held), and a lone new top note shorter than half the bar carries over
 *   a chord all held from before (a melody note: it weighs nothing; held
 *   half the bar or longer it is a chord tone). A single note never does.
 * - **The bass at a bar line:** struck on a new pitch class under voices
 *   still sounding, a new chord there (the slash). While the voices rest
 *   it starts nothing, but their next attack starts at the last bar line
 *   in the rest where the bass, having moved at one, sounds (struck
 *   again, back on the chord's own note, or held through): a change, or
 *   the same voicing over the new bass. The voices have rested when their
 *   last notes stop before that attack, however far they rang past the
 *   bar line: the ring is a release, weighed no further than the line.
 *   Inside a bar the bass never moves a chord.
 * - A stretch with no attack at all (single lines only) cuts where two
 *   notes are struck together or one starts as all stop: note by note.
 * - **Weights:** each pitch class weighs the time it sounds in the
 *   segment, once however many octaves double it. Past a lead-in the
 *   voices count only while two or more notes struck in attacks sound (a
 *   fill after a stab is not the chord); the bass line and a lone bass
 *   count only as the bass. A pitch class at `PASSING` of the strongest
 *   or under is a passing tone, left out.
 * - The **bass** is the lowest note struck within a 16th of the segment's
 *   start, or held into it from before when it sounds at least until the
 *   first struck note stops (a pedal, a bass held under a stab): so the
 *   tail of the last chord played legato is not the bass. Its pitch class
 *   is always kept.
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
/** A pitch class at this share of the strongest one's weight or under is a passing tone (Claude's ruling, 2026-11-08: a fill or a pedal's ring a quarter long is not a chord tone). */
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
 * `lows` each stream's lowest pitch struck, `voicing` each stream's
 * lowest struck or held, `top` the highest's pitch class and `topEnd`
 * where the last note of that pitch class stops, `end` where the last
 * struck stops.
 */
type Attack = {
	mask: number;
	held: number;
	lows: Map<number, number>;
	voicing: Map<number, number>;
	top: number;
	topEnd: number;
	struck: number[];
	end: number;
};

/**
 * The notes starting within the window of the first: `[from, to)` in the
 * sorted notes. `bass` is the pitch of a bass note struck there and
 * `bassEnd` where it stops (`lone`: with no bass line, a single note or
 * a figure of two under the voices); `sounding` whether harmony voices
 * struck before still sound past its window. `unweighed` masks the pitch
 * classes it strikes that weigh nothing: all of a lone bass, or the
 * melody note on a re-strike. `clip` is a tick before which the voices
 * sounding from before it are weighed no further (a release ringing
 * past the bar line where the next chord starts), or -1.
 */
type Group = {
	start: number;
	from: number;
	to: number;
	end: number;
	attack: Attack | null;
	bass: number | null;
	bassEnd: number;
	lone: boolean;
	sounding: boolean;
	unweighed: number;
	clip: number;
};

const streamOf = (n: Note) => n.track * 16 + n.channel;
const bit = (pitch: number) => 1 << (pitch % 12);
/** Every pitch class. */
const ALL = 0xfff;

function groupsOf(notes: Note[], window: number): Group[] {
	const groups: Group[] = [];
	for (let i = 0; i < notes.length; ) {
		const start = (notes[i] as Note).start;
		let end = start;
		let j = i;
		for (let n = notes[j]; n !== undefined && n.start < start + window; n = notes[++j])
			end = Math.max(end, n.end);
		groups.push({
			start,
			from: i,
			to: j,
			end,
			attack: null,
			bass: null,
			bassEnd: Number.NEGATIVE_INFINITY,
			lone: false,
			sounding: false,
			unweighed: 0,
			clip: -1,
		});
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

/** The lowest pitch per stream of `pitches` given as [stream, pitch]. */
function lowsOf(pitches: [number, number][]): Map<number, number> {
	const lows = new Map<number, number>();
	for (const [id, p] of pitches) lows.set(id, Math.min(lows.get(id) ?? 128, p));
	return lows;
}

/** What the voices sound from an attack of `upper`; `latest` and `streams` say what each pitch held before is and where it stops. */
function attackOf(upper: Note[], latest: number[], streams: number[]): Attack {
	const firstStop = Math.min(...upper.map((n) => n.end));
	const held = heldMask(latest, firstStop);
	const mask = upper.reduce((m, n) => m | bit(n.pitch), held);
	const struck = upper.map((n): [number, number] => [streamOf(n), n.pitch]);
	const holding = latest.flatMap((end, p): [number, number][] =>
		end >= firstStop ? [[streams[p] as number, p]] : [],
	);
	const top = Math.max(...upper.map((n) => n.pitch)) % 12;
	return {
		struck: upper.map((n) => n.pitch),
		mask,
		held,
		lows: lowsOf(struck),
		voicing: lowsOf([...struck, ...holding]),
		top,
		topEnd: Math.max(...upper.flatMap((n) => (n.pitch % 12 === top ? [n.end] : []))),
		end: Math.max(...upper.map((n) => n.end)),
	};
}

/**
 * The bass note a group strikes, and where the notes it is chosen from
 * stop: the bass line's lowest, or with no bass line an attack's lowest
 * or a single note; none when a lower note still sounds (to at least the
 * first struck note's end).
 */
function bassOf(struck: Note[], line: number | null, latest: number[]) {
	const candidates = line === null ? struck : struck.filter((n) => streamOf(n) === line);
	if (candidates.length === 0) return null;
	const low = Math.min(...candidates.map((n) => n.pitch));
	const firstStop = Math.min(...struck.map((n) => n.end));
	if (latest.slice(0, low).some((end) => end >= firstStop)) return null;
	return { pitch: low, end: Math.max(...candidates.map((n) => n.end)) };
}

/**
 * Marks each group's attack (two or more harmony-voice notes, the bass
 * line's left out) and the bass note it strikes. `latest[p]` is the
 * latest end of pitch `p` among notes started before, `upperLatest`
 * the same for the harmony voices.
 */
function markGroups(notes: Note[], groups: Group[], line: number | null, window: number) {
	const before: Before = {
		latest: new Array<number>(128).fill(Number.NEGATIVE_INFINITY),
		upper: new Array<number>(128).fill(Number.NEGATIVE_INFINITY),
		streams: new Array<number>(128).fill(0),
		until: Number.NEGATIVE_INFINITY,
	};
	for (const g of groups) {
		const struck = notes.slice(g.from, g.to);
		const upper = struck.filter((n) => streamOf(n) !== line);
		markGroup(g, struck, upper, line, before);
		g.sounding = before.until > g.start + window;
		remember(before, struck, upper);
	}
}

/** Marks one group's attack, whether it is a lone bass, and the bass it strikes. */
function markGroup(g: Group, struck: Note[], upper: Note[], line: number | null, before: Before) {
	if (upper.length >= 2) g.attack = attackOf(upper, before.upper, before.streams);
	g.lone = line === null && struck.length === 1;
	if (line === null && g.attack === null && !g.lone) return;
	const bass = bassOf(struck, line, before.latest);
	if (bass === null) return;
	g.bass = bass.pitch;
	g.bassEnd = bass.end;
}

/**
 * What sounded before a group: each pitch's latest end, among all notes
 * and among the harmony voices (with the stream that struck it), and
 * where the voices' last note stops.
 */
type Before = { latest: number[]; upper: number[]; streams: number[]; until: number };

function remember(before: Before, struck: Note[], upper: Note[]) {
	for (const n of struck)
		before.latest[n.pitch] = Math.max(before.latest[n.pitch] as number, n.end);
	for (const n of upper) {
		before.upper[n.pitch] = Math.max(before.upper[n.pitch] as number, n.end);
		before.streams[n.pitch] = streamOf(n);
		before.until = Math.max(before.until, n.end);
	}
}

/**
 * The chord being read: its attack's sound, each stream's lowest voice in
 * it (struck or held), the lowest note its attack struck, and its bass's
 * pitch class.
 */
type Chord = { mask: number; lows: Map<number, number>; low: number; bass: number | null };

/** Whether every stream striking `a` struck in the chord and now strikes above its lowest voice there. */
const thinner = (chord: Chord, a: Attack) =>
	[...a.lows].every(([id, low]) => low > (chord.lows.get(id) ?? 128));

/**
 * Whether an attack changes the chord (Claude's ruling, 2026-11-08, fix
 * round 2): any pitch class added or dropped. Two carry: a re-strike
 * inside a bar that only drops notes, each stream striking above its own
 * lowest voice in the chord (a thinner voicing), and a `brief` lone new
 * top note over a chord all held from before (a melody note on a
 * re-strike; held half the bar or longer it is a chord tone, fix round 5).
 */
function changes(chord: Chord, a: Attack, atLine: boolean, brief: boolean): boolean {
	const added = a.mask & ~chord.mask;
	const dropped = chord.mask & ~a.mask;
	if (added === 0) return dropped !== 0 && (atLine || !thinner(chord, a));
	// all held means nothing dropped, since what is held sounds
	const melody = brief && added === 1 << a.top && (chord.mask & ~a.held) === 0;
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
 * a bar line under voices still sounding (`bassMove`). A bass moving at a
 * bar line while the voices rest starts nothing, but the voices' next
 * attack starts at the last bar line in the rest the bass sounds through
 * from its move (`heldThrough`): a change, or the same voicing over the
 * new bass. Two notes struck alone under the voices are a bass figure,
 * read like one note (`isFigure`), so the lead-in is found after them.
 */
function voiceCuts(stretch: Group[], grid: Grid, window: number, cuts: Cut[]): number {
	const read: Reading = {
		chord: null,
		reach: Number.NEGATIVE_INFINITY,
		struck: Number.NEGATIVE_INFINITY,
		moved: Number.NEGATIVE_INFINITY,
		movedTo: null,
		bass: null,
		bassEnd: Number.NEGATIVE_INFINITY,
		grid,
	};
	const own: Cut[] = [];
	const nexts = nextAttacks(stretch);
	for (const [i, g] of stretch.entries()) {
		demoteFigure(g, stretch[nexts[i] as number], read, window);
		heldThrough(read, g.start);
		const line = atBarLine(grid, g.start, window);
		const bass = bassAt(read, g);
		if (g.lone && bass !== null) g.unweighed = ALL;
		if (line && bass !== null) bassMove(read, g, bass, own);
		if (bass !== null) {
			read.bass = bass;
			read.bassEnd = g.bassEnd;
		}
		if (g.attack !== null) attack(read, g, g.attack, line, own);
	}
	// the lead-in's cuts all fall at or before the first attack, these after it: in order
	const begin = leadIn(stretch, grid, window, cuts);
	cuts.push(...own);
	return begin;
}

/**
 * The chord being read; where its voices last stop and where their last
 * attack struck; where the bass last moved at a bar line, and
 * (`movedTo`) to what while the voices rested; the pitch class of the
 * bass last struck and where its note stops; the grid.
 */
type Reading = {
	chord: Chord | null;
	reach: number;
	struck: number;
	moved: number;
	movedTo: number | null;
	bass: number | null;
	bassEnd: number;
	grid: Grid;
};

/** Whether the bass moved at a bar line since the voices' last attack: in this rest. */
const movedInRest = (read: Reading) => read.moved > read.struck;

/** The pitch class of the bass a group strikes; with no bass line, a lone note only below the chord's voices. */
function bassAt(read: Reading, g: Group): number | null {
	if (g.bass === null) return null;
	return g.lone && g.bass >= (read.chord?.low ?? 128) ? null : g.bass % 12;
}

/**
 * Two notes struck alone under the voices, with their chord (`chord`,
 * the next attack) following in the same bar, are a bass figure, an
 * octave or a double stop, read like one note: no attack, a lone bass
 * (fix round 5: LH octaves under boom-chick, a bass track in octaves or
 * double stops read `{C} C`). With no chord following in the bar they
 * begin one themselves (an octave under a pedalled arpeggio: `Fmaj7`).
 */
function demoteFigure(g: Group, chord: Group | undefined, read: Reading, window: number) {
	if (g.attack === null || g.attack.struck.length !== 2) return;
	const next = chord?.attack;
	if (next == null || !sameBar(read.grid, g.start, (chord as Group).start, window)) return;
	if (isFigure(g.attack, read.chord?.low ?? voicesLow(next))) {
		g.attack = null;
		g.lone = true;
	}
}

/** Whether `later` falls before the bar line after the bar `tick` is in (a tick within the window before a bar line is in that bar). */
function sameBar(grid: Grid, tick: number, later: number, window: number): boolean {
	const line = grid.bars[barAt(grid, tick + window)]?.start ?? Number.POSITIVE_INFINITY;
	return later < line;
}

/** For each group, the next group with an attack (before any is demoted), as an index; the last ones have none. */
function nextAttacks(stretch: Group[]): number[] {
	const next = new Array<number>(stretch.length).fill(-1);
	let j = -1;
	for (let i = stretch.length - 1; i >= 0; i--) {
		next[i] = j;
		if ((stretch[i] as Group).attack !== null) j = i;
	}
	return next;
}

/** Whether two notes are a bass figure under voices whose lowest is `low`: a double stop below them, or an octave (one pitch class, never a chord). */
function isFigure(a: Attack, low: number): boolean {
	const [lo, hi] = [Math.min(...a.struck), Math.max(...a.struck)];
	return hi < low || hi - lo === 12;
}

/**
 * Once the bass has moved at a bar line in this rest, every later bar
 * line it sounds through, held, is where it moved (a change heard after
 * the rest starts at the last bar line in it): the last line at or
 * before `at` that the bass note last struck reaches, sounding at it or
 * ending there with the rest going on, when it is after the move.
 */
function heldThrough(read: Reading, at: number) {
	if (read.chord === null || !movedInRest(read)) return;
	const last = Math.min(at, read.bassEnd);
	const line = read.grid.bars[barAt(read.grid, last) - 1]?.start;
	if (line !== undefined && line > read.moved) read.moved = line;
}

/**
 * At a bar line, the bass on a new pitch class: under voices still
 * sounding (or struck with it), a new chord there; while they rest, or a
 * lone bass with no bass line, where their next attack starts. Back on
 * the chord's own pitch class, no slash is pending (`heldThrough` places
 * the move at that line when one was made in this rest).
 */
function bassMove(read: Reading, g: Group, bass: number, cuts: Cut[]) {
	const chord = read.chord;
	if (chord === null) return;
	if (bass === chord.bass) read.movedTo = null;
	else if (!g.lone && (g.attack !== null || g.sounding)) {
		cuts.push({ at: g.start, harmony: true });
		read.moved = g.start;
		chord.bass = bass;
		read.movedTo = null;
	} else {
		read.moved = g.start;
		read.movedTo = bass;
	}
}

/**
 * An attack: a new chord when it changes the one read, else the same
 * voicing over a bass that moved while the voices rested. Either starts
 * where the bass so moved when the voices have rested since (their last
 * notes stopped before this attack, however long they rang past the bar
 * line: a release), else at the attack. A cut placed back before the
 * attack clips what rang past it from the new chord's weights.
 */
function attack(read: Reading, g: Group, a: Attack, line: boolean, cuts: Cut[]) {
	const chord = read.chord;
	const rested = movedInRest(read) && read.reach <= g.start;
	const at = rested ? read.moved : g.start;
	const cut = () => {
		cuts.push({ at, harmony: true });
		if (at < g.start) g.clip = at;
	};
	const brief = a.topEnd - g.start < barLength(read.grid, g.start) / 2;
	if (chord === null || changes(chord, a, line, brief)) {
		if (chord !== null) cut();
		read.chord = {
			mask: a.mask,
			lows: new Map(a.voicing),
			low: voicesLow(a),
			bass: read.bass,
		};
	} else if (read.movedTo !== null) {
		cut();
		chord.bass = read.movedTo;
	} else {
		keepLows(chord, a);
		// a lone new top note carried (the melody exemption) weighs nothing
		if ((a.mask & ~chord.mask) !== 0) g.unweighed = 1 << a.top;
	}
	read.movedTo = null;
	read.struck = g.start;
	read.reach = Math.max(read.reach, a.end);
}

/** The length of the bar holding `tick`. */
function barLength(grid: Grid, tick: number): number {
	const i = barAt(grid, tick) - 1;
	const start = grid.bars[i]?.start ?? 0;
	return (grid.bars[i + 1]?.start ?? grid.end) - start;
}

/** The widest gap that splits an attack into a bass register and its voices. */
const REGISTER = 7;

/**
 * The lowest of an attack's voices: above the widest gap between the
 * notes it struck when that is a fifth or more and two or more notes lie
 * above it (a bass and its double stop or octave below the chord; an
 * open voicing's gap under its top note is no split), else its lowest.
 */
function voicesLow(a: Attack): number {
	const sorted = [...a.struck].sort((x, y) => x - y);
	let split = 0;
	for (let i = 1; i < sorted.length - 1; i++)
		if (
			(sorted[i] as number) - (sorted[i - 1] as number) >
			(sorted[split] as number) - (sorted[split - 1] ?? 128)
		)
			split = i;
	const gap = (sorted[split] as number) - (sorted[split - 1] ?? 128);
	if (gap >= REGISTER) return sorted[split] as number;
	return sorted[0] as number;
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

/** How a note is weighed: to `until` (its end, or a clip); always, only while the chord's attack notes sound (`gated`), or as their gate. */
type Weighed = { note: Note; until: number; gated: boolean; gate: boolean };

/**
 * The notes weighed in a stretch. Single lines (a stretch without
 * attacks, or a lead-in) always. Past a lead-in, the harmony voices only
 * while two or more notes struck in its attacks sound: so a fill after
 * a stab, or a pedal under it, doesn't rename the chord; the bass line,
 * a lone bass with no bass line, and a melody note carried on a
 * re-strike not at all (each chord keeps its bass's pitch class). A note
 * sounding at a group's `clip` is weighed only up to it.
 */
function weighedIn(
	notes: Note[],
	stretch: Group[],
	begin: number | null,
	line: number | null,
): Weighed[] {
	const until = clipper(stretch);
	return stretch.flatMap((g) =>
		notes.slice(g.from, g.to).flatMap((note) => weighedNote(g, note, until(note), begin, line)),
	);
}

/** Where each note is weighed to, taken in start order: its end, or the first clip after its start (clips ascend, as the notes do). */
function clipper(stretch: Group[]): (note: Note) => number {
	const clips = stretch.flatMap((g) => (g.clip >= 0 ? [g.clip] : []));
	let c = 0;
	return (note) => {
		while (c < clips.length && (clips[c] as number) <= note.start) c++;
		return Math.min(note.end, clips[c] ?? Number.POSITIVE_INFINITY);
	};
}

/** How a note struck in `g` is weighed: always before `begin`; past it, gated, unless it is the bass line's or unweighed. */
function weighedNote(
	g: Group,
	note: Note,
	until: number,
	begin: number | null,
	line: number | null,
): Weighed[] {
	if (begin === null || g.start < begin) return [{ note, until, gated: false, gate: false }];
	const weighs = streamOf(note) !== line && (g.unweighed & bit(note.pitch)) === 0;
	return weighs ? [{ note, until, gated: true, gate: g.attack !== null }] : [];
}

/** Where segments start, by stretches of sound (silence between them is no harmony), and the notes weighed. */
function cutsOf(notes: Note[], window: number, grid: Grid) {
	const groups = groupsOf(notes, window);
	const found = bassLine(notes);
	const line = found && found.track * 16 + found.channel;
	markGroups(notes, groups, line, window);
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

/** The segments covering the grid: no harmony before the first cut (the cuts come in order), a later cut at one tick winning. */
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
		.flatMap(({ note: n, until, gated, gate }) => [
			{ at: n.start, pc: n.pitch % 12, step: 1, gated, gate },
			{ at: until, pc: n.pitch % 12, step: -1, gated, gate },
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
	// a pitch class sounds or not, however many octaves double it (spec 5.5)
	const sounds = (pc: number) =>
		(sweep.always[pc] as number) + open * (sweep.gated[pc] as number) > 0;
	s.weights = s.weights.map((w, pc) => (sounds(pc) ? w + span : w));
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

/** The kept pitch classes: those over `PASSING` of the strongest, the bass's always. */
function keptOf(s: Segment, bass: number): number[] {
	const strongest = Math.max(...s.weights);
	const kept = s.weights.flatMap((w, pc) => (w > PASSING * strongest ? [pc] : []));
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
