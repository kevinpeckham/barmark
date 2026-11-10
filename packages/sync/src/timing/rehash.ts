import { type ChartParse, type PlayedBar, parseChart } from "barmark";
import type { ConfidenceRecord } from "../build/types.js";
import { checkTimingMap } from "./check.js";
import { chartHash } from "./hash.js";
import type { TimingMap } from "./types.js";

/** Why a timing map could not be carried to a refined chart. */
export type RehashReason = "no-timing" | "unparsed" | "bars-differ" | "meters-differ";

export type RehashResult =
	| { ok: true; timing: TimingMap; confidence: ConfidenceRecord | null; confidenceDropped: boolean }
	| { ok: false; reason: RehashReason; message: string };

const DROPPED = "the timing map was dropped.";

const refuse = (reason: RehashReason, message: string): RehashResult => ({
	ok: false,
	reason,
	message,
});

const meterOf = (bar: PlayedBar) => `${bar.meter.n}/${bar.meter.d}`;

/** Bars of the same length: meters compared by value (2/2 is 4/4, 6/8 is 3/4). */
const sameLength = (a: PlayedBar, b: PlayedBar) => a.meter.n * b.meter.d === b.meter.n * a.meter.d;

/** Rules 2 and 3: why the refined chart cannot take the map, or null. */
function unplayable(map: TimingMap, refined: ChartParse): RehashResult | null {
	const error = refined.diagnostics.find((d) => d.severity === "error");
	if (error)
		return refuse(
			"unparsed",
			`The refined chart has errors (line ${error.line}: ${error.message}); ${DROPPED}`,
		);
	if (refined.bars.length !== map.chart.bars)
		return refuse(
			"bars-differ",
			`The refined chart plays ${refined.bars.length} bars where the map has ${map.chart.bars}; ${DROPPED}`,
		);
	return null;
}

/** Rule 4: the first played bar whose meter changed value, or null. */
function remetered(built: ChartParse, refined: ChartParse): RehashResult | null {
	for (const [i, bar] of refined.bars.entries()) {
		const was = built.bars[i];
		if (was && !sameLength(bar, was))
			return refuse(
				"meters-differ",
				`The refined chart's bar ${bar.index} (in play order) is in ${meterOf(bar)} where the map's chart has ${meterOf(was)}; ${DROPPED}`,
			);
	}
	return null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** True when a record can be copied: its bars, and sections if any, are lists of objects. */
const recordShaped = (r: ConfidenceRecord) =>
	Array.isArray(r.bars) &&
	r.bars.every((b: unknown) => isObj(b) && Array.isArray(b.slots)) &&
	(r.sections === undefined ||
		(Array.isArray(r.sections) && r.sections.every((x: unknown) => isObj(x))));

/** Why `built` cannot be carried as given (a malformed map or record, a short chart), or null. */
function unusable(
	map: TimingMap,
	record: ConfidenceRecord | null,
	was: ChartParse,
): RehashResult | null {
	const shape = checkTimingMap(map).diagnostics.find((d) => d.severity === "error");
	if (shape) return refuse("bars-differ", `${shape.message}; ${DROPPED}`);
	if (record !== null && !(isObj(record) && recordShaped(record)))
		return refuse("bars-differ", `The confidence record has no list of bars; ${DROPPED}`);
	if (was.bars.length !== map.chart.bars)
		return refuse(
			"bars-differ",
			`The built chart plays ${was.bars.length} bars where the map has ${map.chart.bars}; ${DROPPED}`,
		);
	return null;
}

/** A copy of `map` with `hash` (by hand: the build has no `structuredClone` type). */
const withHash = (map: TimingMap, hash: string): TimingMap => ({
	...map,
	chart: { ...map.chart, hash },
	...(map.recording && { recording: { ...map.recording } }),
	bars: map.bars.map((e) => (e.beats ? { ...e, beats: [...e.beats] } : { ...e })),
});

const copyRecord = (r: ConfidenceRecord): ConfidenceRecord => ({
	...r,
	bars: r.bars.map((b) => ({ ...b, slots: [...b.slots] })),
	...(r.sections && { sections: r.sections.map((s) => ({ ...s })) }),
});

/** True when every played bar resolves to as many slots in both charts. */
const sameSlots = (built: ChartParse, refined: ChartParse) =>
	built.bars.length === refined.bars.length &&
	refined.bars.every((bar, i) => bar.slots.length === built.bars[i]?.slots.length);

/**
 * Carries the timing map of a built chart (`BuildResult` fits as is) to a
 * refinement of it, `refined`: the same map with the refined chart's hash,
 * when the refinement plays the same bars in the same meters. The
 * confidence record goes with it when every played bar keeps its slot
 * count, and is dropped otherwise. Pass `options.parse`, the refined
 * chart's parse, if you have it. Never throws; never mutates `built`.
 */
export function rehashTiming(
	built: { chart: string; timing: TimingMap | null; confidence?: ConfidenceRecord | null },
	refined: string,
	options?: { parse?: ChartParse },
): RehashResult {
	if (!built.timing) return refuse("no-timing", "The built chart has no timing map to carry.");
	const record = built.confidence ?? null;
	const was = parseChart(built.chart);
	const parse = options?.parse ?? parseChart(refined);
	const refused =
		unusable(built.timing, record, was) ?? unplayable(built.timing, parse) ?? remetered(was, parse);
	if (refused) return refused;
	const timing = withHash(built.timing, chartHash(refined, parse));
	const failed = checkTimingMap(timing, { text: refined, parse }).diagnostics.find(
		(d) => d.severity === "error",
	);
	if (failed) return refuse("bars-differ", `${failed.message}; ${DROPPED}`);
	const keep = record !== null && sameSlots(was, parse);
	return {
		ok: true,
		timing,
		confidence: keep ? copyRecord(record) : null,
		confidenceDropped: record !== null && !keep,
	};
}
