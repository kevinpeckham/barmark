/**
 * The comb's lattice, ported from the app's `audio/chartlessGrid.ts`
 * (stem-bench Studies 28 to 31c), arithmetic in the app's order and its
 * constants from the resolved options.
 */
import { type CombFit, flatEnvelope, jointOnsetComb } from "../comb/comb.js";
import type { Settings } from "../options.js";
import { type Ok, ok, type Refused, refusal, refused } from "../result.js";

/** The comb's lattice: `anchor` a bar line candidate (lead-corrected), its beat and bar in seconds. The app's `ChartlessLattice`. */
export type Lattice = { anchor: number; beat: number; period: number; beatsPerBar: number };

/** `k` modulo `n`, never negative: a lattice point's beat class. */
export const mod = (k: number, n: number) => ((k % n) + n) % n;

const finitePositive = (v: number) => Number.isFinite(v) && v > 0;

/** The first input the comb cannot take, as an `invalid-input` refusal, or null. */
function badInput(fps: number, declaredBar: number, beatsPerBar: number) {
	const fail = (field: string, message: string) =>
		refused([refusal("invalid-input", message, { field })]);
	if (!finitePositive(fps)) return fail("fps", "The onset envelope's frame rate must be above 0.");
	if (!finitePositive(declaredBar))
		return fail("declaredBar", "The declared bar must be a length in seconds above 0.");
	if (!(Number.isInteger(beatsPerBar) && beatsPerBar >= 1))
		return fail("beatsPerBar", "Beats to the bar must be a whole number from 1.");
	return null;
}

/**
 * The comb's lattice near the declared bar (`jointOnsetComb`), its phase
 * moved by `ONSET_ENVELOPE_LEAD_SEC`: the envelope reads onsets about 70 ms
 * early, and Study 31 found time zero 0.058 to 0.079 s off the uncorrected
 * lattice on every song, so every witness reads the corrected one. The
 * app's `chartlessLattice`, which also returns the comb's fit.
 *
 * New, not the app's: it refuses (`invalid-input`) an fps or declared bar
 * that is not finite and above 0, or beats to the bar that are not a whole
 * number from 1, which would make the comb throw or never end; and a flat
 * envelope (`flatEnvelope`) is `no-period`, where the app voted on noise.
 */
export function gridLattice(
	onset: Float32Array,
	fps: number,
	declaredBar: number,
	beatsPerBar: number,
	s: Settings,
): Ok<{ lattice: Lattice; comb: CombFit }> | Refused {
	const bad = badInput(fps, declaredBar, beatsPerBar);
	if (bad) return bad;
	if (flatEnvelope(onset, fps))
		return refused([
			refusal("no-period", "The recording has no beat to find: its onsets are flat."),
		]);
	const comb = jointOnsetComb(onset, fps, declaredBar, s);
	const { period, phase } = comb;
	const lattice = {
		anchor: phase + s.ONSET_ENVELOPE_LEAD_SEC,
		beat: period / beatsPerBar,
		period,
		beatsPerBar,
	};
	return ok({ lattice, comb });
}

/** The lattice's beats from time zero to `duration`: their starts and the end, and the first one's index from the anchor. The app's `latticeBeats`. */
export function latticeBeats(
	lattice: Lattice,
	duration: number,
): { first: number; starts: number[] } {
	const first = Math.ceil(-lattice.anchor / lattice.beat - 1e-9);
	const starts: number[] = [];
	for (let k = first; lattice.anchor + k * lattice.beat < duration; k++)
		starts.push(lattice.anchor + k * lattice.beat);
	starts.push(duration);
	return { first, starts };
}
