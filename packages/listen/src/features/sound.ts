/**
 * Where sound starts and ends, ported from the app's
 * `audio/chartAlignment.ts` (`audibleSpan`), arithmetic in the app's order.
 * What it computes is fixed (design 5.3); its floor and window are the two
 * feature options, `ALIGNMENT_SOUND_FLOOR` and `ALIGNMENT_SOUND_WINDOW_SEC`,
 * which the features record. A change to what this computes bumps
 * `FEATURES_VERSION`.
 */

/** The RMS of each `size`-sample window, the last one short. */
function windowRms(samples: Float32Array, size: number): number[] {
	const rms: number[] = [];
	for (let from = 0; from < samples.length; from += size) {
		const to = Math.min(samples.length, from + size);
		let sum = 0;
		for (let i = from; i < to; i++) sum += (samples[i] as number) * (samples[i] as number);
		rms.push(Math.sqrt(sum / (to - from)));
	}
	return rms;
}

/**
 * Where sound starts and ends in a recording (stem-bench Study 14's
 * FIRST-ONSET and LAST-SOUND anchors): the RMS of each `windowSec` window,
 * and the first window's start and the last window's end whose RMS reaches
 * `floor` of the loudest one's. Accurate to a window. A silent recording
 * gives 0 and its length. The app's `audibleSpan`, its two constants
 * passed in.
 */
export function audibleSpan(
	samples: Float32Array,
	sampleRate: number,
	floor: number,
	windowSec: number,
): { first: number; last: number } {
	const size = Math.max(1, Math.round(windowSec * sampleRate));
	const rms = windowRms(samples, size);
	const peak = rms.reduce((a, b) => Math.max(a, b), 0);
	const length = samples.length / sampleRate;
	if (peak <= 0) return { first: 0, last: length };
	const level = floor * peak;
	const first = rms.findIndex((v) => v >= level);
	const last = rms.findLastIndex((v) => v >= level);
	return {
		first: (first * size) / sampleRate,
		last: Math.min(length, ((last + 1) * size) / sampleRate),
	};
}
