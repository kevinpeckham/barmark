import type { Key, Meter } from "barmark";
import type { Seconds } from "../timing/index.js";
import type { Report } from "./report.js";
import { labelSymbol, slotSymbol } from "./spell.js";

/** A bar of the grid; `beats` is its slot count. */
export type BarSpan = { start: Seconds; end: Seconds; meter: Meter; beats: number; pickup?: true };

/** A stretch of one slot symbol: canonical slot text, `N.C.` or `?`. Sorted and never overlapping. */
export type SymbolRun = { start: Seconds; end: Seconds; symbol: string; confidence?: number };

/** At most this many invalid runs are named; the rest are counted. */
const INVALID_NAMED = 10;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A finite confidence clamped to 0..1; anything else counts as not given. */
function unit(v: unknown): number | undefined {
	return isTime(v) ? Math.min(1, Math.max(0, v)) : undefined;
}

type Raw = { start: Seconds; end: Seconds; text: string; kind: "label" | "symbol"; at: number };

/** A run's times in seconds and its one label or symbol, or null when it is invalid. */
function readRun(v: unknown, frame: number, at: number): (Raw & { confidence?: number }) | null {
	if (!isRecord(v) || !isTime(v.start) || !isTime(v.end) || v.end <= v.start) return null;
	const label = typeof v.label === "string" ? v.label : undefined;
	const symbol = typeof v.symbol === "string" ? v.symbol : undefined;
	if ((label === undefined) === (symbol === undefined)) return null;
	if (v.label !== undefined && label === undefined) return null;
	if (v.symbol !== undefined && symbol === undefined) return null;
	const run = {
		start: v.start * frame,
		end: v.end * frame,
		text: (label ?? symbol) as string,
		kind: label === undefined ? ("symbol" as const) : ("label" as const),
		at,
	};
	const confidence = unit(v.confidence);
	return confidence === undefined ? run : { ...run, confidence };
}

/** A run as read: what it says, not yet spelled. `order` is its place in the input. */
type Item = {
	start: Seconds;
	end: Seconds;
	text: string;
	kind: "label" | "symbol";
	order: number;
	confidence?: number;
};

/**
 * The later-starting run wins while it sounds, and an earlier run that
 * outlasts it resumes after it; with equal starts the longer wins, then the
 * later in input order. Returns the runs sorted and apart, and how many
 * overlapped an earlier one.
 */
function sweep(items: Item[]): { runs: Omit<Item, "order">[]; overlapped: number } {
	// The winner of equal starts sorts last: shortest first, then earliest in input.
	const sorted = [...items].sort(
		(a, b) => a.start - b.start || a.end - a.start - (b.end - b.start) || a.order - b.order,
	);
	const out: Omit<Item, "order">[] = [];
	const stack: Item[] = [];
	let at = sorted[0]?.start ?? 0;
	let latestEnd = Number.NEGATIVE_INFINITY;
	let overlapped = 0;
	const emitTo = (t: Seconds) => {
		while (at < t) {
			while (stack.length > 0 && (stack.at(-1) as Item).end <= at) stack.pop();
			const top = stack.at(-1);
			if (!top) {
				at = t;
				return;
			}
			const end = Math.min(top.end, t);
			const { order: _order, ...run } = top;
			out.push({ ...run, start: at, end });
			at = end;
		}
	};
	for (const item of sorted) {
		emitTo(item.start);
		at = item.start;
		if (item.start < latestEnd) overlapped++;
		latestEnd = Math.max(latestEnd, item.end);
		stack.push(item);
	}
	emitTo(Number.POSITIVE_INFINITY);
	return { runs: out, overlapped };
}

/** The frame length in seconds (1 when the runs are in seconds), or null when it is unusable. */
function frameOf(chords: Record<string, unknown>): number | null {
	if (chords.frameSec === undefined) return 1;
	const f = chords.frameSec;
	return typeof f === "number" && Number.isFinite(f) && f > 0 ? f : null;
}

type Reader = { items: Item[]; invalid: number; unknown: Set<string> };

/** The key in force at a time, and the times (sorted) at which a key change starts. */
export type Keys = { keyAt: (t: Seconds) => Key | null; turnTimes: Seconds[] };

/** The first index in `sorted` of a time greater than `t`. */
export function firstAfter(sorted: Seconds[], t: Seconds): number {
	let lo = 0;
	let hi = sorted.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if ((sorted[mid] as number) <= t) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

const spell = (r: { kind: "label" | "symbol"; text: string }, key: Key | null) =>
	r.kind === "label" ? labelSymbol(r.text, key) : slotSymbol(r.text);

/** Reads one valid run; an unreadable label or symbol is named once, as it is met. */
function addRun(r: Raw & { confidence?: number }, keys: Keys, to: Reader, report: Report) {
	if (spell(r, keys.keyAt(r.start)) === null && !to.unknown.has(r.text)) {
		to.unknown.add(r.text);
		report.warning("label-unknown", `The ${r.kind} "${r.text}" is not understood; written as ?`, {
			path: `chords.runs[${r.at}]`,
			at: r.start,
		});
	}
	const item: Item = { start: r.start, end: r.end, text: r.text, kind: r.kind, order: r.at };
	if (r.confidence !== undefined) item.confidence = r.confidence;
	to.items.push(item);
}

/**
 * The settled runs, each cut at every key change inside it and each piece
 * spelled in the key in force at its own start. Cutting after the overlaps
 * are settled keeps a change that respells nothing from changing which
 * chord wins.
 */
function spelled(settled: Omit<Item, "order">[], keys: Keys): SymbolRun[] {
	return settled.flatMap((r) => {
		const edges = [r.start];
		for (let i = firstAfter(keys.turnTimes, r.start); i < keys.turnTimes.length; i++) {
			const t = keys.turnTimes[i] as number;
			if (t >= r.end) break;
			edges.push(t);
		}
		edges.push(r.end);
		return edges.slice(0, -1).map((start, k): SymbolRun => {
			const piece: SymbolRun = {
				start,
				end: edges[k + 1] as number,
				symbol: spell(r, keys.keyAt(start)) ?? "?",
			};
			if (r.confidence !== undefined) piece.confidence = r.confidence;
			return piece;
		});
	});
}

/**
 * The chord runs as symbol runs in seconds: frames converted, invalid runs
 * dropped with a warning each (ten, then a count), labels respelled for the
 * key in force at the run's start, overlaps settled.
 */
export function symbolRuns(chords: unknown, keys: Keys, report: Report): SymbolRun[] {
	if (!isRecord(chords) || !Array.isArray(chords.runs)) {
		report.warning("run-invalid", "There are no chord runs to read", { path: "chords.runs" });
		return [];
	}
	const frame = frameOf(chords);
	if (frame === null) {
		report.warning("run-invalid", "frameSec is not a positive number; every run is dropped", {
			path: "chords.frameSec",
		});
		return [];
	}
	const to: Reader = { items: [], invalid: 0, unknown: new Set() };
	for (const [i, v] of (chords.runs as unknown[]).entries()) {
		const run = readRun(v, frame, i);
		if (run) addRun(run, keys, to, report);
		else if (to.invalid++ < INVALID_NAMED)
			report.warning("run-invalid", `Chord run ${i} is not a usable run; dropped`, {
				path: `chords.runs[${i}]`,
			});
	}
	if (to.invalid > INVALID_NAMED)
		report.warning("run-invalid", `${to.invalid - INVALID_NAMED} more invalid runs were dropped`, {
			path: "chords.runs",
		});
	const { runs, overlapped } = sweep(to.items);
	if (overlapped > 0)
		report.warning(
			"run-overlap",
			`${overlapped} ${overlapped === 1 ? "run overlaps" : "runs overlap"} an earlier one; the later onset wins`,
			{ path: "chords.runs" },
		);
	return spelled(runs, keys);
}

const rounded = (s: Seconds) => Number(s.toFixed(3));

/** A beat of the bar, in seconds. */
const beatOf = (bar: BarSpan) => (bar.end - bar.start) / bar.beats;

/**
 * The runs cut to the grid's extent. A side that loses a beat or more of
 * anything but `N.C.` gets one `outside-bars` warning with the seconds lost.
 */
export function cutRuns(runs: SymbolRun[], bars: BarSpan[], report: Report): SymbolRun[] {
	const first = bars[0];
	const last = bars.at(-1);
	if (!first || !last) return [];
	const from = first.start;
	const to = last.end;
	let lostBefore = 0;
	let lostAfter = 0;
	const out: SymbolRun[] = [];
	for (const run of runs) {
		const before = Math.max(0, Math.min(run.end, from) - run.start);
		const after = Math.max(0, run.end - Math.max(run.start, to));
		if (run.symbol !== "N.C.") {
			lostBefore += before;
			lostAfter += after;
		}
		const start = Math.max(run.start, from);
		const end = Math.min(run.end, to);
		if (end > start) out.push({ ...run, start, end });
	}
	if (lostBefore >= beatOf(first))
		report.warning(
			"outside-bars",
			`${rounded(lostBefore)} s of chords before the first bar were dropped`,
			{ at: from },
		);
	if (lostAfter >= beatOf(last))
		report.warning(
			"outside-bars",
			`${rounded(lostAfter)} s of chords after the last bar were dropped`,
			{ at: to },
		);
	return out;
}
