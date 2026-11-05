/**
 * A system's rows: one tutti bar line where every part agrees, else each
 * playing part's labelled lines (`Gtr`, `Pno.RH`), every row writing the
 * same structure (grammar 7.4), each bar's words before their slot, and `%`
 * for a bar the line just played (grammar 2.3).
 */
import { beatsOf, type Meter } from "barmark";
import type { ImportedPart } from "./parts.js";
import { closing, opening } from "./repeats.js";
import type { BarInfo } from "./structure.js";
import type { Playing, System } from "./systems.js";
import { wordsText } from "./text.js";

/** What the rows are written from: the parts with their labels, the bars, and each bar's own meter. */
export type Source = { parts: ImportedPart[]; labels: string[]; bars: BarInfo[]; meters: Meter[] };

type Placed = { text: string; at: number };

/** One line's bar: its slots, and the program's text for each `?` by slot; null where the line rests. */
export type Own = { slots: string; unread: Placed[] } | null;

/** Where a line stands for `%`: the slots of the bar it last wrote and that bar's one-bar meter; null after a bar it didn't play. */
export type Last = Map<string, { slots: string; meter: string } | null>;

const REST = { slots: "--", unread: [] };

/** Whether the export wrote `?` for this part's bar: its `?` words alone, with no chord symbol. */
function asks(part: ImportedPart, index: number): boolean {
	const m = part.lyrics[index];
	return (
		m !== undefined &&
		m.harmonies.length === 0 &&
		m.marks.some((k) => k.kind === "words" && k.text.trim() === "?")
	);
}

/** Line `l` of part `p` in bar `i`, as the part reads it. */
export function ownCell(src: Source, p: number, l: number, i: number): Own {
	const bar = src.bars[i] as BarInfo;
	const part = src.parts[p] as ImportedPart;
	if (l === 0 && bar.question && asks(part, bar.index)) return { slots: "?", unread: [] };
	const slots = part.lines[l]?.bars[bar.index] ?? null;
	if (slots === null) return null;
	const unread = l === 0 ? part.unread.filter((u) => u.measure === bar.index) : [];
	return { slots, unread: unread.map(({ text, at }) => ({ text, at })) };
}

const same = (a: Own, b: Own) => JSON.stringify(a) === JSON.stringify(b);

/** Who plays bar `i`: tutti when every part plays its first line alone and all alike (notes never merge), or nobody plays. */
export function playingOf(src: Source, i: number): Playing {
	const owns = src.parts.map((part, p) => part.lines.map((_, l) => ownCell(src, p, l, i)));
	const lines = owns.flatMap((ls, p) => ls.flatMap((o, l) => (o ? [`${p}.${l}`] : [])));
	if (lines.length === 0) return { tutti: true, lines };
	const firsts = owns.map((ls) => ls[0] ?? null);
	const alone = owns.every((ls) => ls[0] && ls.slice(1).every((o) => o === null));
	const notes = src.parts.length > 1 && firsts.some((o) => o?.slots.includes("{"));
	return { tutti: alone && !notes && firsts.every((o) => same(o, firsts[0] ?? null)), lines };
}

const place = (key: string) => key.split(".").map(Number) as [number, number];

/** A row's own cell in bar `i`: the tutti line's (part 0's, or silence when all rest), else its line's, silence where it rests. */
function cellFor(src: Source, key: string | null, i: number): NonNullable<Own> {
	const [p, l] = key === null ? [0, 0] : place(key);
	return ownCell(src, p, l, i) ?? REST;
}

/**
 * The slots with words placed before the slot they precede (grammar 2.6):
 * `words` by beat, `unread` by slot. Words that fall inside a slot get
 * a slot of their own when the cell can take one per beat (no groups);
 * otherwise they go before the slot they fall in.
 */
function placeWords(slots: string, words: Placed[], unread: Placed[], beats: number): string {
	let tokens = slots.split(" ");
	let bySlot = unread;
	const fits = words.every((w) => (w.at * tokens.length) % beats === 0);
	if (!fits && !slots.includes("_") && beats % tokens.length === 0) {
		const by = beats / tokens.length;
		tokens = tokens.flatMap((t) => [t, ...Array<string>(by - 1).fill("/")]);
		bySlot = unread.map((u) => ({ ...u, at: u.at * by }));
	}
	const k = tokens.length;
	const all = [
		...words.map((w) => ({ text: w.text, at: Math.min(k, Math.floor((w.at * k) / beats)) })),
		...bySlot,
	];
	const quoted = (at: number) =>
		all.filter((w) => w.at === at).flatMap((w) => [wordsText(w.text)].filter((q) => q !== null));
	return [...tokens.flatMap((t, at) => [...quoted(at), t]), ...quoted(k)].join(" ");
}

const meterText = (m: Meter | null) => (m ? `${m.n}/${m.d}` : "");

/** The lines a row speaks for when `%` is weighed: a tutti row each part's first line. */
const speaksFor = (src: Source, key: string | null) =>
	key === null ? src.parts.map((_, p) => `${p}.0`) : [key];

/** Whether bar `i` repeats what each of these lines just played, in the same meter. */
function simile(src: Source, keys: string[], slots: string, i: number, last: Last): boolean {
	const bar = src.bars[i] as BarInfo;
	if (bar.directives?.includes("time:")) return false;
	const meter = meterText(bar.meter);
	return keys.every((k) => {
		const before = last.get(k);
		return before?.slots === slots && before.meter === meter;
	});
}

/** One bar's cell on a row; the system's first row carries the bar's words. */
function cellText(src: Source, key: string | null, i: number, first: boolean, last: Last): string {
	const bar = src.bars[i] as BarInfo;
	const own = cellFor(src, key, i);
	const words = first ? bar.words : [];
	// A bar that only holds stays `/`: shorter than `%`, and how charts write it.
	const plain = words.length === 0 && own.unread.length === 0 && own.slots !== "/";
	if (plain && simile(src, speaksFor(src, key), own.slots, i, last)) return "%";
	const beats = beatsOf(src.meters[i] ?? { n: 4, d: 4 });
	const meter = bar.meter ? `[${meterText(bar.meter)}] ` : "";
	return meter + placeWords(own.slots, words, own.unread, beats);
}

/** A bar's cells: its direction cells and rehearsal mark before it, its own cell, then `...` and directions after it. */
function cellsOf(src: Source, key: string | null, i: number, first: boolean, last: Last): string[] {
	const bar = src.bars[i] as BarInfo;
	return [
		...bar.before,
		...(bar.rehearsal ? [`@${bar.rehearsal}`] : []),
		cellText(src, key, i, first, last),
		...bar.after,
	];
}

function labelOf(src: Source, key: string | null): string {
	if (key === null) return "";
	const [p, l] = place(key);
	const name = src.parts[p]?.lines[l]?.name;
	return `${src.labels[p]}${name ? `.${name}` : ""} `;
}

/** What each line last played, after bar `i` is written on these rows. */
function played(src: Source, keys: (string | null)[], i: number, last: Last): void {
	forget(last);
	const meter = meterText(src.bars[i]?.meter ?? null);
	for (const key of keys) {
		const { slots } = cellFor(src, key, i);
		for (const k of speaksFor(src, key)) last.set(k, { slots, meter });
	}
}

/** Forgets what every line played: after a replay, or at a later ending, the reader comes from elsewhere. */
export function forget(last: Last): void {
	for (const k of last.keys()) last.set(k, null);
}

/** Whether bar `i` starts an ending after the first: played after a `:|`, not after the bar written before it. */
const startsLaterEnding = (bars: BarInfo[], i: number) => {
	const [bar, prev] = [bars[i], bars[i - 1]];
	return (
		bar?.ending != null &&
		prev?.ending != null &&
		(prev.closes !== null || prev.ending.join() !== bar.ending.join())
	);
};

/** Every line's key, for a fresh `Last`. */
export function allLines(src: Source): Last {
	return new Map(
		src.parts.flatMap((part, p) => part.lines.map((_, l) => [`${p}.${l}`, null] as const)),
	);
}

/** `x2`, or `x ...` for an open repeat, from how many times a repeat plays (grammar 5). */
export const timesText = (closes: number | "open") => (closes === "open" ? "x ..." : `x${closes}`);

/**
 * How a system's lines open and close. A repeat of the whole line, with no
 * endings, is `x N` on it (grammar 5); inside a section repeated whole
 * (`## Chorus x2`), the lines carry no repeat marks.
 */
function frame(first: BarInfo, end: BarInfo, inRepeatedSection: boolean): [string, string] {
	if (inRepeatedSection) return ["|", "|"];
	const whole = first.opens && end.closes !== null && first.ending === null && end.ending === null;
	return whole
		? ["|", `| ${timesText(end.closes as number | "open")}`]
		: [opening(first), closing(end)];
}

/** The system's bar lines, in score order; `last` is kept up to date for the next system. */
export function rowsOf(
	src: Source,
	system: System,
	last: Last,
	inRepeatedSection = false,
): string[] {
	const keys: (string | null)[] = system.tutti ? [null] : system.lines;
	const cells = keys.map(() => [] as string[]);
	for (let i = system.from; i < system.to; i++) {
		if (startsLaterEnding(src.bars, i)) forget(last);
		for (const [r, key] of keys.entries()) cells[r]?.push(...cellsOf(src, key, i, r === 0, last));
		played(src, keys, i, last);
	}
	const first = src.bars[system.from] as BarInfo;
	const end = src.bars[system.to - 1] as BarInfo;
	const [open, close] = frame(first, end, inRepeatedSection);
	return keys.map((key, r) => `${labelOf(src, key)}${open} ${cells[r]?.join(" | ")} ${close}`);
}
