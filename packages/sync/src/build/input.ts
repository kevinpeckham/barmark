import { beatsOf, conventionalKey, type Key, keyFromText, type Meter, parseMeter } from "barmark";
import type { Seconds } from "../timing/index.js";
import type { Report } from "./report.js";
import { type BarSpan, type SymbolRun, symbolRuns } from "./runs.js";

/** A change at a bar: any of a key, a meter and a tempo (read in a later task). */
export type BarChange = { key?: Key; meter?: Meter; tempo?: number };

/** What the detections say, read and repaired; the maps are keyed by index into `bars`. */
export type Input = {
	title: string | null;
	bars: BarSpan[];
	key: Key | null;
	meter: Meter;
	/** Whether the input gave a readable meter (so the chart writes `time:`). */
	meterWritten: boolean;
	tempo: number | null;
	changes: Map<number, BarChange>;
	sections: Map<number, string>;
	runs: SymbolRun[];
	confidence: { key?: number; meter?: number; tempo?: number; sections: Map<number, number> };
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isString = (x: unknown): x is string => typeof x === "string";

/** A detected value, bare or wrapped with its confidence (clamped to 0..1); null when it is neither. */
export function detected<T>(
	v: unknown,
	ok: (x: unknown) => x is T,
): { value: T; confidence?: number } | null {
	if (ok(v)) return { value: v };
	if (!isRecord(v) || !("value" in v) || !ok(v.value)) return null;
	const c = v.confidence;
	return typeof c === "number" && Number.isFinite(c)
		? { value: v.value, confidence: Math.min(1, Math.max(0, c)) }
		: { value: v.value };
}

/** Bar starts, finite and sorted, any within a millisecond of the one kept dropped; null if under two remain. */
function readStarts(grid: unknown): { starts: Seconds[]; repaired: boolean } | null {
	const raw: unknown[] = isRecord(grid) && Array.isArray(grid.bars) ? grid.bars : [];
	const finite = raw.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
	const starts: Seconds[] = [];
	for (const x of finite.toSorted((a, b) => a - b))
		if (starts.length === 0 || x - (starts.at(-1) as number) > 0.001) starts.push(x);
	if (starts.length < 2) return null;
	return { starts, repaired: starts.length !== raw.length || starts.some((x, i) => x !== raw[i]) };
}

function readMeter(d: Record<string, unknown>, report: Report) {
	const none = { meter: { n: 4, d: 4 }, written: false } as const;
	if (d.meter === undefined || d.meter === null) {
		report.info("meter-assumed", "No meter was given; 4/4 assumed", { path: "meter" });
		return { ...none, confidence: undefined };
	}
	const got = detected(d.meter, isString);
	const meter = got ? parseMeter(got.value) : null;
	if (!got || !meter) {
		report.warning("meter-unreadable", "The meter is not understood; 4/4 assumed", {
			path: "meter",
		});
		return { ...none, confidence: undefined };
	}
	return { meter, written: true, confidence: got.confidence };
}

function readKey(d: Record<string, unknown>, report: Report) {
	if (d.key === undefined || d.key === null) return null;
	const got = detected(d.key, isString);
	const read = got ? keyFromText(got.value) : null;
	if (!got || !read) {
		report.warning("key-unreadable", "The key is not understood; none written", { path: "key" });
		return null;
	}
	const key = conventionalKey(read);
	if (key.tonic !== read.tonic)
		report.info("key-respelled", `The key ${read.tonic} is written as ${key.tonic}`, {
			path: "key",
		});
	return { key, confidence: got.confidence };
}

/**
 * The detections read into an `Input`: grid, meter, key, then chord runs, in
 * that order. Null when the grid is unusable (an error is reported).
 */
export function readInput(d: unknown, report: Report): Input | null {
	const grid = isRecord(d) ? readStarts(d.grid) : null;
	if (!isRecord(d) || !grid) {
		report.error("grid-unusable", "The grid has fewer than two usable bar starts", {
			path: "grid.bars",
		});
		return null;
	}
	if (grid.repaired)
		report.warning(
			"grid-unsorted",
			"The bar starts were unsorted, duplicated or not numbers; mended",
			{
				path: "grid.bars",
			},
		);
	const m = readMeter(d, report);
	const k = readKey(d, report);
	const beats = beatsOf(m.meter);
	const bars: BarSpan[] = grid.starts.slice(0, -1).map((start, i) => ({
		start,
		end: grid.starts[i + 1] as Seconds,
		meter: m.meter,
		beats,
	}));
	const key = k?.key ?? null;
	const confidence: Input["confidence"] = { sections: new Map() };
	if (k?.confidence !== undefined) confidence.key = k.confidence;
	if (m.confidence !== undefined) confidence.meter = m.confidence;
	return {
		title: null,
		bars,
		key,
		meter: m.meter,
		meterWritten: m.written,
		tempo: null,
		changes: new Map(),
		sections: new Map(),
		runs: symbolRuns(d.chords, () => key, report),
		confidence,
	};
}
