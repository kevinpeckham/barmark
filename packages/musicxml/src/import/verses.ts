/**
 * Verses as lyric rows (grammar 7.7): verse 1 is on the singing line's
 * notes, later verses of the singer are `lyrics N:` rows under each system,
 * a lyric staff's words are rows on no melody, and a section sung again
 * with new words is a replay whose rows carry them. Also what the chart
 * means to sing, bar by bar, for the self-check.
 */
import type { Losses } from "./losses.js";
import type { SungEvent, Words } from "./lyrics.js";
import { sings } from "./lyrics.js";
import type { ImportedPart } from "./parts.js";

/**
 * Whose words the lyric rows write: the singer's (`owner`, the first part
 * with a voice instrument, else the first that sings, as grammar 7.7
 * reads it) from verse 2, or a lyric staff's from verse 1.
 */
export type Verses = {
	words: Words;
	from: number;
	owner: number | null;
	/** `lyrics N:` rather than `lyrics:`. */
	numbered: boolean;
};

const STAFF_LEFT_OUT = "the lyric staff's words left out: a part sings words of its own";

/** The singer by grammar 7.7's rule: the first part with a voice instrument, else the first whose notes carry syllables. */
function ownerOf(parts: ImportedPart[]): number | null {
	const voice = parts.findIndex((p) => p.instrument === "voice");
	const at = voice >= 0 ? voice : parts.findIndex((p) => p.sings?.words.verses.includes(1));
	return at < 0 ? null : at;
}

const hasWords = (p: ImportedPart) => (p.sings?.words.verses.length ?? 0) > 0;

/** Reports a part's verses 2 and later, which no row holds, in the measures they're sung in. */
function laterLeftOut(p: ImportedPart, singer: ImportedPart | undefined, losses: Losses): void {
	const why = singer
		? `the lyric rows are ${singer.name}'s`
		: "no part sings verse 1 or is a voice to sing them";
	const message = `verses 2 and later in ${p.name} left out (${why})`;
	p.sings?.words.bars.forEach((events, m) => {
		if (events.some((e) => [...e.tokens.keys()].some((v) => v > 1)))
			losses.add("verses", message, p.name, p.lyrics[m]?.number);
	});
}

/** Whose rows the chart writes, reporting the verses no row can hold (another part's later verses, a lyric staff beside parts that sing). */
export function versesOf(
	parts: ImportedPart[],
	staff: Words | null,
	losses: Losses,
): Verses | null {
	const owner = ownerOf(parts);
	const singer = owner === null ? undefined : parts[owner];
	parts.forEach((p, i) => {
		if (i !== owner) laterLeftOut(p, singer, losses);
	});
	if (staff && staff.verses.length > 0) {
		if (!parts.some(hasWords))
			return { words: staff, from: 1, owner, numbered: staff.verses.some((v) => v > 1) };
		losses.add("staff", STAFF_LEFT_OUT);
	}
	const words = singer?.sings?.words;
	return words ? { words, from: 2, owner, numbered: true } : null;
}

/** A row: its label, then the verse's cell in each of these measures. */
function row(v: Verses, verse: number, label: string, measures: number[]): string {
	const cells = measures.map((m) => v.words.rows.get(verse)?.[m] ?? "--");
	return `${label} | ${cells.join(" | ")} |`;
}

const labelOf = (verse: number, numbered: boolean) => (numbered ? `lyrics ${verse}:` : "lyrics:");

/** The rows under a system: each later verse its bars sing (from verse 1 for a lyric staff). */
export function rowsUnder(v: Verses | null, measures: number[]): string[] {
	if (!v) return [];
	return v.words.verses
		.filter((verse) => verse >= v.from && measures.some((m) => sings(v.words.bars[m], verse)))
		.map((verse) => row(v, verse, labelOf(verse, v.numbered), measures));
}

/** A bar's words as one key: every verse's tokens at their onsets. */
const barWords = (events: SungEvent[] | undefined) =>
	JSON.stringify((events ?? []).map((e) => [e.at, [...e.tokens].sort(([a], [b]) => a - b)]));

/**
 * The rows under a replay heading, when it sings other words than the
 * section it replays (`root`, the one written out): one row per line the
 * section is written in (`lines`, measures by written line), each verse's
 * rows starting again at its first line; a replay that sings nothing
 * breathes through. None when the words are the same.
 */
export function replayRows(
	v: Verses | null,
	replay: number[],
	root: number[],
	lines: number[][],
): string[] {
	if (
		!v ||
		replay.every((m, k) => barWords(v.words.bars[m]) === barWords(v.words.bars[root[k] ?? -1]))
	)
		return [];
	const sung = v.words.verses.filter((verse) => replay.some((m) => sings(v.words.bars[m], verse)));
	const verses = sung.length > 0 ? sung : [1];
	const numbered = verses.some((verse) => verse !== 1);
	const at = new Map(root.map((m, k) => [m, replay[k] ?? m]));
	return verses.flatMap((verse) =>
		lines.map((line) =>
			row(
				v,
				verse,
				labelOf(verse, numbered),
				line.map((m) => at.get(m) ?? m),
			),
		),
	);
}

/** A syllable as the self-check compares it: who sings it, its verse, its onset as a share of its bar, what it says and whether it lands on a note. */
export const sungKey = (part: string, verse: number, at: number, token: string, note: boolean) =>
	`${part}|${verse}|${Math.round(at * 1e6)}|${token}|${note}`;

/**
 * What measure `m` sings, as the chart means it: each part's syllables on
 * its notes (verse 1), and the rows' verses for their singer, or for no
 * one; `label` names a part as the chart does ("" when it names none).
 */
export function meantAt(
	parts: ImportedPart[],
	v: Verses | null,
	m: number,
	label: (p: number | null) => string,
): string[] {
	const keys = (words: Words, who: string, verses: (n: number) => boolean) =>
		(words.bars[m] ?? []).flatMap((e) =>
			[...e.tokens]
				.filter(([verse, token]) => verses(verse) && (words.onNotes || token !== "/"))
				.map(([verse, token]) =>
					sungKey(who, verse, e.at.n / e.at.d / (words.lengths[m] ?? 4), token, words.onNotes),
				),
		);
	// The singer's later verses are its rows; a lyric staff's rows are every verse.
	const later = (i: number) => v?.from === 2 && v.owner === i;
	const own = parts.flatMap((p, i) =>
		p.sings ? keys(p.sings.words, label(i), (n) => n === 1 || later(i)) : [],
	);
	const staff = v?.from === 1 ? keys(v.words, label(v.owner), () => true) : [];
	return [...own, ...staff];
}
