/**
 * The path's bar starts re-phased onto the recording's onsets (design
 * §6.3): the app's `repairAlignment` (`audio/chartAlignment.ts`, stem-bench
 * Study 27), the arithmetic in the app's order. One addition, §4.1's: a
 * flat onset envelope is reported (`flat`), for the caller's `no-period`,
 * instead of running the comb on silence.
 */
import { flatEnvelope, jointOnsetComb } from "../comb/comb.js";
import { rephaseGrid } from "../comb/rephase.js";
import type { Features } from "../features/features.js";
import type { Settings } from "../options.js";
import type { Alignment, PathResult } from "./path.js";

/**
 * The path's bar starts re-phased: the onset comb near the chart's bar
 * (`chartBar`) gives the period, and `rephaseGrid` the starts, the whole
 * line slid within `REPHASE_FENCE_BEATS` of one of the chart's beats, then
 * moved by `ONSET_ENVELOPE_LEAD_SEC` (the envelope reads onsets early).
 * `flat` when the envelope is (`flatEnvelope`), with the path's alignment
 * unchanged; the path's alignment, `repair` null, when the re-phase
 * refuses. The app's `repairAlignment`.
 */
export function rephaseAlignment(
	path: PathResult,
	features: Features,
	s: Settings,
): { alignment: Alignment; flat: boolean } {
	const { alignment, chartBar, beatsPerBar } = path;
	const { onset, fps } = features;
	if (flatEnvelope(onset, fps)) return { alignment, flat: true };
	// rephaseGrid's preconditions (comb/rephase.ts): a finite positive bar and at least one beat.
	if (!(chartBar > 0 && Number.isFinite(chartBar)) || !(beatsPerBar >= 1))
		return { alignment, flat: false };
	const comb = jointOnsetComb(onset, fps, chartBar, s);
	const rephased = rephaseGrid(alignment.rawBarStarts, onset, fps, comb.period, beatsPerBar, s);
	if (!rephased) return { alignment, flat: false };
	const { period, confidence, delta } = rephased;
	const barStarts = rephased.barStarts.map((t) => t + s.ONSET_ENVELOPE_LEAD_SEC);
	const count = confidence.filter((c) => c === "re-phased").length;
	return {
		alignment: { ...alignment, barStarts, repair: { period, confidence, delta, rephased: count } },
		flat: false,
	};
}
