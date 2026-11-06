import { isBar } from "./barLine.js";
import type { BarSource, Sing } from "./expand.js";
import { slotTimes } from "./shares.js";
import type {
	ChartDiagnostic,
	DeclaredPart,
	Line,
	LyricSlot,
	PlayedBar,
	PlayedLyrics,
	PlayedSyllable,
	SimpleSlot,
	Syllable,
} from "./types.js";

type BarsLine = Extract<Line, { kind: "bars" }>;
type LyricsLine = Extract<Line, { kind: "lyrics" }>;

/**
 * Who sings a chart's words (grammar 7.7): a part, by its label, and the
 * line whose notes carry them (`sings`, "" for the bare line; absent when
 * the part writes no notes). A chart with no parts whose notes carry
 * syllables sings with no label.
 */
export type Singer = { part: DeclaredPart | null; label?: string; sings?: string };

/** Each simple slot of a bar line's cells. */
const simpleSlots = (l: BarsLine): SimpleSlot[] =>
	l.cells.flatMap((c) =>
		c.kind === "slots" ? c.slots.flatMap((s) => (s.kind === "group" ? s.members : [s])) : [],
	);
const isNote = (s: SimpleSlot) => s.kind === "chord" && s.chord.kind === "notes";
const hasSyllables = (l: BarsLine) => simpleSlots(l).some((s) => s.kind === "chord" && s.syllable);
const hasNotes = (l: BarsLine) => simpleSlots(l).some(isNote);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A part's bar lines: those labelled with it, and in a single-part chart the unlabelled ones too. */
function linesOf(part: DeclaredPart, bars: BarsLine[], alone: boolean): BarsLine[] {
	return bars.filter((l) => (l.part === undefined ? alone : same(l.part, part.label ?? "\u0000")));
}

/**
 * The line a part sings on: its first line, in score order, whose notes
 * carry syllables, else its first with notes. A bare line plays as the
 * first line (grammar 7.6); a part with no lines sings on "".
 */
function singingLine(part: DeclaredPart, own: BarsLine[]): string | undefined {
	const names = part.lines?.length ? part.lines : [""];
	const first = names[0] ?? "";
	const on = (name: string, test: (l: BarsLine) => boolean) =>
		own.some((l) => same(l.lineName ?? first, name) && test(l));
	return names.find((n) => on(n, hasSyllables)) ?? names.find((n) => on(n, hasNotes));
}

/**
 * Who sings a chart (grammar 7.7). `owner` sings its lyric rows: the first
 * part with `instrument: voice`, else the first part with syllables on its
 * notes; in a chart with no parts, the chart itself when its notes carry
 * syllables; null when no one sings, so a row's words are the chart's.
 * `all` is every part that sings, in score order: the owner and each part
 * with syllables on its notes, which are its own (a choir's parts).
 */
function singersOf(lines: Line[], parts: DeclaredPart[]): { owner: Singer | null; all: Singer[] } {
	const bars = lines.filter((l): l is BarsLine => l.kind === "bars");
	if (!parts.length) {
		const owner = bars.some(hasSyllables) ? { part: null, sings: "" } : null;
		return { owner, all: owner ? [owner] : [] };
	}
	const alone = parts.length === 1;
	const sung = (p: DeclaredPart) => linesOf(p, bars, alone).some(hasSyllables);
	const first = parts.find((p) => p.instrument === "voice") ?? parts.find(sung);
	const all = parts
		.filter((p) => p === first || sung(p))
		.map((part): Singer => {
			const sings = singingLine(part, linesOf(part, bars, alone));
			return {
				part,
				...(part.label && { label: part.label }),
				...(sings !== undefined && { sings }),
			};
		});
	return { owner: all.find((x) => x.part === first) ?? null, all };
}

/** The bar lines of what a singer sings on: its part's, or with no part every one. */
function singerLines(singer: Singer | null, bars: BarsLine[], parts: number): BarsLine[] {
	if (!singer) return [];
	return singer.part ? linesOf(singer.part, bars, parts === 1) : bars;
}

/** The parts as the parse reports them: each that sings with the line it sings on. */
export function withSings(parts: DeclaredPart[], singers: Singer[]): DeclaredPart[] {
	return parts.map((p) => {
		const sings = singers.find((x) => x.part === p)?.sings;
		return sings === undefined ? p : { ...p, sings };
	});
}

/** Rows by what they cover: the replay heading they are written under ("" for none) and a covered line. */
type Rows = Map<string, LyricsLine[]>;
const rowKey = (replay: number | null, line: number) => `${replay ?? ""}:${line}`;

/** The rows over one set of bars, in one place: written under them, or under one replay heading. */
type Group = { replay: number | null; rows: LyricsLine[] };

/** Each row's group: a row under a replay heading covers lines before that heading. */
function groupsOf(lines: Line[]): Group[] {
	const groups = new Map<string, Group>();
	let heading: number | null = null;
	for (const l of lines) {
		if (l.kind === "section") heading = l.line;
		const first = l.kind === "lyrics" ? l.covers[0] : undefined;
		if (l.kind !== "lyrics" || first === undefined) continue;
		const replay = heading !== null && first < heading ? heading : null;
		const key = rowKey(replay, first);
		const group = groups.get(key) ?? { replay, rows: [] };
		group.rows.push(l);
		groups.set(key, group);
	}
	return [...groups.values()];
}

const NOTES_SING =
	"the notes above sing verse 1 on their syllables, so a lyric row under them is verse 2 or later (lyrics 2:)";
const MIXED =
	"an unnumbered lyric row among numbered ones over the same bars; number every verse (lyrics 1:, lyrics 2:)";

/** Why a row can't sing in its group, or null (grammar 7.7): every syllable is written once. */
function rowProblem(
	row: LyricsLine,
	group: Group,
	sungOnNotes: boolean,
	seen: Map<number, number>,
): string | null {
	const verse = row.verse ?? 1;
	if (sungOnNotes && verse === 1) return NOTES_SING;
	if (row.verse === null && group.rows.some((r) => r.verse !== null)) return MIXED;
	const before = seen.get(verse);
	if (before === undefined) return null;
	return row.verse === null
		? `these bars already have their words (line ${before}); number each verse`
		: `verse ${verse} is already written over these bars (line ${before})`;
}

/**
 * The lyric rows each bar line sings (grammar 7.7), by the replay heading
 * they are written under and the line they cover, with an error for each
 * row that would write a syllable twice: `lyrics 1:` or an unnumbered row
 * under notes that carry syllables, an unnumbered row among numbered ones,
 * or a verse written twice over the same bars. A row with an error, or a
 * bar count other than its line's, sings nothing. Never throws.
 */
function versesOf(
	lines: Line[],
	owner: Singer | null,
	parts: number,
): { rows: Rows; diagnostics: ChartDiagnostic[] } {
	const diagnostics: ChartDiagnostic[] = [];
	const rows: Rows = new Map();
	const all = lines.filter((l): l is BarsLine => l.kind === "bars");
	const bars = new Map(all.map((l) => [l.line, l]));
	// Only the owner's syllables are the rows' verse 1; another part's are its own.
	const owners = new Set(singerLines(owner, all, parts).map((l) => l.line));
	for (const group of groupsOf(lines)) {
		const covered = (group.rows[0]?.covers ?? []).flatMap((n) => bars.get(n) ?? []);
		const sungOnNotes = covered.some((l) => owners.has(l.line) && hasSyllables(l));
		for (const row of singingRows(group, sungOnNotes, diagnostics))
			for (const l of covered)
				if (l.cells.filter(isBar).length === row.cells.length) {
					const key = rowKey(group.replay, l.line);
					rows.set(key, [...(rows.get(key) ?? []), row]);
				}
	}
	return { rows, diagnostics };
}

/** A group's rows that sing, each other with its error. */
function singingRows(group: Group, notes: boolean, diagnostics: ChartDiagnostic[]): LyricsLine[] {
	const sungOnNotes = group.replay === null && notes;
	const seen = new Map<number, number>();
	return group.rows.filter((row) => {
		const problem = rowProblem(row, group, sungOnNotes, seen);
		if (problem)
			diagnostics.push({ line: row.line, severity: "error", message: problem, token: "lyrics" });
		else seen.set(row.verse ?? 1, row.line);
		return !problem;
	});
}

/** Within a rounding error: onsets are sums of fractions of a bar. */
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** The syllables sung on a bar's notes (grammar 4.3), at their notes' onsets. */
function onNotes(bar: PlayedBar): PlayedSyllable[] {
	return slotTimes(bar.slots, bar.meter).flatMap(({ slot, at }) =>
		slot.kind === "chord" && slot.syllable ? [{ at, syllable: slot.syllable, note: true }] : [],
	);
}

/** Where the bar's notes start. */
const noteOnsets = (bar: PlayedBar): number[] =>
	slotTimes(bar.slots, bar.meter).flatMap(({ slot, at }) => (isNote(slot) ? [at] : []));

const HELD: Syllable = { kind: "held" };

/** What a row holds as a cell begins: a syllable, nothing after a breath, or nothing yet (its start). */
type Held = "sung" | "breath" | "start";

/**
 * A row's cell as played: each syllable at its beat, on a note when one
 * starts there; a `/` holding a syllable over a new note of the melody is
 * held there, as `:/` is (4.3). Over a tie, after a breath, at the row's
 * start or where no note starts, a `/` sings nothing; `orphan` says a `/`
 * over a new note found nothing before it in the row to hold.
 */
function onBeats(
	cell: LyricSlot[],
	bar: PlayedBar,
	onsets: number[],
	held: Held,
): { syllables: PlayedSyllable[]; orphan: boolean } {
	let state = held;
	let orphan = false;
	const syllables = slotTimes(cell, bar.meter).flatMap(({ slot, at }): PlayedSyllable[] => {
		const note = onsets.some((o) => near(o, at));
		if (slot.kind === "syllable") {
			state = "sung";
			return [{ at, syllable: slot.syllable, note }];
		}
		if (slot.kind === "breath") state = "breath";
		else if (state === "start" && note) orphan = true;
		return slot.kind === "hold" && state === "sung" && note ? [{ at, syllable: HELD, note }] : [];
	});
	return { syllables, orphan };
}

/** What a row holds as its cell `i` begins: its last syllable or breath before, or nothing at its start. */
function heldAt(row: LyricsLine, i: number): Held {
	const before = row.cells
		.slice(0, i)
		.flat()
		.flatMap((s) => (s.kind === "group" ? s.members : [s]))
		.filter((s) => s.kind !== "hold");
	const last = before.at(-1);
	return last === undefined ? "start" : last.kind === "breath" ? "breath" : "sung";
}

/**
 * The verses a pass sings: outside a repeat every verse; on pass N verse
 * N, or a lone verse 1 on every pass. A lone `lyrics N:` (N ≥ 2) sings on
 * pass N only (decided by Kevin, 2026-11-06).
 */
function forPass<T extends { verse: number }>(verses: T[], pass: number | null): T[] {
	if (pass === null) return verses;
	const own = verses.filter((v) => v.verse === pass);
	if (own.length) return own;
	return verses.every((v) => v.verse === 1) ? verses : [];
}

const textOf = (s: PlayedSyllable) =>
	s.syllable.kind === "sung" ? s.syllable.parts.join("~") : "/";

/** "1 and 2", "1, 2 and 3". */
const listOf = (ns: number[]) =>
	ns.length < 2 ? `${ns[0] ?? ""}` : `${ns.slice(0, -1).join(", ")} and ${ns.at(-1)}`;

/** "verse 2", "verses 1 and 2": each verse once. */
const versesNamed = (ns: number[]) => {
	const each = [...new Set(ns)];
	return `${each.length === 1 ? "verse" : "verses"} ${listOf(each)}`;
};

/** A verse a bar could sing, and the row that writes it (null for its notes' syllables). */
type Candidate = { verse: number; row: LyricsLine | null; lyrics: PlayedLyrics };

const HOLDS_NOTHING = ":/ holds the syllable before it, and none is sung before it";

/** A warning reported once per line and message. */
function warner(diagnostics: ChartDiagnostic[]) {
	const warned = new Set<string>();
	return (line: number, message: string, token: string) => {
		if (warned.has(`${line}\u0000${message}`)) return;
		warned.add(`${line}\u0000${message}`);
		diagnostics.push({ line, severity: "warning", message, token });
	};
}

/**
 * The words each played bar sings (grammar 4.3, 7.7), for `expand` to
 * attach as it plays the line that sings: the syllables on its notes
 * (verse 1) and the rows over it, or under a replay heading with rows for
 * the line, that replay's rows alone; on a repeat's pass N, verse N. The
 * singer's melody is checked as it plays: a row's syllable where no note
 * starts, a `:/` with nothing sung before it to hold, and a pass that
 * sings nothing where other passes sing, warn. `finish`, after playing,
 * warns of each numbered row never sung.
 */
function singing(
	rows: Rows,
	who: Singer | null,
): { sing: Sing; diagnostics: ChartDiagnostic[]; finish: () => void } {
	const diagnostics: ChartDiagnostic[] = [];
	const warn = warner(diagnostics);
	const melody = who?.sings !== undefined;
	const part = who?.label === undefined ? {} : { part: who.label };
	const sung = new Set<LyricsLine>();
	let heard = false;
	/** A row's verse in a bar, its syllables on the beats. */
	const fromRow = (
		row: LyricsLine,
		bar: PlayedBar,
		from: BarSource,
		onsets: number[],
	): Candidate => {
		const cell = onBeats(row.cells[from.bar] ?? [], bar, onsets, heldAt(row, from.bar));
		const syllables = cell.syllables;
		if (cell.orphan) warn(row.line, HOLDS_NOTHING, "/");
		const missed = melody ? syllables.find((s) => !s.note) : undefined;
		if (missed)
			warn(row.line, `"${textOf(missed)}" falls where the voice starts no note`, textOf(missed));
		const verse = row.verse ?? 1;
		return { verse, row, lyrics: { verse, ...part, syllables } };
	};
	/** The bar's verses before a pass picks: its notes' and its rows'. */
	const candidates = (bar: PlayedBar, from: BarSource): Candidate[] => {
		const replayed = from.replay === null ? undefined : rows.get(rowKey(from.replay, from.line));
		const own = replayed ?? rows.get(rowKey(null, from.line)) ?? [];
		const onsets = melody ? noteOnsets(bar) : [];
		const out = own.map((row) => fromRow(row, bar, from, onsets));
		const notes = replayed || !who ? [] : onNotes(bar);
		if (notes.length)
			out.unshift({ verse: 1, row: null, lyrics: { verse: 1, ...part, syllables: notes } });
		return out.sort((a, b) => a.verse - b.verse);
	};
	/** A `:/` holds the syllable sung before it, in play order. */
	const hold = (bar: PlayedBar, notes: Candidate | undefined) => {
		for (const s of notes?.lyrics.syllables ?? []) {
			if (s.syllable.kind === "sung") heard = true;
			else if (!heard) warn(bar.line, HOLDS_NOTHING, ":/");
		}
	};
	/** On a pass that sings none of a bar's several verses, say so. */
	const silent = (all: Candidate[], from: BarSource) =>
		warn(
			from.line,
			`pass ${from.pass} of this repeat sings nothing: its bars have ${versesNamed(all.map((c) => c.verse))}`,
			"lyrics",
		);
	/** Each written bar's notes' syllables, by their line, and whether a pass sang them. */
	const notes = new Map<string, { line: number; sung: boolean }>();
	const noteNotes = (bar: PlayedBar, from: BarSource, all: Candidate[], chosen: Candidate[]) => {
		const own = all.find((c) => c.row === null);
		if (!own) return;
		const key = `${from.line}:${from.bar}`;
		const sungHere = chosen.includes(own) || notes.get(key)?.sung === true;
		notes.set(key, { line: bar.line, sung: sungHere });
	};
	const sing: Sing = (bar, from) => {
		const all = candidates(bar, from);
		const chosen = forPass(all, from.pass);
		if (all.length && !chosen.length) silent(all, from);
		noteNotes(bar, from, all, chosen);
		hold(
			bar,
			chosen.find((c) => c.row === null),
		);
		for (const c of chosen) if (c.row) sung.add(c.row);
		return chosen.length ? chosen.map((c) => c.lyrics) : undefined;
	};
	const finish = () => {
		for (const n of notes.values())
			if (!n.sung) warn(n.line, "verse 1 is never sung: no pass of its repeat is pass 1", "lyrics");
		const unsung = new Set(
			[...rows.values()].flat().filter((r) => r.verse !== null && !sung.has(r)),
		);
		for (const r of unsung)
			warn(
				r.line,
				`verse ${r.verse} is never sung: no pass of its repeat is pass ${r.verse}`,
				"lyrics",
			);
	};
	return { sing, diagnostics, finish };
}

/** One voice that sings (grammar 7.7): its singer, null for the chart's words when no part sings, and its words. */
export type Voice = { singer: Singer | null } & ReturnType<typeof singing>;

/**
 * Every voice of a chart: each part that sings, the owner with the lyric
 * rows; or, when no part sings, the chart's words alone. `diagnostics`
 * are the rows' errors, `all` the parts that sing.
 */
export function voicesOf(
	lines: Line[],
	parts: DeclaredPart[],
): { voices: Voice[]; all: Singer[]; owner: Singer | null; diagnostics: ChartDiagnostic[] } {
	const { owner, all } = singersOf(lines, parts);
	const verses = versesOf(lines, owner, parts.length);
	const singers = owner ? all : [null];
	const voices = singers.map((singer) => ({
		singer,
		...singing(singer === owner ? verses.rows : new Map(), singer),
	}));
	return { voices, all, owner, diagnostics: verses.diagnostics };
}

/** The voices an extract of a part, or of one of its lines, sings: its own, and the chart's words when no part sings. */
export function voicesIn(voices: Voice[], part: DeclaredPart, lineName?: string): Voice[] {
	return voices.filter(({ singer }) => {
		if (!singer) return true;
		if (singer.part !== part) return false;
		const line = singer.sings ?? part.lines?.[0] ?? "";
		return lineName === undefined || same(lineName, line);
	});
}

/** Several voices' words on one line (verse order, then the voices' order), or none. */
export function together(sings: Sing[]): Sing | undefined {
	if (sings.length < 2) return sings[0];
	return (bar, from) => {
		const all = sings.flatMap((sing) => sing(bar, from) ?? []);
		return all.length ? all.sort((a, b) => a.verse - b.verse) : undefined;
	};
}
