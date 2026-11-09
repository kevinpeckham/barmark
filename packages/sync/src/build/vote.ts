import type { Seconds } from "../timing/index.js";
import type { Report } from "./report.js";
import type { BarSpan, SymbolRun } from "./runs.js";

/** Covered times closer than this are a tie (float noise from frames and divisions). */
const TIE = 1e-9;

type Slot = { start: Seconds; end: Seconds };

/**
 * The symbol of one slot (spec 6.3 steps 1 to 3), or null when under half of
 * it is covered. `from` is the first run that may still reach the slot.
 */
function pick(runs: SymbolRun[], from: number, slot: Slot): string | null {
	const covered = new Map<string, { time: number; first: number; atStart: boolean }>();
	let total = 0;
	for (let j = from; j < runs.length; j++) {
		const r = runs[j] as SymbolRun;
		if (r.start >= slot.end) break;
		const time = Math.min(r.end, slot.end) - Math.max(r.start, slot.start);
		if (time <= 0) continue;
		total += time;
		const seen = covered.get(r.symbol);
		const atStart = r.start <= slot.start && slot.start < r.end;
		if (seen) {
			seen.time += time;
			seen.atStart ||= atStart;
		} else covered.set(r.symbol, { time, first: r.start, atStart });
	}
	if (total < (slot.end - slot.start) / 2) return null;
	let best: string | null = null;
	let top: { time: number; first: number; atStart: boolean } | undefined;
	for (const [symbol, c] of covered) {
		const wins =
			!top ||
			c.time > top.time + TIE ||
			(Math.abs(c.time - top.time) <= TIE &&
				(c.atStart !== top.atStart ? c.atStart : c.first < top.first));
		if (wins) {
			best = symbol;
			top = c;
		}
	}
	return best;
}

/**
 * One symbol per slot per bar: the plurality of the slot's covered time, ties
 * to the chord sounding at the slot's start and then to the earlier-starting
 * run; `?` where under half is covered, with one `no-chord-detected` warning
 * per stretch of such slots. `runs` must be sorted and apart; one sweep, so
 * the cost is linear in slots plus runs.
 */
export function voteSlots(bars: BarSpan[], runs: SymbolRun[], report: Report): string[][] {
	let from = 0;
	let gap = false;
	return bars.map((bar, b) => {
		const width = (bar.end - bar.start) / bar.beats;
		const symbols: string[] = [];
		for (let k = 0; k < bar.beats; k++) {
			const slot = { start: bar.start + k * width, end: bar.start + (k + 1) * width };
			while (from < runs.length && (runs[from] as SymbolRun).end <= slot.start) from++;
			const symbol = pick(runs, from, slot);
			if (symbol === null && !gap)
				report.warning("no-chord-detected", "No chord was detected here; written as ?", {
					at: slot.start,
					bar: bars[0]?.pickup === true ? b : b + 1,
				});
			gap = symbol === null;
			symbols.push(symbol ?? "?");
		}
		return symbols;
	});
}
