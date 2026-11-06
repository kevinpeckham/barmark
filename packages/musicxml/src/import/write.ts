/**
 * The imported chart as canonical barmark text: the title, credits and
 * `part:` lines, then each section's systems (one tutti line where the
 * parts agree), lyrics as text lines under each system's rows, and replays
 * where a section comes back unchanged. The importer parses what it wrote:
 * an error there is an importer bug, reported as one.
 */
import { parseChart, printChart } from "barmark";
import { metersOf, settleEndings } from "./endings.js";
import type { Losses } from "./losses.js";
import { importLyrics, lyricLines, verseText } from "./lyrics.js";
import type { ImportedPart } from "./parts.js";
import type { ReadMeasure, ReadScore } from "./read.js";
import { replaysOf, type Section, sectionsOf, wholeRepeat } from "./replays.js";
import { allLines, forget, type Last, playingOf, rowsOf, type Source } from "./rows.js";
import { mismatches } from "./selfcheck.js";
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

/** How many bars after a system are read for the end of a word it starts: a word's syllables come bar after bar. */
const FOLLOWING = 8;

/** The lyric text lines for a system's (or a replayed section's) bars, one per verse. */
function lyricsUnder(w: Writer, s: Span): string[] {
	const { lyrics, src } = w;
	if (!lyrics) return [];
	const measuresOf = (from: number, to: number) =>
		src.bars.slice(from, to).flatMap((b) => lyrics.measures[b.index] ?? []);
	const verses = lyricLines(
		measuresOf(s.from, s.to),
		lyrics.line,
		measuresOf(s.to, s.to + FOLLOWING),
	);
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

function plans(w: Writer, systems: System[], sections: Section[]): Map<number, Plan> {
	const replays = replaysOf(w.src, sections);
	return new Map(
		sections.map((s) => {
			const rows = systems.filter((x) => s.from <= x.from && x.from < s.to).length;
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

/** A label as the rows write it: `Gtr`, `Pno.RH`. */
function rowLabel(src: Source, key: string): string {
	const [p = 0, l = 0] = key.split(".").map(Number);
	const name = src.parts[p]?.lines[l]?.name;
	return `${src.labels[p]}${name ? `.${name}` : ""}`;
}

/**
 * The text line that keeps a labelled system from joining the labelled
 * system written just before it (grammar 7.4 joins consecutive labelled
 * lines while no label repeats), or nothing when its first row repeats a
 * label of that system and starts a new one by itself. It names who stops
 * playing (`Gtr tacet`), else who starts (`Gtr enters`): a cue, as charts
 * write one, that changes nothing that plays.
 */
function separator(w: Writer, previous: string[] | null, s: System): string[] {
	const keys = keysOf(s);
	if (previous === null || keys === null || previous.includes(keys[0] ?? "")) return [];
	const leaving = previous.filter((k) => !keys.includes(k));
	const entering = keys.filter((k) => !previous.includes(k));
	const names = (ks: string[]) => ks.map((k) => rowLabel(w.src, k)).join(", ");
	const cue =
		leaving.length > 0
			? `${names(leaving)} tacet`
			: `${names(entering)} ${entering.length > 1 ? "enter" : "enters"}`;
	return [textLine(cue, w.header) ?? cue];
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
	const rows = rowsOf(w.src, s, w.last, plan.times !== null);
	const lyrics = lyricsUnder(w, s);
	for (let i = s.from; i < s.to; i++) w.written.push(i);
	const lines = [
		...lead,
		...(lead.length === 0 ? separator(w, previous, s) : []),
		...rows,
		...lyrics,
	];
	return { lines, open: lyrics.length === 0 ? keysOf(s) : null };
}

/** The body: each system; a replayed section as its heading and its own lyrics. */
function body(w: Writer, systems: System[], sections: Section[]): string[] {
	const planned = plans(w, systems, sections);
	const sectionOf = (i: number) => sections.find((x) => x.from <= i && i < x.to) as Section;
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

/** The most importer bugs listed one by one; the rest are counted. */
const BUGS_SHOWN = 3;

/**
 * The chart's errors, and every bar where a part plays other than the
 * importer meant, each reported as the importer's bug: the first few, then
 * how many more.
 */
function check(text: string, w: Writer, losses: Losses): void {
	const parsed = parseChart(text);
	const errors = parsed.diagnostics
		.filter((d) => d.severity === "error")
		.map((d) => `${d.message} (line ${d.line})`);
	const bugs = errors.length > 0 ? errors : mismatches(parsed, w.src, w.written);
	for (const bug of bugs.slice(0, BUGS_SHOWN))
		losses.note({ severity: "error", message: `importer bug: ${bug}` });
	if (bugs.length > BUGS_SHOWN)
		losses.note({
			severity: "error",
			message: `importer bug: and ${bugs.length - BUGS_SHOWN} more`,
		});
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
	const src: Source = { parts, labels, bars, meters: metersOf(bars) };
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
	const text = printChart(`${lines.join("\n")}\n`);
	check(text, w, losses);
	return text;
}
