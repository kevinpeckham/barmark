/**
 * A lyric row with no melody (barmark's grammar 7.7) as a part of its own:
 * a one-line rhythm staff with a slash at each syllable's onset, held to
 * the next syllable as the row holds it, a rest where every verse
 * breathes, and the syllables on the slashes. `<?barmark lyrics?>` in its
 * first measure marks it, so the import reads it back as a lyric row.
 */
import type {
	ChartParse,
	Line,
	LyricSlot,
	PlayedBar,
	SectionOccurrence,
	SimpleSlot,
} from "barmark";
import { crosses, lengthsIn, type MeasureEvents, type SoundEvent } from "./events.js";
import { type Sung, sungAt } from "./lyrics.js";
import { measureXml, placeIn } from "./measure-xml.js";
import { type Measure, writtenMeasures } from "./measures.js";
import {
	barLength,
	cmp,
	divisionsFor,
	dyadic,
	type Frac,
	frac,
	memberLength,
	minus,
	plus,
	times,
	ZERO,
} from "./rhythm.js";
import { el, text } from "./xml.js";

type Row = Extract<Line, { kind: "lyrics" }>;

/** A row, and the replay heading it is written under (null for a row under the bars it covers). */
type Placed = { row: Row; replay: number | null };

/** Each row with its replay heading: a row under a heading that covers lines before it. */
function rowsOf(lines: Line[]): Placed[] {
	let heading: number | null = null;
	return lines.flatMap((l): Placed[] => {
		if (l.kind === "section") heading = l.line;
		if (l.kind !== "lyrics") return [];
		const first = l.covers[0] ?? Number.POSITIVE_INFINITY;
		return [{ row: l, replay: heading !== null && first < heading ? heading : null }];
	});
}

/** Each written bar's place in its bar line, by its written number: the row's cell for it. */
function cellsOf(lines: Line[]): Map<number, number> {
	const out = new Map<number, number>();
	let written = 0;
	for (const l of lines) {
		if (l.kind !== "bars") continue;
		let cell = 0;
		for (const c of l.cells)
			if (c.kind === "slots" || c.kind === "simile") out.set(++written, cell++);
	}
	return out;
}

const within = (o: SectionOccurrence, index: number) =>
	o.firstBar !== null && o.lastBar !== null && o.firstBar <= index && index <= o.lastBar;

/** A parse's rows and where each written bar sits in its bar line, read once. */
type Rows = { parse: ChartParse; rows: Placed[]; cells: Map<number, number> };

const rowsIn = (parse: ChartParse): Rows => ({
	parse,
	rows: rowsOf(parse.lines),
	cells: cellsOf(parse.lines),
});

/** What the rows say of a played bar: each verse's cell, from its replay's rows if it has any, else from the rows under its line. */
function rowCells({ parse, rows: all, cells }: Rows, bar: PlayedBar): Map<number, LyricSlot[]> {
	const rows = all.filter((r) => r.row.covers.includes(bar.line));
	const replay = parse.sections.find((o) => o.replayOf !== null && within(o, bar.index));
	const own = replay ? rows.filter((r) => r.replay === replay.line) : [];
	const chosen = own.length ? own : rows.filter((r) => r.replay === null);
	const cell = cells.get(bar.written) ?? 0;
	return new Map(chosen.map(({ row }) => [row.verse ?? 1, row.cells[cell] ?? []]));
}

type Token = { at: Frac; kind: Exclude<LyricSlot["kind"], "group"> };

/** A cell's slots in quarter notes from the bar's start: the bar shared among them, a group's slot among its members. */
function tokensOf(cell: LyricSlot[], length: Frac): Token[] {
	const each = times(length, frac(1, Math.max(1, cell.length)));
	let at = ZERO;
	const out: Token[] = [];
	for (const slot of cell) {
		const members = slot.kind === "group" ? slot.members : [slot];
		for (const m of members) {
			if (m.kind !== "group") out.push({ at, kind: m.kind });
			at = plus(at, memberLength(each, members.length));
		}
	}
	return out;
}

type Segment = { at: Frac; length: Frac; kind: "attack" | "held" | "rest" };

/**
 * The staff's rhythm in a bar, from every verse's row: a new slash where
 * any verse sings a syllable, held while any holds one, a rest where all
 * breathe. `carried` says the staff was sounding as the bar began.
 */
function segmentsOf(verses: Token[][], length: Frac, carried: boolean): Segment[] {
	const starts = [ZERO, ...verses.flat().map((t) => t.at)]
		.sort(cmp)
		.filter((at, i, all) => i === 0 || cmp(at, all[i - 1] as Frac) !== 0);
	const sounding = verses.map(() => carried);
	return starts.map((at, i) => {
		let attack = false;
		verses.forEach((tokens, v) => {
			const kind = tokens.find((t) => cmp(t.at, at) === 0)?.kind;
			if (kind === "syllable") attack = sounding[v] = true;
			else if (kind === "breath") sounding[v] = false;
		});
		const kind = attack ? "attack" : sounding.some(Boolean) ? "held" : "rest";
		return { at, length: minus(starts[i + 1] ?? length, at), kind };
	});
}

/** A slash: a hold of no note set sounds as one (`soundOf`). */
const SLASH: SimpleSlot = { kind: "hold" };
const REST: SimpleSlot = { kind: "silence" };
const sounds = (e: SoundEvent) => e.slot.kind !== "silence";

function eventOf(slash: boolean, length: Frac, lyrics: Sung[]): SoundEvent {
	return {
		slot: slash ? SLASH : REST,
		length,
		words: [],
		harmony: false,
		tie: { start: false, stop: false },
		...(lyrics.length ? { lyrics } : {}),
	};
}

/** A segment held on from the one before: one value where they join (not past a tuplet's), else tied. */
function holdOn(last: SoundEvent, s: Segment): SoundEvent | null {
	if (dyadic(last.length) || !dyadic(s.length)) {
		last.length = plus(last.length, s.length);
		return null;
	}
	const e = eventOf(sounds(last), s.length, []);
	if (sounds(last)) tie(last, e);
	return e;
}

function tie(before: SoundEvent, e: SoundEvent): void {
	before.tie = { ...before.tie, start: true };
	e.tie = { ...e.tie, stop: true };
}

/** A bar's segments as events, each syllable on the slash its onset starts. */
function eventsFrom(segments: Segment[], sung: Sung[]): SoundEvent[] {
	const out: SoundEvent[] = [];
	for (const s of segments) {
		const last = out[out.length - 1];
		const slash = s.kind !== "rest";
		const next =
			s.kind !== "attack" && last && sounds(last) === slash
				? holdOn(last, s)
				: eventOf(slash, s.length, s.kind === "attack" ? sungAt(sung, s.at) : []);
		if (next) out.push(next);
	}
	return out;
}

/** The staff's measures: the score's bars, with no key, words or text of their own. */
const bareMeasure = (m: Measure): Measure => ({
	...m,
	key: null,
	words: [],
	text: [],
	lead: [],
	foot: [],
	tacet: false,
});

/** A held opening ties over from the bar before, if play goes straight on. */
function tieOver(before: MeasureEvents | undefined, bar: MeasureEvents): void {
	const last = before?.events[before.events.length - 1];
	const first = bar.events[0];
	if (!before || !last || !first || !sounds(last) || crosses(before.measure, bar.measure)) return;
	tie(last, first);
}

/** One bar of the staff: each verse's row read into slashes and rests; nothing sounding, a whole-bar rest. */
function staffBar(m: Measure, cells: Map<number, LyricSlot[]>, carried: boolean) {
	const length = barLength(m.meter);
	// A bar a row only holds sings no syllable, but its rhythm is still the row's.
	const verses = [...cells.values()].map((cell) => tokensOf(cell, length));
	const segments = segmentsOf(verses, length, carried);
	const events = eventsFrom(segments, m.lyrics);
	const silent = events.every((e) => !sounds(e));
	const bar = { measure: { ...m, tacet: silent }, events: silent ? [] : events, after: [] };
	return { bar, held: segments[0]?.kind === "held", sounding: segments.at(-1)?.kind !== "rest" };
}

/** The lyric staff's bars, in written order. */
function staffBars(parse: ChartParse): MeasureEvents[] {
	const byIndex = new Map(parse.bars.map((b) => [b.index, b]));
	const rows = rowsIn(parse);
	const out: MeasureEvents[] = [];
	let carried = false;
	for (const written of writtenMeasures(parse)) {
		const m = bareMeasure(written);
		const played = m.played === null ? undefined : byIndex.get(m.played);
		const { bar, held, sounding } = staffBar(
			m,
			played ? rowCells(rows, played) : new Map(),
			carried,
		);
		if (held) tieOver(out[out.length - 1], bar);
		out.push(bar);
		carried = sounding;
	}
	return out;
}

/**
 * The lyric staff's `<score-part>`: "Lyrics", an instrument of that name
 * at volume 0, so a program plays no pitch the chart doesn't write.
 */
export function lyricScorePart(id: string): string {
	const instrument = `${id}-I1`;
	return el("score-part", { id }, [
		text("part-name", "Lyrics"),
		el("score-instrument", { id: instrument }, text("instrument-name", "Lyrics")),
		el("midi-instrument", { id: instrument }, text("volume", 0)),
	]);
}

/** The lyric staff's `<part>`, from a parse whose lyrics have no melody to sit on; `carried`: the part before left slash style on. */
export function lyricPartXml(parse: ChartParse, id: string, carried = false): string {
	const bars = staffBars(parse);
	const measures = bars.map((b) => b.measure);
	const divisions = divisionsFor(lengthsIn(bars));
	const xml = bars.map((bar, index) =>
		measureXml(bar, {
			divisions,
			...placeIn(measures, index),
			slashed: { now: false, before: index > 0 ? false : null, carried },
			clef: { now: "rhythm", before: index > 0 ? "rhythm" : null },
			rhythmic: true,
			written: { diatonic: 0, chromatic: 0 },
			staves: 1,
			score: false,
			...(index === 0 ? { lyricRow: true as const } : {}),
		}),
	);
	return el("part", { id }, xml);
}
