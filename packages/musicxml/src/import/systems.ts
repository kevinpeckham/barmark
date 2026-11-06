/**
 * Bars grouped into systems (the design's "Systems"): up to four bars a
 * row, a new one at every heading, repeat mark, ending, direction, `...`,
 * text line and directive, and wherever the parts' agreement changes. An
 * ending is one bar line however long (grammar 5.1), so it is never split.
 */
import type { BarInfo } from "./structure.js";

/** Who plays a bar: one tutti line (every part alike, or every part resting), else these lines (`"part.line"`). */
export type Playing = { tutti: boolean; lines: string[] };

/** Bars `from` up to `to` (exclusive), as one tutti line or the given labelled lines. */
export type System = { from: number; to: number; tutti: boolean; lines: string[] };

/** The most bars a system holds, the grammar's recommended phrasing (grammar 2). */
const BARS = 4;

const sameEnding = (a: number[] | null | undefined, b: number[] | null | undefined) =>
	(a ?? null)?.join() === (b ?? null)?.join();

/** Whether bar `i` continues the ending of the bar before it. */
const continuesEnding = (bars: BarInfo[], i: number) =>
	bars[i]?.ending != null &&
	sameEnding(bars[i]?.ending, bars[i - 1]?.ending) &&
	bars[i - 1]?.closes === null;

/** Whether a row must end after bar `i`. */
const endsRow = (b: BarInfo) => b.closes !== null || b.after.length > 0;

/** Whether a row must start at bar `i`. */
function startsRow(bars: BarInfo[], i: number): boolean {
	const b = bars[i] as BarInfo;
	const prev = bars[i - 1];
	if (!prev) return true;
	if (continuesEnding(bars, i)) return false;
	return (
		b.heading !== null ||
		b.opens ||
		b.before.length > 0 ||
		b.directives !== null ||
		b.textLines.length > 0 ||
		!sameEnding(b.ending, prev.ending) ||
		endsRow(prev)
	);
}

/** Runs of bars no system may cross, as [from, to) pairs. */
function segments(bars: BarInfo[]): [number, number][] {
	const out: [number, number][] = [];
	bars.forEach((_, i) => {
		const last = out[out.length - 1];
		if (startsRow(bars, i) || !last) out.push([i, i + 1]);
		else last[1] = i + 1;
	});
	return out;
}

const keyOf = (p: Playing) => (p.tutti ? "tutti" : `lines ${p.lines.join(" ")}`);

type Run = { from: number; to: number; playing: Playing };

/** Bars alike in who plays them, in runs. */
function runsOf(playing: Playing[], from: number, to: number): Run[] {
	const runs: Run[] = [];
	for (let i = from; i < to; i++) {
		const p = playing[i] as Playing;
		const last = runs[runs.length - 1];
		if (last && keyOf(last.playing) === keyOf(p)) last.to = i + 1;
		else runs.push({ from: i, to: i + 1, playing: p });
	}
	return runs;
}

/** Whether bars `from` up to `to` are played by exactly the lines of a labelled run. */
const joins = (playing: Playing[], from: number, to: number, run: Run | undefined) =>
	run !== undefined &&
	!run.playing.tutti &&
	playing.slice(from, to).every((p) => p.lines.join() === run.playing.lines.join());

/** A tutti run with the bars that don't fill a system (all of a short run) given to a labelled neighbour that can take them. */
function share(run: Run, prev: Run | undefined, next: Run | undefined, playing: Playing[]): Run[] {
	const length = run.to - run.from;
	const spare = length < BARS ? length : length % BARS;
	if (!run.playing.tutti || spare === 0) return [run];
	const cut = run.to - spare;
	if (next && joins(playing, cut, run.to, next))
		return [
			{ ...run, to: cut },
			{ from: cut, to: run.to, playing: next.playing },
		];
	const head = run.from + spare;
	if (prev && joins(playing, run.from, head, prev))
		return [
			{ from: run.from, to: head, playing: prev.playing },
			{ ...run, from: head },
		];
	return [run];
}

/**
 * A few bars that agree by chance (both parts on C) stay in the labelled
 * lines around them: the bars of a tutti run that don't fill a system join
 * a labelled neighbour played by the same lines.
 */
function absorbed(runs: Run[], playing: Playing[]): Run[] {
	const out = runs.flatMap((run, i) => share(run, runs[i - 1], runs[i + 1], playing));
	return out
		.filter((r) => r.to > r.from)
		.reduce<Run[]>((merged, run) => {
			const last = merged[merged.length - 1];
			if (last && keyOf(last.playing) === keyOf(run.playing)) last.to = run.to;
			else merged.push({ ...run });
			return merged;
		}, []);
}

/** A run in systems of up to four bars. */
function chunks(run: Run): System[] {
	const out: System[] = [];
	for (let from = run.from; from < run.to; from += BARS)
		out.push({ from, to: Math.min(run.to, from + BARS), ...run.playing });
	return out;
}

/** "part.line" keys in score order. */
const byPlace = (a: string, b: string) => {
	const [pa = 0, la = 0] = a.split(".").map(Number);
	const [pb = 0, lb = 0] = b.split(".").map(Number);
	return pa - pb || la - lb;
};

/** An ending, whole: tutti when every bar is, else every line that plays in it. */
function ending(playing: Playing[], from: number, to: number): System {
	const bars = playing.slice(from, to);
	const tutti = bars.every((p) => p.tutti);
	const lines = [...new Set(bars.flatMap((p) => p.lines))].sort(byPlace);
	return { from, to, tutti, lines: tutti ? [] : lines };
}

/** Part `p`'s line numbers in a system. */
const linesIn = (s: System, p: number) =>
	s.tutti
		? []
		: s.lines
				.map(place)
				.filter(([q]) => q === p)
				.map(([, l]) => l);

const place = (key: string) => key.split(".").map(Number) as [number, number];

/**
 * The order a reader gives part `p`'s lines (grammar 7.6): as the first
 * system writing two or more of them writes them (in order, as rows are),
 * then the others as they first appear.
 */
function readOrder(systems: System[], p: number): number[] {
	const sets = systems.map((s) => linesIn(s, p)).filter((ls) => ls.length > 0);
	const order = sets.find((ls) => ls.length > 1) ?? [];
	for (const l of sets.flat()) if (!order.includes(l)) order.push(l);
	return order;
}

/**
 * Systems in which a reader takes part `p`'s lines in the part's own order,
 * the first carrying the harmony: where it wouldn't, the first system that
 * writes a line after the first writes all of the part's lines (those that
 * rest there as `--`, which plays the same as leaving them out).
 */
function pinOrder(systems: System[], p: number, count: number): System[] {
	const order = readOrder(systems, p);
	if (order.every((l, k) => k === 0 || l > (order[k - 1] ?? 0))) return systems;
	const at = systems.findIndex((s) => linesIn(s, p).some((l) => l > 0));
	return systems.map((s, i) => {
		if (i !== at) return s;
		const all = Array.from({ length: count }, (_, l) => `${p}.${l}`);
		return { ...s, lines: [...new Set([...s.lines, ...all])].sort(byPlace) };
	});
}

/** The bars as systems, given who plays each bar and how many lines each part has. */
export function systemsOf(bars: BarInfo[], playing: Playing[], lines: number[] = []): System[] {
	const systems = segments(bars).flatMap(([from, to]) =>
		bars[from]?.ending != null
			? [ending(playing, from, to)]
			: absorbed(runsOf(playing, from, to), playing).flatMap(chunks),
	);
	return lines.reduce((out, count, p) => (count > 1 ? pinOrder(out, p, count) : out), systems);
}
