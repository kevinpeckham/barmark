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
export type Source = {
	parts: ImportedPart[];
	labels: string[];
	bars: BarInfo[];
	meters: Meter[];
	/** The bar written just before each bar, null for none, as the writer writes them (a replay writes no bars); unset, the bar before. */
	previous: (number | null)[];
	/** The singer's line (`"part.line"`), whose syllables a replay's lyric rows replace; null or absent for none. */
	newWords?: string | null;
};

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

/** What each line's cells leave sounding into each measure, once worked out: a long hold isn't walked back again. */
const heldCache = new WeakMap<(string | null)[], Map<number, string | null>>();

/** What a line's cells leave sounding into measure `index`: the last attack before it, null when it rested there. */
function heldInto(cells: (string | null)[], index: number): string | null {
	const cache = heldCache.get(cells) ?? new Map<number, string | null>();
	heldCache.set(cells, cache);
	const known = cache.get(index);
	if (known !== undefined) return known;
	const held = lastAttackBefore(cells, index, cache);
	cache.set(index, held);
	return held;
}

function lastAttackBefore(
	cells: (string | null)[],
	index: number,
	cache: Map<number, string | null>,
): string | null {
	for (let m = index - 1; m >= 0; m--) {
		const known = cache.get(m + 1);
		if (known !== undefined && m + 1 < index) return known;
		const cell = cells[m];
		if (cell === null || cell === undefined) return null;
		// A slot's members, a note set's spaces inside it; the attack again, not its syllable.
		const attacks = (cell.match(/[^\s_{]*\{[^}]*\}\.?(?::[^\s_]*)?|[^\s_]+/g) ?? [])
			.map((t) => t.replace(/(?<=\}\.?):.*$/, "").replace(/(?<!N\.C)\.$/, ""))
			.filter((t) => t !== "/");
		const last = attacks[attacks.length - 1];
		if (last !== undefined) return last;
	}
	return null;
}

const LEADING_HOLD = /^\/(?=[ _]|$)/;

/** The bar written just before bar `i`: as the writer recorded it, else the bar before. */
function writtenBefore(src: Source, i: number): BarInfo | undefined {
	const before = src.previous[i];
	if (before === undefined) return src.bars[i - 1];
	return before === null ? undefined : src.bars[before];
}

/**
 * A cell that starts by holding what the measure before it left sounding,
 * written where the bar written before it isn't that measure (bars in
 * played order, after a jump, or after a replay) or the line rested
 * there: the hold has nothing to hold (grammar 2.3), so the held attack
 * is written again, else `N.C.` (or `--` on a line of notes).
 */
function restated(
	src: Source,
	p: number,
	l: number,
	i: number,
	slots: string,
	always: boolean,
): string {
	if (!LEADING_HOLD.test(slots)) return slots;
	const index = (src.bars[i] as BarInfo).index;
	const cells = src.parts[p]?.lines[l]?.bars ?? [];
	if (!always && follows(src, i, cells)) return slots;
	return slots.replace(LEADING_HOLD, heldInto(cells, index) ?? (l === 0 ? "N.C." : "--"));
}

/** Whether bar `i` is written right after the measure before it, and the line played there: a hold holds it. */
function follows(src: Source, i: number, cells: (string | null)[]): boolean {
	const prev = writtenBefore(src, i);
	return prev?.index === (src.bars[i] as BarInfo).index - 1 && cells[prev.index] != null;
}

/**
 * Line `l` of part `p` in bar `i`, as the part reads it; `always` restates
 * a leading hold whatever bar is written before (the writer learns that
 * only as it writes, after a replay).
 */
export function ownCell(src: Source, p: number, l: number, i: number, always = false): Own {
	const bar = src.bars[i] as BarInfo;
	const part = src.parts[p] as ImportedPart;
	if (l === 0 && bar.question && asks(part, bar.index)) return { slots: "?", unread: [] };
	const read = part.lines[l]?.bars[bar.index] ?? null;
	if (read === null) return null;
	const slots = restated(src, p, l, i, read, always);
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
	// Alike as written, and alike if each holds what it held: a hold restated
	// (after a replay) must not tell the parts apart inside one tutti line.
	const restatedFirsts = src.parts.map((_, p) => ownCell(src, p, 0, i, true));
	const alike = (os: Own[]) => os.every((o) => same(o, os[0] ?? null));
	return { tutti: alone && !notes && alike(firsts) && alike(restatedFirsts), lines };
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

/** Whether a cell sings: a syllable after a note set's brace (`{G4}:maz-`, `{C4}.:la`). */
const sung = (slots: string) => /\}\.?:/.test(slots);

/** A cell without its syllables: the notes alone. */
export const unsung = (slots: string) => slots.replace(/(\}\.?):[^\s_]*/g, "$1");

/** Whether a cell holds a `?`. */
const unknown = (slots: string) => slots.split(/[ _]/).some((t) => t.replace(/\.$/, "") === "?");

/** Whether bar `i` repeats what each of these lines just played, in the same meter. */
function simile(src: Source, keys: string[], slots: string, i: number, last: Last): boolean {
	const bar = src.bars[i] as BarInfo;
	// `%` can't carry a one-bar meter, which every line writes (grammar 7.4);
	// and two unknown bars aren't known to match, so `?` is never copied.
	if (bar.directives?.includes("time:") || bar.meter !== null || unknown(slots)) return false;
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
	// A bar that only holds stays `/`: shorter than `%`, and how charts write it;
	// `%` doesn't copy syllables (grammar 4.3).
	const plain =
		words.length === 0 && own.unread.length === 0 && own.slots !== "/" && !sung(own.slots);
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
