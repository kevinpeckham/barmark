/** Lyrics as text lines: syllables joined into whole words, one line per verse. */
import type { Losses } from "./losses.js";
import type { Attack, ReadMeasure, ReadPart } from "./read.js";

type Syllable = Attack["lyrics"][number];

const PLACEMENT = "lyrics written as text lines; their placement by beat isn't kept";

/** The syllables of each verse sung on a line through some measures, in order. */
function syllablesByVerse(measures: ReadMeasure[], line: number): Map<number, Syllable[]> {
	const out = new Map<number, Syllable[]>();
	for (const m of measures)
		for (const attack of m.lines[line] ?? [])
			for (const s of attack.lyrics) out.set(s.verse, [...(out.get(s.verse) ?? []), s]);
	return out;
}

const startsWord = (s: Syllable) => s.syllabic === "single" || s.syllabic === "begin";

/** Adds a syllable to the words, returning the word still open. */
function feed(words: string[], open: string | null, s: Syllable): string | null {
	if (open !== null && startsWord(s)) words.push(open);
	if (s.syllabic === "single") {
		words.push(s.text);
		return null;
	}
	if (s.syllabic === "begin") return s.text;
	if (open === null) return null;
	if (s.syllabic === "middle") return open + s.text;
	words.push(open + s.text);
	return null;
}

/** The words a verse's syllables make; the first `own` syllables belong to this system, the rest only finish its last word. */
function wordsOf(syllables: Syllable[], own: number): string[] {
	// A word that began in an earlier system was written there.
	const skip = syllables.findIndex(startsWord);
	const from = skip < 0 ? syllables.length : skip;
	const words: string[] = [];
	let open: string | null = null;
	for (const s of syllables.slice(from, Math.max(from, own))) open = feed(words, open, s);
	for (const s of syllables.slice(Math.max(from, own))) {
		if (open === null || startsWord(s)) break;
		open = feed(words, open, s);
	}
	if (open !== null) words.push(open);
	return words;
}

/**
 * Verse number to the words sung on `line` in `measures` (one system).
 * A word split across the system's end belongs to the system where it starts: its later
 * syllables are read from `following` (the measures after the system) and skipped
 * at the start of the next system.
 */
export function lyricLines(
	measures: ReadMeasure[],
	line: number,
	following: ReadMeasure[] = [],
): Map<number, string[]> {
	const own = syllablesByVerse(measures, line);
	const later = syllablesByVerse(following, line);
	const out = new Map<number, string[]>();
	for (const verse of [...own.keys()].sort((a, b) => a - b)) {
		const mine = own.get(verse) ?? [];
		const words = wordsOf([...mine, ...(later.get(verse) ?? [])], mine.length);
		if (words.length > 0) out.set(verse, words);
	}
	return out;
}

/** The text lines for a system's verses, numbered "1. " only when there is more than one. */
export function verseText(verses: Map<number, string[]>): string[] {
	const numbered = verses.size > 1;
	return [...verses.entries()]
		.sort(([a], [b]) => a - b)
		.map(([verse, words]) => `${numbered ? `${verse}. ` : ""}${words.join(" ")}`.trim());
}

const hasLyrics = (attacks: Attack[]) => attacks.some((a) => a.lyrics.length > 0);

/** The first line of a part that has any lyric, or -1. */
const lyricLine = (part: ReadPart) => {
	const count = Math.max(0, ...part.measures.map((m) => m.lines.length));
	for (let line = 0; line < count; line++)
		if (part.measures.some((m) => hasLyrics(m.lines[line] ?? []))) return line;
	return -1;
};

/** Picks the part and line whose lyrics are kept (the first with any), and reports what is lost. */
export function importLyrics(
	parts: ReadPart[],
	losses: Losses,
): { part: number; line: number } | null {
	const found = parts.map((p) => lyricLine(p));
	const first = found.findIndex((line) => line >= 0);
	const chosen = parts[first];
	if (!chosen) return null;
	losses.add("lyrics", PLACEMENT, chosen.name);
	parts.forEach((p, i) => {
		if (i !== first && (found[i] ?? -1) >= 0)
			losses.add(
				"lyricsLeftOut",
				`lyrics in ${p.name} left out; only ${chosen.name}'s are kept`,
				p.name,
			);
	});
	return { part: first, line: found[first] ?? 0 };
}
