import type { Alignment } from "../../src/align/path.js";
import { DEFAULTS } from "../../src/options.js";

/**
 * An alignment for the fit and placements tests: the app's test fixture
 * (`alignedPlacements.test.ts`), with what `alignPath` derives from the
 * costs (`ratio`, `localMedian`, `samePiece`) derived the same way, so a
 * test moves `controlCost` or `localCost` and the gate follows, as in the
 * app, where `alignedPlacements` computed it.
 */
export function alignmentOf(over: Partial<Alignment> = {}): Alignment {
	const base = {
		barStarts: [0.1, 2.4, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2],
		rawBarStarts: [0.1, 2.4, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2],
		repair: { period: 2, confidence: [], delta: 0, rephased: 0 },
		cost: 0.05,
		controlCost: 0.5,
		localCost: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
		chartBar: 2.4,
		beatsPerBar: 4,
		hopSec: 0.093,
		firstSound: 0,
		lastSound: 16,
		...over,
	};
	const ratio = base.controlCost / Math.max(base.cost, 1e-6);
	const sorted = base.localCost.toSorted((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const localMedian =
		sorted.length === 0
			? 0
			: sorted.length % 2
				? (sorted[mid] as number)
				: ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
	const samePiece =
		ratio >= DEFAULTS.ALIGNMENT_SAME_PIECE_RATIO &&
		localMedian <= DEFAULTS.ALIGNMENT_SAME_PIECE_LOCAL_COST;
	return { ratio, localMedian, samePiece, ...base };
}
