/**
 * The grid re-phase, ported from the app's `audio/alignmentRepair.ts`
 * (stem-bench Study 27, recipe v5), arithmetic in the app's order. At fast
 * tempos the warping's middle carries a coherent whole-grid phase offset
 * (Mop Heart, 224 bpm in 3/4: 0.42 s), and the onset lattice, not the
 * path's phase, is where the notes are, so the whole uniform line slides
 * once onto the onsets, fenced at `REPHASE_FENCE_BEATS` of a beat.
 */
import type { Settings } from "../options.js";
import { combSlide } from "./slide.js";
import { phaseLine } from "./span.js";

/** The app's `GridRephase`. */
export type GridRephase = {
	/** The re-phased bar starts, as many as went in: the uniform line slid by `delta`. */
	barStarts: number[];
	/** Per bar start: the path's own start agrees within `REPAIR_TRUST_FRACTION` of a bar ("aligned"), or not ("re-phased"). */
	confidence: ("aligned" | "re-phased")[];
	/** The bar in seconds the line runs at (the comb's). */
	period: number;
	/** Seconds the whole line slid onto the onsets, within ±`REPHASE_FENCE_BEATS` beat. */
	delta: number;
	/** The trusted span's first and last index. */
	iFirst: number;
	iLast: number;
};

/**
 * An alignment's bar starts `ts` re-phased (stem-bench Study 27's recipe
 * v5): v3's phase line and trusted span (`phaseLine`), then the whole
 * uniform line at `period` slid once onto the onsets, fenced at
 * ±`REPHASE_FENCE_BEATS` of a beat (`period / beatsPerBar`) so it fixes a
 * sub-beat phase and never hops a beat. Every start ships on the slid
 * line; one is "aligned" where the path's own start agrees within
 * `REPAIR_TRUST_FRACTION` of a bar, else "re-phased". Null, the phase
 * line's refusal. The app's `rephaseGrid`.
 */
export function rephaseGrid(
	ts: number[],
	onset: Float32Array,
	fps: number,
	period: number,
	beatsPerBar: number,
	s: Settings,
): GridRephase | null {
	const fit = phaseLine(ts, period, s);
	if (!fit) return null;
	const line = ts.map((_, i) => fit.phase + i * period);
	const delta = combSlide(onset, fps, line, s.REPHASE_FENCE_BEATS * (period / beatsPerBar), s);
	const barStarts = line.map((t) => t + delta);
	const tol = s.REPAIR_TRUST_FRACTION * period;
	const confidence = barStarts.map((t, i) =>
		Math.abs((ts[i] as number) - t) <= tol ? ("aligned" as const) : ("re-phased" as const),
	);
	return { barStarts, confidence, period, delta, iFirst: fit.iFirst, iLast: fit.iLast };
}
