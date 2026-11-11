/**
 * Two of the downbeat's witnesses, time zero and the chord changes, ported
 * from the app's `audio/chartlessGrid.ts` (stem-bench Study 31),
 * arithmetic in the app's order and the constants from the options. Class
 * k is the comb's phase moved k beats.
 */
import type { Settings } from "../options.js";
import { beatChords, type ListenChordRuns } from "./beats.js";
import { type Lattice, latticeBeats, mod } from "./lattice.js";

/** One witness's say: the class it votes (null, it abstains), its weight and what it read. The app's `DownbeatWitness`. */
export type Witness = {
	name: "timeZero" | "harmonicRhythm" | "sections";
	/** Null: abstains. */
	cls: number | null;
	weight: number;
	detail: {
		/** Time zero's distance to the nearest lattice beat, in beats. */
		distanceBeats?: number;
		/** Changes or peaks per beat class. */
		histogram?: number[];
		/** The top class's count over the runner-up's, and over it (Infinity when the runner-up has none). */
		margin?: number;
		ratio?: number;
		/** Novelty peaks pooled from both kernels. */
		peaks?: number;
	};
};

/**
 * The recording's start (Study 31, witness 1): time zero snapped to the
 * nearest lattice beat votes that beat's class when within
 * `TIME_ZERO_SNAP_BEATS`, else abstains (a song that starts mid-bar). The
 * app's `timeZeroWitness`.
 */
export function timeZeroWitness(lattice: Lattice, s: Settings): Witness {
	const k = Math.round(-lattice.anchor / lattice.beat);
	const distanceBeats = Math.abs(lattice.anchor + k * lattice.beat) / lattice.beat;
	const cls = distanceBeats <= s.TIME_ZERO_SNAP_BEATS ? mod(k, lattice.beatsPerBar) : null;
	return { name: "timeZero", cls, weight: s.DOWNBEAT_WEIGHTS.timeZero, detail: { distanceBeats } };
}

/**
 * A histogram's top class, the margin and ratio over the runner-up; the
 * class null under `least` counts in all or on a tie for the top. The
 * app's `histogramVote`.
 */
export function histogramVote(
	histogram: number[],
	least: number,
): { cls: number | null; histogram: number[]; margin: number; ratio: number } {
	const order = histogram
		.map((_, k) => k)
		.sort((a, b) => (histogram[b] as number) - (histogram[a] as number) || a - b);
	const top = histogram[order[0] as number] ?? 0;
	const runner = histogram[order[1] as number] ?? 0;
	const total = histogram.reduce((sum, n) => sum + n, 0);
	const cls = total < least || top === runner ? null : (order[0] as number);
	return { cls, histogram, margin: top - runner, ratio: runner > 0 ? top / runner : Infinity };
}

const NO_CHORD = new Set(["N", "N.C.", "X", "?", ""]);

/**
 * The chord changes (Study 31, witness 2): a chord per lattice beat voted
 * by frame coverage (`beatChords` on the beats, so each merged segment's
 * start is a change), the changes between two chords (never to or from no
 * chord) counted per beat class; the top class votes. Abstains without
 * the model's chords, with fewer changes than beats in a bar, on a tie, or
 * when the top class holds under `HARMONIC_MIN_RATIO` times the
 * runner-up's changes (a flat histogram: harmony moving on every beat, or
 * a cut that starts off the beat, Study 32's one wrong placement). The
 * app's `harmonicRhythmWitness`.
 */
export function harmonicRhythmWitness(
	chords: ListenChordRuns | null,
	lattice: Lattice,
	duration: number,
	s: Settings,
): Witness {
	const histogram = Array.from({ length: lattice.beatsPerBar }, () => 0);
	if (chords) {
		const { first, starts } = latticeBeats(lattice, duration);
		const segments = beatChords(chords, starts);
		for (let i = 1; i < segments.length; i++) {
			const before = segments[i - 1] as { chord: string };
			const segment = segments[i] as { bar: number; chord: string };
			if (NO_CHORD.has(before.chord) || NO_CHORD.has(segment.chord)) continue;
			const k = mod(first + segment.bar - 1, lattice.beatsPerBar);
			histogram[k] = (histogram[k] as number) + 1;
		}
	}
	const { cls: top, ...detail } = histogramVote(histogram, lattice.beatsPerBar);
	const cls = detail.ratio >= s.HARMONIC_MIN_RATIO ? top : null;
	return { name: "harmonicRhythm", cls, weight: s.DOWNBEAT_WEIGHTS.harmonicRhythm, detail };
}
