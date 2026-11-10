/**
 * The section changes, the downbeat's third witness, ported from the
 * app's `audio/chartlessGrid.ts` (stem-bench Study 31), arithmetic in the
 * app's order and the spans from the options.
 */
import type { Settings } from "../options.js";
import { type Lattice, latticeBeats, mod } from "./lattice.js";
import { histogramVote, type Witness } from "./witnesses.js";

/**
 * The chroma (flattened, 12 a frame, `hopSec` apart) summed over each beat
 * (`starts` with the end) and L2-normalized; a beat without frames stays
 * zero. The app's `beatChromaOf`.
 */
export function beatChroma(chroma: Float32Array, hopSec: number, starts: number[]): Float32Array[] {
	const frames = Math.floor(chroma.length / 12);
	return starts.slice(0, -1).map((start, j) => {
		const lo = Math.floor(start / hopSec);
		const hi = Math.min(frames, Math.max(lo + 1, Math.floor((starts[j + 1] as number) / hopSec)));
		const sum = new Float32Array(12);
		for (let f = lo; f < hi; f++)
			for (let c = 0; c < 12; c++) sum[c] = (sum[c] as number) + (chroma[f * 12 + c] as number);
		const norm = Math.hypot(...sum);
		if (norm > 0) for (let c = 0; c < 12; c++) sum[c] = (sum[c] as number) / norm;
		return sum;
	});
}

/** The dot product of beats `a` and `b`, 0 when either is outside the song. */
function similarity(beats: Float32Array[], a: number, b: number): number {
	const x = beats[a];
	const y = beats[b];
	if (x === undefined || y === undefined) return 0;
	let d = 0;
	for (let k = 0; k < x.length; k++) d += (x[k] as number) * (y[k] as number);
	return d;
}

/** One beat's novelty: the kernel `g` signed by quadrant over the ±L-beat window around `b`. */
function noveltyAt(beats: Float32Array[], g: number[], L: number, b: number): number {
	let s = 0;
	for (let i = -L; i < L; i++)
		for (let j = -L; j < L; j++)
			s +=
				(i < 0 ? -1 : 1) *
				(j < 0 ? -1 : 1) *
				(g[i + L] as number) *
				(g[j + L] as number) *
				similarity(beats, b + i, b + j);
	return s;
}

/**
 * Foote's checkerboard novelty on the beats' self-similarity (ported from
 * the bench's reference, Study 31): the Gaussian-tapered kernel
 * `g(i) = exp(-2 (i/L)^2)` signed by quadrant, summed over a ±L-beat
 * window; high where the beats before and after differ and each half
 * agrees with itself. The app's `checkerboardNovelty`.
 */
export function checkerboardNovelty(beats: Float32Array[], L: number): Float32Array {
	const g = Array.from({ length: 2 * L }, (_, m) => Math.exp(-(((m - L) / L) ** 2) * 2));
	const nov = new Float32Array(beats.length);
	for (let b = 0; b < beats.length; b++) nov[b] = noveltyAt(beats, g, L, b);
	return nov;
}

/** The mean and standard deviation of `xs` (not empty). */
function meanAndSd(xs: number[]): { mean: number; sd: number } {
	const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
	const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
	return { mean, sd };
}

/**
 * The novelty's peaks: local maxima above the mean plus one standard
 * deviation, at least L/2 beats apart (the taller kept). Only beats a full
 * kernel from either end count, and the threshold is theirs: past the
 * ends the kernel reads zeros, which makes a peak of the song's edge. The
 * app's `noveltyPeaks`.
 */
export function noveltyPeaks(nov: Float32Array, L: number): number[] {
	const inner = Array.from(nov.subarray(L, Math.max(L, nov.length - L)));
	if (inner.length < 3) return [];
	const { mean, sd } = meanAndSd(inner);
	const at = (b: number) => nov[b] as number;
	const candidates: number[] = [];
	for (let b = L + 1; b < nov.length - L - 1; b++)
		if (at(b) > mean + sd && at(b) >= at(b - 1) && at(b) >= at(b + 1)) candidates.push(b);
	const kept: number[] = [];
	for (const b of candidates.sort((x, y) => at(y) - at(x)))
		if (kept.every((k) => Math.abs(k - b) >= L / 2)) kept.push(b);
	return kept;
}

/**
 * The section changes (Study 31, witness 3): beat-synchronous chroma, its
 * checkerboard novelty at each of `SECTION_NOVELTY_SPANS`, the peaks
 * pooled and counted per beat class; the top class votes. Abstains with
 * fewer than two peaks or on a tie. The app's `sectionWitness`.
 */
export function sectionWitness(
	chroma: Float32Array,
	hopSec: number,
	lattice: Lattice,
	duration: number,
	s: Settings,
): Witness {
	const { first, starts } = latticeBeats(lattice, duration);
	const beats = beatChroma(chroma, hopSec, starts);
	const peaks = s.SECTION_NOVELTY_SPANS.flatMap((L) =>
		noveltyPeaks(checkerboardNovelty(beats, L), L),
	);
	const histogram = Array.from({ length: lattice.beatsPerBar }, () => 0);
	for (const b of peaks) {
		const k = mod(first + b, lattice.beatsPerBar);
		histogram[k] = (histogram[k] as number) + 1;
	}
	const { cls, ...detail } = histogramVote(histogram, 2);
	return {
		name: "sections",
		cls,
		weight: s.DOWNBEAT_WEIGHTS.sections,
		detail: { ...detail, peaks: peaks.length },
	};
}
