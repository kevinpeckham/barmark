/**
 * The words as HTML (barmark's grammar 4.3, 7.7). A singing line draws
 * each note as its pitch name with each verse's syllable under it, in one
 * column per slot, so words stay under their notes however the bar is laid
 * out or wrapped. A lyric row on no melody draws a line per verse in each
 * bar it covers, spaced by beat, so its words wrap with their bars. Every
 * syllable is escaped text.
 */
import type { ChordRecord, Syllable } from "barmark";
import { splitPitch } from "./chord.js";
import { escapeHtml } from "./escape.js";
import type { Verse } from "./types.js";

/** A note set on a singing line: its notes' names, without octaves (a divisi shows each). */
export function pitchHtml(record: ChordRecord): string {
	const names = record.pitches.map((p) => splitPitch(p).name).join(" ");
	return `<span class="bm-chord bm-pitch" part="chord">${escapeHtml(names)}</span>`;
}

/** Elided syllables (`the~end`) join under a tie, as a lead sheet prints them. */
const ELISION = "‿";

/** A syllable, with a hyphen after it when the word goes on; a held one is an extender line. */
function syllableHtml(s: Syllable): string {
	if (s.kind === "held") return `<span class="bm-extender"></span>`;
	const hyphen = s.continues ? `<span class="bm-hyphen"> –</span>` : "";
	return `<span class="bm-syllable">${escapeHtml(s.parts.join(ELISION))}${hyphen}</span>`;
}

const syllablesHtml = (syllables: Syllable[]) => syllables.map(syllableHtml).join(" ");

/**
 * A singing line's bar as it draws: each verse's syllables by place (a
 * slot, a group's members each one), taken in slot order as the slots draw.
 */
export type SungBar = { verses: { verse: number; places: Syllable[][] }[]; next: number };

/** A singing row's bar `i`; null when nothing is sung on the row. */
export function sungBar(verses: Verse[] | undefined, i: number): SungBar | null {
	if (!verses?.length) return null;
	return { verses: verses.map((v) => ({ verse: v.verse, places: v.cells[i] ?? [] })), next: 0 };
}

/** A slot of a singing line: its note, and under it a line per verse with what that verse sings there. */
export function sungSlotHtml(slot: string, bar: SungBar): string {
	const k = bar.next++;
	const lines = bar.verses.map(
		(v) =>
			`<span class="bm-under" part="lyrics" data-verse="${v.verse}">${syllablesHtml(v.places[k] ?? [])}</span>`,
	);
	return `<span class="bm-sung"><span class="bm-sung-note">${slot}</span>${lines.join("")}</span>`;
}

/** The verse numbers, "1.", "2.", left of a singing row's first bar, each on its verse's line; none for one verse. */
export const verseNumbersHtml = (bar: SungBar | null) =>
	bar && bar.verses.length > 1
		? `<span class="bm-verse-numbers" aria-hidden="true">${bar.verses.map((v) => `<span class="bm-verse">${v.verse}.</span>`).join("")}</span>`
		: "";

/** One step of a lyric row's bar. */
const stepHtml = (syllables: Syllable[]) =>
	`<span class="bm-syllable-slot">${syllablesHtml(syllables)}</span>`;

/**
 * A lyric row's words on no melody in the bar `i` they cover, a line per
 * verse spaced by beat, each numbered at the row's first bar when there
 * are several. Empty when the row has none.
 */
export function beatLinesHtml(verses: Verse[] | undefined, i: number, first: boolean): string {
	const numbered = (verses?.length ?? 0) > 1;
	return (verses ?? [])
		.map((v) => {
			const number = numbered && first ? `<span class="bm-verse">${v.verse}.</span>` : "";
			const steps = (v.cells[i] ?? []).map(stepHtml).join("");
			return `<span class="bm-beats" part="lyrics" data-verse="${v.verse}" aria-hidden="true">${number}${steps}</span>`;
		})
		.join("");
}

/** Roughly how many em a verse's bar needs: 0.55em a character, and the gap after each place. */
export const verseWidth = (places: Syllable[][]) =>
	places.length
		? 1.5 +
			places.reduce(
				(w, p) =>
					w +
					0.6 +
					p.reduce((c, s) => c + 0.55 * (s.kind === "sung" ? s.parts.join(" ").length + 1 : 1), 0),
				0,
			)
		: 0;
