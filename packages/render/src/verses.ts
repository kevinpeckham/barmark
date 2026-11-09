/**
 * Where the words go (barmark's grammar 4.3, 7.7). The parser places every
 * syllable: a verse's syllables on a played bar, each at its onset. This
 * module only sorts them under the written bars a row draws: under a
 * singing line's slots, or spaced by beat in a lyric row on no melody.
 */
import {
	type ChartParse,
	type Line,
	type Meter,
	memberShares,
	type PlayedBar,
	type PlayedLyrics,
	type PlayedSyllable,
	type Slot,
	type Syllable,
} from "barmark";
import type { CellModel, Verse } from "./types.js";

type BarsLine = Extract<Line, { kind: "bars" }>;

/** A bar a row draws, as played, and every verse sung on its written bar; null for a cell that isn't a bar. */
export type Landing = { bar: PlayedBar; lyrics: PlayedLyrics[] } | null;

/** Within a rounding error: onsets are sums of fractions of a bar. */
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const barLength = (m: Meter) => m.n / m.d;
/** Whose words a verse is: its part's label, or "" for the chart's. */
const keyOf = (v: PlayedLyrics) => v.part ?? "";

/**
 * Whose words a row sings under its slots: the label of the part whose
 * singing line it is ("" in a chart that sings with no part declared), or
 * null when the line doesn't sing (barmark's grammar 7.7).
 */
export function singerOf(l: BarsLine, parse: ChartParse): string | null {
	const { parts } = parse;
	if (!parts.length) return l.part === undefined && singsOnNotes(parse) ? "" : null;
	const p =
		l.part === undefined
			? parts.length === 1
				? parts[0]
				: undefined
			: parts.find((x) => same(x.label ?? "", l.part ?? ""));
	if (p?.sings === undefined) return null;
	// A bare line plays as the part's first line (7.6).
	const name = l.lineName ?? p.lines?.[0] ?? "";
	return same(name, p.sings) ? (p.label ?? "") : null;
}

/** Whether a verse's syllables sit on notes, read once for each written bar however often it plays. */
const noted = new WeakMap<PlayedSyllable[], boolean>();
function onNote(syllables: PlayedSyllable[]): boolean {
	let known = noted.get(syllables);
	if (known === undefined) {
		known = syllables.some((s) => s.note);
		noted.set(syllables, known);
	}
	return known;
}

/** Whether a chart with no parts sings: its verse 1 sits on notes. */
const onNotes = (b: PlayedBar) => (b.lyrics ?? []).some((v) => onNote(v.syllables));

/** `onNotes` over the chart, worked out once a parse: asked for each line, it would read every bar each time. */
const sang = new WeakMap<ChartParse, boolean>();
function singsOnNotes(parse: ChartParse): boolean {
	const known = sang.get(parse);
	if (known !== undefined) return known;
	const sings = parse.bars.some(onNotes);
	sang.set(parse, sings);
	return sings;
}

/**
 * What lands on each cell a row draws: its bar as played, with the verses
 * of every pass the occurrence plays over that written bar, each part's
 * verse once (a jump's pass back sings pass 1's words again).
 */
export function landings(bars: (PlayedBar | undefined)[], passes: PlayedBar[]): Landing[] {
	return bars.map((bar) => {
		if (!bar) return null;
		const seen = new Set<string>();
		const lyrics = passes
			.filter((p) => p.written === bar.written)
			.flatMap((p) => p.lyrics ?? [])
			.filter((v) => {
				const key = `${keyOf(v)}\u0000${v.verse}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		return { bar, lyrics };
	});
}

/** One part's verse in a bar, or none. */
const verseIn = (landing: Landing, key: string, verse: number): PlayedSyllable[] =>
	landing?.lyrics.find((v) => keyOf(v) === key && v.verse === verse)?.syllables ?? [];

/** The verses some cell sings for `key`, or for anyone not in `skip`, in verse order. */
function versesOf(cells: Landing[], wanted: (key: string) => boolean): [string, number][] {
	const found = new Map<string, [string, number]>();
	for (const v of cells.flatMap((c) => c?.lyrics ?? [])) {
		if (!wanted(keyOf(v)) || !v.syllables.length) continue;
		found.set(`${keyOf(v)}\u0000${v.verse}`, [keyOf(v), v.verse]);
	}
	return [...found.values()].sort((a, b) => a[1] - b[1]);
}

/** Where each of a bar's simple slots starts, as a fraction of the bar (grammar 2.1, 2.2). */
function slotStarts(slots: Slot[]): number[] {
	const starts: number[] = [];
	slots.forEach((s, i) => {
		const members = s.kind === "group" ? s.members : [s];
		let at = i / slots.length;
		for (const share of memberShares(members)) {
			starts.push(at);
			at += share / slots.length;
		}
	});
	return starts;
}

/** The last of the ascending `starts` at or before `at` (within a rounding error), or -1: a binary search, so a bar of many notes and syllables isn't their product. */
function lastStartBy(starts: number[], at: number): number {
	let lo = 0;
	let hi = starts.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		const start = starts[mid] ?? 0;
		if (start < at || near(start, at)) lo = mid + 1;
		else hi = mid;
	}
	return lo - 1;
}

/** A verse's syllables in a bar under its slots: each on the slot sounding at its onset. */
function underSlots(cell: CellModel, landing: Landing, key: string, verse: number): Syllable[][] {
	if (cell.kind !== "slots" || !landing) return [];
	const sung = verseIn(landing, key, verse);
	const starts = slotStarts(cell.slots);
	// A `%` drawn as itself has no slots to sit under: its syllables sit in a row.
	if (!starts.length) return sung.length ? [sung.map((s) => s.syllable)] : [];
	const out: Syllable[][] = starts.map(() => []);
	const length = barLength(landing.bar.meter);
	for (const s of sung) {
		out[Math.max(0, lastStartBy(starts, s.at / length))]?.push(s.syllable);
	}
	return out;
}

/** The verses a singing line's part sings over its bars, each syllable under its slot. */
export function sungVerses(cells: CellModel[], lands: Landing[], key: string): Verse[] {
	return versesOf(lands, (k) => k === key).map(([, verse]) => ({
		verse,
		cells: cells.map((c, i) => underSlots(c, lands[i] ?? null, key, verse)),
	}));
}

/** The finest steps a bar is cut into: enough for a triplet of sixteenth triplets. */
const MAX_STEPS = 96;

/** The fewest equal steps of a bar that every onset falls on. */
function stepsFor(fractions: number[]): number {
	for (let n = 1; n < MAX_STEPS; n++)
		if (fractions.every((f) => near(f * n, Math.round(f * n)))) return n;
	return MAX_STEPS;
}

/** A verse's syllables in a bar on its beats: equal steps, each syllable at its onset's. */
function onBeats(landing: Landing, key: string, verse: number): Syllable[][] {
	if (!landing) return [];
	const sung = verseIn(landing, key, verse);
	const length = barLength(landing.bar.meter);
	const steps = stepsFor(sung.map((s) => s.at / length));
	const out: Syllable[][] = Array.from({ length: steps }, () => []);
	for (const s of sung)
		out[Math.min(steps - 1, Math.round((s.at / length) * steps))]?.push(s.syllable);
	return out;
}

/** The verses no row sings under its slots: the chart's words, or a singer's with no melody here, by beat. */
export function rowVerses(lands: Landing[], sung: Set<string>): Verse[] {
	return versesOf(lands, (k) => !sung.has(k)).map(([key, verse]) => ({
		verse,
		cells: lands.map((l) => onBeats(l, key, verse)),
	}));
}
