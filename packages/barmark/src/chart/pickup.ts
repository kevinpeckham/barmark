import type { Meter, PlayedBar } from "./types.js";

/** Whether meter `a` lasts less than `b`, by value (`[4/4]` and 4/4 are the same length). */
const shorter = (a: Meter, b: Meter) => a.n * b.d < b.n * a.d;

/**
 * The rule of grammar 2.4 on bars numbered from 1, as `expand` plays them:
 * the first written bar is in a one-bar meter shorter than the meter in
 * force at the next written bar, and that bar is not itself in a one-bar
 * meter shorter than its `time:`. A bar line dropped for an error writes
 * bars no played bar has, so a chart whose first or second written bar is
 * on one has no pickup.
 */
function pickupRule(bars: PlayedBar[]): boolean {
	const first = bars.find((b) => b.written === 1);
	const next = bars.find((b) => b.written === 2);
	if (!first?.time || !next) return false;
	if (next.time && shorter(next.meter, next.time)) return false;
	return shorter(first.meter, next.meter);
}

/**
 * Whether a chart's played bars open with a pickup (grammar 2.4), for a
 * reader holding only the bars. Accepts both numberings: bars as
 * `parseChart` and `extractPart` give them (the pickup is the bar written
 * 0), and bars as `expand` gives them, counting from 1.
 * `ChartParse.pickup` says the same.
 */
export function opensWithPickup(bars: PlayedBar[]): boolean {
	return bars.some((b) => b.written === 0) || pickupRule(bars);
}

/**
 * Number a chart's bars from 0 when it opens with a pickup (grammar 2.4):
 * every played bar's `written` drops by one (each played bar is its own
 * object, so none drops twice). Returns whether it did.
 */
export function numberFromPickup(bars: PlayedBar[]): boolean {
	if (!pickupRule(bars)) return false;
	for (const b of bars) b.written -= 1;
	return true;
}
