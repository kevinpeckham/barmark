/** Rhythm figures on a line (spec 3.6): how hard a slot attacks, and how early. */
import type { Articulation, Push, SimpleSlot } from "barmark";
import type { TimedSlot } from "./line.js";
import { add, cmp, q, sub, ZERO } from "./quarters.js";
import type { Quarters } from "./types.js";

/** A note's velocity: 80, an accent `>` 100, a hit `^` 112. */
export function velocityOf(articulation?: Articulation): number {
	if (articulation === "hit") return 112;
	return articulation === "accent" ? 100 : 80;
}

const PUSH: Record<Push, Quarters> = { eighth: q(1, 2), sixteenth: q(1, 4) };

/**
 * How early a slot arrives, given the length of the slot played before
 * it (zero when none): an eighth for `<`, a sixteenth for `<<`. A push
 * with nothing before it (a chart error, grammar 2.8) or no longer than
 * that slot stays on the beat, as musicxml's export keeps it, so no
 * written chord is taken whole.
 */
export function pushOf(slot: SimpleSlot, giver: Quarters): Quarters | undefined {
	const push = slot.kind === "hold" || slot.kind === "unknown" ? undefined : slot.push;
	const by = push && PUSH[push];
	return by && cmp(giver, by) > 0 ? by : undefined;
}

/**
 * Each pushed slot attacks early and sounds to its own end, taking the
 * time from the slot played just before it on the line, in play order,
 * across bar lines, repeats, replays and jumps (grammar 2.8): what sounds
 * there ends at the new attack.
 */
export function applyPushes(line: TimedSlot[]): TimedSlot[] {
	const out: TimedSlot[] = [];
	for (const timed of line) {
		const giver = out.at(-1);
		const by = pushOf(timed.slot, giver?.length ?? ZERO);
		if (giver && by) {
			out[out.length - 1] = { ...giver, length: sub(giver.length, by) };
			out.push({ ...timed, at: sub(timed.at, by), length: add(timed.length, by) });
		} else out.push(timed);
	}
	return out;
}
