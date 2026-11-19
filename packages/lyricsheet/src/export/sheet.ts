/**
 * The bars the sheet writes (spec 4.4): one part's harmony, its first
 * line's, and the singer's words. With `part`, that part; else the first
 * declared part that writes a chord symbol. The words come from the whole
 * chart, since an extracted part leaves the singer's rows out unless it
 * is the singer (grammar 7.7).
 */
import {
	type ChartParse,
	type DeclaredPart,
	extractPart,
	type PlayedBar,
	type PlayedLyrics,
	parseChart,
	type Slot,
} from "barmark";
import type { LyricsheetOptions, Out } from "./types.js";

const same = (a: string | undefined, b: string | undefined) =>
	a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();

/** Whether slots hold a chord symbol (not a note set). */
const writesChords = (slots: Slot[]) =>
	slots.some((s) =>
		(s.kind === "group" ? s.members : [s]).some(
			(m) => m.kind === "chord" && m.chord.kind === "chord",
		),
	);

/** The part written by default: the first declared that writes a chord symbol, else the first (spec 4.4). */
function defaultPart(full: ChartParse): DeclaredPart | undefined {
	const writes = (i: number) => full.bars.some((b) => writesChords(b.parts?.[i]?.slots ?? []));
	return full.parts.find((_, i) => writes(i)) ?? full.parts[0];
}

/** The part who sings the lyric rows (grammar 7.7): the first voice, else the first with syllables. */
const singerOf = (full: ChartParse) =>
	full.parts.find((p) => p.instrument === "voice") ?? full.parts.find((p) => p.sings !== undefined);

/** A bar's words as its singer sings them: the singer's verses, or the chart's when no part sings. */
function singersLyrics(bar: PlayedBar | undefined, singer: string | undefined): PlayedLyrics[] {
	return (bar?.lyrics ?? []).filter((l) => !singer || !l.part || same(l.part, singer));
}

/** A bar of the written part as the sheet reads it: its first line's slots and words, the singer's lyrics. */
function sheetBar(
	bar: PlayedBar,
	lyrics: PlayedLyrics[],
	first: string | undefined,
	out: Out,
): PlayedBar {
	const { lyrics: _, lines, ...rest } = bar;
	const written = { ...rest, ...(lyrics.length && { lyrics }) };
	if (!lines || first === undefined) return written;
	if (lines.some((l) => !same(l.name, first)))
		out.losses.add(
			"other-lines",
			"only the part's chords and the sung words are written: its other lines (a melody's notes, a second staff) are not",
			bar,
		);
	const line = lines.find((l) => same(l.name, first));
	const { words: __, ...plain } = written;
	return { ...plain, slots: line?.slots ?? [], ...(line?.words && { words: line.words }) };
}

/** The parse the sheet is written from: the written part's bars, each with the singer's words. */
export function sheetOf(
	chart: string,
	parse: ChartParse,
	options: LyricsheetOptions,
	out: Out,
	whole?: ChartParse,
): ChartParse {
	const full = options.part === undefined ? parse : (whole ?? parseChart(chart));
	const chosen = options.part === undefined ? defaultPart(full) : undefined;
	const harmony =
		chosen?.label !== undefined && full.parts.length > 1
			? (extractPart(chart, chosen.label) ?? parse)
			: parse;
	if (full.parts.length > 1) {
		const others = full.parts.filter((p) => !same(p.label, harmony.parts[0]?.label));
		out.losses.add(
			"other-parts",
			`one part's chords are written (${harmony.parts[0]?.label}); the others (${others.map((p) => p.label).join(", ")}) are left out`,
		);
	}
	const first = harmony.parts[0]?.lines?.[0];
	const singer = singerOf(full)?.label;
	const byIndex = new Map(full.bars.map((b) => [b.index, b]));
	const bars = harmony.bars.map((b) =>
		sheetBar(b, singersLyrics(byIndex.get(b.index), singer), first, out),
	);
	return { ...harmony, bars };
}
