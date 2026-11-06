/**
 * Lyrics (barmark's grammar 4.3, 7.7): the verses each written measure
 * sings, and their `<lyric>`s. A measure written once sings every pass's
 * verses, verse N on the same notes as `<lyric number="N">`; a bar
 * written out (a replay) sings only its own pass's words.
 */
import type { ChartParse, PlayedBar, PlayedLyrics, Syllable } from "barmark";
import type { Measure } from "./measures.js";
import type { Frac } from "./rhythm.js";
import { el, text } from "./xml.js";

export type Syllabic = "single" | "begin" | "middle" | "end";

/**
 * A syllable on a written measure: its verse, its onset in quarter notes
 * from the measure's start, whether a note of the singing line starts
 * there, and where it falls in its word (none for a held one).
 */
export type Sung = {
	verse: number;
	at: number;
	note: boolean;
	syllable: Syllable;
	syllabic: Syllabic | null;
	/** A `:/` holds it: its extension line starts here. */
	extend?: true;
};

/** Within a rounding error: onsets are sums of fractions of a bar. */
export const sungAt = (sung: Sung[], at: Frac) =>
	sung.filter((s) => Math.abs(s.at - at.n / at.d) < 1e-9);

/**
 * Each measure's played bars: its own, and the passes no measure of their
 * own writes (a repeat's), on the measure of their bar's first play.
 */
function barsOf(parse: ChartParse, measures: Measure[]): PlayedBar[][] {
	const claimed = new Set(measures.map((m) => m.played));
	const first = new Map<number, number>();
	const passes = new Map<number, PlayedBar[]>();
	for (const b of parse.bars) {
		const at = first.get(b.written) ?? b.index;
		first.set(b.written, at);
		if (!claimed.has(b.index)) passes.set(at, [...(passes.get(at) ?? []), b]);
	}
	const byIndex = new Map(parse.bars.map((b) => [b.index, b]));
	return measures.map((m) => {
		const own = m.played === null ? undefined : byIndex.get(m.played);
		return own ? [own, ...(passes.get(own.index) ?? [])] : [];
	});
}

/** A measure's verses, each once: a pass back over bars (a jump's) sings the words already there. */
function versesOf(bars: PlayedBar[]): PlayedLyrics[] {
	const seen = new Set<string>();
	return bars
		.flatMap((b) => b.lyrics ?? [])
		.filter((l) => {
			const key = `${l.part ?? ""}\u0000${l.verse}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return l.syllables.length > 0;
		})
		.sort((a, b) => a.verse - b.verse);
}

const syllabicOf = (before: boolean, continues: boolean): Syllabic =>
	before ? (continues ? "middle" : "end") : continues ? "begin" : "single";

/**
 * Each written measure's syllables, in written order: a syllable's
 * `syllabic` comes from whether it continues its word and whether the
 * one sung before it in its verse did, and a `:/` extends the syllable
 * sung before it.
 */
export function withLyrics(parse: ChartParse, measures: Measure[]): void {
	const before = new Map<string, Sung>();
	barsOf(parse, measures).forEach((bars, i) => {
		const m = measures[i] as Measure;
		m.lyrics = versesOf(bars).flatMap((l) => {
			const key = `${l.part ?? ""}\u0000${l.verse}`;
			return [...l.syllables]
				.sort((a, b) => a.at - b.at)
				.map(({ at, note, syllable }): Sung => {
					const sung: Sung = { verse: l.verse, at: at * 4, note, syllable, syllabic: null };
					const last = before.get(key);
					if (syllable.kind === "held") {
						if (last) last.extend = true;
						return sung;
					}
					sung.syllabic = syllabicOf(
						last?.syllable.kind === "sung" && last.syllable.continues,
						syllable.continues,
					);
					before.set(key, sung);
					return sung;
				});
		});
	});
}

/** One `<lyric>`: its syllabic and text, elided syllables joined by `<elision>`; a held one only `<extend>`. */
function lyricXml(s: Sung): string {
	if (s.syllable.kind === "held") return el("lyric", { number: s.verse }, el("extend"));
	const [first = "", ...rest] = s.syllable.parts;
	return el("lyric", { number: s.verse }, [
		s.syllabic ? text("syllabic", s.syllabic) : "",
		text("text", first),
		...rest.flatMap((part) => [el("elision"), text("text", part)]),
		s.extend ? el("extend", { type: "start" }) : "",
	]);
}

/** A note's `<lyric>`s, in verse order. */
export const lyricsXml = (sung: Sung[]) =>
	[...sung]
		.sort((a, b) => a.verse - b.verse)
		.map(lyricXml)
		.join("");
