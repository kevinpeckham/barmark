/**
 * The end repair, ported from the app's `audio/alignmentRepair.ts`
 * (stem-bench Study 26c, recipe v3), arithmetic in the app's order. The
 * pipeline re-phases with `rephaseGrid` instead; this stays as the bench's
 * v3 reference and the one reader of `REPAIR_SLIDE_FRACTION` (design 11).
 *
 * The warping places the middle of a song well and its ends badly (Letter
 * Lands: bar 1 at 8 s, half-length bars at the head, the end 15 s early),
 * because the chart stops describing the intro and the outro. The repair
 * keeps the path as it is and rebuilds only the ends. On the bench:
 * Letter Lands' first and last bars to 0.05 and 0.02 s, Peaceful Dreams'
 * to 0.06 and 0.11 s.
 */
import type { Settings } from "../options.js";
import { combSlide } from "./slide.js";
import { phaseLine } from "./span.js";

/** The app's `EndRepair`. */
export type EndRepair = {
	/** The repaired bar starts, as many as went in. */
	barStarts: number[];
	/** Per bar start: on the trusted span (the path's own), or extrapolated from it. */
	confidence: ("aligned" | "extrapolated")[];
	/** The bar in seconds the ends were extrapolated at (the comb's). */
	period: number;
	/** The trusted span's first and last index. */
	iFirst: number;
	iLast: number;
	/** Seconds each end slid onto the onsets. */
	slides: { intro: number; outro: number };
};

/**
 * The ends of an alignment's bar starts `ts` rebuilt (Study 26c's recipe
 * v3): the phase line and trusted span at `period` (the comb's), and the
 * starts before and after the span extrapolated at `period` from its first
 * and last, each end slid onto the onsets within ±`REPAIR_SLIDE_FRACTION`
 * of a bar. Null, the phase line's refusal. The app's `repairEnds`.
 */
export function repairEnds(
	ts: number[],
	onset: Float32Array,
	fps: number,
	period: number,
	s: Settings,
): EndRepair | null {
	const line = phaseLine(ts, period, s);
	if (!line) return null;
	const n = ts.length;
	const { iFirst, iLast } = line;
	const first = ts[iFirst] as number;
	const last = ts[iLast] as number;
	const intro = Array.from({ length: iFirst }, (_, k) => first - (iFirst - k) * period);
	const outro = Array.from({ length: n - 1 - iLast }, (_, j) => last + (j + 1) * period);
	const reach = s.REPAIR_SLIDE_FRACTION * period;
	const introSlide = intro.length > 0 ? combSlide(onset, fps, intro, reach, s) : 0;
	const outroSlide = outro.length > 0 ? combSlide(onset, fps, outro, reach, s) : 0;
	const barStarts = [
		...intro.map((t) => t + introSlide),
		...ts.slice(iFirst, iLast + 1),
		...outro.map((t) => t + outroSlide),
	];
	const confidence = barStarts.map((_, i) =>
		i >= iFirst && i <= iLast ? ("aligned" as const) : ("extrapolated" as const),
	);
	return {
		barStarts,
		confidence,
		period,
		iFirst,
		iLast,
		slides: { intro: introSlide, outro: outroSlide },
	};
}
