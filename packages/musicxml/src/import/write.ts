/**
 * The imported chart as canonical barmark text: the title, credits and
 * `part:` lines, then each section's systems (one tutti line where the
 * parts agree), lyrics as text lines under each system's rows, and replays
 * where a section comes back unchanged. The importer parses what it wrote:
 * an error there is an importer bug, reported as one.
 */
import { type ChartParse, parseChart, printParsed } from "barmark";
import { metersOf, settleEndings } from "./endings.js";
import type { Losses } from "./losses.js";
import { importLyrics, lyricLines, verseText } from "./lyrics.js";
import type { ImportedPart } from "./parts.js";
import type { ReadMeasure, ReadScore } from "./read.js";
import { replaysOf, type Section, sectionsOf, wholeRepeat } from "./replays.js";
import { allLines, forget, type Last, playingOf, rowsOf, type Source } from "./rows.js";
import { mismatches, reportBugs } from "./selfcheck.js";
import type { Structure } from "./structure.js";
import { type System, systemsOf } from "./systems.js";
import { creditLines, headingLine, partLine, textLine, titleLine } from "./text.js";

/** Labels told apart: each label two parts share is numbered (`Gtr1`, `Gtr2`), skipping labels already taken. */
export function numbered(labels: string[]): string[] {
	const count = (l: string) => labels.filter((x) => x.toLowerCase() === l.toLowerCase()).length;
	const taken = new Set(labels.filter((l) => count(l) === 1).map((l) => l.toLowerCase()));
	return labels.map((label) => {
		if (count(label) === 1) return label;
		let n = 1;
		while (taken.has(`${label}${n}`.toLowerCase())) n++;
		taken.add(`${label}${n}`.toLowerCase());
		return `${label}${n}`;
	});
}

/** Where lyrics are read: the measures of the part that has them, its line, and whether verses are numbered. */
type LyricSource = { measures: ReadMeasure[]; line: number; numbered: boolean };

/** Bars `from` up to `to` (exclusive): a system or a section. */
type Span = { from: number; to: number };

/** What the body is written with. */
type Writer = {
	src: Source;
	header: string[];
	lyrics: LyricSource | null;
	last: Last;
	/** Each bar written so far, in written order, as its index in `src.bars`: what the self-check plays back. */
	written: number[];
};

/** How many bars after a system are read for the end of a word it leaves open: far past any sung word, and a bound on a file whose words never end. */
const FOLLOWING = 64;

/** The lyric text lines for a system's (or a replayed section's) bars, one per verse. */
function lyricsUnder(w: Writer, s: Span): string[] {
	const { lyrics, src } = w;
	if (!lyrics) return [];
	const own = src.bars.slice(s.from, s.to).flatMap((b) => lyrics.measures[b.index] ?? []);
	// The bars after the system, read lazily: only as far as a word it leaves open needs.
	function* following() {
		for (let i = s.to; i < Math.min(src.bars.length, s.to + FOLLOWING); i++) {
			const m = lyrics?.measures[src.bars[i]?.index ?? -1];
			if (m) yield m;
		}
	}
	const verses = lyricLines(own, lyrics.line, following());
	return verseText(verses, lyrics.numbered).flatMap((t) => textLine(t, w.header) ?? []);
}

/** A section's heading, with `x N` when the section repeats whole; null when the name can't be written as one. */
function headingOf(w: Writer, s: System, times: string | null): string | null {
	const name = w.src.bars[s.from]?.heading;
	const line = name == null ? null : headingLine(name, w.header);
	return line && times ? `${line} ${times}` : line;
}

/** What comes before a system's rows: its first bar's directives and heading. */
function before(w: Writer, s: System, times: string | null): string[] {
	const directives = w.src.bars[s.from]?.directives;
	const heading = headingOf(w, s, times);
	return [...(directives ? [directives] : []), ...(heading ? [heading] : [])];
}

/** Every text line the system's bars carry, before its rows (an ending may hold some mid-line). */
function textOf(w: Writer, s: Span): string[] {
	return w.src.bars
		.slice(s.from, s.to)
		.flatMap((b) => b.textLines.flatMap((t) => textLine(t, w.header) ?? []));
}

/** How a section is written: as a replay (its heading and lyrics alone), and `x N` when it repeats whole over several systems. */
type Plan = { replay: boolean; times: string | null };

/** Each section's first bar, for every bar: a section is found without searching them all. */
function sectionStarts(sections: Section[], bars: number): number[] {
	const out = Array<number>(bars).fill(0);
	for (const s of sections) for (let i = s.from; i < s.to; i++) out[i] = s.from;
	return out;
}

function plans(w: Writer, systems: System[], sections: Section[]): Map<number, Plan> {
	const replays = replaysOf(w.src, sections);
	const starts = sectionStarts(sections, w.src.bars.length);
	const rowsIn = new Map<number, number>();
	for (const x of systems) {
		const start = starts[x.from] ?? 0;
		rowsIn.set(start, (rowsIn.get(start) ?? 0) + 1);
	}
	return new Map(
		sections.map((s) => {
			const rows = rowsIn.get(s.from) ?? 0;
			// A replay, and `x N` on a heading, need the heading; a name no heading can
			// hold (unreachable in practice: quoting stops every repeat and elision)
			// writes its bars out, with their repeat marks.
			const named = headingOf(w, { from: s.from, to: s.to, tutti: true, lines: [] }, null);
			const times = rows > 1 && named !== null ? wholeRepeat(w.src, s) : null;
			return [s.from, { replay: replays.has(s.from) && named !== null, times }];
		}),
	);
}

/** A labelled system's lines as `"part.line"` keys; null for a tutti line. */
const keysOf = (s: System): string[] | null => (s.tutti ? null : s.lines);

/**
 * The `---` that keeps a labelled system from joining the labelled system
 * written just before it (grammar 7.4 joins consecutive labelled lines
 * while no label repeats), or nothing when its first row repeats a label
 * of that system and starts a new one by itself.
 */
function separator(previous: string[] | null, s: System): string[] {
	const keys = keysOf(s);
	if (previous === null || keys === null || previous.includes(keys[0] ?? "")) return [];
	return ["---"];
}

/**
 * A system's lines, and its keys when its rows come last (nothing yet
 * between them and the next system); `previous` holds the keys of a
 * labelled system written just before it, with nothing between.
 */
function systemLines(
	w: Writer,
	s: System,
	plan: Plan,
	first: boolean,
	previous: string[] | null,
): { lines: string[]; open: string[] | null } {
	const lead = [...before(w, s, first ? plan.times : null), ...textOf(w, s)];
	for (let i = s.from; i < s.to; i++) {
		w.src.previous[i] = w.written[w.written.length - 1] ?? null;
		w.written.push(i);
	}
	const rows = rowsOf(w.src, s, w.last, plan.times !== null);
	const lyrics = lyricsUnder(w, s);
	const lines = [...lead, ...(lead.length === 0 ? separator(previous, s) : []), ...rows, ...lyrics];
	return { lines, open: lyrics.length === 0 ? keysOf(s) : null };
}

/** The body: each system; a replayed section as its heading and its own lyrics. */
function body(w: Writer, systems: System[], sections: Section[]): string[] {
	const planned = plans(w, systems, sections);
	const starts = sectionStarts(sections, w.src.bars.length);
	const byStart = new Map(sections.map((x) => [x.from, x]));
	const sectionOf = (i: number) => byStart.get(starts[i] ?? 0) as Section;
	// The keys of the labelled system just written, while nothing has followed its rows.
	let previous: string[] | null = null;
	return systems.flatMap((s) => {
		const section = sectionOf(s.from);
		const plan = planned.get(section.from) as Plan;
		const first = s.from === section.from;
		if (!plan.replay) {
			const { lines, open } = systemLines(w, s, plan, first, previous);
			previous = open;
			return lines;
		}
		if (!first) return [];
		previous = null;
		// The bars after a replay follow what it played, not the bar written before it.
		forget(w.last);
		return [...before(w, s, plan.times), ...textOf(w, section), ...lyricsUnder(w, section)];
	});
}

/** The chart's errors, and every bar where a part plays other than the importer meant, each reported as the importer's bug. */
function check(parsed: ChartParse, w: Writer, losses: Losses): void {
	const errors = parsed.diagnostics
		.filter((d) => d.severity === "error")
		.map((d) => `${d.message} (line ${d.line})`);
	reportBugs(errors.length > 0 ? errors : mismatches(parsed, w.src, w.written), losses);
}

/** Where the lyrics come from, if any part has them. */
function lyricSource(score: ReadScore, losses: Losses): Writer["lyrics"] {
	const found = importLyrics(score.parts, losses);
	const measures = found ? score.parts[found.part]?.measures : undefined;
	return found && measures ? { measures, line: found.line, numbered: found.numbered } : null;
}

/** The imported chart, canonical (`printChart(text) === text`); errors in it are reported to `losses`. */
export function writeChart(
	score: ReadScore,
	parts: ImportedPart[],
	structure: Structure,
	losses: Losses,
): string {
	const bars = settleEndings(structure.bars, losses);
	const labels = numbered(parts.map((p) => p.label));
	const src: Source = { parts, labels, bars, meters: metersOf(bars), previous: [] };
	const systems =
		parts.length === 0
			? []
			: systemsOf(
					bars,
					bars.map((_, i) => playingOf(src, i)),
					parts.map((p) => p.lines.length),
				);
	const labelled = systems.some((s) => !s.tutti);
	const header = labelled
		? parts.map((p, i) => partLine(labels[i] ?? p.label, p.name, p.instrument))
		: [];
	const w: Writer = {
		src,
		header,
		lyrics: lyricSource(score, losses),
		last: allLines(src),
		written: [],
	};
	const lines = [
		...titleLine(score.title),
		...creditLines(score.credits),
		...header,
		...body(w, systems, sectionsOf(src)),
	];
	const raw = `${lines.join("\n")}\n`;
	const first = parseChart(raw);
	const text = printParsed(raw, first);
	// The rows are written canonical, so the printed chart is usually the one already parsed.
	check(text === raw ? first : parseChart(text), w, losses);
	return text;
}
