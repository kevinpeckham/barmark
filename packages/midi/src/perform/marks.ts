/** Markers and words (spec 3.8). */
import type { ChartParse, PlayedBar } from "barmark";
import { add, barQuarters, mul, q } from "./quarters.js";
import type { Performance, PerformedTrack, Quarters } from "./types.js";

/**
 * Each section occurrence's heading at its first bar, in play order, and
 * each rehearsal mark at its bar; on one bar, the heading first.
 */
export function markersOf(parse: ChartParse, bars: Performance["bars"]): Performance["markers"] {
	const headings = new Map<number, string[]>();
	for (const s of parse.sections)
		if (s.firstBar !== null)
			headings.set(s.firstBar, [...(headings.get(s.firstBar) ?? []), s.name]);
	const rehearsal = new Map(parse.bars.map((b) => [b.index, b.rehearsal]));
	return bars.flatMap(({ index, at }) => {
		const mark = rehearsal.get(index);
		return [...(headings.get(index) ?? []), ...(mark === undefined ? [] : [mark])].map((text) => ({
			at,
			text,
		}));
	});
}

/** A bar's words, each before the slot it precedes (after the last, at the bar's end). */
export function wordsOf(bar: PlayedBar, at: Quarters): PerformedTrack["words"] {
	const each = mul(barQuarters(bar.meter), q(1, Math.max(1, bar.slots.length)));
	return (bar.words ?? []).map((w) => ({ at: add(at, mul(each, q(w.at))), text: w.text }));
}
