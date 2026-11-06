/**
 * The imported chart as canonical barmark text: the title, credits and
 * `part:` lines, then each section's systems (one tutti line where the
 * parts agree), later verses as lyric rows under each system's rows, and
 * replays where a section comes back with the same notes (and its rows,
 * when its words are new). The importer parses what it wrote:
 * an error there is an importer bug, reported as one.
 */
import { type ChartParse, parseChart, printParsed } from "barmark";
import { metersOf, settleEndings } from "./endings.js";
import type { Losses } from "./losses.js";
import type { Words } from "./lyrics.js";
import type { ImportedPart } from "./parts.js";
import type { ReadScore } from "./read.js";
import { replaysOf, type Section, sectionsOf, wholeRepeat } from "./replays.js";
import { allLines, forget, type Last, playingOf, rowsOf, type Source } from "./rows.js";
import { mismatches, NEVER_SUNG, reportBugs, verseMismatches } from "./selfcheck.js";
import type { Structure } from "./structure.js";
import { type System, systemsOf } from "./systems.js";
import { creditLines, headingLine, partLine, textLine, titleLine } from "./text.js";
import { meantAt, type RowBar, replayRows, rowsUnder, type Verses, versesOf } from "./verses.js";

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

/** Bars `from` up to `to` (exclusive): a system or a section. */
type Span = { from: number; to: number };

/** What the body is written with. */
type Writer = {
	src: Source;
	header: string[];
	verses: Verses | null;
	last: Last;
	/** Each bar written so far, in written order, as its index in `src.bars`: what the self-check plays back. */
	written: number[];
	/** Each written bar (its index in `src.bars`) and what it sings, every pass and replay of it: a measure, under the rows of a written bar. What it means is read once the rows are written. */
	sung: [number, RowBar][];
};

/** The measures of bars `s` (indices in `src.bars`). */
const measuresIn = (w: Writer, s: Span) => w.src.bars.slice(s.from, s.to).map((b) => b.index);

/** A part's label as the chart names it to the parse: "" when it declares no parts. */
const labelFor = (w: Writer) => (p: number | null) =>
	w.header.length > 0 && p !== null ? (w.src.labels[p] ?? "") : "";

/** Notes that written bar `bar` (its index in `src.bars`) sings as written bar `as` does. */
function mean(w: Writer, bar: number, as: number): void {
	w.sung.push([bar, rowBar(w, as)]);
}

/** Written bar `i` as its rows see it: its measure, and itself. */
const rowBar = (w: Writer, i: number): RowBar => ({ measure: w.src.bars[i]?.index ?? i, bar: i });

/** The bars `s` as rows see them. */
const rowBars = (w: Writer, s: Span) =>
	Array.from({ length: s.to - s.from }, (_, k) => rowBar(w, s.from + k));

/** What each written bar means to sing, every pass and replay of it together, as `sungKey`s. */
function meantOf(w: Writer): Map<number, Set<string>> {
	const out = new Map<number, Set<string>>();
	for (const [bar, as] of w.sung) {
		const set = out.get(bar) ?? new Set<string>();
		out.set(bar, set);
		for (const k of meantAt(w.src.parts, w.verses, as, labelFor(w))) set.add(k);
	}
	return out;
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

/** Each replay's section written out: a replay of a replay replays the same bars. */
function rootsOf(replays: Map<number, number>): Map<number, number> {
	const out = new Map<number, number>();
	for (const [from, of] of replays) out.set(from, out.get(of) ?? of);
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
		mean(w, i, i);
	}
	const rows = rowsOf(w.src, s, w.last, plan.times !== null);
	const lyrics = rowsUnder(w.verses, rowBars(w, s), w.src.bars[s.from]?.ending != null);
	const lines = [...lead, ...(lead.length === 0 ? separator(previous, s) : []), ...rows, ...lyrics];
	return { lines, open: lyrics.length === 0 ? keysOf(s) : null };
}

/**
 * A replayed section's rows, when it sings new words: one per line its
 * section (the one written out, `root`) is written in. Its bars sing as
 * the root's bars do, so what they sing is meant there.
 */
function replayed(w: Writer, section: Section, root: Section, systems: System[]): string[] {
	const lines = systems
		.filter((x) => x.from >= root.from && x.to <= root.to)
		.map((x) => Array.from({ length: x.to - x.from }, (_, k) => x.from - root.from + k));
	const rows = replayRows(w.verses, rowBars(w, section), measuresIn(w, root), lines);
	// With no rows of its own, a replay sings the root's rows as the root does.
	const from = rows.length > 0 ? section.from : root.from;
	for (let k = 0; k < section.to - section.from; k++) mean(w, root.from + k, from + k);
	return rows;
}

/** The body: each system; a replayed section as its heading, and its rows when it sings new words. */
function body(w: Writer, systems: System[], sections: Section[]): string[] {
	const planned = plans(w, systems, sections);
	const roots = rootsOf(replaysOf(w.src, sections));
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
		const root = byStart.get(roots.get(section.from) ?? section.from) ?? section;
		return [
			...before(w, s, plan.times),
			...textOf(w, section),
			...replayed(w, section, root, systems),
		];
	});
}

/** The chart's errors, and every bar where a part plays other than the importer meant, each reported as the importer's bug. */
function check(parsed: ChartParse, w: Writer, losses: Losses): void {
	const errors = parsed.diagnostics
		.filter((d) => d.severity === "error")
		.map((d) => `${d.message} (line ${d.line})`);
	const bugs =
		errors.length > 0
			? errors
			: [
					...mismatches(parsed, w.src, w.written),
					...verseMismatches(parsed, w.written, meantOf(w), (i) => w.src.bars[i]?.measure ?? ""),
				];
	reportBugs(bugs, losses);
	// More stacked verses than a repeat has passes: every row is kept, and barmark says which aren't sung.
	for (const d of parsed.diagnostics)
		if (NEVER_SUNG.test(d.message)) losses.note({ severity: "warning", message: d.message });
}

/** The singer's line, whose syllables a replay may change with its rows (`"part.line"`); null when the rows are a lyric staff's or no one's. */
function newWords(parts: ImportedPart[], verses: Verses | null): string | null {
	const line = verses?.owner == null ? undefined : parts[verses.owner]?.sings?.line;
	return verses?.from === 2 && line !== undefined ? `${verses.owner}.${line}` : null;
}

/** The imported chart, canonical (`printChart(text) === text`); errors in it are reported to `losses`. */
export function writeChart(
	score: ReadScore,
	parts: ImportedPart[],
	structure: Structure,
	losses: Losses,
	staff: Words | null = null,
): string {
	const bars = settleEndings(structure.bars, losses);
	// Played in order, endings no pass takes can leave nothing at all.
	if (bars.length === 0) {
		losses.note({ severity: "error", message: "nothing to import: no bar plays" });
		return "";
	}
	const labels = numbered(parts.map((p) => p.label));
	const verses = versesOf(parts, staff, losses);
	const src: Source = {
		parts,
		labels,
		bars,
		meters: metersOf(bars),
		previous: [],
		newWords: newWords(parts, verses),
	};
	const systems =
		parts.length === 0
			? []
			: systemsOf(
					bars,
					bars.map((_, i) => playingOf(src, i)),
					parts.map((p) => p.lines.length),
				);
	// A lyric staff's rows are the voice part's only when the chart names its parts (grammar 7.7).
	const voiced = verses?.from === 1 && verses.owner !== null;
	const labelled = voiced || systems.some((s) => !s.tutti);
	const header = labelled
		? parts.map((p, i) => partLine(labels[i] ?? p.label, p.name, p.instrument))
		: [];
	const w: Writer = {
		src,
		header,
		verses,
		last: allLines(src),
		written: [],
		sung: [],
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
