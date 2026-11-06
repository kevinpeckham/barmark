/**
 * Directives where a chart can write them. An ending is one bar line, and
 * only text may come between endings (grammar 5.1), so a directive inside
 * a run of endings can't be a line of its own: a meter change becomes
 * one-bar meters on the bars it covers there, and anything else moves to
 * the bar after the endings, as a loss.
 */
import { type Meter, parseDirectiveLine } from "barmark";
import type { Losses } from "./losses.js";
import type { BarInfo } from "./structure.js";

const ORDER = ["key", "time", "tempo", "feel"];
const DEFAULT_TIME: Meter = { n: 4, d: 4 };

const sameMeter = (a: Meter | null, b: Meter | null) => a?.n === b?.n && a?.d === b?.d;

/** A directive line's entries by name (the structure writes them canonically: `key: G, time: 3/4`). */
function entries(line: string | null): Map<string, string> {
	const out = new Map<string, string>();
	for (const entry of line?.split(", ") ?? []) {
		const at = entry.indexOf(": ");
		if (at > 0) out.set(entry.slice(0, at), entry.slice(at + 2));
	}
	return out;
}

function lineOf(set: Map<string, string>): string | null {
	const named = ORDER.filter((n) => set.has(n)).map((n) => `${n}: ${set.get(n)}`);
	return named.length === 0 ? null : named.join(", ");
}

/** The meter a directive line sets, if any. */
function timeOf(line: string | null): Meter | null {
	return line === null ? null : (parseDirectiveLine(line, 0)?.set.time ?? null);
}

/** Each bar's own meter: its one-bar meter, else the meter its directive lines leave running. */
export function metersOf(bars: BarInfo[]): Meter[] {
	let running = DEFAULT_TIME;
	return bars.map((b) => {
		running = timeOf(b.directives) ?? running;
		return b.meter ?? running;
	});
}

const inRun = (bars: BarInfo[], i: number) =>
	bars[i]?.ending != null && bars[i - 1]?.ending != null;

/** Where the walk through the bars stands. */
type Walk = { running: Meter; current: Meter | null; deferred: Map<string, string> };

/** A bar inside a run of endings: its meter change kept as one-bar meters, other directives deferred. */
function inside(bar: BarInfo, w: Walk, losses: Losses): BarInfo {
	for (const [name, value] of entries(bar.directives)) {
		if (name === "time") w.current = timeOf(`time: ${value}`);
		else {
			w.deferred.set(name, value);
			losses.add(
				"ending directive",
				"a directive inside an ending moved after it",
				undefined,
				bar.measure,
			);
		}
	}
	const meter = bar.meter ?? (w.current && !sameMeter(w.current, w.running) ? w.current : null);
	return { ...bar, directives: null, meter };
}

/** A bar outside a run: the deferred directives join its own, which win. */
function outside(bar: BarInfo, w: Walk): BarInfo {
	const merged = new Map([...w.deferred, ...entries(bar.directives)]);
	w.deferred.clear();
	const directives = lineOf(merged);
	w.running = timeOf(directives) ?? w.running;
	return { ...bar, directives };
}

/** The bars with every directive where a chart can write it. */
export function settleEndings(bars: BarInfo[], losses: Losses): BarInfo[] {
	const w: Walk = { running: DEFAULT_TIME, current: null, deferred: new Map() };
	const out = bars.map((bar, i) => {
		const settled = inRun(bars, i) ? inside(bar, w, losses) : outside(bar, w);
		if (inRun(bars, i) && !inRun(bars, i + 1)) {
			if (w.current && !sameMeter(w.current, w.running))
				w.deferred.set("time", `${w.current.n}/${w.current.d}`);
			w.current = null;
		}
		return settled;
	});
	if ([...w.deferred.keys()].some((k) => k !== "time"))
		losses.add("ending directive end", "a directive inside the last ending left out");
	return out;
}
