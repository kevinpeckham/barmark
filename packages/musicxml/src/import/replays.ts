/**
 * Sections, and which come back as replays (grammar 6): a section whose
 * bars, structure and every part's lines match the most recent section of
 * the same name is written as its heading alone, as charts write it, with
 * its own lyrics under it. Its first bar's directives may differ: they are
 * written before the heading, where they change the replay. A section
 * repeated whole is `x N` on its heading.
 */
import { ownCell, type Source, timesText } from "./rows.js";

/** A section: its heading, and bars `from` up to `to` (exclusive). */
export type Section = { name: string | null; from: number; to: number };

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

/** Whether two sections play alike; their lyrics may differ (a replay keeps its own as text lines). */
function alike(src: Source, a: Section, b: Section): boolean {
	if (a.to - a.from !== b.to - b.from) return false;
	for (let k = 0; k < a.to - a.from; k++)
		if (barKey(src, a.from + k, k === 0) !== barKey(src, b.from + k, k === 0)) return false;
	return true;
}

/**
 * `x2` (or `x ...`) when the section is one repeat from its first bar to
 * its last, with no endings and no other repeat inside: grammar 5's
 * `## Chorus x2`. Null otherwise.
 */
export function wholeRepeat(src: Source, s: Section): string | null {
	const bars = src.bars.slice(s.from, s.to);
	const first = bars[0];
	const end = bars[bars.length - 1];
	if (s.name === null || !first?.opens || !end || end.closes === null) return null;
	const inside = bars.some(
		(b, k) => b.ending !== null || (k > 0 && b.opens) || (k < bars.length - 1 && b.closes !== null),
	);
	return inside ? null : timesText(end.closes);
}

/** Names match in any case, whitespace collapsed (grammar 6). */
const nameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/** The first bars of the sections written as replays. */
export function replaysOf(src: Source, sections: Section[]): Set<number> {
	const out = new Set<number>();
	sections.forEach((s, k) => {
		if (s.name === null) return;
		const name = nameKey(s.name);
		const earlier = sections
			.slice(0, k)
			.reverse()
			.find((e) => e.name !== null && nameKey(e.name) === name);
		if (earlier && alike(src, earlier, s)) out.add(s.from);
	});
	return out;
}
