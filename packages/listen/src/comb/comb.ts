/**
 * The onset comb, ported from the app's `audio/alignmentRepair.ts`
 * (stem-bench Study 24's P2, as Study 26c uses it), arithmetic in the
 * app's order and its constants from the resolved options.
 *
 * The caller's preconditions: a finite, positive declared bar and fps
 * (and `beatsPerBar ≥ 1` wherever a beat is taken from the bar). A NaN or
 * Infinity bar throws a TypeError here and a bar of 0 loops forever, so
 * every stage entry refuses such inputs before it calls in, and checks
 * `flatEnvelope` first, so the comb never runs on an envelope with no
 * lattice to find.
 */
import { detrend } from "../features/onset.js";
import type { Settings } from "../options.js";

/** A lattice found by the comb: its period and phase in seconds and the objective there. */
export type CombFit = { period: number; phase: number; score: number };

/**
 * True when `onset` holds no lattice to find: it is empty, or nothing is
 * left of it after `detrend` (silence, or a constant level). The
 * `no-period` refusal's test (design 4.1); new, not the app's.
 */
export function flatEnvelope(onset: Float32Array, fps: number): boolean {
	return onset.length === 0 || detrend(onset, fps).every((v) => v === 0);
}

/** The best phase and its mean detrended onset energy, for one candidate period. */
function phaseScore(
	x: Float32Array,
	fps: number,
	period: number,
	s: Settings,
): { phase: number; score: number } {
	const duration = x.length / fps;
	let bestPhase = 0;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (let phase = 0; phase < period; phase += s.COMB_PHASE_STEP_SEC) {
		let sum = 0;
		let count = 0;
		for (let t = phase; t < duration; t += period) {
			const frame = Math.round(t * fps);
			if (frame < x.length) {
				sum += x[frame] as number;
				count++;
			}
		}
		const score = count > 0 ? sum / count : Number.NEGATIVE_INFINITY;
		if (score > bestScore) {
			bestScore = score;
			bestPhase = phase;
		}
	}
	return { phase: bestPhase, score: bestScore };
}

/**
 * The best of `periods` (the first on a tie), each with its best phase.
 * The ladder is never empty once the options validate (a positive range
 * and step), so the app's "empty period scan" throw is gone.
 */
function scanPeriods(
	periods: number[],
	evaluate: (period: number) => { phase: number; score: number },
): CombFit {
	let best: CombFit | null = null;
	for (const period of periods) {
		const { phase, score } = evaluate(period);
		if (best === null || score > best.score) best = { period, phase, score };
	}
	return best as CombFit;
}

function periodLadder(center: number, halfRange: number, step: number): number[] {
	const out: number[] = [];
	for (let p = center - halfRange; p <= center + halfRange + 1e-9; p += step) out.push(p);
	return out;
}

/**
 * The onset comb (stem-bench Study 24's P2): the period within
 * ±`COMB_RANGE_FRACTION` of the declared bar, and its phase, whose lattice
 * lands on the most detrended onset energy on average; a coarse scan, then
 * a fine one around its best. The app's `jointOnsetComb`.
 */
export function jointOnsetComb(
	onset: Float32Array,
	fps: number,
	declaredPeriod: number,
	s: Settings,
): CombFit {
	const x = detrend(onset, fps);
	const evaluate = (period: number) => phaseScore(x, fps, period, s);
	const coarse = scanPeriods(
		periodLadder(
			declaredPeriod,
			declaredPeriod * s.COMB_RANGE_FRACTION,
			declaredPeriod * s.COMB_COARSE_STEP_FRACTION,
		),
		evaluate,
	);
	return scanPeriods(
		periodLadder(
			coarse.period,
			declaredPeriod * s.COMB_COARSE_STEP_FRACTION,
			declaredPeriod * s.COMB_FINE_STEP_FRACTION,
		),
		evaluate,
	);
}
