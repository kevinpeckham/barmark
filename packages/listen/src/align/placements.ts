/**
 * What a chart aligned to a recording places in it (design §6.3): the
 * app's `alignedPlacements` (`utils/alignedPlacements.ts`, stem-bench
 * Studies 12, 14 and 16), the arithmetic in the app's order. The
 * same-piece gate is the alignment's own (`Alignment.samePiece`, computed
 * by `alignPath` as the app computed it here); tempo is grammar 2.1's
 * beat.
 */
import type { Settings } from "../options.js";
import type { PadBar } from "./bars.js";
import type { Alignment } from "./path.js";

/** The app's `AlignedPlacements`, its `ratio` and `samePiece` on the alignment, tempo in barmark's beat. */
export type Placements = {
	sections: { name: string; start: number; hedged: boolean }[];
	keyChanges: { at: number; key: string; hedged: boolean }[];
	/** `bpm` in grammar 2.1's beat, like `Declared.tempo`; the app converts to its bottom-note unit. */
	tempoChanges: { at: number; bpm: number; hedged: boolean }[];
};

/** The chart's own seconds for bars `from` to the end, each at its own tempo and meter. */
const secondsFrom = (bars: PadBar[], from: number) =>
	bars.slice(from).reduce((sum, b) => sum + b.seconds, 0);

/** Where each marked section starts, FIRST-ONSET and LAST-SOUND applied (the app's `sectionsOf`). */
function sectionsOf(
	bars: PadBar[],
	alignment: Alignment,
	s: Settings,
	at: (i: number) => number,
	hedge: (i: number) => boolean,
): Placements["sections"] {
	const marked = bars.flatMap((b, i) => (b.section ? [{ name: b.section, i }] : []));
	const starts = marked.map(({ i }) => at(i));
	if (!alignment.samePiece) {
		if (starts.length > 0 && (starts[0] as number) < s.SECTION_START_SNAP_SEC) starts[0] = 0;
	} else {
		if (marked[0]?.i === 0) starts[0] = Math.max(0, alignment.firstSound);
		const prev = marked.at(-2);
		const last = marked.at(-1);
		if (prev && last) {
			const floor = (starts.at(-2) as number) + (bars[prev.i] as PadBar).seconds;
			starts[starts.length - 1] = Math.max(floor, alignment.lastSound - secondsFrom(bars, last.i));
		}
	}
	return marked.map(({ name, i }, k) => ({
		name,
		start: starts[k] as number,
		hedged: hedge(i) || k === 0 || k === marked.length - 1,
	}));
}

/**
 * What the aligned chart places, the app's `alignedPlacements`: a section
 * at each bar that begins one, a key or tempo change at each bar whose key
 * or tempo (grammar 2.1's beat: a one-bar meter is no change) differs from
 * the bar before's. Hedged: the first and last sections, a bar whose local
 * cost is over `HEDGE_LOCAL_COST_FACTOR` times the median, and everything
 * when the chart is not this recording (`Alignment.samePiece`). When it
 * is, a first section at the first bar starts at the first sound
 * (FIRST-ONSET) and, with two sections or more, the last starts the
 * chart's own length of it before the last sound, never within a bar of
 * the section before (LAST-SOUND); when it is not, a first section within
 * `SECTION_START_SNAP_SEC` of the start starts at 0. Nothing is before 0.
 * `bars` and `alignment` are only read.
 */
export function alignedPlacements(bars: PadBar[], alignment: Alignment, s: Settings): Placements {
	const limit = s.HEDGE_LOCAL_COST_FACTOR * alignment.localMedian;
	const at = (i: number) => Math.max(0, alignment.barStarts[i] ?? 0);
	const hedge = (i: number) => !alignment.samePiece || (alignment.localCost[i] ?? 0) > limit;
	const changed = bars.flatMap((b, i) => (i > 0 ? [{ b, i, prev: bars[i - 1] as PadBar }] : []));
	return {
		sections: sectionsOf(bars, alignment, s, at, hedge),
		keyChanges: changed
			.filter(({ b, prev }) => b.key !== null && b.key !== prev.key)
			.map(({ b, i }) => ({ at: at(i), key: b.key as string, hedged: hedge(i) })),
		tempoChanges: changed
			.filter(({ b, prev }) => b.tempo !== prev.tempo)
			.map(({ b, i }) => ({ at: at(i), bpm: b.tempo, hedged: hedge(i) })),
	};
}
