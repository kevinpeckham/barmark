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

/** How early a slot arrives: an eighth for `<`, a sixteenth for `<<`, else nothing. */
export function pushOf(slot: SimpleSlot): Quarters | undefined {
	const push = slot.kind === "hold" || slot.kind === "unknown" ? undefined : slot.push;
	return push && PUSH[push];
}

/**
 * Each pushed slot attacks early and sounds to its own end, taking the
 * time from the slots played just before it on the line, in play order,
 * across bar lines, repeats, replays and jumps (grammar 2.8): what sounds
 * there ends at the new attack. A slot left with no time is dropped.
 */
export function applyPushes(line: TimedSlot[]): TimedSlot[] {
	const out: TimedSlot[] = [];
	for (const timed of line) {
		// A push with nothing before it is a chart error (grammar 2.8); it stays on the beat.
		const by = out.length > 0 ? pushOf(timed.slot) : undefined;
		if (by) take(out, by);
		out.push(by ? { ...timed, at: sub(timed.at, by), length: add(timed.length, by) } : timed);
	}
	return out;
}

/** Shortens the slots at the end of `out` by `by` in all, dropping any it empties. */
function take(out: TimedSlot[], by: Quarters): void {
	let left = by;
	while (cmp(left, ZERO) > 0) {
		const last = out.at(-1);
		if (!last) return;
		if (cmp(last.length, left) > 0) {
			out[out.length - 1] = { ...last, length: sub(last.length, left) };
			return;
		}
		left = sub(left, last.length);
		out.pop();
	}
}
