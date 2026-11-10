/**
 * The chart's bars placed in a recording by the warping alone (design
 * §6.3, §10): the app's `alignChartPath` (`audio/chartAlignment.ts`), the
 * arithmetic in the app's order. Two changes of order, both §10's: the
 * DTW's cell count is reckoned from the bar seconds and checked before
 * anything is rendered or allocated, and the chart's render streams into
 * its chromagram instead of existing whole. The tritone control reuses the
 * right chart's step table. Each "nothing to align" error of the app is a
 * refusal here.
 */

import { chromaFrameCount, chromaStream } from "../features/chroma.js";
import type { Features } from "../features/features.js";
import type { Settings } from "../options.js";
import { type Ok, ok, type Refused, refusal, refused } from "../result.js";
import { chartBar, chartBeatsPerBar, median, type PadBar } from "./bars.js";
import { barCosts, dtwAlign, dtwTable, mapSeconds, tritone } from "./dtw.js";
import { renderChartPads, renderLength } from "./render.js";

/** The chart's bars placed in a recording (design §6.3). */
export type Alignment = {
	/** Where each played bar starts, plus where the last one ends: the re-phased starts, else the path's. */
	barStarts: number[];
	/** The warping path's own bar starts, before the re-phase. */
	rawBarStarts: number[];
	/** The grid re-phase; null when it refused or did not run. */
	repair: {
		period: number;
		confidence: ("aligned" | "re-phased")[];
		delta: number;
		rephased: number;
	} | null;
	/** Mean step cost of the warping path (cosine distance, 0 to 1). */
	cost: number;
	/** The same with every chord a tritone away: what a wrong chart costs here. */
	controlCost: number;
	/** `controlCost / max(cost, 1e-6)`, the placements' ratio. */
	ratio: number;
	/** Per played bar, the mean step cost over its frames. */
	localCost: number[];
	/** The median of `localCost`; 0 when there is none. */
	localMedian: number;
	/** The same-piece gate: `ratio ≥ ALIGNMENT_SAME_PIECE_RATIO` and `localMedian ≤ ALIGNMENT_SAME_PIECE_LOCAL_COST`. */
	samePiece: boolean;
	/** The median of the chart's bar seconds: the comb's centre. */
	chartBar: number;
	/** The most common numerator among the played bars. */
	beatsPerBar: number;
	/** Seconds per chroma frame. */
	hopSec: number;
	/** Where the recording's first audible window starts. */
	firstSound: number;
	/** Where the recording's last audible window ends. */
	lastSound: number;
};

/** The warping's alignment before the re-phase, with what the re-phase reads: the app's `AlignmentPath`. */
export type PathResult = { alignment: Alignment; chartBar: number; beatsPerBar: number };

/** The placements' floor under the path cost (the app's `COST_FLOOR`, `utils/alignedPlacements.ts`). */
const COST_FLOOR = 1e-6;

/** The median of `values`, 0 for none (as the app's `alignedPlacements` reads it). */
const medianOr0 = (values: number[]) => (values.length > 0 ? median(values) : 0);

/** A flattened chromagram as one 12-value view per frame, no copy (the app's `chromaFrames`). */
const framesOf = (chroma: Float32Array, frames: number) =>
	Array.from({ length: frames }, (_, i) => chroma.subarray(i * 12, i * 12 + 12));

/** `too-long`, with the numbers behind it: the cells the step table would take, `(n + 1)(m + 1)`. */
function tooLong(chartFrames: number, recordingFrames: number, limit: number): Refused {
	const cells = (chartFrames + 1) * (recordingFrames + 1);
	return refused([
		refusal(
			"too-long",
			`Aligning ${chartFrames} chart frames with ${recordingFrames} recording frames takes ${cells} cells, over the limit of ${limit}.`,
			{ cells, limit, chartFrames, recordingFrames },
		),
	]);
}

/** `chart-too-long`: no warping path fits the chart into the recording. */
function chartTooLong(chartSeconds: number, recordingSeconds: number): Refused {
	return refused([
		refusal(
			"chart-too-long",
			`The chart runs more than twice as long as the recording (${chartSeconds.toFixed(1)} s against ${recordingSeconds.toFixed(1)} s); check its tempo.`,
			{ chartSeconds, recordingSeconds },
		),
	]);
}

/**
 * The chart's played bars placed in the recording by the warping alone:
 * the app's `alignChartPath`. In order: `invalid-input` (`field: "bars"`)
 * when the bar seconds do not sum to a finite length, the render's chroma
 * frames from the bar seconds (`too-short` when it or the recording has none), `too-long`
 * when the step table's cells, (chart frames + 1) × (recording frames + 1),
 * exceed `DTW_MAX_CELLS`, and `chart-too-long` when the chart's seconds are
 * more than twice the recording's, all before any render or allocation;
 * then the step table, the streamed render into its
 * chromagram, the right chart's warping (`chart-too-long` when no path
 * fits: the chart runs more than twice the recording), the tritone control
 * on the same table, and the bar starts mapped through the path.
 * `features` is a record `readFeatures` accepted; the render runs at its
 * rate. `repair` is null and `barStarts` the path's own.
 */
export function alignPath(
	bars: PadBar[],
	features: Features,
	s: Settings,
): Ok<PathResult> | Refused {
	const rate = features.sampleRate;
	const length = renderLength(bars, rate);
	// A bar of non-finite seconds makes the length NaN or ∞, which every comparison below lets by.
	if (!Number.isFinite(length))
		return refused([
			refusal("invalid-input", "A bar of the chart has no finite length in seconds.", {
				field: "bars",
			}),
		]);
	const n = chromaFrameCount(length, rate);
	const m = features.frames;
	if (n === 0 || m === 0)
		return refused([
			refusal(
				"too-short",
				"The recording or the chart is too short to align: it has no chroma frame.",
				{
					chartFrames: n,
					recordingFrames: m,
				},
			),
		]);
	// The step table is (n + 1)(m + 1) bytes, and m ≥ 1 here, so n + 1 is at most half the
	// limit: checked first, on its own, so a huge chart is refused before any product is taken.
	if (n + 1 > s.DTW_MAX_CELLS / 2 || (n + 1) * (m + 1) > s.DTW_MAX_CELLS)
		return tooLong(n, m, s.DTW_MAX_CELLS);
	// The warping's steps let the chart run at most twice the recording's speed, so a chart more
	// than twice as long has no path: refused here, before hours of it are rendered.
	if (length / rate > 2 * features.duration) return chartTooLong(length / rate, features.duration);
	const steps = dtwTable(n, m);
	const stream = chromaStream(rate, length);
	const { barStarts } = renderChartPads(bars, rate, (chunk) => stream.push(chunk));
	const ref = stream.finish();
	const refFrames = framesOf(ref.chroma, ref.frames);
	const rec = framesOf(features.chroma, m);
	const right = dtwAlign(refFrames, rec, steps, true);
	if (!Number.isFinite(right.normalizedCost)) return chartTooLong(length / rate, features.duration);
	const control = dtwAlign(tritone(refFrames), rec, steps, true);
	const rawBarStarts = barStarts.map(mapSeconds(right.path, ref.hopSec));
	const localCost = barCosts(barStarts, right.frameCost, ref.hopSec);
	const ratio = control.normalizedCost / Math.max(right.normalizedCost, COST_FLOOR);
	const localMedian = medianOr0(localCost);
	const bar = chartBar(bars);
	const beatsPerBar = chartBeatsPerBar(bars);
	return ok({
		alignment: {
			barStarts: [...rawBarStarts],
			rawBarStarts,
			repair: null,
			cost: right.normalizedCost,
			controlCost: control.normalizedCost,
			ratio,
			localCost,
			localMedian,
			samePiece:
				ratio >= s.ALIGNMENT_SAME_PIECE_RATIO && localMedian <= s.ALIGNMENT_SAME_PIECE_LOCAL_COST,
			chartBar: bar,
			beatsPerBar,
			hopSec: ref.hopSec,
			firstSound: features.firstSound,
			lastSound: features.lastSound,
		},
		chartBar: bar,
		beatsPerBar,
	});
}
