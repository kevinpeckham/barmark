/**
 * Lyrics as barmark writes them (grammar 4.3, 7.7): each `<lyric>` as a
 * syllable (`maz-`, `the~end`), a melisma as `/` held over a new note, and
 * a line's words bar by bar, from which its later verses' lyric rows are
 * placed on the beats.
 */
import { beatsOf } from "barmark";
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
	/** Each measure's beats (grammar 2.1), which a row's slots are counted against. */
	beats: number[];
	verses: number[];
	/** Each measure's verses, so a system looks only at the verses its own bars sing. */
	versesIn: Set<number>[];
	onNotes: boolean;
	/** A verse's row cell in a measure, worked out when a row asks for it: never every verse in every measure. */
	cell: (verse: number, measure: number) => string;
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
 * Which verses hold a syllable over the notes after it (`on`), and which
 * have written a held note's own lyric (an `<extend>` alone, or a stop):
 * from then on that verse's holds are written, not guessed.
 */
export type Holds = {
	/** Only the verses holding now: a verse that stops holding leaves, so each note looks at the few that hold, never every verse so far. */
	on: Map<number, boolean>;
	written: Set<number>;
	/** What was held as a repeat's endings began, which each ending starts from. */
	body?: Map<number, boolean> | undefined;
};

export const newHolds = (): Holds => ({ on: new Map(), written: new Set() });

/**
 * Holds follow play order into a repeat's endings: each ending starts
 * from what was held as the first began, and holds no verse its passes
 * don't sing (verse 2 in a first ending), as barmark reads them (7.7).
 */
export function enterEnding(holds: Holds, ending: number[] | null, before: number[] | null): void {
	if (!ending) {
		holds.body = undefined;
		return;
	}
	if (ending === before) return;
	if (!before) holds.body = new Map(holds.on);
	holds.on = new Map(holds.body ?? holds.on);
	for (const verse of holds.on.keys())
		if (verse !== 1 && !ending.includes(verse)) holds.on.delete(verse);
}

/**
 * The tokens a new note sings, verse by verse, keeping `holds` up to date.
 * A held note's own lyric (ours, or an extend's stop) sings `/` and ends
 * the hold there. A syllable with an extend holds over the unsung notes
 * after it until then. Until a verse writes a held note's lyric, one that
 * continues its word holds too: MuseScore keeps an extend only on a
 * word's last syllable, and draws a held first syllable as hyphens over
 * the notes.
 */
export function tokensAt(lyrics: Lyric[], holds: Holds): Map<number, string> {
	const out = new Map<number, string>();
	const byVerse = new Map<number, Lyric>();
	for (const l of lyrics) if (!byVerse.has(l.verse)) byVerse.set(l.verse, l);
	for (const verse of new Set([...holds.on.keys(), ...byVerse.keys()])) {
		const token = tokenFor(verse, byVerse.get(verse), holds);
		if (token !== null) out.set(verse, token);
	}
	return out;
}

/** One verse's token on a new note, keeping its hold up to date: null when it sings nothing there. */
function tokenFor(verse: number, l: Lyric | undefined, holds: Holds): string | null {
	if (!l) return holds.on.get(verse) ? "/" : null;
	if (l.parts.length === 0) {
		holds.on.delete(verse);
		holds.written.add(verse);
		return "/";
	}
	const token = syllableOf(l);
	if (token === null) return holds.on.get(verse) ? "/" : null;
	setHold(holds, verse, l.extend || (continuesWord(l) && !holds.written.has(verse)));
	return token;
}

const continuesWord = (l: Lyric) => l.syllabic === "begin" || l.syllabic === "middle";

/** A verse holds, or leaves `holds.on`: only the verses holding now stay in it. */
function setHold(holds: Holds, verse: number, on: boolean): void {
	if (on) holds.on.set(verse, true);
	else holds.on.delete(verse);
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
	const versesIn = bars.map((events) => new Set(events.flatMap((e) => [...e.tokens.keys()])));
	const verses = [...new Set(versesIn.flatMap((set) => [...set]))].sort((a, b) => a - b);
	const cells = new Map<string, string>();
	const cell = (verse: number, measure: number) => {
		const k = `${verse} ${measure}`;
		const bar = shared[measure];
		if (bar === undefined) return "--";
		const known = cells.get(k);
		if (known !== undefined) return known;
		const made = rowCell(bars[measure] ?? [], verse, bar, held[measure] ?? false, held.length > 0);
		cells.set(k, made);
		return made;
	};
	const lengths = shared.map((bar) => bar.length.n / bar.length.d);
	return {
		bars,
		lengths,
		beats: shared.map((bar) => beatsOf(bar.meter)),
		verses,
		versesIn,
		onNotes: held.length > 0,
		cell,
	};
}
