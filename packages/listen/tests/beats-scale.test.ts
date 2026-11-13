/** `gridFromBeats` runs in time linear in the number of beats. */
import { expect, test } from "bun:test";
import { growth, TIMING_TIMEOUT } from "../../../test-support/growth.js";
import { gridFromBeats } from "../src/beats/grid.js";
import { evenBeats, reading } from "./helpers/beats.js";

/** A steady 4/4 reading of `n` beats, as the call reads it. */
function steady(n: number) {
	const r = evenBeats(120, 4, n / 4);
	return { ...r, duration: (n / 4) * 2 };
}

/** A reading whose every bar is a pair of half bars, `n` beats in all. */
function halves(n: number) {
	return reading(Array(n / 2).fill(2));
}

const OPTIONS = { MAX_GRID_BARS: 1_000_000 };

/** A call that must not refuse. */
function call(input: ReturnType<typeof steady>) {
	return () => {
		const r = gridFromBeats(input, OPTIONS);
		if (!r.ok) throw new Error(`refused: ${r.refusals[0]?.reason}`);
	};
}

test(
	"100,000 beats' grid in under sixteen times 12,500 beats' time (linear is eight)",
	() => {
		const ratio = growth(call(steady(12_500)), call(steady(100_000)), { balance: 8 });
		expect(ratio).toBeLessThan(16);
	},
	TIMING_TIMEOUT,
);

test(
	"the same with every bar a pair of half bars, so the join is timed",
	() => {
		const ratio = growth(call(halves(12_500)), call(halves(100_000)), { balance: 8 });
		expect(ratio).toBeLessThan(16);
	},
	TIMING_TIMEOUT,
);
