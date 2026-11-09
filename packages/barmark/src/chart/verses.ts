import { isBar } from "./barLine.js";
import type { BarSource, Sing } from "./expand.js";
import { perWritten, slotTimes } from "./shares.js";
import type {
	ChartDiagnostic,
	DeclaredPart,
	Line,
	LyricSlot,
	Meter,
	PlayedBar,
	PlayedLyrics,
	PlayedSyllable,
	SimpleSlot,
	Slot,
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
	// Each part's lines found once, not by reading every bar line for every part.
	const byPart = new Map<string, BarsLine[]>();
	for (const l of bars) {
		const key = l.part?.toLowerCase();
		if (key === undefined) continue;
		const own = byPart.get(key);
		if (own) own.push(l);
		else byPart.set(key, [l]);
	}
	const ownLines = (p: DeclaredPart) =>
		alone ? linesOf(p, bars, true) : (byPart.get((p.label ?? "\u0000").toLowerCase()) ?? []);
	const sung = (p: DeclaredPart) => ownLines(p).some(hasSyllables);
	const first = parts.find((p) => p.instrument === "voice") ?? parts.find(sung);
	const all = parts
		.filter((p) => p === first || sung(p))
		.map((part): Singer => {
			const sings = singingLine(part, ownLines(part));
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
		const barsIn = covered.map((l) => l.cells.filter(isBar).length);
		for (const row of singingRows(group, sungOnNotes, diagnostics))
			covered.forEach((l, i) => {
				if (barsIn[i] !== row.cells.length) return;
				// In place: a copy per row would cost the rows squared over every covered line.
				const key = rowKey(group.replay, l.line);
				const sung = rows.get(key);
				if (sung) sung.push(row);
				else rows.set(key, [row]);
			});
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
function onNotes(slots: Slot[], meter: Meter): PlayedSyllable[] {
	return slotTimes(slots, meter).flatMap(({ slot, at }) =>
		slot.kind === "chord" && slot.syllable ? [{ at, syllable: slot.syllable, note: true }] : [],
	);
}

/** Where the bar's notes start. */
const noteOnsets = (slots: Slot[], meter: Meter): number[] =>
	slotTimes(slots, meter).flatMap(({ slot, at }) => (isNote(slot) ? [at] : []));

const HELD: Syllable = { kind: "held" };

/** What a row holds as a cell begins: a syllable, nothing after a breath, or nothing yet (its verse has sung nothing). */
type Held = "sung" | "breath" | "start";
const HELD_INDEX: Record<Held, number> = { sung: 0, breath: 1, start: 2 };

/**
 * A row's cell as played: each syllable at its beat, on a note when one
 * starts there; a `/` holding a syllable over a new note of the melody is
 * held there, as `:/` is (4.3). Over a tie, after a breath, before its
 * verse has sung anything, or where no note starts, a `/` sings nothing;
 * `orphan` says a `/` over a new note found nothing to hold. `ends` is
 * what the cell leaves held.
 */
function onBeats(
	cell: LyricSlot[],
	meter: Meter,
	onsets: number[],
	held: Held,
): { syllables: PlayedSyllable[]; orphan: boolean; ends: Held } {
	let state = held;
	let orphan = false;
	const syllables = slotTimes(cell, meter).flatMap(({ slot, at }): PlayedSyllable[] => {
		const note = onsets.some((o) => near(o, at));
		if (slot.kind === "syllable") {
			state = "sung";
			return [{ at, syllable: slot.syllable, note }];
		}
		if (slot.kind === "breath") state = "breath";
		else if (state === "start" && note) orphan = true;
		return slot.kind === "hold" && state === "sung" && note ? [{ at, syllable: HELD, note }] : [];
	});
	return { syllables, orphan, ends: state };
}

/** What a row holds as each of its cells begins, from its own cells: its last syllable or breath before, or "start" with none. */
function heldBefore(row: LyricsLine): Held[] {
	let state: Held = "start";
	return row.cells.map((cell) => {
		const at = state;
		for (const s of cell.flatMap((x) => (x.kind === "group" ? x.members : [x])))
			if (s.kind !== "hold") state = s.kind === "breath" ? "breath" : "sung";
		return at;
	});
}

/** Whether a cell sings the same whatever is held as it begins: it opens with a syllable or a breath. */
const opensFresh = (cell: LyricSlot[]) => {
	const first = cell[0];
	const head = first?.kind === "group" ? first.members[0] : first;
	return head?.kind === "syllable" || head?.kind === "breath";
};

const textOf = (s: PlayedSyllable) =>
	s.syllable.kind === "sung" ? s.syllable.parts.join("~") : "/";

/** A list cut short: past five items, four and how many more (`more` counts the rest). */
const SHOWN = 4;

/** "1 and 2", "1, 2 and 3"; past five, "1, 2, 3, 4 and 7 more". */
function listOf(items: string[], more: (rest: string[]) => number = (rest) => rest.length): string {
	if (items.length > SHOWN + 1)
		return `${items.slice(0, SHOWN).join(", ")} and ${more(items.slice(SHOWN))} more`;
	return items.length < 2
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "verse 2", "verses 1 and 2": each verse once. */
const versesNamed = (ns: number[]) => {
	const each = [...new Set(ns)].map(String);
	return `${each.length === 1 ? "verse" : "verses"} ${listOf(each)}`;
};

/** Passes in order, a run of three or more as a range: "1, 3 and 5\u20139". */
function passesNamed(passes: number[]): string {
	const runs: [number, number][] = [];
	for (const p of passes) {
		const last = runs.at(-1);
		if (last && p === last[1] + 1) last[1] = p;
		else runs.push([p, p]);
	}
	const items = runs.flatMap(([a, b]) =>
		b - a >= 2 ? [`${a}\u2013${b}`] : a === b ? [`${a}`] : [`${a}`, `${b}`],
	);
	const count = (item: string) => {
		const [a = 0, b = a] = item.split("\u2013").map(Number);
		return b - a + 1;
	};
	const list = listOf(items, (rest) => rest.reduce((n, item) => n + count(item), 0));
	return passes.length === 1
		? `pass ${list} of this repeat sings`
		: `passes ${list} of this repeat sing`;
}

/** A verse a bar could sing, and the row that writes it (null for its notes' syllables). */
type Candidate = {
	verse: number;
	row: LyricsLine | null;
	lyrics: PlayedLyrics;
	/** What the row's cell leaves held, and whether a `/` in it over a new note had nothing to hold. */
	ends?: Held;
	orphan?: boolean;
	/** For the notes' syllables: whether the first is a `:/`, and whether any is sung. */
	opensHeld?: boolean;
	sings?: boolean;
};

/**
 * The rows over a bar line, read once for every pass (grammar 7.7): in
 * verse order, by verse, and whether every row is verse 1 (which then
 * sings on every pass).
 */
type Verses = {
	ordered: LyricsLine[];
	byVerse: Map<number, LyricsLine[]>;
	allOne: boolean;
	/** "verses 2 and 3", without and with the notes' verse 1, once asked. */
	named: [string?, string?];
};

function versesIn(rows: LyricsLine[]): Verses {
	const verse = (r: LyricsLine) => r.verse ?? 1;
	const ordered = [...rows].sort((a, b) => verse(a) - verse(b));
	const byVerse = new Map<number, LyricsLine[]>();
	for (const r of ordered) byVerse.set(verse(r), [...(byVerse.get(verse(r)) ?? []), r]);
	return { ordered, byVerse, allOne: rows.every((r) => verse(r) === 1), named: [] };
}

/**
 * Which of a bar's verses a pass sings: outside a repeat every verse; on
 * pass N verse N, or a lone verse 1 on every pass. A lone `lyrics N:`
 * (N ≥ 2) sings on pass N only (decided by Kevin, 2026-11-06). `notes`
 * is whether the bar's notes sing verse 1; the rows chosen follow them.
 */
function forPass(
	verses: Verses,
	notes: boolean,
	pass: number | null,
): { notes: boolean; rows: LyricsLine[] } {
	const every = { notes, rows: verses.ordered };
	if (pass === null) return every;
	const own = { notes: notes && pass === 1, rows: verses.byVerse.get(pass) ?? [] };
	if (own.notes || own.rows.length) return own;
	return verses.allOne ? every : { notes: false, rows: [] };
}

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

const NO_ROWS: LyricsLine[] = [];

/**
 * The words each played bar sings (grammar 4.3, 7.7), for `expand` to
 * attach as it plays the line that sings: the syllables on its notes
 * (verse 1) and the rows over it, or under a replay heading with rows for
 * the line, that replay's rows alone; on a repeat's pass N, verse N. The
 * singer's melody is checked as it plays: a row's syllable where no note
 * starts, a `:/` with nothing sung before it to hold, and a pass that
 * sings nothing where other passes sing, warn. `finish`, after playing,
 * warns of each numbered row never sung.
 *
 * A bar played again shares what its first play read (its notes' and its
 * rows' syllables, by the written slots, the meter and what each row
 * holds as it begins): a pass costs only the verses it sings.
 */
function singing(
	rows: Rows,
	who: Singer | null,
): { sing: Sing; diagnostics: ChartDiagnostic[]; finish: (stopped?: boolean) => void } {
	const diagnostics: ChartDiagnostic[] = [];
	const warn = warner(diagnostics);
	const melody = who?.sings !== undefined;
	const part = who?.label === undefined ? {} : { part: who.label };
	const sung = new Set<LyricsLine>();
	/** What each verse's rows left held, in play order: a row starting with `/` holds on from it. */
	const ends = new Map<number, Held>();
	let heard = false;
	/**
	 * What a written bar's slots, in one meter, give every play of it: its
	 * notes' verse (null when they carry no syllables), where its notes
	 * start, each row's cell (by the row, then its cell and what it holds
	 * as it begins), and the rows already read over it.
	 */
	const writtenBar = perWritten((slots: Slot[], meter: Meter) => {
		const syllables = onNotes(slots, meter);
		const notes: Candidate | null = syllables.length
			? {
					verse: 1,
					row: null,
					lyrics: { verse: 1, ...part, syllables },
					opensHeld: syllables[0]?.syllable.kind === "held",
					sings: syllables.some((s) => s.syllable.kind === "sung"),
				}
			: null;
		return {
			meter,
			notes,
			onsets: melody ? noteOnsets(slots, meter) : [],
			cells: new Map<LyricsLine, Map<number, Candidate>>(),
			checked: new Map<LyricsLine[], Set<number>>(),
		};
	});
	type Written = ReturnType<typeof writtenBar>;
	const held = new WeakMap<LyricsLine, Held[]>();
	const heldAt = (row: LyricsLine, i: number): Held => {
		let each = held.get(row);
		if (!each) {
			each = heldBefore(row);
			held.set(row, each);
		}
		return each[i] ?? "start";
	};
	const verses = new WeakMap<LyricsLine[], Verses>();
	const versesOver = (own: LyricsLine[]): Verses => {
		let v = verses.get(own);
		if (!v) {
			v = versesIn(own);
			verses.set(own, v);
		}
		return v;
	};
	/** A row's cell read over a written bar, from what it holds as it begins: a syllable where no note starts warns. */
	const readRow = (row: LyricsLine, w: Written, at: number, begins: Held): Candidate => {
		const verse = row.verse ?? 1;
		const cell = onBeats(row.cells[at] ?? [], w.meter, w.onsets, begins);
		const missed = melody ? cell.syllables.find((s) => !s.note) : undefined;
		if (missed)
			warn(row.line, `"${textOf(missed)}" falls where the voice starts no note`, textOf(missed));
		const lyrics = { verse, ...part, syllables: cell.syllables };
		return { verse, row, lyrics, ends: cell.ends, orphan: cell.orphan };
	};
	/** The cells already read of a row over a written bar. */
	const readOver = (row: LyricsLine, w: Written): Map<number, Candidate> => {
		const found = w.cells.get(row);
		if (found) return found;
		const made = new Map<number, Candidate>();
		w.cells.set(row, made);
		return made;
	};
	/** A row's verse in a bar, its syllables on the beats: read once for each thing it can begin holding. */
	const fromRow = (row: LyricsLine, w: Written, at: number): Candidate => {
		const own = heldAt(row, at);
		const begins = own === "start" ? (ends.get(row.verse ?? 1) ?? "start") : own;
		const key = at * 4 + (opensFresh(row.cells[at] ?? []) ? 3 : HELD_INDEX[begins]);
		const read = readOver(row, w);
		const found = read.get(key);
		if (found) return found;
		const made = readRow(row, w, at, begins);
		read.set(key, made);
		return made;
	};
	/** The first time a bar line's bar plays over these slots, every row's cell is read, sung or not, for its warnings. */
	const checkRows = (own: LyricsLine[], w: Written, at: number) => {
		const seen = w.checked.get(own) ?? new Set<number>();
		w.checked.set(own, seen);
		if (seen.has(at)) return;
		seen.add(at);
		for (const row of own) fromRow(row, w, at);
	};
	/** A `:/` holds the syllable sung before it, in play order. */
	const hold = (bar: PlayedBar, notes: Candidate | null) => {
		if (notes?.opensHeld && !heard) warn(bar.line, HOLDS_NOTHING, ":/");
		if (notes?.sings) heard = true;
	};
	/** Each line's passes that sing none of its verses: one warning, pushed at the first and worded once playing is done. */
	const silences = new Map<
		string,
		{ passes: Set<number>; named: string; warning: ChartDiagnostic }
	>();
	/** On a pass that sings none of a bar's several verses, say so. */
	const silent = (over: Verses, notes: boolean, from: BarSource) => {
		const i = notes ? 1 : 0;
		over.named[i] ??= versesNamed([
			...(notes ? [1] : []),
			...over.ordered.map((r) => r.verse ?? 1),
		]);
		const named = over.named[i];
		const key = `${from.line}\u0000${named}`;
		let found = silences.get(key);
		if (!found) {
			const warning: ChartDiagnostic = {
				line: from.line,
				severity: "warning",
				message: "",
				token: "lyrics",
			};
			diagnostics.push(warning);
			found = { passes: new Set(), named, warning };
			silences.set(key, found);
		}
		found.passes.add(from.pass ?? 0);
	};
	/** Word each silent-pass warning from all its passes. */
	const wordSilences = () => {
		for (const { passes, named, warning } of silences.values())
			warning.message = `${passesNamed([...passes].sort((a, b) => a - b))} nothing: its bars have ${named}`;
	};
	/** Each written bar's notes' syllables, by their line, and whether a pass sang them. */
	const notes = new Map<string, { line: number; sung: boolean }>();
	const noteNotes = (bar: PlayedBar, from: BarSource, sungHere: boolean) => {
		const key = `${from.line}:${from.bar}`;
		notes.set(key, { line: bar.line, sung: sungHere || notes.get(key)?.sung === true });
	};
	/** A row's verse as a pass sings it: the row is sung, leaves its state held, and warns of a hold with nothing to hold. */
	const sungRow = ({ row, verse, ends: left, orphan }: Candidate) => {
		if (!row) return;
		sung.add(row);
		if (left) ends.set(verse, left);
		if (orphan) warn(row.line, HOLDS_NOTHING, "/");
	};
	/** The rows over a played bar: under its replay heading when that writes rows for its line, else as written. */
	const rowsOver = (from: BarSource): { own: LyricsLine[]; replayed: boolean } => {
		const replayed = from.replay === null ? undefined : rows.get(rowKey(from.replay, from.line));
		return { own: replayed ?? rows.get(rowKey(null, from.line)) ?? NO_ROWS, replayed: !!replayed };
	};
	/** The verses a pass sings: the notes' first, then the rows'. */
	const choose = (
		pick: ReturnType<typeof forPass>,
		mine: Candidate | null,
		w: Written,
		at: number,
	) => {
		const chosen = pick.rows.map((row) => fromRow(row, w, at));
		return pick.notes && mine ? [mine, ...chosen] : chosen;
	};
	/** What a pass leaves behind: a silent pass warns, the notes' verse is marked sung or not, holds and rows move on. */
	const played = (bar: PlayedBar, from: BarSource, mine: Candidate | null, chosen: Candidate[]) => {
		const notesSung = mine !== null && chosen[0] === mine;
		if (mine) noteNotes(bar, from, notesSung);
		hold(bar, notesSung ? mine : null);
		for (const c of chosen) sungRow(c);
	};
	const singBar = (bar: PlayedBar, from: BarSource): PlayedBar["lyrics"] => {
		const { own, replayed } = rowsOver(from);
		const w = writtenBar(bar.slots, bar.meter);
		checkRows(own, w, from.bar);
		const mine = replayed || !who ? null : w.notes;
		const over = versesOver(own);
		const chosen = choose(forPass(over, mine !== null, from.pass), mine, w, from.bar);
		if ((mine || own.length) && !chosen.length) silent(over, mine !== null, from);
		played(bar, from, mine, chosen);
		return chosen.length ? chosen.map((c) => c.lyrics) : undefined;
	};
	/** How many verses a bar would sing here, with no effect on what is sung or warned. */
	const versesHere = (bar: PlayedBar, from: BarSource): number => {
		const { own, replayed } = rowsOver(from);
		const mine = replayed || !who ? null : writtenBar(bar.slots, bar.meter).notes;
		const pick = forPass(versesOver(own), mine !== null, from.pass);
		return (pick.notes && mine ? 1 : 0) + pick.rows.length;
	};
	const sing: Sing = Object.assign(singBar, { verses: versesHere });
	/** After playing: word the silent passes, then warn of verses never sung, unless a stop left them unsung. */
	const finish = (stopped = false) => {
		wordSilences();
		if (stopped) return;
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
	const sing = (bar: PlayedBar, from: BarSource) => {
		const all = sings.flatMap((s) => s(bar, from) ?? []);
		return all.length ? all.sort((a, b) => a.verse - b.verse) : undefined;
	};
	const verses = (bar: PlayedBar, from: BarSource) =>
		sings.reduce((n, s) => n + s.verses(bar, from), 0);
	return Object.assign(sing, { verses });
}
