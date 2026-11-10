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
const near = (s: Sung, at: number) => Math.abs(s.at - at) < 1e-9;

/**
 * The syllables sung at an onset, in the order given, looked up by a
 * binary search over them sorted once: a bar may hold thousands, and
 * each onset scanning all of them made a crowded bar quadratic.
 */
export function sungAtOf(sung: Sung[]): (at: Frac) => Sung[] {
	const order = sung.map((_, i) => i).sort((a, b) => (sung[a] as Sung).at - (sung[b] as Sung).at);
	return (f) => {
		const at = f.n / f.d;
		// The first syllable not well below the onset: a wider margin than `near`'s, which then decides.
		let lo = 0;
		let hi = order.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if ((sung[order[mid] as number] as Sung).at < at - 1e-6) lo = mid + 1;
			else hi = mid;
		}
		const found: number[] = [];
		for (let i = lo; i < order.length; i++) {
			const index = order[i] as number;
			const s = sung[index] as Sung;
			if (s.at > at + 1e-6) break;
			if (near(s, at)) found.push(index);
		}
		return found.sort((a, b) => a - b).map((i) => sung[i] as Sung);
	};
}

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
		if (claimed.has(b.index)) continue;
		// Pushed, not copied: a bar line played thousands of times made copying quadratic.
		const sharing = passes.get(at);
		if (sharing) sharing.push(b);
		else passes.set(at, [b]);
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
