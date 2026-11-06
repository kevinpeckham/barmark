/**
 * A rhythm the grammar can't write, snapped to the nearest it can (the
 * voice-and-lyrics design, section 7): each beat's onsets move to the
 * nearest of its halves, thirds, quarters or sixths, whichever moves them
 * least without two landing together (Claude's call). Two that land
 * together all the same keep the first.
 */
import { cmp, type Frac, frac, minus, plus, times } from "../rhythm.js";

/** The divisions of a beat a group can write (grammar 2.2), and the beat itself. */
const DIVISIONS = [1, 2, 3, 4, 6];

const value = (f: Frac) => f.n / f.d;
const key = (f: Frac) => `${f.n}/${f.d}`;

/** A beat's onsets snapped to `k` divisions: where each lands, how far they moved in all, and how many land together. */
function trial<T extends { at: Frac }>(
	group: T[],
	k: number,
	start: Frac,
	beat: Frac,
	last: boolean,
) {
	let moved = 0;
	const out = group.map((e) => {
		const p = value(minus(e.at, start)) / value(beat);
		// The bar's last beat can't push an onset out of the bar.
		const q = Math.min(Math.round(p * k), last ? k - 1 : k);
		moved += Math.abs(p - Math.max(0, q) / k);
		return { ...e, at: plus(start, times(beat, frac(Math.max(0, q), k))) };
	});
	const together = out.length - new Set(out.map((e) => key(e.at))).size;
	return { out, moved, together };
}

/**
 * The events (onsets in quarters from the bar's start) with each beat's
 * onsets on the division of the beat that moves them least, in order; an
 * event landing where an earlier one already is goes.
 */
export function snapOnsets<T extends { at: Frac }>(events: T[], length: Frac, beats: number): T[] {
	const beat = times(length, frac(1, beats));
	const groups = new Map<number, T[]>();
	for (const e of events) {
		const index = Math.max(0, Math.min(beats - 1, Math.floor(value(e.at) / value(beat))));
		groups.set(index, [...(groups.get(index) ?? []), e]);
	}
	const snapped = [...groups].flatMap(([index, group]) => {
		const start = times(beat, frac(index));
		const tried = DIVISIONS.map((k) => trial(group, k, start, beat, index === beats - 1));
		tried.sort((a, b) => a.together - b.together || a.moved - b.moved);
		return tried[0]?.out ?? group;
	});
	const seen = new Set<string>();
	return snapped
		.sort((a, b) => cmp(a.at, b.at))
		.filter((e) => {
			const fresh = !seen.has(key(e.at));
			seen.add(key(e.at));
			return fresh;
		});
}
