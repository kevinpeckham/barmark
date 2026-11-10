/** The downbeat vote, ported from the app's `audio/chartlessGrid.ts` (stem-bench Study 31's registered rule), arithmetic in the app's order. */
import type { Settings } from "../options.js";
import type { Witness } from "./witnesses.js";

/**
 * The vote (Study 31's registered rule): each witness's weight on its
 * class; decided when the top score is at least `DOWNBEAT_MIN_SCORE`,
 * beats the runner-up by one, and is class 0 (the comb's own phase) or
 * beats class 0 by `DOWNBEAT_OFF_COMB_MARGIN`. The chord witness's ratio
 * rule (`HARMONIC_MIN_RATIO`) is applied where it votes, as the bench's
 * validated run of the vote applied it (Study 32). An abstaining witness
 * (`cls: null`) carries no weight. The app's `downbeatVote`.
 */
export function downbeatVote(
	witnesses: Witness[],
	beatsPerBar: number,
	s: Settings,
): { cls: number; decided: boolean; scores: number[] } {
	const scores = Array.from({ length: beatsPerBar }, () => 0);
	for (const w of witnesses)
		if (w.cls !== null) scores[w.cls] = (scores[w.cls] as number) + w.weight;
	const order = scores
		.map((_, k) => k)
		.sort((a, b) => (scores[b] as number) - (scores[a] as number) || a - b);
	const cls = order[0] as number;
	const top = scores[cls] as number;
	const runner = scores[order[1] as number] ?? 0;
	const decided =
		top >= s.DOWNBEAT_MIN_SCORE &&
		top >= runner + 1 &&
		(cls === 0 || top >= (scores[0] as number) + s.DOWNBEAT_OFF_COMB_MARGIN);
	return { cls, decided, scores };
}
