/**
 * Lyrics as lyric rows (spec 5.8, grammar 7.7). The lyric events of the
 * first track with any (others named in `lyrics-other-tracks`) are read
 * as verses: events at one tick are verses 1, 2, … in file order. Each
 * syllable is tidied so a row reads it as one syllable or as nothing
 * (`|`, quotes, braces and `_` removed, whitespace inside becoming `~`,
 * stray `~` and hyphens dropped). In each bar a verse's syllables sit on
 * the coarsest even grid that holds their onsets (the bar, a divisor of
 * its beats, its beats each in two, three or four); a slot with none is
 * `/` while the lyric track's notes sound, else `--`. Sync writes no
 * repeats, so played bars are written bars, one to one: each bar line
 * gets a row per verse singing on it, and the chart is printed again.
 * Then the self-check: the chart must parse with no errors and sing
 * every syllable placed; a failing verse's rows are dropped
 * (`lyrics-dropped`) and the rest checked again, so a bug here never
 * costs the chords.
 */
import { beatsOf, type Meter, type PlayedBar, parseChart, printChart } from "barmark";
import { decodeText } from "../smf/text.js";
import type { Smf, SmfEvent } from "../smf/types.js";
import type { Grid } from "./grid.js";
import type { Note } from "./notes.js";
import type { Report } from "./report.js";
import { namedList } from "./streams.js";

const LYRIC = 0x05;

/**
 * The most verses read (Claude's call, Task 14): barmark's parser and
 * printer slow with the rows under one bar line (20,000 take 3 s), and a
 * hostile file can put every event at one tick.
 */
const MAX_VERSES = 100;

/**
 * The most lyric rows written, a verse under a bar line each (the
 * coordinator's ruling, Task 14 fix round 1): a real song needs a few
 * thousand at most, and 200,000 rows took 20 s and 4 GB; later verses
 * are left out.
 */
const MAX_ROWS = 20_000;

/** A lyric event's text at its tick, in its verse. */
type Raw = { tick: number; verse: number; text: string };

/** A syllable as a row writes it: elided parts joined by `~`, and whether it continues its word. */
type Sung = { tick: number; body: string; continues: boolean };

/** A bar's cell for one verse, and what it sings: each syllable's onset (whole notes) and token. */
type Cell = { text: string; sings: string[] };

/** Rewrites a verse's row before it goes in: a test seam for the self-check. */
type Seam = (verse: number, row: string) => string;

/** Items by key, each list in order. */
function groupBy<T>(items: T[], keyOf: (item: T) => number): Map<number, T[]> {
	const out = new Map<number, T[]>();
	for (const item of items) {
		const key = keyOf(item);
		const list = out.get(key);
		if (list) list.push(item);
		else out.set(key, [item]);
	}
	return out;
}

const TEXT = 0x01;

const isMeta =
	(type: number) =>
	(e: SmfEvent): e is SmfEvent & { kind: "meta" } =>
		e.kind === "meta" && e.type === type;
const isLyric = isMeta(LYRIC);
const isText = isMeta(TEXT);

/** A karaoke (.kar) header line: `@T` title, `@L` language and the like. */
const isHeader = (e: SmfEvent & { kind: "meta" }) => decodeText(e.data).startsWith("@");

/**
 * Where the lyrics are: the lyric events (0x05) of the first track with
 * any; or, in a file with none, a karaoke file's text events (0x01) of
 * the first track with `@` header lines, the headers left out. `texts`
 * are their decoded texts by tick, file order; `others` the other tracks
 * that have lyrics.
 */
function lyricSource(smf: Smf): LyricSource | null {
	const lyric = smf.tracks.flatMap((events, i) => (events.some(isLyric) ? [i + 1] : []));
	if (lyric.length > 0) return sourceOf(smf, lyric, isLyric, (text) => text);
	const karaoke = smf.tracks.flatMap((events, i) =>
		events.filter(isText).some(isHeader) ? [i + 1] : [],
	);
	// A leading \ or / marks a new line, and so a word's end: a space.
	return sourceOf(smf, karaoke, isText, (text) =>
		text.startsWith("@") ? null : text.replace(/^[\\/]/, " "),
	);
}

type LyricSource = { track: number; others: number[]; texts: { tick: number; text: string }[] };

/** The first of `tracks`, its events of a kind as texts (`read` null leaves one out), and the others. */
function sourceOf(
	smf: Smf,
	tracks: number[],
	kind: (e: SmfEvent) => e is SmfEvent & { kind: "meta" },
	read: (text: string) => string | null,
): LyricSource | null {
	const [track, ...others] = tracks;
	if (track === undefined) return null;
	const texts = (smf.tracks[track - 1] ?? []).filter(kind).flatMap((e) => {
		const text = read(decodeText(e.data));
		return text === null ? [] : [{ tick: e.tick, text }];
	});
	return { track, others, texts };
}

/** The tick of the last lyric, or -1 when the file has none: the grid runs to it (spec 5.3). */
export function lastLyric(smf: Smf): number {
	return lyricSource(smf)?.texts.at(-1)?.tick ?? -1;
}

/** The other tracks with lyrics, named once. */
function reportOthers(track: number, others: number[], report: Report) {
	if (others.length === 0) return;
	const one = others.length === 1;
	report.add(
		"lyrics-other-tracks",
		"info",
		`lyrics are read from track ${track} alone; ${one ? "track" : "tracks"} ${namedList(others.map(String))} also ${one ? "has" : "have"} lyrics, left out`,
		{ track: one ? others[0] : undefined },
	);
}

/**
 * Verses by order at a tick (spec 5.8): MIDI has no verse number. When
 * the number of lyrics at a tick varies, a verse that holds where another
 * sings takes the other's place, so the import warns.
 */
function reportUncertain(raws: Raw[], track: number, report: Report) {
	const counts = new Set<number>();
	raws.forEach((e, i) => {
		if (raws[i + 1]?.tick !== e.tick) counts.add(e.verse);
	});
	if (counts.size > 1)
		report.add(
			"lyrics-verses-uncertain",
			"warning",
			"the number of lyrics at a tick varies, and verses are told apart only by their order at each tick, so verses may be mixed",
			{ track },
		);
}

/** The lyrics as verses: at one tick, verses 1, 2, … in file order, up to `MAX_VERSES`. */
function lyricEvents(smf: Smf, report: Report): { track: number; events: Raw[] } | null {
	const source = lyricSource(smf);
	if (source === null) return null;
	const { track, others, texts } = source;
	reportOthers(track, others, report);
	const all: Raw[] = [];
	let at = { tick: -1, verse: 0 };
	for (const { tick, text } of texts) {
		at = { tick, verse: at.tick === tick ? at.verse + 1 : 1 };
		all.push({ ...at, text });
	}
	reportUncertain(all, track, report);
	const events = all.filter((e) => e.verse <= MAX_VERSES);
	for (let n = all.length - events.length; n > 0; n--)
		report.add("lyrics-dropped", "warning", `verses past ${MAX_VERSES} at one tick are left out`, {
			track,
		});
	return { track, events };
}

/**
 * A syllable's text as a row can hold it, and whether it ends with a
 * hyphen; an empty body when nothing is left, or it would read as a hold.
 */
function tidy(text: string): { body: string; hyphen: boolean } {
	let body = text
		// The undertie, and SMuFL's lyric elisions (MuseScore writes U+E551).
		.replace(/[‿\uE550-\uE552]/g, "~")
		.replace(/[|"{}_]/g, "")
		.trim()
		.replace(/\s+/g, "~");
	let hyphen = false;
	for (;;) {
		body = body.replace(/~+/g, "~").replace(/^~|~$/g, "");
		if (!body.endsWith("-")) break;
		body = body.slice(0, -1);
		hyphen = true;
	}
	return { body: body === "/" ? "" : body, hyphen };
}

/**
 * Each verse's syllables in time order. One continues its word when it
 * ends with a hyphen, or when its text doesn't end in whitespace and a
 * next syllable follows that doesn't begin with it.
 */
function syllablesOf(events: Raw[]): Map<number, Sung[]> {
	const byVerse = groupBy(events, (e) => e.verse);
	const out = new Map<number, Sung[]>();
	for (const [verse, raws] of byVerse) {
		const sung = raws.flatMap((e, i): Sung[] => {
			const { body, hyphen } = tidy(e.text);
			const next = raws[i + 1]?.text;
			const ends = /\s$/.test(e.text) || next === undefined || /^\s/.test(next);
			return body === "" ? [] : [{ tick: e.tick, body, continues: hyphen || !ends }];
		});
		if (sung.length > 0) out.set(verse, sung);
	}
	return out;
}

/** Whether the lyric track's notes sound at a tick: their spans merged, searched by halves. */
function soundingOf(notes: Note[]): (tick: number) => boolean {
	const spans: [number, number][] = [];
	for (const n of [...notes].sort((a, b) => a.start - b.start)) {
		const last = spans.at(-1);
		if (last && n.start <= last[1]) last[1] = Math.max(last[1], n.end);
		else spans.push([n.start, n.end]);
	}
	return (tick) => {
		let lo = 0;
		let hi = spans.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if ((spans[mid]?.[1] ?? 0) <= tick) lo = mid + 1;
			else hi = mid;
		}
		const span = spans[lo];
		return span !== undefined && span[0] <= tick;
	};
}

/** The even grids a bar may take, coarsest first: the bar and each divisor of its beats, then each beat in 2, 3, 4. */
function gridsOf(beats: number): number[] {
	const divisors = Array.from({ length: beats }, (_, i) => i + 1).filter((d) => beats % d === 0);
	return [...divisors, 2 * beats, 3 * beats, 4 * beats];
}

/** The coarsest grid whose nearest slots lie nearest the onsets (0 ticks away when they fit). */
function slotsFor(offsets: number[], length: number, beats: number): number {
	let best = 1;
	let bestMiss = Number.POSITIVE_INFINITY;
	for (const k of gridsOf(beats)) {
		const miss = Math.max(
			0,
			...offsets.map((o) => Math.abs(o - (Math.round((o * k) / length) * length) / k)),
		);
		if (miss < bestMiss) {
			best = k;
			bestMiss = miss;
		}
	}
	return best;
}

/** A beat's slots as written: one token when the rest hold it (or all breathe), else a `_` group. */
function beatToken(members: string[]): string {
	const [first = "--", ...rest] = members;
	if (rest.every((m) => m === "/") || members.every((m) => m === "--")) return first;
	return members.join("_");
}

type BarSpan = { start: number; length: number; meter: Meter };

/**
 * One verse's cell in a bar: its syllables on the bar's grid, the other
 * slots held or breathing. `held` says whether a slot's tick is held: the
 * lyric track sounds there, after the verse's first syllable.
 */
function cellOf(syllables: Sung[], bar: BarSpan, held: (tick: number) => boolean): Cell {
	const beats = beatsOf(bar.meter);
	const k = slotsFor(
		syllables.map((s) => s.tick - bar.start),
		bar.length,
		beats,
	);
	const slots: (Sung | undefined)[] = Array(k).fill(undefined);
	for (const s of syllables) {
		const j = Math.min(k - 1, Math.round(((s.tick - bar.start) * k) / bar.length));
		const there = slots[j];
		// Two syllables on one slot: an elision.
		slots[j] = there ? { ...s, body: `${there.body}~${s.body}` } : s;
	}
	const whole = bar.meter.n / bar.meter.d;
	const sings: string[] = [];
	const tokens = slots.map((s, j) => {
		if (s === undefined) return held(bar.start + (j * bar.length) / k) ? "/" : "--";
		const token = `${s.body}${s.continues ? "-" : ""}`;
		sings.push(`${Math.round(((j * whole) / k) * 1e9)} ${token}`);
		return token;
	});
	if (k <= beats) return { text: tokens.join(" "), sings };
	const per = k / beats;
	const groups = Array.from({ length: beats }, (_, b) =>
		beatToken(tokens.slice(b * per, (b + 1) * per)),
	);
	return { text: groups.join(" "), sings };
}

/** Each grid bar's span, with the meter the chart writes it in; null unless they match one to one. */
function spansOf(grid: Grid, bars: PlayedBar[]): BarSpan[] | null {
	if (bars.length !== grid.bars.length) return null;
	return grid.bars.map((b, i) => {
		const end = grid.bars[i + 1]?.start ?? grid.end;
		return { start: b.start, length: end - b.start, meter: bars[i]?.meter ?? b.meter };
	});
}

/** A verse's syllables by bar index; past the last bar, the index `spans.length` (no bar line's, so not placed). */
function byBar(syllables: Sung[], spans: BarSpan[]): Map<number, Sung[]> {
	const ends = spans.map((b) => b.start + b.length);
	let i = 0;
	return groupBy(syllables, (s) => {
		while (i < ends.length && s.tick >= (ends[i] ?? Number.POSITIVE_INFINITY)) i++;
		return i;
	});
}

/** The bar lines: each source line with the indices of the played bars written on it. */
function barLinesOf(bars: PlayedBar[]): { line: number; bars: number[] }[] {
	const out: { line: number; bars: number[] }[] = [];
	bars.forEach((b, i) => {
		const last = out.at(-1);
		if (last?.line === b.line) last.bars.push(i);
		else out.push({ line: b.line, bars: [i] });
	});
	return out;
}

/** A verse's cells: every bar of each bar line it sings on (by bar index). */
function placeVerse(
	inBar: Map<number, Sung[]>,
	spans: BarSpan[],
	lines: { bars: number[] }[],
	held: (tick: number) => boolean,
): Map<number, Cell> {
	const cells = new Map<number, Cell>();
	for (const { bars } of lines.filter((l) => l.bars.some((i) => inBar.has(i))))
		for (const i of bars) {
			const span = spans[i];
			if (span) cells.set(i, cellOf(inBar.get(i) ?? [], span, held));
		}
	return cells;
}

/** Per verse that sings, its cells. */
function placeAll(
	verses: Map<number, Sung[]>,
	spans: BarSpan[],
	lines: { bars: number[] }[],
	sounding: (tick: number) => boolean,
): Map<number, Map<number, Cell>> {
	const out = new Map<number, Map<number, Cell>>();
	for (const [verse, syllables] of verses) {
		const first = syllables[0]?.tick ?? 0;
		const held = (tick: number) => tick > first && sounding(tick);
		const cells = placeVerse(byBar(syllables, spans), spans, lines, held);
		if (cells.size > 0) out.set(verse, cells);
	}
	return out;
}

/** The verses, in order, while their rows (a verse under a bar line) number at most `MAX_ROWS`; `drop` for each past. */
export function withinRows(
	verses: number[],
	cells: Map<number, Map<number, Cell>>,
	lines: { bars: number[] }[],
	drop: () => void,
): number[] {
	let rows = 0;
	return verses.filter((verse) => {
		const own = cells.get(verse);
		rows += lines.filter((l) => l.bars.some((i) => own?.has(i))).length;
		if (rows <= MAX_ROWS) return true;
		drop();
		return false;
	});
}

/** The chart with each kept verse's rows under the bar lines it sings on, printed. */
function withRows(
	chart: string,
	lines: { line: number; bars: number[] }[],
	cells: Map<number, Map<number, Cell>>,
	kept: number[],
	seam: Seam,
): string {
	const numbered = !(kept.length === 1 && kept[0] === 1);
	const out = chart.split("\n");
	for (const { line, bars } of [...lines].reverse()) {
		const rows = kept.flatMap((verse) => {
			const own = cells.get(verse);
			if (!bars.some((i) => own?.has(i))) return [];
			const label = numbered ? `lyrics ${verse}:` : "lyrics:";
			return [seam(verse, `${label} | ${bars.map((i) => own?.get(i)?.text).join(" | ")} |`)];
		});
		out.splice(line, 0, ...rows);
	}
	return printChart(out.join("\n"));
}

const ROW = /^lyrics(?:\s+(\d+))?:/i;

/** The verse a line's row writes, or null when the line is no row. */
function rowVerse(text: string | undefined): number | null {
	const m = ROW.exec(text ?? "");
	return m ? Number(m[1] ?? 1) : null;
}

/** What the parse sings, as the cells write it: by verse and bar, and how many bars each verse sings in. */
function sungByParse(bars: PlayedBar[]): { sung: Map<string, string>; count: Map<number, number> } {
	const sung = new Map<string, string>();
	const count = new Map<number, number>();
	bars.forEach((bar, i) => {
		for (const { verse, syllables } of bar.lyrics ?? []) {
			const tokens = syllables.flatMap(({ at, syllable }) =>
				syllable.kind === "sung"
					? [`${Math.round(at * 1e9)} ${syllable.parts.join("~")}${syllable.continues ? "-" : ""}`]
					: [],
			);
			if (tokens.length === 0) continue;
			sung.set(`${verse} ${i}`, tokens.join(" "));
			count.set(verse, (count.get(verse) ?? 0) + 1);
		}
	});
	return { sung, count };
}

/** Whether a verse is sung exactly as placed: the same syllables in the same bars, and none elsewhere. */
function singsAsPlaced(
	verse: number,
	cells: Map<number, Cell>,
	heard: ReturnType<typeof sungByParse>,
) {
	const placed = [...cells].filter(([, c]) => c.sings.length > 0);
	return (
		(heard.count.get(verse) ?? 0) === placed.length &&
		placed.every(([i, c]) => heard.sung.get(`${verse} ${i}`) === c.sings.join(" "))
	);
}

/**
 * The first kept verse failing the self-check, or null when all pass: a
 * verse whose row has an error, the last verse for an error on no row,
 * then a verse whose syllables aren't sung as placed.
 */
function failing(
	text: string,
	cells: Map<number, Map<number, Cell>>,
	kept: number[],
	barCount: number,
): number | null {
	const parse = parseChart(text);
	const lines = text.split("\n");
	const errors = parse.diagnostics.filter((d) => d.severity === "error");
	const onRows = errors.map((d) => rowVerse(lines[d.line - 1]));
	if (onRows.some((v) => v === null)) return kept.at(-1) ?? null;
	const first = kept.find((v) => onRows.includes(v));
	if (first !== undefined) return first;
	if (parse.bars.length !== barCount) return kept[0] ?? null;
	const heard = sungByParse(parse.bars);
	return kept.find((v) => !singsAsPlaced(v, cells.get(v) ?? new Map(), heard)) ?? null;
}

/**
 * The chart with lyric rows from the file's lyric events (spec 5.8), or
 * the chart unchanged when none place or every verse fails the
 * self-check. `seam` rewrites a verse's row before it goes in (tests).
 */
export function withLyrics(
	chart: string,
	smf: Smf,
	grid: Grid,
	notes: Note[],
	report: Report,
	seam: Seam = (_, row) => row,
): string {
	const lyrics = lyricEvents(smf, report);
	if (lyrics === null) return chart;
	const verses = syllablesOf(lyrics.events);
	const dropped = (verse: number) =>
		report.add(
			"lyrics-dropped",
			"warning",
			`the lyric rows of verse ${verse} failed the import's check and are left out`,
			{ track: lyrics.track },
		);
	const bars = parseChart(chart).bars;
	const spans = spansOf(grid, bars);
	if (spans === null) {
		// No bar to place a syllable in: every verse fails.
		for (const verse of [...verses.keys()].sort((a, b) => a - b)) dropped(verse);
		return chart;
	}
	const lines = barLinesOf(bars);
	const sounding = soundingOf(notes.filter((n) => n.track === lyrics.track));
	const cells = placeAll(verses, spans, lines, sounding);
	let kept = withinRows(
		[...cells.keys()].sort((a, b) => a - b),
		cells,
		lines,
		() =>
			report.add(
				"lyrics-dropped",
				"warning",
				`verses past ${MAX_ROWS.toLocaleString("en-US")} lyric rows are left out`,
				{
					track: lyrics.track,
				},
			),
	);
	while (kept.length > 0) {
		const text = withRows(chart, lines, cells, kept, seam);
		const verse = failing(text, cells, kept, grid.bars.length);
		if (verse === null) return text;
		dropped(verse);
		kept = kept.filter((v) => v !== verse);
	}
	return chart;
}
