/**
 * The played yardstick (spec 5.2), from the chart alone: per section
 * occurrence in play order, its label and, when it sings, ONE sequence of
 * chord attacks and sung words in time order (a tie putting the chord
 * first, a word placed at its first syllable), else the chord attacks of
 * each bar it plays; and the same read back from a sheet with `readCho`,
 * a grid's `%`, `/`, `.`, repeats and endings played out. Test only; it
 * uses nothing in `src/` but `spelled`.
 *
 * The yardstick knows the rules of spec 4.1, 4.4 and 4.5 (a new
 * environment where a repeat sings a different verse on bars it played
 * before, one per verse where verses are stacked, the harmony of one part
 * and the singer's words), and nothing of how the export writes them.
 */
import {
	beatsOf,
	type ChartParse,
	type ChordRecord,
	extractPart,
	memberShares,
	type PlayedBar,
	parseChart,
	type Slot,
} from "barmark";
import { spelled } from "../src/export/spell.js";
import { type ChoLine, type GridParts, gridParts, readCho } from "./read-cho.js";

export type Token = { chord: string } | { word: string };
export type Sung = { label: string | null; tokens: Token[] };
/** A chord a grid bar attacks, and the beat (its cell, from 0) it attacks in. */
export type Attack = { beat: number; chord: string };
/** A bar of a grid: its beats (cells) and its chord attacks in order. */
export type GridBar = { beats: number; attacks: Attack[] };
/** An occurrence with no words: each bar it plays, in play order. */
export type Grid = { label: string | null; bars: GridBar[] };
export type Read = Sung | Grid;
export type Played = Read & { records: ChordRecord[] };

/** The first part that writes a chord symbol, by label (spec 4.4), when the chart has several. */
function defaultPart(parse: ChartParse): string | undefined {
	if (parse.parts.length < 2) return undefined;
	const writes = (i: number) =>
		parse.bars.some((b) => timedChords(b.parts?.[i]?.slots ?? [], 1).length > 0);
	const i = parse.parts.findIndex((_, k) => writes(k));
	return parse.parts[Math.max(0, i)]?.label;
}

/** A bar's harmony: its part's first line. */
function harmonyOf(bar: PlayedBar, first: string | undefined): Slot[] {
	if (!bar.lines || first === undefined) return bar.slots;
	return bar.lines.find((l) => l.name.toLowerCase() === first.toLowerCase())?.slots ?? [];
}

/** The chord symbols a bar attacks with their onsets in whole notes (note sets are annotations, not chords). */
function timedChords(slots: Slot[], length: number): { at: number; chord: ChordRecord }[] {
	const each = length / Math.max(1, slots.length);
	return slots.flatMap((s, k) => {
		const members = s.kind === "group" ? s.members : [s];
		const shares = memberShares(members);
		let at = k * each;
		return members.flatMap((m, i) => {
			const here = at;
			at += each * (shares[i] ?? 0);
			return m.kind === "chord" && m.chord.kind === "chord" ? [{ at: here, chord: m.chord }] : [];
		});
	});
}

/** Text as the export writes it in lyrics: brackets and braces as parentheses, a tag's `<…>` as `(…)`. */
const asWritten = (text: string) =>
	text
		.replace(/[[{]/g, "(")
		.replace(/[\]}]/g, ")")
		.replace(/<([^<>]*)>/g, "($1)");

type Event = { at: number; chord?: ChordRecord; parts?: string[]; continues?: boolean };

/** An occurrence's chords and sung syllables, timed from its first bar. */
function eventsOf(bars: PlayedBar[], harmony: (b: PlayedBar) => Slot[]): Event[] {
	const out: Event[] = [];
	let offset = 0;
	for (const bar of bars) {
		const length = bar.meter.n / bar.meter.d;
		for (const c of timedChords(harmony(bar), length))
			out.push({ at: offset + c.at, chord: c.chord });
		for (const l of bar.lyrics ?? [])
			for (const { at, syllable: s } of l.syllables)
				if (s.kind === "sung")
					out.push({ at: offset + at, parts: s.parts, continues: s.continues });
		offset += length;
	}
	const tick = (e: Event) => Math.round(e.at * 1e9);
	return out
		.map((e, i) => ({ e, i }))
		.sort((a, b) => tick(a.e) - tick(b.e) || (a.e.chord ? 0 : 1) - (b.e.chord ? 0 : 1) || a.i - b.i)
		.map((x) => x.e);
}

/** The word tokens' last, which a continued syllable extends. */
function extendLastWord(tokens: Token[], text: string): void {
	for (let i = tokens.length - 1; i >= 0; i--) {
		const t = tokens[i];
		if (t && "word" in t) {
			t.word += text;
			return;
		}
	}
	tokens.push({ word: text });
}

/** Events as tokens: each chord, each word at its first syllable, a continued word joined. */
function tokensOf(events: Event[]): { tokens: Token[]; records: ChordRecord[] } {
	const tokens: Token[] = [];
	const records: ChordRecord[] = [];
	let joining = false;
	for (const e of events) {
		if (e.chord) {
			tokens.push({ chord: spelled(e.chord) });
			records.push(e.chord);
			continue;
		}
		for (const [i, p] of (e.parts ?? []).entries()) {
			if (joining && i === 0) extendLastWord(tokens, asWritten(p));
			else tokens.push({ word: asWritten(p) });
		}
		joining = !!e.continues;
	}
	return { tokens, records };
}

/** A bar's verses, as a key: which verses it sings. */
const verseKey = (b: PlayedBar) => (b.lyrics ?? []).map((l) => l.verse).join(",");

/** Bars split into passes where the written number falls back. */
function passes(bars: PlayedBar[]): PlayedBar[][] {
	const out: PlayedBar[][] = [];
	for (const [i, bar] of bars.entries()) {
		const prev = bars[i - 1];
		if (!prev || bar.written <= prev.written) out.push([]);
		out.at(-1)?.push(bar);
	}
	return out;
}

/**
 * A section occurrence's environments: a pass joins the one before unless
 * it sings a different verse on a bar that one already played.
 */
function environments(bars: PlayedBar[]): PlayedBar[][] {
	const envs: { bars: PlayedBar[]; sang: Map<number, string> }[] = [];
	for (const pass of passes(bars)) {
		const env = envs.at(-1);
		const fits = (e: typeof env) =>
			e !== undefined && pass.every((b) => (e.sang.get(b.written) ?? verseKey(b)) === verseKey(b));
		const into = env && fits(env) ? env : { bars: [], sang: new Map<number, string>() };
		if (into !== env) envs.push(into);
		for (const b of pass) {
			into.bars.push(b);
			into.sang.set(b.written, verseKey(b));
		}
	}
	return envs.map((e) => e.bars);
}

/** Whether verse `v` sings a syllable on any of the bars. */
const singsVerse = (bars: PlayedBar[], v: number) =>
	bars.some((b) =>
		(b.lyrics ?? []).some(
			(l) => l.verse === v && l.syllables.some((s) => s.syllable.kind === "sung"),
		),
	);

/** Stacked verses (a bar singing several) are one pass per verse that sings; otherwise the bars as they are. */
function versesOf(env: PlayedBar[]): PlayedBar[][] {
	if (!env.some((b) => (b.lyrics?.length ?? 0) > 1)) return [env];
	const all = [...new Set(env.flatMap((b) => (b.lyrics ?? []).map((l) => l.verse)))];
	const verses = all.filter((v) => singsVerse(env, v));
	if (!verses.length) return [env];
	return verses
		.sort((a, b) => a - b)
		.map((v) => env.map((b) => ({ ...b, lyrics: (b.lyrics ?? []).filter((l) => l.verse === v) })));
}

/** The sections' bars in play order, bars before the first heading unnamed. */
function spans(parse: ChartParse): { label: string | null; bars: PlayedBar[] }[] {
	const out: { label: string | null; bars: PlayedBar[] }[] = [];
	const first = parse.sections.find((s) => s.firstBar !== null)?.firstBar ?? Infinity;
	const lead = parse.bars.filter((b) => b.index < first);
	if (lead.length) out.push({ label: null, bars: lead });
	for (const s of parse.sections) {
		if (s.firstBar === null || s.lastBar === null) continue;
		const { firstBar: a, lastBar: z } = s;
		out.push({ label: s.name, bars: parse.bars.filter((b) => b.index >= a && b.index <= z) });
	}
	return out;
}

/** The singer's lyrics on each bar (grammar 7.7's owner), from the full parse. */
function singersBars(full: ChartParse): Map<number, PlayedBar> {
	const owner =
		full.parts.find((p) => p.instrument === "voice") ??
		full.parts.find((p) => p.sings !== undefined);
	const label = owner?.label?.toLowerCase();
	const keep = (part: string | undefined) => !label || !part || part.toLowerCase() === label;
	return new Map(
		full.bars.map((b) => [b.index, { ...b, lyrics: (b.lyrics ?? []).filter((l) => keep(l.part)) }]),
	);
}

/** A bar's beats as a grid counts them, and its chords with the beat each attacks in. */
function gridBar(bar: PlayedBar, slots: Slot[]): { bar: GridBar; records: ChordRecord[] } {
	const length = bar.meter.n / bar.meter.d;
	const beats = beatsOf(bar.meter);
	const timed = timedChords(slots, length);
	const attacks = timed.map((c) => ({
		beat: Math.floor((c.at / length) * beats + 1e-9),
		chord: spelled(c.chord),
	}));
	return { bar: { beats, attacks }, records: timed.map((c) => c.chord) };
}

/** An occurrence with no words: each bar's beats and chord attacks (spec 4.1's grid). */
function gridOf(
	label: string | null,
	bars: PlayedBar[],
	slotsOf: (b: PlayedBar) => Slot[],
): Played {
	const each = bars.map((b) => gridBar(b, slotsOf(b)));
	return { label, bars: each.map((e) => e.bar), records: each.flatMap((e) => e.records) };
}

/** Per occurrence in play order: its label and its chords and words in time order, or its bars' chords (spec 5.2). */
export function yardstick(chart: string, part?: string): Played[] {
	const full = parseChart(chart);
	const label = part ?? defaultPart(full);
	const harmony = (label !== undefined && extractPart(chart, label)) || full;
	const first = harmony.parts[0]?.lines?.[0];
	const sung = singersBars(full);
	const slotsOf = (b: PlayedBar) => harmonyOf(harmony.bars[b.index - 1] ?? b, first);
	return spans(full).flatMap((span) =>
		environments(span.bars.map((b) => sung.get(b.index) ?? b))
			.flatMap(versesOf)
			.map((bars): Played => {
				const { tokens, records } = tokensOf(eventsOf(bars, slotsOf));
				return tokens.some((t) => "word" in t)
					? { label: span.label, tokens, records }
					: gridOf(span.label, bars, slotsOf);
			}),
	);
}

/**
 * A label's text as drawn, unquoted and unescaped: `label="Verse \"1\""`
 * gives `Verse "1"`; a word joiner (U+2060) is drawn as nothing.
 */
function labelOf(value: string): string | null {
	const m = /^label="((?:[^"\\]|\\.)*)"$/.exec(value);
	return m ? (m[1] ?? "").replace(/\\(.)/g, "$1").replace(/\u2060/g, "") : null;
}

type Tokens = Extract<ChoLine, { kind: "lyrics" }>["tokens"];
/** A grid occurrence being read: its lines, over every grid it is written in. */
type GridRead = { label: string | null; lines: GridParts[] };
type Reading = {
	out: (Sung | GridRead)[];
	open: { env: string; sung: Sung; carry: boolean } | null;
	lastChorus: Sung | null;
	/** The grid being read; `after` is the last one ended, until a blank line or an environment. */
	grid: GridRead | null;
	after: GridRead | null;
};

const ENV = /^start_of_(verse|chorus|bridge)$/;

function startEnv(r: Reading, name: string, value: string): void {
	if (r.open) throw new Error(`${name} inside ${r.open.env}`);
	const sung: Sung = { label: labelOf(value), tokens: [] };
	r.open = { env: name.replace("start_of_", ""), sung, carry: false };
	r.after = null;
}

function endEnv(r: Reading, name: string): void {
	const { open } = r;
	if (open?.env !== name.replace("end_of_", "")) throw new Error(`unbalanced ${name}`);
	r.out.push(open.sung);
	if (open.env === "chorus") r.lastChorus = open.sung;
	r.open = null;
}

function recall(r: Reading): void {
	if (!r.lastChorus || r.open) throw new Error("{chorus} with no chorus to recall");
	r.out.push(r.lastChorus);
	r.after = null;
}

/**
 * A grid starts an occurrence, or continues the one whose grid ended just
 * before it with no blank line between (the export reopens a grid inside
 * one occurrence for a longer line or after an open repeat's comment).
 */
function startGrid(r: Reading, value: string): void {
	if (r.open) throw new Error(`a grid inside ${r.open.env}`);
	if (r.after) {
		if (/label=/.test(value)) throw new Error("a grid continued with a label");
		r.grid = r.after;
		return;
	}
	r.grid = { label: labelOf(/^(label="(?:[^"\\]|\\.)*")?/.exec(value)?.[1] ?? ""), lines: [] };
	r.out.push(r.grid);
}

/** A directive line into the reading. */
function readDirective(r: Reading, name: string, value: string): void {
	if (ENV.test(name)) startEnv(r, name, value);
	else if (name === "start_of_grid") startGrid(r, value);
	else if (name === "end_of_grid") [r.after, r.grid] = [r.grid, null];
	else if (name.startsWith("end_of_")) endEnv(r, name);
	else if (name === "chorus") recall(r);
}

/** One line of the sheet into the reading. */
function readOne(r: Reading, line: ChoLine): void {
	if (line.kind === "lyrics") {
		if (!r.open) throw new Error("a lyric line outside an environment");
		r.open.carry = readLine(line.tokens, r.open.sung, r.open.carry);
	} else if (line.kind === "grid") r.grid?.lines.push(gridParts(line.cells));
	else if (line.kind === "blank") r.after = null;
	else readDirective(r, line.name, line.value);
}

/**
 * Each occurrence of a sheet in order: a lyric environment, `{chorus}`
 * recalling the last chorus, or a grid read out to its bars' chords;
 * throws when unbalanced.
 */
export function readBack(text: string): Read[] {
	const r: Reading = { out: [], open: null, lastChorus: null, grid: null, after: null };
	for (const line of readCho(text)) readOne(r, line);
	if (r.open) throw new Error(`${r.open.env} never ended`);
	return r.out.map((o) => ("lines" in o ? { label: o.label, bars: gridBars(o.lines) } : o));
}

/** A grid line read: its bar symbols at each end, its `x N`, and each bar (fermata measures left out). */
type GridLine = { open: string; close: string; repeat: number | null; bars: GridBar[] };

/** A measure's attacks by cell: `%` the bar before's, `/` the last name again, `.` nothing, `C~G` each in turn. */
function attacksOf(cells: string[], before: Attack[] | undefined): Attack[] {
	if (cells[0] === "%") {
		if (!before || cells.slice(1).some((c) => c !== ".")) throw new Error(`a bad %: ${cells}`);
		return before;
	}
	const out: Attack[] = [];
	for (const [beat, cell] of cells.entries()) {
		const names =
			cell === "/" ? [out.at(-1)?.chord ?? "/"] : cell.split("~").filter((p) => p !== ".");
		out.push(...names.map((chord) => ({ beat, chord })));
	}
	if (out.some((a) => a.chord === "/")) throw new Error(`a / with no name before it: ${cells}`);
	return out;
}

/** A fermata is a measure of its own, `*…`: not a bar. */
const isFermata = (cells: string[]) => cells.length === 1 && cells[0] === "*…";

/** The `x N` that ends a line's right margin, or null; words that read as a count are written quoted (`"x3"`). */
function timesOf(right: string): number | null {
	const n = /(?:^| )x(\d+)$/.exec(right)?.[1];
	return n === undefined ? null : Number(n);
}

/** The grid's lines with each bar's chords, `%` and `/` resolved in written order. */
function gridLines(lines: GridParts[]): GridLine[] {
	let before: Attack[] | undefined;
	return lines.map((l) => {
		const bars: GridBar[] = [];
		for (const m of l.measures.filter((m) => !isFermata(m.cells))) {
			before = attacksOf(m.cells, before);
			// Annotations (`*…`) and N.C. are not chords.
			const attacks = before.filter((a) => !a.chord.startsWith("*") && a.chord !== "N.C.");
			bars.push({ beats: m.cells.length, attacks });
		}
		const open = l.measures[0]?.before ?? "|";
		return { open, close: l.measures.at(-1)?.after ?? "|", repeat: timesOf(l.right), bars };
	});
}

const isVolta = (l: GridLine | undefined) => l !== undefined && /^\|\d+$/.test(l.open);
const closes = (l: GridLine | undefined) => l?.close === ":|";

/** The lines of each ending from `from`: a volta's line, and the plain lines up to its `:|` when it has one. */
function endingsFrom(lines: GridLine[], from: number): { pass: number; lines: GridLine[] }[] {
	const out: { pass: number; lines: GridLine[] }[] = [];
	let j = from;
	while (isVolta(lines[j])) {
		let end = j;
		if (!closes(lines[j])) {
			let m = j + 1;
			while (lines[m]?.open === "|" && !closes(lines[m])) m++;
			if (lines[m]?.open === "|" && closes(lines[m])) end = m;
		}
		out.push({ pass: Number(lines[j]?.open.slice(1)), lines: lines.slice(j, end + 1) });
		j = end + 1;
	}
	return out;
}

/** Plays lines into `out`, each its own `x N` times but `closer`, whose count is its repeat's. */
function play(block: GridLine[], out: GridBar[], closer?: GridLine): void {
	for (const l of block)
		for (let k = 0; k < (l === closer ? 1 : (l.repeat ?? 1)); k++) out.push(...l.bars);
}

/** Where the repeat opened at line `i` ends: its `:|`, or the first ending. */
function repeatEnd(lines: GridLine[], i: number): number {
	for (let k = i; k < lines.length; k++)
		if (closes(lines[k]) || (k > i && isVolta(lines[k]))) return k;
	throw new Error("a |: with no :|");
}

/** A repeat opened at line `i` into `out`: twice or `x N` times, or once per ending's pass; the line after it. */
function playRepeat(lines: GridLine[], i: number, out: GridBar[]): number {
	const k = repeatEnd(lines, i);
	const end = lines[k] as GridLine;
	if (!isVolta(end)) {
		for (let p = 0; p < (end.repeat ?? 2); p++) play(lines.slice(i, k + 1), out, end);
		return k + 1;
	}
	const endings = endingsFrom(lines, k);
	const passes = Math.max(...endings.map((e) => e.pass));
	for (let p = 1; p <= passes; p++) {
		play(lines.slice(i, k), out);
		play(endings.find((e) => e.pass === p)?.lines ?? [], out);
	}
	return k + endings.reduce((n, e) => n + e.lines.length, 0);
}

/** The bars a grid plays, in order: `|: :|` twice or `x N` times, endings by pass, a line's own `x N`. */
function gridBars(all: GridParts[]): GridBar[] {
	const lines = gridLines(all);
	const out: GridBar[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] as GridLine;
		if (line.open === "|:") i = playRepeat(lines, i, out);
		else {
			play([line], out);
			i++;
		}
	}
	return out;
}

/** A chord read back: annotations (`*…`) are not chords. */
function readChord(sung: Sung, chord: string): void {
	if (!chord.startsWith("*")) sung.tokens.push({ chord });
}

/** Whether the last word ends `-`, running on to the next line; the hyphen is dropped. */
function runsOn(sung: Sung): boolean {
	const end = sung.tokens.findLast((t): t is { word: string } => "word" in t);
	if (!end?.word.endsWith("-")) return false;
	end.word = end.word.slice(0, -1);
	return true;
}

/**
 * One lyric line's tokens into `sung`, in order: chords that are not
 * annotations, and words, a piece that continues a word (`wait[D]ing`, or
 * the first word after a line that ended `wait-`) joined to the last
 * word. Returns whether this line's last word runs on to the next line.
 */
function readLine(tokens: Tokens, sung: Sung, carry: boolean): boolean {
	let join = carry;
	let wrote = false;
	for (const t of tokens) {
		if ("chord" in t) readChord(sung, t.chord);
		else if (t.joins || join) extendLastWord(sung.tokens, t.word);
		else sung.tokens.push({ word: t.word });
		if ("word" in t) [join, wrote] = [false, true];
	}
	return wrote ? runsOn(sung) : carry;
}
