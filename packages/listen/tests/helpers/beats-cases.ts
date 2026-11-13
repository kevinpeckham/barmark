/**
 * The readings `scripts/listen-beats-equivalence.ts` runs through the app's
 * `trackerBarGrid` and `beatThisGrid`, and `tests/beats-equivalence.test.ts`
 * through `gridFromBeats`: each already snapped (every downbeat one of the
 * beats), ascending and within `[0, duration]`.
 */
import { evenBeats, lead, reading } from "./beats.js";
import { seeded } from "./seeded.js";

export type BeatsCase = {
	name: string;
	input: { beats: number[]; downbeats: number[]; duration: number };
};

/** A tracker's 4/4 near 143 bpm on a 20 ms frame grid, `bars` bars; a bar in `stretched` reads as two half bars. */
function framed(
	seed: number,
	bars: number,
	stretched: (bar: number) => boolean,
): BeatsCase["input"] {
	const draw = seeded(seed);
	const frame = (t: number) => Math.round(t / 0.02) * 0.02;
	const beats: number[] = [];
	const downbeats: number[] = [];
	let t = 0.1;
	const add = (isDown: boolean) => {
		const at = frame(t);
		if (isDown) downbeats.push(at);
		beats.push(at);
		t += (60 / 143) * (1 + (draw() - 0.5) * 0.04);
	};
	for (let bar = 0; bar < bars; bar++)
		for (let k = 0; k < 4; k++) add(k === 0 || (k === 2 && stretched(bar)));
	add(true);
	return { beats, downbeats, duration: frame(t) + 1.3 };
}

const steady = (bpm: number, perBar: number, bars: number) => {
	const r = evenBeats(bpm, perBar, bars);
	return { ...r, duration: (r.beats.at(-1) as number) + 1 };
};

export const BEATS_CASES: BeatsCase[] = [
	{ name: "steady 4/4", input: reading([4, 4, 4, 4, 4, 4], 1) },
	{ name: "steady 3/4", input: reading([3, 3, 3, 3, 3, 3], 0.5) },
	{ name: "steady 6/8", input: reading([6, 6, 6, 6, 6, 6], 1) },
	{ name: "even 4/4 at 120 bpm", input: steady(120, 4, 12) },
	{ name: "even 3/4 at 90 bpm", input: steady(90, 3, 10) },
	{ name: "a half-bar intro", input: reading([2, 2, 2, 2, 4, 4, 4, 4]) },
	{ name: "an unpaired half bar", input: reading([4, 4, 2, 4, 4, 4]) },
	{ name: "three half bars in a row", input: reading([2, 2, 2, 4, 4, 4, 4, 4]) },
	{ name: "a 6/8 read half in threes", input: reading([3, 3, 6, 6, 3, 3, 6, 6, 6]) },
	{ name: "the app's unsteady reading", input: reading([3, 3, 3, 2, 4, 5, 2, 4, 5]) },
	{ name: "a steady share of exactly 0.4", input: reading([3, 3, 3, 3, 2, 4, 5, 2, 4, 5]) },
	{ name: "a short reading", input: reading([4, 4, 4]) },
	{ name: "a tail of 0.99 s", input: reading([4, 4, 4, 4], 0.99) },
	{ name: "a tail of 1.0 s", input: reading([4, 4, 4, 4], 1) },
	{ name: "a tail of 1.5 s", input: reading([4, 4, 4, 4], 1.5) },
	{ name: "bars of 2 beats", input: reading([2, 2, 2, 2, 2, 2]) },
	{ name: "bars of 5 beats", input: reading([5, 5, 5, 5, 5, 5]) },
	// The app has no pickup: listen reports one here, beside the same grid.bars. The
	// equivalence compares bars, meter, barSeconds, tempos, beatsPerBar and counts, not the pickup.
	{ name: "one beat before bar one", input: lead(reading([4, 4, 4, 4], 1), 1) },
	{ name: "seeded 4/4 on a 20 ms frame grid", input: framed(20261113, 24, () => false) },
	{
		name: "seeded 4/4 on a 20 ms frame grid with half-bar stretches",
		input: framed(20261114, 24, (bar) => bar % 6 === 1 || bar % 6 === 2),
	},
];
