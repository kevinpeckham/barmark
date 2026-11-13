/**
 * The tracker's bar helpers, ported from the app's
 * `utils/trackerBarGrid.ts`: the beats a bar holds, adjacent half bars
 * joined, and the share of bars that hold the usual count.
 */
import { firstAtLeast } from "./snap.js";

/** Beats in [lines[i], lines[i + 1]) for each bar, found by bisection on each line, never by scanning the beats. */
export function barBeats(beats: readonly number[], lines: readonly number[]): number[] {
	const out: number[] = [];
	let from = lines.length > 0 ? firstAtLeast(beats, lines[0] as number) : 0;
	for (let i = 0; i + 1 < lines.length; i++) {
		const to = firstAtLeast(beats, lines[i + 1] as number);
		out.push(Math.max(0, to - from));
		from = to;
	}
	return out;
}

/**
 * The downbeats with each pair of adjacent half bars joined into one bar:
 * where the usual bar has an even count of beats and two bars in a row
 * each have half of it, the line between them goes. A half bar with no
 * partner stays as read. Expects finite, ascending times, as
 * `gridFromBeats` checks before calling it.
 */
export function joinHalfBars(
	beats: readonly number[],
	downbeats: readonly number[],
	usual: number,
): number[] {
	if (usual % 2 !== 0) return [...downbeats];
	const counts = barBeats(beats, downbeats);
	const half = usual / 2;
	const out: number[] = [];
	for (let i = 0; i < downbeats.length; i++) {
		out.push(downbeats[i] as number);
		const pair = i + 2 < downbeats.length && counts[i] === half && counts[i + 1] === half;
		if (pair) i++;
	}
	return out;
}

/** The share of the bars (line to line) that hold `usual` beats. Expects finite, ascending times, as `gridFromBeats` checks. */
export function steadyShare(
	beats: readonly number[],
	lines: readonly number[],
	usual: number,
): number {
	let steady = 0;
	for (const n of barBeats(beats, lines)) if (n === usual) steady++;
	return steady / (lines.length - 1);
}

/** numpy's median: the mean of the two middle values for an even count. */
export function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2
		? (sorted[mid] as number)
		: ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
