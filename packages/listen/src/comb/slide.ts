/** The comb slide, ported from the app's `audio/alignmentRepair.ts` (stem-bench Study 26c), arithmetic in the app's order. */
import { detrend } from "../features/onset.js";
import type { Settings } from "../options.js";

/**
 * The shift within ±`range` seconds, in `REPAIR_SLIDE_STEP_SEC` steps,
 * that puts `times` on the most detrended onset energy on average (0 when
 * none lands inside the envelope). The app's `combSlide`.
 */
export function combSlide(
	onset: Float32Array,
	fps: number,
	times: number[],
	range: number,
	s: Settings,
): number {
	const x = detrend(onset, fps);
	let best = 0;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (let d = -range; d <= range + 1e-9; d += s.REPAIR_SLIDE_STEP_SEC) {
		let sum = 0;
		let count = 0;
		for (const t of times) {
			const f = Math.round((t + d) * fps);
			if (f >= 0 && f < x.length) {
				sum += x[f] as number;
				count++;
			}
		}
		const score = count > 0 ? sum / count : Number.NEGATIVE_INFINITY;
		if (score > bestScore) {
			bestScore = score;
			best = d;
		}
	}
	return best;
}
