/**
 * A file that is one line of notes, as that line (the note-line design,
 * 4 to 6.4): the grid and directives as the chord reading makes them,
 * the line's pitches named, put on the grid, held or rested, and written
 * one text a bar. Sync builds the chart around them from one placeholder
 * run of `C`; each bar's cell is then replaced with the line's, found
 * through the parse, and lyric rows go on as the chord reading's do. The
 * self-check plays the chart with `perform`: it must parse and sound the
 * line's attacks, the same pitches at the same times, or the caller reads
 * the file as chords instead (null).
 */
import { type Meter, type PlayedBar, parseChart, parseMeter, printChart } from "barmark";
import { perform } from "../perform/index.js";
import type { Smf } from "../smf/types.js";
import type { Line } from "./attacks.js";
import { built, detectionsOf, failed, writable } from "./build.js";
import { barTexts, withSimile } from "./cells.js";
import { directivesOf } from "./directives.js";
import { statesOf } from "./ends.js";
import { type Grid, gridOf, lastHeard } from "./grid.js";
import { lastLyric, withLyrics } from "./lyrics.js";
import { sectionsOf, titleOf } from "./markers.js";
import type { Note } from "./notes.js";
import { type Named, named } from "./pitch.js";
import { pointTick, type Quantized, quantize, TOLERANCE } from "./quantize.js";
import { andList, createReport, type Report } from "./report.js";
import type { MidiImportOptions } from "./types.js";

/** Rewrites the finished chart before the self-check plays it: a test seam. */
export type LineSeam = (chart: string) => string;

/** The most bars `rhythm-rounded` names before it counts the rest. */
const NAMED_BARS = 8;
/** Times in quarters agree within this. */
const EPSILON = 1e-6;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The grid's exclusive end (as `gridOf` takes it): past every note's
 * attack and a 128th after it, so the beat an early attack belongs to
 * exists (ruling 5), and past every lyric.
 */
function lastTick(line: Line, smf: Smf, options: MidiImportOptions): number {
	const lyric = options.lyrics === false ? -1 : lastLyric(smf);
	const { ppq } = smf;
	return line.notes.reduce(
		(end, n) => Math.max(end, lastHeard(n, ppq, Math.floor(n.start + ppq / TOLERANCE) + 1)),
		lyric + 1,
	);
}

/** One `rhythm-rounded` for the file: its first bar, up to eight bars by written number, and the attacks joined. */
function reportRounded(q: Quantized<Named>, grid: Grid, report: Report): void {
	const [first] = q.rounded;
	if (first === undefined) return;
	const offset = grid.pickup ? 0 : 1;
	const numbers = q.rounded.map((b) => String(b + offset));
	const more = numbers.length - NAMED_BARS;
	const bars =
		more > 0 ? `${numbers.slice(0, NAMED_BARS).join(", ")} and ${more} more` : andList(numbers);
	const joined =
		q.joined > 0
			? `; ${plural(q.joined, "attack was", "attacks were")} joined to another on one point`
			: "";
	report.add(
		"rhythm-rounded",
		"warning",
		`an attack fit no division of its beat and was moved to the nearest point, in ${numbers.length === 1 ? "bar" : "bars"} ${bars}${joined}`,
		{ bar: first + 1 },
	);
}

/** The opening info: the line, and the short notes left out. */
function reportLine(line: Line, report: Report): void {
	report.add(
		"notes-line",
		"info",
		"the notes are one line and are written as notes; notes: false reads chords from them",
	);
	if (line.short > 0)
		report.add(
			"notes-short",
			"info",
			`${plural(line.short, "note", "notes")} shorter than a 64th note left out`,
		);
}

/** A bar's leading `[n/d]`, kept when its cell is replaced. */
const BAR_METER = /^\s*(\[\d+\/\d+\])/;

const sameMeter = (a: Meter | undefined, b: Meter | undefined) =>
	a !== undefined && b !== undefined && a.n === b.n && a.d === b.d;

/** A bar line: its source line (0-based), the index of its first played bar, and its cells as split at `|`. */
type Row = { at: number; first: number; cells: string[] };

/** The bar lines, each with its cells, in order; null when a line's cells do not number its bars. */
function rowsOf(lines: string[], bars: PlayedBar[]): Row[] | null {
	const rows: Row[] = [];
	bars.forEach((bar, i) => {
		const last = rows.at(-1);
		if (last?.at === bar.line - 1) last.cells.push("");
		else rows.push({ at: bar.line - 1, first: i, cells: [""] });
	});
	for (const row of rows) {
		const parts = (lines[row.at] ?? "").split("|");
		const count = row.cells.length;
		if (parts.length !== count + 2 || parts[0]?.trim() !== "" || parts.at(-1)?.trim() !== "")
			return null;
		row.cells = parts.slice(1, -1);
	}
	return rows;
}

/** Only blank lines between two source lines. */
const adjacent = (lines: string[], from: number, to: number) =>
	lines.slice(from + 1, to).every((l) => l.trim() === "");

/**
 * Each bar's cell replaced by its text (spec 6.2), a leading `[n/d]`
 * kept, `%` for a repeat when `simile` (6.1). Null when sync's bars are
 * not the grid's one for one, or its first bar is not in the meter the
 * line was quantized in (`first`).
 */
function withCells(
	chart: string,
	texts: string[],
	simile: boolean,
	first: Meter | undefined,
): string | null {
	const { bars } = parseChart(chart);
	if (bars.length !== texts.length || !sameMeter(bars[0]?.meter, first)) return null;
	const lines = chart.split("\n");
	const rows = rowsOf(lines, bars);
	if (rows === null) return null;
	const meters = rows.flatMap((row) => row.cells.map((cell) => BAR_METER.exec(cell)?.[1] ?? null));
	const same = (i: number) => {
		const [bar, before] = [bars[i], bars[i - 1]];
		return (
			meters[i] === null &&
			sameMeter(bar?.meter, before?.meter) &&
			adjacent(lines, (before?.line ?? 0) - 1, (bar?.line ?? 0) - 1)
		);
	};
	const written = simile ? withSimile(texts, same) : texts;
	for (const row of rows) {
		const cells = row.cells.map((_, k) => {
			const i = row.first + k;
			const meter = meters[i];
			return meter ? `${meter} ${written[i]}` : written[i];
		});
		lines[row.at] = `| ${cells.join(" | ")} |`;
	}
	return printChart(lines.join("\n"));
}

/** `[quarters, pitch]` pairs sorted by time, then pitch. */
const sorted = (pairs: [number, number][]) => pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

/** The line's attacks as the chart must sound them: each struck point's pitches at its time on the chart's clock. */
function struckPairs(q: Quantized<Named>, ppq: number): [number, number][] {
	return sorted(
		q.struck.flatMap((s) => {
			const at = pointTick(q, s.beat, s.point) / ppq;
			const pitches = new Set(s.attacks.flatMap((a) => a.pitches));
			return [...pitches].map((p): [number, number] => [at, p]);
		}),
	);
}

/** The self-check (6.4): the chart parses with no error and its performance sounds exactly the struck points. */
function soundsAsStruck(chart: string, q: Quantized<Named>, ppq: number): boolean {
	try {
		const parse = parseChart(chart);
		if (parse.diagnostics.some((d) => d.severity === "error")) return false;
		const heard = sorted(
			perform(parse).tracks.flatMap((t) =>
				t.notes.map((n): [number, number] => [n.at.n / n.at.d, n.pitch]),
			),
		);
		const wanted = struckPairs(q, ppq);
		return (
			heard.length === wanted.length &&
			heard.every(([at, p], i) => {
				const [w, wp] = wanted[i] ?? [Number.NaN, -1];
				return p === wp && Math.abs(at - w) < EPSILON;
			})
		);
	} catch {
		return false;
	}
}

/** The line's attacks named; reports `pitch-range`. Null when no pitch can be written. */
function namedAttacks(
	line: Line,
	keys: Parameters<typeof named>[1],
	report: Report,
): Named[] | null {
	const { attacks, outOfRange } = named(line.attacks, keys);
	if (outOfRange > 0)
		report.add(
			"pitch-range",
			"warning",
			`${plural(outOfRange, "pitch", "pitches")} outside C0 to B8 left out: a chart cannot write ${outOfRange === 1 ? "it" : "them"}`,
		);
	return attacks.length === 0 ? null : attacks;
}

/**
 * The grid in the meters the chart is written in (final review, 2): a
 * written pickup in the unit of the meter after it, as sync writes its
 * `[k/d]`; every other bar as read. `withCells` holds the chart to it.
 */
function chartGrid(grid: Grid): Grid {
	const [pickup, next] = grid.bars;
	if (!grid.pickup || pickup === undefined || next === undefined) return grid;
	const n = ((next.start - pickup.start) * next.meter.d) / (4 * grid.ppq);
	if (!Number.isInteger(n)) return grid;
	return { ...grid, bars: [{ ...pickup, meter: { n, d: next.meter.d } }, ...grid.bars.slice(1)] };
}

/**
 * Whether the chart's final beat was rounded and an attack in it lies
 * nearer the beat's end than the point it was given, on the file's clock
 * (final review, 3): the final beat has no end point to carry it to.
 */
function endsEarly(q: Quantized): boolean {
	const b = q.beats.length - 1;
	const beat = q.beats[b];
	if (beat === undefined || q.rounded.at(-1) !== beat.bar) return false;
	const end = beat.start + beat.length;
	const step = beat.length / (q.parts[b] ?? 1);
	return q.struck.some(
		(s) =>
			s.beat === b &&
			s.attacks.some((a) => end - a.tick < Math.abs(a.tick - (beat.start + s.point * step))),
	);
}

/**
 * Whether a chart can write every bar's meter (grammar 2.1: 1 to 32 over 2,
 * 4, 8 or 16). A bar cut by a time signature can come out as thousands of
 * sixteenths; sync leaves such a meter out, so the line could not be
 * written in it, and counting its beats first would cost a small file
 * millions of them. Asked before any beat is counted.
 */
const writes = (grid: Grid) => grid.bars.every((b) => parseMeter(`${b.meter.n}/${b.meter.d}`));

/**
 * The grid's exclusive end: `lastTick`, or one bar more when the last
 * attack would be written early in the final beat (`endsEarly`), unless
 * that bar is past the bar limit. Trial grids report nothing.
 */
function gridEnd(line: Line, smf: Smf, options: MidiImportOptions): number {
	const last = lastTick(line, smf, options);
	const trial = createReport();
	const read = gridOf(smf, last, trial);
	if (failed(trial) || !writes(read) || !endsEarly(quantize(line.attacks, read))) return last;
	const longer = createReport();
	gridOf(smf, read.end + 1, longer);
	return failed(longer) ? last : read.end + 1;
}

/**
 * The chart of a line (the note-line design, 6), or null when anything
 * stops it (ruling 11): an error reported, no pitch in range, cells that
 * cannot be placed, or a failed self-check; the caller then reads the
 * file as chords. It reports only into `report`. `seam` rewrites the
 * chart before the check (tests).
 */
export function lineChart(
	line: Line,
	smf: Smf,
	names: (string | null)[],
	allNotes: Note[],
	options: MidiImportOptions,
	report: Report,
	seam: LineSeam = (chart) => chart,
): string | null {
	reportLine(line, report);
	const read = gridOf(smf, gridEnd(line, smf, options), report);
	if (failed(report) || !writes(read)) return null;
	const grid = writable(read, report);
	const directives = directivesOf(smf, grid, line.notes, report);
	const attacks = namedAttacks(line, directives.keys, report);
	if (attacks === null) return null;
	const written = chartGrid(grid);
	const q = quantize(attacks, written);
	reportRounded(q, grid, report);
	const texts = barTexts(statesOf(q, grid), q);
	const placeholder = [{ start: grid.bars[0]?.start ?? 0, end: grid.end, symbol: "C" }];
	const sections = sectionsOf(smf, grid, report);
	const input = detectionsOf(grid, placeholder, directives, sections, titleOf(smf, names));
	const chart = built(input, grid, options, report);
	if (failed(report)) return null;
	const cells = withCells(chart, texts, options.simile !== false, written.bars[0]?.meter);
	if (cells === null) return null;
	const rows = options.lyrics === false ? cells : withLyrics(cells, smf, grid, allNotes, report);
	const out = seam(rows);
	return soundsAsStruck(out, q, smf.ppq) ? out : null;
}
