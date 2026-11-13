/**
 * `declared` against the tracker's reading (design §5): the song's meter
 * and tempo, compared with what the beats say and never obeyed.
 */
import { beatsOf, parseMeter } from "barmark";
import { tempoDrift } from "../grid/drift.js";
import type { ListenWarning } from "../result.js";
import type { BeatsDeclared } from "./input.js";
import type { BeatsMeter } from "./label.js";

/** The fold nearest to the bar over the declared bar: 1, 0.5 or 2 by the absolute log, the earlier on a tie. */
function nearestFold(quotient: number): number {
	let best = 1;
	for (const fold of [0.5, 2]) {
		if (Math.abs(Math.log(quotient / fold)) < Math.abs(Math.log(quotient / best))) best = fold;
	}
	return best;
}

/** `meter-differs` when the declared meter is not the read one. */
function meterDiffers(declared: BeatsDeclared, meter: BeatsMeter): ListenWarning | null {
	const read = parseMeter(meter);
	if (
		declared.meter === null ||
		(read && declared.meter.n === read.n && declared.meter.d === read.d)
	)
		return null;
	const text = `${declared.meter.n}/${declared.meter.d}`;
	return {
		code: "meter-differs",
		message: `The declared meter is ${text}, but the beats read as ${meter}.`,
		detail: { meter, declared: text },
	};
}

/** `tempo-drift` with its fold when both parts are declared and the bar differs from theirs. */
function drift(declared: BeatsDeclared, barSeconds: number): ListenWarning | null {
	if (declared.meter === null || declared.tempo === null) return null;
	const declaredBar = (beatsOf(declared.meter) * 60) / declared.tempo;
	const warning = tempoDrift(barSeconds, declaredBar);
	if (!warning) return null;
	const fold = nearestFold(barSeconds / declaredBar);
	const foldRatio = barSeconds / (fold * declaredBar) - 1;
	return { ...warning, detail: { ...warning.detail, fold, foldRatio } };
}

/**
 * The warnings of `declared` against the read grid: `meter-differs` when
 * the declared meter is not the label's, and `tempo-drift` (with `fold`,
 * the nearest of 1, 0.5 and 2, and `foldRatio`, the drift left after it)
 * when both parts are given and the bar is not the declared one.
 */
export function declaredWarnings(
	declared: BeatsDeclared,
	meter: BeatsMeter,
	barSeconds: number,
): ListenWarning[] {
	const out = [meterDiffers(declared, meter), drift(declared, barSeconds)];
	return out.filter((w): w is ListenWarning => w !== null);
}
