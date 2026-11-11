/**
 * The `tempo-drift` warning (new, not the app's; Stem Shovel issue #17,
 * Study 34b): how far the comb's settled bar is from the declared one. The
 * app computes the same ratio itself. Here it is a warning with no
 * threshold: the host chooses its own threshold (the app held drafts above
 * 4 % at 59da1952).
 */
import type { ListenWarning } from "../result.js";

/** A ratio this close to zero is floating-point error, not drift: a few ulps of 1. */
const ZERO = 8 * Number.EPSILON;

/**
 * `tempo-drift` with `detail.ratio` `period / declaredBar − 1` (signed:
 * negative when the recording's bars are shorter, its tempo faster),
 * `detail.period` and `detail.declaredBar`; null when the ratio is zero
 * within floating-point error. The comb scans its period in steps of
 * 0.02 %, so a recording at its declared tempo usually shows a drift of
 * about that size.
 */
export function tempoDrift(period: number, declaredBar: number): ListenWarning | null {
	const ratio = period / declaredBar - 1;
	if (!(Math.abs(ratio) > ZERO)) return null;
	const percent = (Math.abs(ratio) * 100).toFixed(2);
	const way = ratio < 0 ? "shorter" : "longer";
	return {
		code: "tempo-drift",
		message: `The bars run ${percent} % ${way} than the declared tempo's (${period.toFixed(3)} s against ${declaredBar.toFixed(3)} s).`,
		detail: { ratio, period, declaredBar },
	};
}
