/**
 * The trusted span and the phase line, ported from the app's
 * `audio/alignmentRepair.ts` (stem-bench Study 26c, recipe v3), arithmetic
 * in the app's order. Fixed, not options (design 5.3): the trusted run of
 * four starts and the phase line's middle 60 %.
 */
import type { Settings } from "../options.js";

/**
 * The run of bar starts that sit on the lattice `predict` (within
 * `REPAIR_TRUST_FRACTION` of a bar): `iFirst` opens the first run of four
 * trusted starts, `iLast` closes the last; null when there is no such run.
 * The app's `trustedSpan`.
 */
export function trustedSpan(
	ts: number[],
	period: number,
	predict: (i: number) => number,
	s: Settings,
): { iFirst: number; iLast: number } | null {
	const tol = s.REPAIR_TRUST_FRACTION * period;
	const trusted = ts.map((t, i) => Math.abs(t - predict(i)) <= tol);
	const run = (i: number) =>
		(trusted[i] as boolean) &&
		(trusted[i + 1] as boolean) &&
		(trusted[i + 2] as boolean) &&
		(trusted[i + 3] as boolean);
	let iFirst = -1;
	for (let i = 0; i + 3 < trusted.length; i++) {
		if (run(i)) {
			iFirst = i;
			break;
		}
	}
	let iLast = -1;
	for (let i = trusted.length - 1; i >= 3; i--) {
		if (run(i - 3)) {
			iLast = i;
			break;
		}
	}
	if (iFirst < 0 || iLast < iFirst) return null;
	return { iFirst, iLast };
}

/**
 * The phase line through an alignment's bar starts `ts` at `period`: the
 * phase the median residual of the middle 60 % of starts, and the trusted
 * span on that line. Null, the refusal, when the span covers under
 * `REPAIR_MIN_TRUSTED_SHARE` of the starts: the chart's bars do not line
 * up with the recording's middle (on the bench, a wrong chart). The app's
 * `phaseLine`.
 */
export function phaseLine(
	ts: number[],
	period: number,
	s: Settings,
): { phase: number; iFirst: number; iLast: number } | null {
	const n = ts.length;
	const lo = Math.floor(0.2 * n);
	const hi = Math.max(lo + 2, Math.ceil(0.8 * n));
	const residuals = ts
		.slice(lo, hi)
		.map((t, j) => t - (lo + j) * period)
		.sort((a, b) => a - b);
	const phase = residuals[Math.floor(residuals.length / 2)] as number;
	const span = trustedSpan(ts, period, (i) => phase + i * period, s);
	if (!span || span.iLast - span.iFirst + 1 < s.REPAIR_MIN_TRUSTED_SHARE * n) return null;
	return { phase, ...span };
}
