/**
 * The played yardstick (spec 5.2), from the chart alone: per sung section
 * occurrence in play order, its label, the chords it attacks and the words
 * it sings; and the same read back from a sheet with `readCho`. Test only.
 *
 * The yardstick knows the rules of spec 4.1, 4.4 and 4.5 (an occurrence
 * per pass of a repeat, one per verse where verses are stacked, the
 * harmony of one part and the singer's words), and nothing of how the
 * export writes them.
 */
import {
	type ChartParse,
	type ChordRecord,
	extractPart,
	type PlayedBar,
	parseChart,
	type Slot,
} from "barmark";
import { spelled } from "../src/export/spell.js";
import { type ChoLine, readCho } from "./read-cho.js";

export type Sung = { label: string | null; chords: string[]; words: string[] };
export type Played = Sung & { records: ChordRecord[] };

/** The chord symbols a bar attacks, in order (note sets are annotations, not chords). */
const attacks = (slots: Slot[]): ChordRecord[] =>
	slots
		.flatMap((s) => (s.kind === "group" ? s.members : [s]))
		.flatMap((s) => (s.kind === "chord" && s.chord.kind === "chord" ? [s.chord] : []));

/** The first part that writes a chord symbol, by label (spec 4.4), when the chart has several. */
function defaultPart(parse: ChartParse): string | undefined {
	if (parse.parts.length < 2) return undefined;
	const writes = (i: number) =>
		parse.bars.some((b) => attacks(b.parts?.[i]?.slots ?? []).length > 0);
	const i = parse.parts.findIndex((_, k) => writes(k));
	return parse.parts[Math.max(0, i)]?.label;
}

/** A bar's harmony: its part's first line. */
function harmonyOf(bar: PlayedBar, first: string | undefined): Slot[] {
	if (!bar.lines || first === undefined) return bar.slots;
	return bar.lines.find((l) => l.name.toLowerCase() === first.toLowerCase())?.slots ?? [];
}

/** Brackets and braces as the export writes them in lyrics (the plan's Review Focus 2 rule). */
const asWritten = (text: string) => text.replace(/[[{]/g, "(").replace(/[\]}]/g, ")");

/** The words a pass sings: each sung syllable's pieces, a continued word joined. */
function wordsOf(bars: PlayedBar[], verse: number | null): string[] {
	const words: string[] = [];
	let joining = false;
	for (const bar of bars)
		for (const l of bar.lyrics ?? []) {
			if (verse !== null && l.verse !== verse) continue;
			for (const { syllable: s } of l.syllables) {
				if (s.kind !== "sung") continue;
				s.parts.forEach((p, i) => {
					if (joining && i === 0) words[words.length - 1] += asWritten(p);
					else words.push(asWritten(p));
				});
				joining = s.continues;
			}
		}
	return words;
}

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

/** A pass's verses as the sheet writes them: each verse alone where verses are stacked, else all as one. */
function versesOf(pass: PlayedBar[]): (number | null)[] {
	if (!pass.some((b) => (b.lyrics?.length ?? 0) > 1)) return [null];
	const verses = new Set(pass.flatMap((b) => (b.lyrics ?? []).map((l) => l.verse)));
	return [...verses].sort((a, b) => a - b);
}

/** Per sung occurrence in play order: its label, chords and words (spec 5.2's yardstick). */
export function yardstick(chart: string, part?: string): Played[] {
	const full = parseChart(chart);
	const label = part ?? defaultPart(full);
	const harmony = (label !== undefined && extractPart(chart, label)) || full;
	const first = harmony.parts[0]?.lines?.[0];
	const sung = singersBars(full);
	const chordsOf = (pass: PlayedBar[]) =>
		pass.flatMap((b) => attacks(harmonyOf(harmony.bars[b.index - 1] ?? b, first)));
	return spans(full).flatMap((span) =>
		passes(span.bars.map((b) => sung.get(b.index) ?? b)).flatMap((pass) =>
			versesOf(pass).flatMap((verse): Played[] => {
				const words = wordsOf(pass, verse);
				const records = chordsOf(pass);
				return words.length
					? [{ label: span.label, chords: records.map(spelled), words, records }]
					: [];
			}),
		),
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
	const sung: Sung = { label: labelOf(value), chords: [], words: [] };
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

/** A word piece into `sung`: joined to the word before when it continues it. */
function addWord(sung: Sung, word: string, joins: boolean): void {
	if (joins) sung.words[sung.words.length - 1] += word;
	else sung.words.push(word);
}

/** One lyric line's chords and words into `sung`; whether its last word runs on to the next line. */
function readLine(tokens: Tokens, sung: Sung, carry: boolean): boolean {
	const words = tokens.flatMap((t) => ("word" in t ? [t] : []));
	sung.chords.push(
		...tokens.flatMap((t) => ("chord" in t && !t.chord.startsWith("*") ? [t.chord] : [])),
	);
	for (const [i, t] of words.entries()) addWord(sung, t.word, !!t.joins || (i === 0 && carry));
	const last = sung.words.at(-1) ?? "";
	const runsOn = words.length > 0 && last.endsWith("-");
	if (runsOn) sung.words[sung.words.length - 1] = last.slice(0, -1);
	return runsOn || (words.length === 0 && carry);
}
