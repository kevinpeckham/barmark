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
 * Whose words a chart's are (grammar 7.7): the first part with `instrument:
 * voice`, else the first part with syllables on its notes; in a chart with
 * no parts, the chart itself when its notes carry syllables. Null when no
 * one sings: a lyric row's words are then the chart's, sung over the band.
 */
export function singerOf(lines: Line[], parts: DeclaredPart[]): Singer | null {
	const bars = lines.filter((l): l is BarsLine => l.kind === "bars");
	if (!parts.length) return bars.some(hasSyllables) ? { part: null, sings: "" } : null;
	const alone = parts.length === 1;
	const part =
		parts.find((p) => p.instrument === "voice") ??
		parts.find((p) => linesOf(p, bars, alone).some(hasSyllables));
	if (!part) return null;
	const sings = singingLine(part, linesOf(part, bars, alone));
	return { part, ...(part.label && { label: part.label }), ...(sings !== undefined && { sings }) };
}

/** The parts as the parse reports them: the singer's with the line it sings on. */
export function withSings(parts: DeclaredPart[], singer: Singer | null): DeclaredPart[] {
	const sings = singer?.sings;
	return parts.map((p) => (p === singer?.part && sings !== undefined ? { ...p, sings } : p));
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
export function versesOf(lines: Line[]): { rows: Rows; diagnostics: ChartDiagnostic[] } {
	const diagnostics: ChartDiagnostic[] = [];
	const rows: Rows = new Map();
	const bars = new Map(
		lines.filter((l): l is BarsLine => l.kind === "bars").map((l) => [l.line, l]),
	);
	for (const group of groupsOf(lines)) {
		const covered = (group.rows[0]?.covers ?? []).flatMap((n) => bars.get(n) ?? []);
		for (const row of singingRows(group, covered, diagnostics))
			for (const l of covered)
				if (l.cells.filter(isBar).length === row.cells.length) {
					const key = rowKey(group.replay, l.line);
					rows.set(key, [...(rows.get(key) ?? []), row]);
				}
	}
	return { rows, diagnostics };
}

/** A group's rows that sing, each other with its error. */
function singingRows(
	group: Group,
	covered: BarsLine[],
	diagnostics: ChartDiagnostic[],
): LyricsLine[] {
	const sungOnNotes = group.replay === null && covered.some(hasSyllables);
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

/** A row's cell as played: each syllable at its beat, on a note when one starts there. */
function onBeats(cell: LyricSlot[], bar: PlayedBar, onsets: number[]): PlayedSyllable[] {
	return slotTimes(cell, bar.meter).flatMap(({ slot, at }) =>
		slot.kind === "syllable"
			? [{ at, syllable: slot.syllable, note: onsets.some((o) => near(o, at)) }]
			: [],
	);
}

/** The verses a pass sings: outside a repeat every verse; on pass N verse N, or a lone verse on every pass. */
function forPass(verses: PlayedLyrics[], pass: number | null): PlayedLyrics[] {
	if (pass === null) return verses;
	const own = verses.filter((v) => v.verse === pass);
	return own.length ? own : verses.length === 1 ? verses : [];
}

const textOf = (s: PlayedSyllable) =>
	s.syllable.kind === "sung" ? s.syllable.parts.join("~") : "/";

/**
 * The words each played bar sings (grammar 4.3, 7.7), for `expand` to
 * attach as it plays the line that sings: the syllables on its notes
 * (verse 1) and the rows over it, or under a replay heading with rows for
 * the line, that replay's rows alone; on a repeat's pass N, verse N. The
 * singer's melody is checked as it plays: a row's syllable where no note
 * starts, and a `:/` with nothing sung before it to hold, warn.
 */
export function singing(
	rows: Rows,
	who: Singer | null,
): { sing: Sing; diagnostics: ChartDiagnostic[] } {
	const diagnostics: ChartDiagnostic[] = [];
	const warned = new Set<string>();
	const warn = (line: number, message: string, token: string) => {
		if (warned.has(`${line}\u0000${message}`)) return;
		warned.add(`${line}\u0000${message}`);
		diagnostics.push({ line, severity: "warning", message, token });
	};
	const melody = who?.sings !== undefined;
	const part = who?.label === undefined ? {} : { part: who.label };
	let heard = false;
	/** The bar's verses before a pass picks: its notes' and its rows'. */
	const verses = (bar: PlayedBar, from: BarSource): { verses: PlayedLyrics[]; notes: boolean } => {
		const replayed = from.replay === null ? undefined : rows.get(rowKey(from.replay, from.line));
		const own = replayed ?? rows.get(rowKey(null, from.line)) ?? [];
		const onsets = melody ? noteOnsets(bar) : [];
		const out: PlayedLyrics[] = own.map((row) => {
			const syllables = onBeats(row.cells[from.bar] ?? [], bar, onsets);
			const missed = melody ? syllables.find((s) => !s.note) : undefined;
			if (missed)
				warn(row.line, `"${textOf(missed)}" falls where the voice starts no note`, textOf(missed));
			return { verse: row.verse ?? 1, ...part, syllables };
		});
		const notes = replayed || !who ? [] : onNotes(bar);
		if (notes.length) out.unshift({ verse: 1, ...part, syllables: notes });
		return { verses: out.sort((a, b) => a.verse - b.verse), notes: notes.length > 0 };
	};
	/** A `:/` holds the syllable sung before it, in play order. */
	const hold = (bar: PlayedBar, sung: PlayedLyrics | undefined) => {
		for (const s of sung?.syllables ?? []) {
			if (s.syllable.kind === "sung") heard = true;
			else if (!heard)
				warn(bar.line, ":/ holds the syllable before it, and none is sung before it", ":/");
		}
	};
	const sing: Sing = (bar, from) => {
		const read = verses(bar, from);
		const chosen = forPass(read.verses, from.pass);
		if (read.notes)
			hold(
				bar,
				chosen.find((v) => v.verse === 1),
			);
		return chosen.length ? chosen : undefined;
	};
	return { sing, diagnostics };
}
