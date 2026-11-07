import { beatsOf, conventionalKey, type Key, keyFromText, type Meter, parseMeter } from "barmark";
import type { Seconds } from "../timing/index.js";
import {
	applyMeters,
	checkTempos,
	cleanTitle,
	gridTempo,
	isTempo,
	readChanges,
	readPickup,
	readSections,
} from "./marks.js";
import type { Report } from "./report.js";
import { type BarSpan, type SymbolRun, symbolRuns } from "./runs.js";

/** A change at a bar: any of a key, a meter and a tempo. */
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

type StartTempo = { value: number | null; derive: boolean; confidence?: number };

/** The tempo as given, derived (omitted), absent (null) or dropped (unreadable, with a warning). */
function readTempo(d: Record<string, unknown>, report: Report): StartTempo {
	if (d.tempo === undefined) return { value: null, derive: true };
	if (d.tempo === null) return { value: null, derive: false };
	const got = detected(d.tempo, isTempo);
	if (!got) {
		report.warning("tempo-unreadable", "The tempo is not a number from 1 to 999; none written", {
			path: "tempo",
		});
		return { value: null, derive: false };
	}
	return got.confidence === undefined
		? { value: got.value, derive: false }
		: { value: got.value, derive: false, confidence: got.confidence };
}

const shifted = <T>(m: Map<number, T>) => new Map([...m].map(([b, v]) => [b + 1, v] as const));

/** The key in force at a time: the starting key, then each key change from its bar's start. */
function keyFollowing(
	key: Key | null,
	bars: BarSpan[],
	changes: Map<number, BarChange>,
): (t: Seconds) => Key | null {
	const turns = [...changes]
		.filter(([, c]) => c.key)
		.sort(([a], [b]) => a - b)
		.map(([b, c]) => ({ at: (bars[b] as BarSpan).start, key: c.key as Key }));
	return (t) => turns.findLast((x) => x.at <= t)?.key ?? key;
}

/** The starting tempo, derived from the grid when omitted; checks every tempo against the grid. */
function settleTempo(
	start: StartTempo,
	r: ReturnType<typeof readChanges>,
	bars: BarSpan[],
	report: Report,
): number | null {
	const tempos = [...r.tempos];
	let tempo = r.starting.tempo;
	if (!r.tempoReplaced && tempo !== null) tempos.push({ bar: 0, value: tempo, path: "tempo" });
	if (!r.tempoReplaced && start.derive) {
		const until = tempos.map((t) => t.bar).sort((a, b) => a - b)[0] ?? bars.length;
		const derived = Math.round(gridTempo(bars.slice(0, until)));
		if (isTempo(derived)) tempo = derived;
		else
			report.warning(
				"tempo-unreadable",
				`The grid's tempo (${derived}) is outside 1 to 999; none written`,
				{
					path: "grid.bars",
				},
			);
	}
	checkTempos(tempos, bars, report);
	return tempo;
}

/**
 * The detections read into an `Input`: grid, meter, key, tempo, changes,
 * sections and pickup, then chord runs, in that order. Null when the grid is
 * unusable (an error is reported).
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
	const bars: BarSpan[] = grid.starts.slice(0, -1).map((start, i) => ({
		start,
		end: grid.starts[i + 1] as Seconds,
		meter: m.meter,
		beats: beatsOf(m.meter),
	}));
	const t = readTempo(d, report);
	const r = readChanges(
		d.changes,
		bars,
		{ key: k?.key ?? null, meter: m.written ? m.meter : null, tempo: t.value },
		report,
	);
	const meter = r.starting.meter ?? m.meter;
	applyMeters(bars, meter, r.changes);
	const tempo = settleTempo(t, r, bars, report);
	const sections = readSections(d.sections, bars, report);
	const keyAt = keyFollowing(r.starting.key, bars, r.changes);
	const pickup = readPickup(d.pickup, bars, report);
	if (pickup) {
		bars.unshift(pickup);
		// Collisions were numbered by grid bar; the chart counts the pickup first.
		for (const x of report.list)
			if (x.bar !== undefined && (x.code === "section-collision" || x.code === "change-collision"))
				x.bar += 1;
	}
	const confidence: Input["confidence"] = {
		sections: pickup ? shifted(sections.confidence) : sections.confidence,
	};
	if (k?.confidence !== undefined) confidence.key = k.confidence;
	if (m.confidence !== undefined) confidence.meter = m.confidence;
	if (t.confidence !== undefined) confidence.tempo = t.confidence;
	return {
		title: cleanTitle(d.title),
		bars,
		key: r.starting.key,
		meter,
		meterWritten: r.starting.meter !== null,
		tempo,
		changes: pickup ? shifted(r.changes) : r.changes,
		sections: pickup ? shifted(sections.names) : sections.names,
		runs: symbolRuns(d.chords, keyAt, report),
		confidence,
	};
}
