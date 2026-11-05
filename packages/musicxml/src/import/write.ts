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
import type { ReadScore } from "./read.js";
import { type LyricSource, replaysOf, type Section, sectionsOf } from "./replays.js";
import { allLines, type Last, playingOf, rowsOf, type Source } from "./rows.js";
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

/** What the body is written with. */
type Writer = {
	src: Source;
	header: string[];
	lyrics: (LyricSource & { numbered: boolean }) | null;
	last: Last;
};

/** The lyric text lines for a system's bars, one per verse. */
function lyricsUnder(w: Writer, s: System): string[] {
	const { lyrics, src } = w;
	if (!lyrics) return [];
	const measuresOf = (from: number, to: number) =>
		src.bars.slice(from, to).flatMap((b) => lyrics.measures[b.index] ?? []);
	const verses = lyricLines(measuresOf(s.from, s.to), lyrics.line, measuresOf(s.to, Infinity));
	return verseText(verses, lyrics.numbered).flatMap((t) => textLine(t, w.header) ?? []);
}

/** What comes before a system's rows: its first bar's directives and heading. */
function before(w: Writer, s: System): string[] {
	const bar = w.src.bars[s.from];
	if (!bar) return [];
	const heading = bar.heading === null ? null : headingLine(bar.heading, w.header);
	return [...(bar.directives ? [bar.directives] : []), ...(heading ? [heading] : [])];
}

/** Every text line the system's bars carry, before its rows (an ending may hold some mid-line). */
function textOf(w: Writer, s: System): string[] {
	return w.src.bars
		.slice(s.from, s.to)
		.flatMap((b) => b.textLines.flatMap((t) => textLine(t, w.header) ?? []));
}

function systemLines(w: Writer, s: System): string[] {
	return [...before(w, s), ...textOf(w, s), ...rowsOf(w.src, s, w.last), ...lyricsUnder(w, s)];
}

/** The body: each system, a replayed section as its heading alone. */
function body(w: Writer, systems: System[], sections: Section[]): string[] {
	const replays = replaysOf(w.src, sections, w.lyrics);
	const sectionOf = (i: number) => sections.find((x) => x.from <= i && i < x.to) as Section;
	return systems.flatMap((s) => {
		const start = sectionOf(s.from).from;
		if (!replays.has(start)) return systemLines(w, s);
		return s.from === start ? before(w, s) : [];
	});
}

/** The chart's errors, each reported as the importer's bug. */
function check(text: string, losses: Losses): void {
	for (const d of parseChart(text).diagnostics)
		if (d.severity === "error")
			losses.note({ severity: "error", message: `importer bug: ${d.message} (line ${d.line})` });
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
				);
	const labelled = systems.some((s) => !s.tutti);
	const header = labelled
		? parts.map((p, i) => partLine(labels[i] ?? p.label, p.name, p.instrument))
		: [];
	const w: Writer = { src, header, lyrics: lyricSource(score, losses), last: allLines(src) };
	const lines = [
		...titleLine(score.title),
		...creditLines(score.credits),
		...header,
		...body(w, systems, sectionsOf(src)),
	];
	const text = printChart(`${lines.join("\n")}\n`);
	check(text, losses);
	return text;
}
