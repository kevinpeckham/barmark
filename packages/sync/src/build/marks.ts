import {
	beatsOf,
	conventionalKey,
	type Key,
	keyFromText,
	type Meter,
	parseChart,
	parseMeter,
} from "barmark";
import type { Seconds } from "../timing/index.js";
import type { BarChange } from "./input.js";
import type { Report } from "./report.js";
import type { BarSpan } from "./runs.js";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A tempo counts when it is a whole or fractional bpm from 1 to 999. */
export const isTempo = (v: unknown): v is number => isTime(v) && v >= 1 && v <= 999;

/**
 * The index into `bars` of the bar start nearest `t`, or `"after"` when the
 * nearest is the grid's end. A tie goes to the later bar; before the first
 * bar is the first bar. A pickup bar is never the target.
 */
export function snapToBar(t: Seconds, bars: BarSpan[]): number | "after" {
	const first = bars[0]?.pickup ? 1 : 0;
	const n = bars.length;
	const at = (i: number) => (i < n ? (bars[i] as BarSpan).start : (bars[n - 1] as BarSpan).end);
	if (t <= at(first)) return first;
	let lo = first;
	let hi = n;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (at(mid) <= t) lo = mid;
		else hi = mid - 1;
	}
	const nearest = lo >= n || t >= (at(lo) + at(lo + 1)) / 2 ? lo + 1 : lo;
	return nearest >= n ? "after" : nearest;
}

/** Whitespace and control characters (newlines included) collapse to one space; the ends are trimmed. */
const tidy = (s: string) => s.replace(/[\s\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").trim();

/** A title for one `# ` line, or null when it is not text or is empty. */
export function cleanTitle(t: unknown): string | null {
	if (typeof t !== "string") return null;
	return tidy(t) || null;
}

/** A trailing repeat or elision mark: `x N`, `x ...` (`×` and `…` too), `->` or `→`. */
const MARKS = /(?:^|\s+)[xX×]\s*(?:\d+|\.\.\.|…)\s*$|\s*(?:->|→)\s*$/;

/** Whether `## name` reads back as one plain section: no diagnostics, no repeat, no replay, no elision. */
function readsPlain(name: string): boolean {
	const p = parseChart(`## ${name}\n| C |\n`);
	const head = p.lines.find((l) => l.kind === "section");
	return (
		p.diagnostics.length === 0 &&
		p.sections.length === 1 &&
		p.sections[0]?.replayOf === null &&
		p.bars.length === 1 &&
		head?.kind === "section" &&
		head.repeat === null &&
		!head.elided
	);
}

/**
 * A heading name that reads back as a plain section: tidied, trailing and
 * interior marks removed (`section-marks-stripped`), and, should the reader
 * still see a mark or a typo of one (`(x2)`, `2x`), words dropped from the end
 * until it does not. Null, with `section-unnamed`, when nothing is left.
 */
export function sectionName(name: unknown, report: Report, path: string): string | null {
	const original = typeof name === "string" ? tidy(name) : "";
	let text = original;
	for (let next = text.replace(MARKS, ""); next !== text; next = text.replace(MARKS, ""))
		text = next;
	text = text.replace(/\s*(?:->|→)\s*/g, " - ").trim();
	while (text !== "" && !readsPlain(text)) text = text.replace(/\s*\S+$/, "");
	if (text === "") {
		report.warning("section-unnamed", "A section has no name once its marks are removed; dropped", {
			path,
		});
		return null;
	}
	if (text !== original)
		report.warning(
			"section-marks-stripped",
			`The section name "${original}" was changed to "${text}" so it reads as a plain heading`,
			{ path },
		);
	return text;
}

/** 60 divided by the median beat length of the bars (a pickup bar is not counted). */
export function gridTempo(bars: BarSpan[]): number {
	const beats = bars
		.filter((b) => !b.pickup)
		.map((b) => (b.end - b.start) / b.beats)
		.sort((a, b) => a - b);
	const mid = beats.length >> 1;
	const median =
		beats.length % 2
			? (beats[mid] as number)
			: ((beats[mid - 1] as number) + (beats[mid] as number)) / 2;
	return 60 / median;
}

type Placed<T> = { i: number; start: Seconds; bar: number; value: T };

/** What `start` says about `t` for each element; elements in input order. */
function place<T>(
	items: { i: number; start: number; value: T }[],
	bars: BarSpan[],
	report: Report,
	path: (i: number) => string,
): Placed<T>[] {
	const out: Placed<T>[] = [];
	for (const it of items) {
		const bar = snapToBar(it.start, bars);
		if (bar === "after")
			report.warning("after-last-bar", "This starts at the grid's end; dropped", {
				path: path(it.i),
				at: it.start,
			});
		else out.push({ ...it, bar });
	}
	return out;
}

/** Later start wins a clash (input order breaks ties); the loser is named. */
function settle<T>(
	placed: Placed<T>[],
	clashKey: (p: Placed<T>) => string,
	report: Report,
	code: "section-collision" | "change-collision",
	path: (i: number) => string,
): Placed<T>[] {
	const kept = new Map<string, Placed<T>>();
	for (const p of placed.toSorted((a, b) => a.start - b.start || a.i - b.i)) {
		const k = clashKey(p);
		const loser = kept.get(k);
		if (loser)
			report.warning(code, "Two entries land on one bar; the later one is kept", {
				path: path(loser.i),
				at: loser.start,
				bar: p.bar + 1,
			});
		kept.set(k, p);
	}
	return [...kept.values()];
}

/** The sections by bar index (after snapping and clashes) and the confidence of each. */
export function readSections(
	raw: unknown,
	bars: BarSpan[],
	report: Report,
): { names: Map<number, string>; confidence: Map<number, number> } {
	const names = new Map<number, string>();
	const confidence = new Map<number, number>();
	if (!Array.isArray(raw)) return { names, confidence };
	const path = (i: number) => `sections[${i}]`;
	const items: { i: number; start: number; value: { name: string; confidence?: number } }[] = [];
	for (const [i, v] of raw.entries()) {
		const name = sectionName(isRecord(v) ? v.name : undefined, report, path(i));
		if (name === null) continue;
		const start = (v as Record<string, unknown>).start;
		if (!isTime(start)) {
			report.warning("section-unnamed", `Section "${name}" has no usable start; dropped`, {
				path: path(i),
			});
			continue;
		}
		const c = (v as Record<string, unknown>).confidence;
		items.push({
			i,
			start,
			value: isTime(c) ? { name, confidence: Math.min(1, Math.max(0, c)) } : { name },
		});
	}
	const settled = settle(
		place(items, bars, report, path),
		(p) => String(p.bar),
		report,
		"section-collision",
		path,
	);
	for (const p of settled) {
		names.set(p.bar, p.value.name);
		if (p.value.confidence !== undefined) confidence.set(p.bar, p.value.confidence);
	}
	return { names, confidence };
}

type Kind = "key" | "meter" | "tempo";
type Value = Key | Meter | number;

/** One change's value read for its kind, or null when it is unreadable. */
function readValue(kind: Kind, value: unknown, report: Report, path: string): Value | null {
	if (kind === "tempo") return isTempo(value) ? value : null;
	if (typeof value !== "string") return null;
	if (kind === "meter") return parseMeter(value);
	const read = keyFromText(value);
	if (!read) return null;
	const key = conventionalKey(read);
	if (key.tonic !== read.tonic)
		report.info("key-respelled", `The key ${read.tonic} is written as ${key.tonic}`, { path });
	return key;
}

const same = (a: Value | null, b: Value): boolean => {
	if (a === null) return false;
	if (typeof a === "number" || typeof b === "number") return a === b;
	if ("tonic" in a && "tonic" in b) return a.tonic === b.tonic && a.mode === b.mode;
	if ("n" in a && "n" in b) return a.n === b.n && a.d === b.d;
	return false;
};

export type Starting = { key: Key | null; meter: Meter | null; tempo: number | null };

export type Resolved = {
	/** Changes after the first bar, by bar index. */
	changes: Map<number, BarChange>;
	/** The starting values, with any change at the first bar applied. */
	starting: Starting;
	/** Whether a tempo change at the first bar replaced the starting tempo. */
	tempoReplaced: boolean;
	/** Every kept tempo change (the first bar's included) with where it was read. */
	tempos: { bar: number; value: number; path: string }[];
};

/**
 * The changes read, snapped, settled and made relative to what is in force:
 * one already in force is dropped, one at the first bar replaces the starting
 * value. `starting.meter` is null when no meter was written.
 */
export function readChanges(
	raw: unknown,
	bars: BarSpan[],
	starting: Starting,
	report: Report,
): Resolved {
	const path = (i: number) => `changes[${i}]`;
	const items: { i: number; start: number; value: { kind: Kind; value: Value } }[] = [];
	for (const [i, v] of (Array.isArray(raw) ? raw : []).entries()) {
		const kind = isRecord(v) ? v.kind : undefined;
		const value =
			(kind === "key" || kind === "meter" || kind === "tempo") && isTime(v.start)
				? readValue(kind, v.value, report, path(i))
				: null;
		if (value === null || !isRecord(v))
			report.warning("change-unreadable", "This change is not understood; dropped", {
				path: path(i),
			});
		else items.push({ i, start: v.start as number, value: { kind: kind as Kind, value } });
	}
	const settled = settle(
		place(items, bars, report, path),
		(p) => `${p.value.kind}:${p.bar}`,
		report,
		"change-collision",
		path,
	).sort((a, b) => a.bar - b.bar);
	const begin: Starting = { ...starting };
	const cur: Record<Kind, Value | null> = { ...starting };
	const out: Resolved = { changes: new Map(), starting: begin, tempoReplaced: false, tempos: [] };
	const first = bars[0]?.pickup ? 1 : 0;
	for (const { bar, value, i } of settled) {
		if (same(cur[value.kind], value.value)) continue;
		cur[value.kind] = value.value;
		if (value.kind === "tempo")
			out.tempos.push({ bar, value: value.value as number, path: path(i) });
		if (bar === first) {
			(begin as Record<Kind, Value | null>)[value.kind] = value.value;
			out.tempoReplaced ||= value.kind === "tempo";
		} else out.changes.set(bar, { ...out.changes.get(bar), [value.kind]: value.value });
	}
	return out;
}

/** Sets each bar's meter and beats: the starting meter, then each meter change from its bar on. */
export function applyMeters(bars: BarSpan[], start: Meter, changes: Map<number, BarChange>): void {
	let meter = start;
	for (const [b, bar] of bars.entries()) {
		meter = changes.get(b)?.meter ?? meter;
		bar.meter = meter;
		bar.beats = beatsOf(meter);
	}
}

/**
 * `tempo-grid-disagree` for each tempo more than 15% from the grid's over the
 * bars where it is in force.
 */
export function checkTempos(
	tempos: { bar: number; value: number; path: string }[],
	bars: BarSpan[],
	report: Report,
): void {
	const sorted = tempos.toSorted((a, b) => a.bar - b.bar);
	for (const [k, t] of sorted.entries()) {
		const span = bars.slice(t.bar, sorted[k + 1]?.bar ?? bars.length);
		if (span.length === 0) continue;
		const grid = gridTempo(span);
		if (Math.abs(t.value - grid) / grid > 0.15)
			report.warning(
				"tempo-grid-disagree",
				`The tempo ${t.value} is far from the grid's ${Math.round(grid)}; written as given (is it in the meter's beat?)`,
				{ path: t.path },
			);
	}
}

/**
 * The pickup bar for `pickup.start`, or null with `pickup-ignored` when it is
 * not a time before bar 1 or its length is not one to (beats - 1) beats.
 */
export function readPickup(raw: unknown, bars: BarSpan[], report: Report): BarSpan | null {
	if (raw === undefined || raw === null) return null;
	const bar = bars[0] as BarSpan;
	const start = isRecord(raw) ? raw.start : undefined;
	const k = isTime(start)
		? Math.round((bar.start - start) / ((bar.end - bar.start) / bar.beats))
		: 0;
	if (!isTime(start) || start >= bar.start || k < 1 || k >= bar.beats) {
		report.info("pickup-ignored", "The pickup is not one to a few beats before bar 1; ignored", {
			path: "pickup",
		});
		return null;
	}
	const compound = beatsOf(bar.meter) !== bar.meter.n;
	const meter = compound ? { n: 3 * k, d: 8 } : { n: k, d: bar.meter.d };
	return { start, end: bar.start, meter, beats: k, pickup: true };
}
