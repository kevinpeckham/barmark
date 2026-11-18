/**
 * The played yardstick (spec 5.2), from the chart alone: per sung section
 * occurrence in play order, its label and ONE sequence of chord attacks
 * and sung words in time order (a tie putting the chord first, a word
 * placed at its first syllable); and the same read back from a sheet with
 * `readCho`. Test only; it uses nothing in `src/` but `spelled`.
 *
 * The yardstick knows the rules of spec 4.1, 4.4 and 4.5 (a new
 * environment where a repeat sings a different verse on bars it played
 * before, one per verse where verses are stacked, the harmony of one part
 * and the singer's words), and nothing of how the export writes them.
 */
import {
	type ChartParse,
	type ChordRecord,
	extractPart,
	memberShares,
	type PlayedBar,
	parseChart,
	type Slot,
} from "barmark";
import { spelled } from "../src/export/spell.js";
import { type ChoLine, readCho } from "./read-cho.js";

export type Token = { chord: string } | { word: string };
export type Sung = { label: string | null; tokens: Token[] };
export type Played = Sung & { records: ChordRecord[] };

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

/** Stacked verses (a bar singing several) are one pass per verse; otherwise the bars as they are. */
function versesOf(env: PlayedBar[]): PlayedBar[][] {
	if (!env.some((b) => (b.lyrics?.length ?? 0) > 1)) return [env];
	const verses = [...new Set(env.flatMap((b) => (b.lyrics ?? []).map((l) => l.verse)))];
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

/** Per sung occurrence in play order: its label and its chords and words in time order (spec 5.2). */
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
			.flatMap((bars): Played[] => {
				const { tokens, records } = tokensOf(eventsOf(bars, slotsOf));
				return tokens.some((t) => "word" in t) ? [{ label: span.label, tokens, records }] : [];
			}),
	);
}

/** A label's text, unquoted and unescaped: `label="Verse \"1\""` gives `Verse "1"`. */
function labelOf(value: string): string | null {
	const m = /^label="((?:[^"\\]|\\.)*)"$/.exec(value);
	return m ? (m[1] ?? "").replace(/\\(.)/g, "$1") : null;
}

type Tokens = Extract<ChoLine, { kind: "lyrics" }>["tokens"];
type Reading = {
	out: Sung[];
	open: { env: string; sung: Sung; carry: boolean } | null;
	lastChorus: Sung | null;
};

const ENV = /^start_of_(verse|chorus|bridge)$/;

function startEnv(r: Reading, name: string, value: string): void {
	if (r.open) throw new Error(`${name} inside ${r.open.env}`);
	const sung: Sung = { label: labelOf(value), tokens: [] };
	r.open = { env: name.replace("start_of_", ""), sung, carry: false };
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
}

/** One line of the sheet into the reading. */
function readOne(r: Reading, line: ChoLine): void {
	if (line.kind === "lyrics") {
		if (!r.open) throw new Error("a lyric line outside an environment");
		r.open.carry = readLine(line.tokens, r.open.sung, r.open.carry);
	} else if (line.kind !== "directive") return;
	else if (ENV.test(line.name)) startEnv(r, line.name, line.value);
	else if (line.name.startsWith("end_of_")) endEnv(r, line.name);
	else if (line.name === "chorus") recall(r);
}

/** Each lyric environment of a sheet in order, `{chorus}` recalling the last chorus; throws when unbalanced. */
export function readBack(text: string): Sung[] {
	const r: Reading = { out: [], open: null, lastChorus: null };
	for (const line of readCho(text)) readOne(r, line);
	if (r.open) throw new Error(`${r.open.env} never ended`);
	return r.out;
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
