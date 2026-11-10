/**
 * The onset fixtures of the app's `alignmentRepair.test.ts`, ported as they
 * are: a lattice of 80 bar starts from 3 s at 2 s, an onset envelope at
 * 100 fps with a smeared hit on each, and the warping's failure shape.
 */

export const FPS = 100;
export const P = 2;
export const N = 80;
export const T0 = 3;
/** The true bar starts: 80 lattice points from 3 s at 2 s. */
export const truth = Array.from({ length: N }, (_, i) => T0 + i * P);

/**
 * A seeded uniform draw in [0, 1): the app's test generator (multiplier
 * 16807, modulus 2³¹ − 1), not `seeded`'s 48271, so the envelopes are the
 * app's to the bit.
 */
export function rng(seed = 7): () => number {
	let state = seed;
	return () => {
		state = (state * 16807) % 2147483647;
		return state / 2147483647;
	};
}

/**
 * An onset envelope at `fps` (100 unless given): a hit at each of `hits`
 * ([seconds, gain]), peaking on its frame and smeared over ±15 frames as a
 * played note's flux is, over low noise drawn from `rand`.
 */
export function envelope(
	hits: [number, number][],
	seconds = T0 + N * P + 2,
	rand = rng(),
	fps = FPS,
): Float32Array {
	const onset = new Float32Array(Math.round(seconds * fps));
	for (let f = 0; f < onset.length; f++) onset[f] = 0.05 * rand();
	for (const [t, gain] of hits) {
		const at = Math.round(t * fps);
		for (let k = -15; k <= 15; k++)
			if (at + k >= 0 && at + k < onset.length)
				onset[at + k] = (onset[at + k] as number) + gain * 0.8 ** Math.abs(k);
	}
	return onset;
}

/** Bar lines at full strength at each of `bars`, the other three beats of each bar (at `period`) at 0.4. */
export function barsAndBeatsOf(bars: number[], period: number): [number, number][] {
	return bars.flatMap((t) => [
		[t, 1] as [number, number],
		...[1, 2, 3].map((b) => [t + (b * period) / 4, 0.4] as [number, number]),
	]);
}

/** Bar lines at full strength, the other three beats of each bar at 0.4. */
export const barsAndBeats = envelope(barsAndBeatsOf(truth, P));

/** The warping's failure shape: the first 7 starts squeezed into half bars ending at the true bar 8, the last 6 dragged 10 s early, a little wobble between. */
export function dtwShape(): number[] {
	const rand = rng(11);
	const ts = truth.map((t) => t + 0.06 * (rand() - 0.5));
	for (let k = 0; k < 7; k++) ts[k] = (truth[7] as number) - (7 - k) * 0.5 * P;
	for (let k = N - 6; k < N; k++) ts[k] = (truth[k] as number) - 10;
	return ts;
}
