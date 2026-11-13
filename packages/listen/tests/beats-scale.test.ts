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

/** A reading of `n` beats or so, bars of 4, 4, 4, 2, 2 over and over: each pair of 2s joins. */
function halves(n: number) {
	return reading(Array.from({ length: (n / 16) * 5 }, (_, i) => (i % 5 < 3 ? 4 : 2)));
}

const OPTIONS = { MAX_GRID_BARS: 1_000_000 };

/** A call that must not refuse. */
function call(input: ReturnType<typeof steady>, joins = false) {
	return () => {
		const r = gridFromBeats(input, OPTIONS);
		if (!r.ok) throw new Error(`refused: ${r.refusals[0]?.reason}`);
		if (joins && r.value.reading.joined === 0) throw new Error("nothing joined");
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
	"the same with bars joined from half bars, so the join is timed",
	() => {
		const ratio = growth(call(halves(12_500), true), call(halves(100_000), true), { balance: 8 });
		expect(ratio).toBeLessThan(16);
	},
	TIMING_TIMEOUT,
);
