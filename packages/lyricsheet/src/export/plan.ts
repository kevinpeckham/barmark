/**
 * The played bars as the sheet writes them (spec 4.1, 4.5): section
 * occurrences in play order, a repeat's passes apart and stacked verses
 * one pass each; and what sits between the bars (text lines, fermatas,
 * the end of an open repeat) by where it is written.
 */
import type { ChartEvent, ChartParse, PlayedBar, SectionOccurrence } from "barmark";

export type Occurrence = {
	name: string | null;
	bars: PlayedBar[];
	/** Some bar sings words: a lyric environment, else (the next task) a grid. */
	sung: boolean;
	/** A replay heading's occurrence, or a jump's return through a section. */
	replay: boolean;
	/** The one verse sung, when one is; null when none is, or several. */
	verse: number | null;
	/** One pass of verses stacked on bars that play once (spec 4.5): its bars hold that verse only. */
	stacked?: true;
};

type Span = { name: string | null; replay: boolean; bars: PlayedBar[] };
type Played = SectionOccurrence & { firstBar: number; lastBar: number };

const played = (s: SectionOccurrence): s is Played => s.firstBar !== null && s.lastBar !== null;

/** The first section from `s` that has not ended before bar `index`. */
function advance(sections: Played[], s: number, index: number): number {
	let at = s;
	while (at < sections.length && index > (sections[at]?.lastBar ?? 0)) at += 1;
	return at;
}

/** The section bar `index` is in, if it has begun; null for a bar before it (before the first heading). */
const within = (section: Played | undefined, index: number) =>
	section && index >= section.firstBar ? section : null;

const spanOf = (section: Played | null): Span => ({
	name: section?.name ?? null,
	replay: (section?.replayOf ?? null) !== null,
	bars: [],
});

/** The bars of each section occurrence in play order; bars before the first heading are one unnamed span. */
function spans(parse: ChartParse): Span[] {
	const sections = parse.sections.filter(played);
	const out: Span[] = [];
	let s = 0;
	let owner: Played | null | undefined;
	for (const bar of parse.bars) {
		s = advance(sections, s, bar.index);
		const section = within(sections[s], bar.index);
		if (section !== owner) out.push(spanOf(section));
		owner = section;
		out.at(-1)?.bars.push(bar);
	}
	return out;
}

/** A span's passes: a new one where the written bar number falls back (a repeat going round). */
function passes(bars: PlayedBar[]): PlayedBar[][] {
	const out: PlayedBar[][] = [];
	let prev: PlayedBar | undefined;
	for (const bar of bars) {
		if (!prev || bar.written <= prev.written) out.push([]);
		out.at(-1)?.push(bar);
		prev = bar;
	}
	return out;
}

const sings = (bar: PlayedBar) =>
	bar.lyrics?.some((l) => l.syllables.some((s) => s.syllable.kind === "sung")) ?? false;

/** A bar with only verse `verse`'s words, or none. */
function withVerse(bar: PlayedBar, verse: number): PlayedBar {
	const { lyrics, ...rest } = bar;
	const kept = (lyrics ?? []).filter((l) => l.verse === verse);
	return kept.length ? { ...rest, lyrics: kept } : rest;
}

/** One pass as occurrences: itself, or with verses stacked, one per verse in verse order. */
function ofPass(span: Span, bars: PlayedBar[]): Occurrence[] {
	const verses = [...new Set(bars.flatMap((b) => (b.lyrics ?? []).map((l) => l.verse)))].sort(
		(a, b) => a - b,
	);
	const base = { name: span.name, replay: span.replay };
	if (!bars.some((b) => (b.lyrics?.length ?? 0) > 1)) {
		const verse = verses.length === 1 ? (verses[0] ?? null) : null;
		return [{ ...base, bars, sung: bars.some(sings), verse }];
	}
	return verses.map((verse) => {
		const own = bars.map((b) => withVerse(b, verse));
		return { ...base, bars: own, sung: own.some(sings), verse, stacked: true as const };
	});
}

/** The played bars as section occurrences in play order; bars before the first heading are one unnamed occurrence. */
export function occurrences(parse: ChartParse): Occurrence[] {
	return spans(parse).flatMap((span) => passes(span.bars).flatMap((bars) => ofPass(span, bars)));
}

/** Text lines around a run of consecutive bar lines (a system, or several written together). */
export type Run = { before: string[]; after: string[] };

/** What the sheet writes between bars, found by where it is written. */
export type Layout = {
	/** Text lines before the first section and the first bar: written after the header. */
	header: string[];
	/** Each bar line's run, by its line number. */
	runs: Map<number, Run>;
	/** The played bars a fermata follows, by `PlayedBar.index`; 0 for one before the first bar. */
	fermatas: Set<number>;
	/** The last bar of each open repeat's pass, by `PlayedBar.index`. */
	openEnds: Set<number>;
};

/**
 * Text lines by the run of bar lines they belong to: those before a run
 * are its `before`; those after a section's last run, before the next
 * heading or the chart's end, its `after`; those before any bar and any
 * heading the header's.
 */
function runsOf(parse: ChartParse): Pick<Layout, "header" | "runs"> {
	const header: string[] = [];
	const runs = new Map<number, Run>();
	let pending: string[] = [];
	let current: Run | null = null;
	let last: Run | null = null;
	let headed = false;
	const settle = () => {
		if (last) last.after.push(...pending);
		else if (!headed) header.push(...pending);
		else return;
		pending = [];
	};
	for (const line of parse.lines) {
		if (line.kind === "text") {
			current = null;
			pending.push(line.text);
		} else if (line.kind === "bars" || line.kind === "invalid") {
			current ??= { before: pending, after: [] };
			pending = [];
			runs.set(line.line, current);
			last = current;
		} else if (line.kind === "section") {
			settle();
			current = null;
			headed = true;
		} else if (line.kind === "directive") current = null;
	}
	settle();
	return { header, runs };
}

/** The bars fermatas follow and the bars that end an open repeat's pass, from the events. */
function eventMarks(
	events: ChartEvent[],
	into: Pick<Layout, "fermatas" | "openEnds">,
	before: number | null = null,
): number | null {
	let lastBar = before;
	for (const e of events) {
		if (e.kind === "bar") lastBar = e.bar.index;
		else if (e.kind === "fermata") into.fermatas.add(lastBar ?? 0);
		else {
			const end = eventMarks(e.events, into, lastBar);
			if (end !== null && end !== lastBar) into.openEnds.add(end);
			lastBar = end;
		}
	}
	return lastBar;
}

/** What the sheet writes between a chart's bars (spec 4.3, 4.5, 4.6). */
export function layout(parse: ChartParse): Layout {
	const marks = { fermatas: new Set<number>(), openEnds: new Set<number>() };
	eventMarks(parse.events, marks);
	return { ...runsOf(parse), ...marks };
}
