import type { Seconds, TimingMap } from "./types.js";

/** Where an entry stops: its own `end`, else the next entry's start, else the map's `end`. */
function entryStop(map: TimingMap, i: number): Seconds {
	const entry = map.bars[i];
	return entry?.end ?? map.bars[i + 1]?.start ?? map.end;
}

/**
 * The entry sounding at `t`: its played bar and how far through it (0..1);
 * null before the first start, at or after `map.end`, or for a non-finite `t`.
 * A time equal to an entry's start belongs to that entry. In a pause after an
 * entry's `end`, it is that entry with fraction 1 and `paused: true`.
 */
export function barAt(
	map: TimingMap,
	t: Seconds,
): { entry: number; bar: number; fraction: number; paused?: true } | null {
	if (!Number.isFinite(t) || map.bars.length === 0 || t >= map.end) return null;
	let lo = 0;
	let hi = map.bars.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if ((map.bars[mid]?.start ?? Number.POSITIVE_INFINITY) <= t) {
			found = mid;
			lo = mid + 1;
		} else hi = mid - 1;
	}
	const entry = map.bars[found];
	if (!entry) return null;
	const stop = entryStop(map, found);
	if (t >= stop) return { entry: found, bar: entry.bar, fraction: 1, paused: true };
	return { entry: found, bar: entry.bar, fraction: (t - entry.start) / (stop - entry.start) };
}

/** Where the `pass`th playing (from 1) of a played bar starts; null if there is none. */
export function secondsAtBar(map: TimingMap, bar: number, pass = 1): Seconds | null {
	if (!Number.isInteger(pass) || pass < 1) return null;
	let seen = 0;
	for (const entry of map.bars) {
		if (entry.bar === bar && ++seen === pass) return entry.start;
	}
	return null;
}
