/**
 * Lyrics as barmark writes them (grammar 4.3, 7.7): each `<lyric>` as a
 * syllable (`maz-`, `the~end`), a melisma as `/` held over a new note, and
 * a line's words bar by bar, from which its later verses' lyric rows are
 * placed on the beats.
 */
import { type Frac, frac, times } from "../rhythm.js";
import type { Bar } from "./cells.js";
import { placeBar } from "./grid.js";
import type { Lyric } from "./read.js";

/**
 * What each verse sings at an onset (quarters from the bar's start): a
 * syllable as barmark writes it, or `/` holding one over a new note;
 * `otherwise` for a verse with nothing there (`--` an unsung note, `/` a
 * lyric staff's slash that holds on).
 */
export type SungEvent = { at: Frac; tokens: Map<number, string>; otherwise: string };

/**
 * A line's words: each measure's onsets (by measure index), the verses
 * sung, whether they sit on a melody's notes (else on a lyric staff's
 * beats alone), and each verse's lyric row cell for each measure.
 */
export type Words = {
	bars: SungEvent[][];
	/** Each measure's length in quarters: an onset's place in its bar is what the self-check compares. */
	lengths: number[];
	verses: number[];
	onNotes: boolean;
	rows: Map<number, string[]>;
};

/** Characters a syllable can't hold (grammar 4.3, 7.7), each as the nearest it can. */
const SWAPS: Record<string, string> = { '"': "”", "{": "(", "}": ")", "|": "¦" };

/** A syllable's parts, cleaned so barmark reads them back as written: spaces and `_` elide. */
function cleanParts(parts: string[]): string[] {
	const out = parts
		.flatMap((p) => p.replace(/["{}|]/g, (c) => SWAPS[c] ?? c).split(/[\s_~]+/))
		// Hyphens alone say nothing: `--` would read as a breath, `-` as an empty syllable.
		.filter((p) => !/^-*$/.test(p));
	const last = (out.pop() ?? "").replace(/-+$/, "");
	if (last !== "") out.push(last);
	// `/` alone would read as a hold, `--` as a breath in a lyric row.
	return out.map((p) => (p === "/" ? "∕" : p));
}

/** A lyric as a syllable token (`maz-`, `the~end`); null when nothing of it reads. */
function syllableOf(l: Lyric): string | null {
	const parts = cleanParts(l.parts);
	if (parts.length === 0) return null;
	const continues = l.syllabic === "begin" || l.syllabic === "middle";
	return `${parts.join("~")}${continues ? "-" : ""}`;
}

/**
 * The tokens a new note sings, verse by verse; `holding` says which verses
 * hold a syllable over the notes after it, and is kept up to date. A
 * syllable with an extend, or one that continues its word, holds over the
 * unsung notes after it: MuseScore keeps an extend only on a word's last
 * syllable, and draws a held first syllable as hyphens over the notes.
 */
export function tokensAt(lyrics: Lyric[], holding: Map<number, boolean>): Map<number, string> {
	const out = new Map<number, string>();
	const byVerse = new Map<number, Lyric>();
	for (const l of lyrics) if (!byVerse.has(l.verse)) byVerse.set(l.verse, l);
	for (const verse of new Set([...holding.keys(), ...byVerse.keys()])) {
		const l = byVerse.get(verse);
		const token = l ? syllableOf(l) : null;
		if (l && token !== null) {
			out.set(verse, token);
			holding.set(verse, l.extend || l.syllabic === "begin" || l.syllabic === "middle");
		} else if (holding.get(verse)) out.set(verse, "/");
	}
	return out;
}

/** Where a row cell's slots and group members start, as onset keys: a row's members share their slot evenly (it has no dots). */
function startsOf(cell: string, length: Frac): Set<string> {
	const slots = cell.split(" ");
	const out = new Set<string>();
	slots.forEach((slot, i) => {
		const k = slot.split("_").length;
		for (let j = 0; j < k; j++) out.add(key(times(length, frac(i * k + j, slots.length * k))));
	});
	return out;
}

const key = (f: Frac) => `${f.n}/${f.d}`;

/**
 * A verse's row cell for a bar: its tokens on the beats, with no dotted
 * pair (a row has none); with no onsets, `/` over a held note, else a
 * breath. Under a melody, an unsung note is a breath (`--`) only where a
 * slot of the row starts on it, since a hold there would hold the
 * syllable before over it; elsewhere the row says nothing of it, as a
 * chart writes it.
 */
function rowCell(
	events: SungEvent[],
	verse: number,
	bar: Bar,
	held: boolean,
	onNotes: boolean,
): string {
	if (events.length === 0) return held ? "/" : "--";
	const token = (e: SungEvent) => e.tokens.get(verse) ?? e.otherwise;
	const place = (list: SungEvent[]) =>
		placeBar(
			list.map((e) => ({ at: e.at, symbol: token(e) })),
			bar.length,
			bar.meter,
			true,
			false,
		)?.cell ?? null;
	let kept = onNotes ? events.filter((e) => token(e) !== "--") : events;
	for (;;) {
		const cell = place(kept);
		if (cell === null) return place(events) ?? "--";
		const starts = startsOf(cell, bar.length);
		const more = events.filter((e) => !kept.includes(e) && starts.has(key(e.at)));
		if (more.length === 0) return cell;
		kept = events.filter((e) => kept.includes(e) || more.includes(e));
	}
}

/**
 * A line's words from its onsets: the verses sung and each verse's row
 * cells. `held` marks the bars a melody only holds (a tie through them);
 * a lyric staff passes none, its words on no melody.
 */
export function wordsOf(bars: SungEvent[][], shared: Bar[], held: boolean[]): Words {
	const verses = [...new Set(bars.flat().flatMap((e) => [...e.tokens.keys()]))].sort(
		(a, b) => a - b,
	);
	const cells = (v: number) =>
		shared.map((bar, i) => rowCell(bars[i] ?? [], v, bar, held[i] ?? false, held.length > 0));
	const lengths = shared.map((bar) => bar.length.n / bar.length.d);
	return {
		bars,
		lengths,
		verses,
		onNotes: held.length > 0,
		rows: new Map(verses.map((v) => [v, cells(v)])),
	};
}

/** Whether a measure's onsets sing verse `verse`. */
export const sings = (events: SungEvent[] | undefined, verse: number) =>
	(events ?? []).some((e) => e.tokens.has(verse));
