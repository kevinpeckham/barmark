/**
 * Whether an aligned chart's bars fit the recording well enough to keep as
 * its timing (design §6.3): the app's `alignmentFit`
 * (`utils/alignmentFit.ts`), each of its reasons a refusal, the
 * arithmetic in the app's order.
 */
import type { Settings } from "../options.js";
import { type Refusal, refusal } from "../result.js";
import { median } from "./bars.js";
import type { Alignment } from "./path.js";

/**
 * The fit's numbers. `declaredBar` is the declared bar when given, else
 * `Alignment.chartBar`. `ratio` is the app's fit ratio, controlCost / cost
 * (Infinity at cost 0); `Alignment.ratio` is the placements' (cost floored
 * at 1e-6). Both are kept as the app has them.
 */
export type Fit = { bar1: number; medianBar: number; declaredBar: number; ratio: number };

/**
 * The fit of an alignment, the app's `alignmentFit`: bar 1 within one
 * declared bar of where the music starts (`max(startAt, firstSound)`,
 * else `bar-one-far`), the median bar within `FIT_BAR_TOLERANCE` of the
 * declared bar (`bar-length-off`), the chart at least `FIT_MIN_RATIO`
 * times better than its tritone control (`weak-fit`), the re-phase not
 * refused (`bars-off-middle`, or `no-period` when the envelope was
 * `flat`: new, the app reported silence as a wrong chart), then the
 * same-piece gate (`not-same-piece`, §14 Q1: new as a refusal). Every
 * reason that holds is listed, in that order. Fewer than two bar starts
 * measure no bar: `no-bars` alone, where the app said "too few bars".
 * The alignment is only read.
 */
export function alignmentFit(
	alignment: Alignment,
	declared: { startAt: number; barSeconds: number },
	flat: boolean,
	s: Settings,
): { fit: Fit; refusals: Refusal[] } {
	const { barStarts } = alignment;
	const declaredBar = declared.barSeconds;
	const ratio = alignment.cost > 0 ? alignment.controlCost / alignment.cost : Infinity;
	const bar1 = barStarts[0] ?? Number.NaN;
	if (barStarts.length < 2) {
		const fit = { bar1, medianBar: Number.NaN, declaredBar, ratio };
		const message = "The alignment has too few bar starts to measure a bar.";
		return { fit, refusals: [refusal("no-bars", message, { barStarts: barStarts.length })] };
	}
	const medianBar = median(barStarts.slice(1).map((t, i) => t - (barStarts[i] as number)));
	const music = Math.max(declared.startAt, alignment.firstSound);
	const refusals: Refusal[] = [];
	if (Math.abs(bar1 - music) > declaredBar)
		refusals.push(
			refusal(
				"bar-one-far",
				`Bar 1 is at ${bar1.toFixed(1)} s where the music starts at ${music.toFixed(1)} s.`,
				{ bar1, music, declaredBar },
			),
		);
	if (Math.abs(medianBar - declaredBar) > declaredBar * s.FIT_BAR_TOLERANCE)
		refusals.push(
			refusal(
				"bar-length-off",
				`The aligned bars are ${medianBar.toFixed(2)} s where the declared bar is ${declaredBar.toFixed(2)} s.`,
				{ medianBar, declaredBar, tolerance: s.FIT_BAR_TOLERANCE },
			),
		);
	if (ratio < s.FIT_MIN_RATIO)
		refusals.push(
			refusal("weak-fit", "The chart fits the recording little better than a wrong one would.", {
				ratio,
				minRatio: s.FIT_MIN_RATIO,
			}),
		);
	if (flat)
		refusals.push(
			refusal(
				"no-period",
				"The recording has no onsets to find its bars by: it is silent or flat.",
			),
		);
	else if (alignment.repair === null)
		refusals.push(
			refusal(
				"bars-off-middle",
				"The chart's bars do not line up with the recording through its middle; is this the right chart?",
			),
		);
	if (!alignment.samePiece)
		refusals.push(
			refusal(
				"not-same-piece",
				"The chart does not sound like this recording: it fits little better than a wrong chart, or not closely enough.",
				{ ratio: alignment.ratio, localMedian: alignment.localMedian },
			),
		);
	return { fit: { bar1, medianBar, declaredBar, ratio }, refusals };
}
