/**
 * The importer's self-check: the chart it wrote, parsed and played, must
 * give every part's line exactly the cells the importer meant it to play.
 * Parsing without errors isn't enough: neighbouring labelled systems can
 * join into one (grammar 7.4) and still parse cleanly.
 */
import {
	type ChartParse,
	MAX_EXPANDED_BARS,
	type PartBar,
	type PlayedBar,
	type PlayedSyllable,
	parseBarLine,
	type SimpleSlot,
	type Slot,
} from "barmark";
import type { Losses } from "./losses.js";
import { ownCell, type Source } from "./rows.js";
import { sungKey } from "./verses.js";

/** A slot member as the check names it: what sounds, with its marks. */
function nameOf(s: SimpleSlot): string {
	const marks = ["push" in s ? s.push : "", "articulation" in s ? s.articulation : ""]
		.concat("pedal" in s ? [s.pedal ?? ""] : [])
		.filter(Boolean)
		.map((m) => ` ${m}`)
		.join("");
	if (s.kind !== "chord") return `${s.kind}${marks}`;
	return `${s.chord.canonical}${s.voicing?.canonical ?? ""}${marks}`;
}

/** Where each member of a slot starts, as a fraction [n, d] of the slot: a dotted pair splits 3:1 or 1:3 (grammar 2.2). */
function starts(members: SimpleSlot[]): [number, number][] {
	const [first, second] = members;
	if (members.length === 2 && first?.dotted)
		return [
			[0, 4],
			[3, 4],
		];
	if (members.length === 2 && second?.dotted)
		return [
			[0, 4],
			[1, 4],
		];
	return members.map((_, j) => [j, members.length]);
}

/**
 * A line's bar as the check compares it: its timeline, each attack at its
 * place in the bar; holds add nothing, nor does a rest after a rest. So
 * `C / / /` and `C` compare alike, and so do a bar of rest and a line
 * that doesn't play.
 */
function barKey(slots: Slot[] | null): string {
	const out: string[] = [];
	let sounding = "silence";
	const k = slots?.length ?? 0;
	(slots ?? []).forEach((slot, i) => {
		const members = slot.kind === "group" ? slot.members : [slot];
		starts(members).forEach(([n, d], j) => {
			const m = members[j] as SimpleSlot;
			if (m.kind === "hold") return;
			const name = nameOf(m);
			const quiet = (m.kind === "silence" || m.kind === "nc") && sounding === name;
			sounding = name;
			if (!quiet) out.push(`${(i * d + n) / (k * d)}:${name}`);
		});
	});
	return out.join(" ") || "rest";
}

/** The slots the importer meant a cell to hold, as barmark reads them. */
function meantKey(slots: string | null, cache: Map<string, string>): string {
	if (slots === null) return barKey(null);
	const known = cache.get(slots);
	if (known !== undefined) return known;
	const cell = parseBarLine(`| ${slots} |`, 1).bars?.cells[0];
	const key = cell?.kind === "slots" ? barKey(cell.slots) : `unreadable ${slots}`;
	cache.set(slots, key);
	return key;
}

/** Part `p`'s share of a played bar: its own in a chart of several parts, else the bar's. */
function partBar(parse: ChartParse, bar: PlayedBar, p: number): PartBar {
	if (parse.parts.length > 1) return bar.parts?.[p] ?? null;
	return { line: bar.line, slots: bar.slots, ...(bar.lines ? { lines: bar.lines } : {}) };
}

/** What a part's line played in a bar: a bare line the part's slots, a named one its line's, else nothing. */
function linePlayed(part: PartBar, name: string | null, l: number): Slot[] | null {
	if (part === null) return null;
	if (name === null) return part.slots;
	const found = part.lines?.find((x) => x.name.toLowerCase() === name.toLowerCase());
	if (found) return found.slots;
	return l === 0 && part.lines === undefined ? part.slots : null;
}

/**
 * Where the written chart plays something other than what the importer
 * meant: `written` maps each written bar (from 1, as `PlayedBar.written`
 * counts) to its bar in `src.bars`.
 */
export function mismatches(parse: ChartParse, src: Source, written: number[]): string[] {
	const out: string[] = [];
	const cache = new Map<string, string>();
	const played = new Set<number>();
	for (const bar of parse.bars) {
		const i = written[bar.written - 1];
		if (i === undefined) {
			out.push(`bar ${bar.written} plays, but the importer wrote ${written.length}`);
			continue;
		}
		played.add(i);
		const measure = src.bars[i]?.measure ?? "";
		src.parts.forEach((part, p) => {
			const share = partBar(parse, bar, p);
			part.lines.forEach((line, l) => {
				const meant = meantKey(ownCell(src, p, l, i)?.slots ?? null, cache);
				const got = barKey(linePlayed(share, line.name, l));
				const who = `${src.labels[p]}${line.name ? `.${line.name}` : ""}`;
				if (meant !== got) out.push(`${who} plays ${got} in measure ${measure}, not ${meant}`);
			});
		});
	}
	if (parse.bars.length < MAX_EXPANDED_BARS)
		written.forEach((i, k) => {
			if (!played.has(i))
				out.push(`written bar ${k + 1} (measure ${src.bars[i]?.measure}) never plays`);
		});
	return out;
}

/** A played syllable as `sungKey` names it, its onset a share of the bar (`length` in whole notes): `/` for a held one. */
const playedKey = (part: string, verse: number, s: PlayedSyllable, length: number) =>
	sungKey(
		part,
		verse,
		s.at / length,
		s.syllable.kind === "sung"
			? `${s.syllable.parts.join("~")}${s.syllable.continues ? "-" : ""}`
			: "/",
		s.note,
	);

/** Keys in `a` and not in `b`, as the message lists them. */
const missing = (a: Set<string>, b: Set<string>) =>
	[...a].filter((k) => !b.has(k)).map((k) => k.split("|").slice(0, 4).join(" "));

/**
 * Where the written chart sings other syllables than the importer meant:
 * `meant` holds what each written bar (its index in the importer's bars)
 * means to sing, every pass and replay of it together, as `sungKey`s.
 */
export function verseMismatches(
	parse: ChartParse,
	written: number[],
	meant: Map<number, Set<string>>,
	measureOf: (bar: number) => string,
): string[] {
	const got = new Map<number, Set<string>>();
	for (const bar of parse.bars) {
		const i = written[bar.written - 1];
		if (i === undefined) continue;
		const set = got.get(i) ?? new Set<string>();
		got.set(i, set);
		for (const l of bar.lyrics ?? [])
			for (const s of l.syllables)
				set.add(playedKey(l.part ?? "", l.verse, s, bar.meter.n / bar.meter.d));
	}
	return [...new Set([...meant.keys(), ...got.keys()])].flatMap((i) => {
		const [want, have] = [meant.get(i) ?? new Set<string>(), got.get(i) ?? new Set<string>()];
		const [lost, extra] = [missing(want, have), missing(have, want)];
		if (lost.length === 0 && extra.length === 0) return [];
		const list = (keys: string[]) => (keys.length > 0 ? keys.join(", ") : "nothing");
		return [`measure ${measureOf(i)} sings ${list(extra)}, not ${list(lost)}`];
	});
}

/** The most importer bugs listed one by one; the rest are counted. */
const BUGS_SHOWN = 3;

/** Importer bugs as errors: the first few, then how many more. */
export function reportBugs(bugs: string[], losses: Losses): void {
	for (const bug of bugs.slice(0, BUGS_SHOWN))
		losses.note({ severity: "error", message: `importer bug: ${bug}` });
	if (bugs.length > BUGS_SHOWN)
		losses.note({
			severity: "error",
			message: `importer bug: and ${bugs.length - BUGS_SHOWN} more`,
		});
}
