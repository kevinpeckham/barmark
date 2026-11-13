/**
 * The tracker's downbeat cleanup, ported from the app's
 * `utils/beatThisDownbeats.ts`: each downbeat moved to its nearest beat.
 */

/** The first index in the ascending `beats` whose value is at least `time` (`beats.length` when none). */
export function firstAtLeast(beats: readonly number[], time: number): number {
	let lo = 0;
	let hi = beats.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if ((beats[mid] as number) < time) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** The first index in the ascending `beats` whose value is more than `time` (`beats.length` when none). */
export function firstAfter(beats: readonly number[], time: number): number {
	let lo = 0;
	let hi = beats.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if ((beats[mid] as number) <= time) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** The beat nearest `time`, the earlier one on a tie (numpy's argmin). `beats` is ascending and not empty. */
function nearest(beats: readonly number[], time: number): number {
	const after = firstAtLeast(beats, time);
	if (after === 0) return beats[0] as number;
	if (after === beats.length) return beats[after - 1] as number;
	const before = beats[after - 1] as number;
	const next = beats[after] as number;
	return Math.abs(next - time) < Math.abs(before - time) ? next : before;
}

/**
 * Beat This's downbeat cleanup: each downbeat moved to its nearest beat,
 * then sorted with duplicates removed (`np.unique`), so every downbeat is
 * also a beat. With no beats the downbeats come back as a copy.
 */
export function snapDownbeats(beats: readonly number[], downbeats: readonly number[]): number[] {
	if (beats.length === 0) return [...downbeats];
	const snapped = downbeats.map((d) => nearest(beats, d)).sort((a, b) => a - b);
	return snapped.filter((t, i) => i === 0 || t !== snapped[i - 1]);
}
