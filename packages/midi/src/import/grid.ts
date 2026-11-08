/**
 * The bar grid (spec 5.3), in ticks. Bars run from tick 0, each the length
 * of its meter; a time signature inside a bar cuts it there
 * (`meter-mid-bar`). The grid ends with the bar holding the last thing
 * kept; a pickup is a first bar shorter than the second, with a time
 * signature at the second that changes the meter. At most
 * `MAX_EXPANDED_BARS` bars, a pickup counted (`too-large`).
 */
import { MAX_EXPANDED_BARS, type Meter } from "barmark";
import { type Smf, type SmfEvent, TIME } from "../smf/types.js";
import type { Report } from "./report.js";

/** Bars in ticks; `end` is where the last ends. The pickup, when found, is `bars[0]`. */
export type Grid = {
	ppq: number;
	bars: { start: number; meter: Meter }[];
	end: number;
	pickup: boolean;
};

/** A meta event's tick and bytes. */
export type MetaAt = { tick: number; data: Uint8Array };

/**
 * Every meta event of `type` in the file, any track, by tick; at one tick
 * the last in file order wins.
 */
export function metaOf(smf: Smf, type: number): MetaAt[] {
	const all = smf.tracks
		.flat()
		.filter((e): e is SmfEvent & { kind: "meta" } => e.kind === "meta" && e.type === type)
		.sort((a, b) => a.tick - b.tick);
	const out: MetaAt[] = [];
	for (const { tick, data } of all) {
		if (out.at(-1)?.tick === tick) out.pop();
		out.push({ tick, data });
	}
	return out;
}

/** The time signatures: 4/4 before the first (the SMF default). */
export function signaturesOf(smf: Smf): { tick: number; meter: Meter }[] {
	return metaOf(smf, TIME).map(({ tick, data }) => ({
		tick,
		meter: { n: data[0] ?? 4, d: 2 ** (data[1] ?? 2) },
	}));
}

const sameMeter = (a: Meter, b: Meter) => a.n === b.n && a.d === b.d;
const ticksOf = (meter: Meter, ppq: number) => (meter.n * 4 * ppq) / meter.d;

/** A cut bar's meter: its length in the signature's units when whole, else in sixteenths, rounded (at least one). */
function cutMeter(length: number, meter: Meter, ppq: number): Meter {
	const unit = (4 * ppq) / meter.d;
	if (length % unit === 0) return { n: length / unit, d: meter.d };
	return { n: Math.max(1, Math.round(length / (ppq / 4))), d: 16 };
}

type Walk = {
	ppq: number;
	sigs: { tick: number; meter: Meter }[];
	next: number;
	signature: Meter;
	tick: number;
};

/** The bar at `w.tick`: its meter, cut short by a signature inside it; moves `w` to its end. */
function nextBar(w: Walk, report: Report, number: number): Grid["bars"][number] {
	for (let s = w.sigs[w.next]; s !== undefined && s.tick <= w.tick; s = w.sigs[++w.next])
		w.signature = s.meter;
	const start = w.tick;
	const full = ticksOf(w.signature, w.ppq);
	const cut = w.sigs[w.next];
	if (cut === undefined || cut.tick >= start + full) {
		w.tick += full;
		return { start, meter: w.signature };
	}
	report.add("meter-mid-bar", "warning", "a time signature inside a bar starts a new bar there", {
		bar: number,
	});
	w.tick = cut.tick;
	return { start, meter: cutMeter(cut.tick - start, w.signature, w.ppq) };
}

/** Whether the first bar is a pickup: shorter than the second, which a signature starts with a new meter. */
function isPickup(grid: Grid, sigs: Walk["sigs"]): boolean {
	const [first, second] = grid.bars;
	if (first === undefined || second === undefined) return false;
	const atSecond = sigs.find((s) => s.tick === second.start);
	const opening = sigs.find((s) => s.tick === 0)?.meter ?? { n: 4, d: 4 };
	const end = grid.bars[2]?.start ?? grid.end;
	return (
		atSecond !== undefined &&
		!sameMeter(atSecond.meter, opening) &&
		second.start - first.start < end - second.start
	);
}

/** The 1-based bar holding `tick` (binary search); a pickup is bar 1. */
export function barAt(grid: Grid, tick: number): number {
	let lo = 0;
	let hi = grid.bars.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if ((grid.bars[mid]?.start ?? 0) <= tick) lo = mid;
		else hi = mid - 1;
	}
	return lo + 1;
}

/**
 * The bars up to the end of the one in which `lastTick` falls, a bar
 * ending at its next bar's start exclusive: so `lastTick` is the end of
 * the last note (or one past the last lyric's tick). At least one bar.
 */
export function gridOf(smf: Smf, lastTick: number, report: Report): Grid {
	const sigs = signaturesOf(smf);
	const w: Walk = { ppq: smf.ppq, sigs, next: 0, signature: { n: 4, d: 4 }, tick: 0 };
	const bars: Grid["bars"] = [];
	while (bars.length === 0 || w.tick < lastTick) {
		if (bars.length === MAX_EXPANDED_BARS) {
			report.add(
				"too-large",
				"error",
				`the file has more than ${MAX_EXPANDED_BARS.toLocaleString("en-US")} bars, the most import reads`,
			);
			return { ppq: smf.ppq, bars: [], end: 0, pickup: false };
		}
		bars.push(nextBar(w, report, bars.length + 1));
	}
	const grid: Grid = { ppq: smf.ppq, bars, end: w.tick, pickup: false };
	grid.pickup = isPickup(grid, sigs);
	return grid;
}
