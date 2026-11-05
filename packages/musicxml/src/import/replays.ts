/**
 * Sections, and which come back as replays (grammar 6): a section whose
 * bars, structure, every part's lines and lyrics match the most recent
 * section of the same name is written as its heading alone, as charts
 * write it. Its first bar's directives may differ: they are written
 * before the heading, where they change the replay.
 */
import type { ReadMeasure } from "./read.js";
import { ownCell, type Source } from "./rows.js";

/** A section: its heading, and bars `from` up to `to` (exclusive). */
export type Section = { name: string | null; from: number; to: number };

/** Where lyrics are read: the measures of the part that has them, and its line. */
export type LyricSource = { measures: ReadMeasure[]; line: number } | null;

export function sectionsOf(src: Source): Section[] {
	const out: Section[] = [];
	src.bars.forEach((bar, i) => {
		const last = out[out.length - 1];
		if (bar.heading !== null || !last) out.push({ name: bar.heading, from: i, to: i + 1 });
		else last.to = i + 1;
	});
	return out;
}

/** Everything a bar plays and shows, for comparing two sections; the first bar's directives are left out. */
function barKey(src: Source, i: number, first: boolean): string {
	const bar = src.bars[i];
	if (!bar) return "";
	const { index: _i, measure: _m, heading: _h, directives, ...shown } = bar;
	const cells = src.parts.map((part, p) => part.lines.map((_, l) => ownCell(src, p, l, i)));
	return JSON.stringify({ ...shown, directives: first ? null : directives, cells });
}

/** The words sung in a section, syllable by syllable. */
function sungIn(src: Source, s: Section, lyrics: LyricSource): string {
	if (!lyrics) return "";
	const measures = src.bars.slice(s.from, s.to).map((b) => lyrics.measures[b.index]);
	return JSON.stringify(
		measures.map((m) => (m?.lines[lyrics.line] ?? []).flatMap((a) => a.lyrics)),
	);
}

function alike(src: Source, a: Section, b: Section, lyrics: LyricSource): boolean {
	if (a.to - a.from !== b.to - b.from) return false;
	for (let k = 0; k < a.to - a.from; k++)
		if (barKey(src, a.from + k, k === 0) !== barKey(src, b.from + k, k === 0)) return false;
	return sungIn(src, a, lyrics) === sungIn(src, b, lyrics);
}

/** Names match in any case, whitespace collapsed (grammar 6). */
const nameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/** The first bars of the sections written as replays. */
export function replaysOf(src: Source, sections: Section[], lyrics: LyricSource): Set<number> {
	const out = new Set<number>();
	sections.forEach((s, k) => {
		if (s.name === null) return;
		const name = nameKey(s.name);
		const earlier = sections
			.slice(0, k)
			.reverse()
			.find((e) => e.name !== null && nameKey(e.name) === name);
		if (earlier && alike(src, earlier, s, lyrics)) out.add(s.from);
	});
	return out;
}
