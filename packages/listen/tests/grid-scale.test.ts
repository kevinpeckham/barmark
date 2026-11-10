/** `findGrid` runs in time linear in the recording's length (design 10). */
import { expect, test } from "bun:test";
import { findGrid, type GridInput } from "../src/grid/grid.js";
import { onDownbeats, periodOf, type Song, songFeatures } from "./helpers/songs.js";

// The ratio is of best-of-three timings; the timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = 60_000;

/** A 4/4 song at 117 of about `seconds`, as the grid reads it. */
function input(seconds: number): GridInput {
	const song: Song = { bpm: 117, beatsPerBar: 4, downbeat: 0, bars: 0 };
	song.bars = Math.round(seconds / periodOf(song));
	return {
		features: songFeatures(song),
		chords: onDownbeats(song),
		declared: { meter: "4/4", tempo: 117 / 1.01 },
	};
}

/** One run's milliseconds. */
function run(given: GridInput): number {
	const start = performance.now();
	const r = findGrid(given);
	if (!r.ok) throw new Error("refused");
	return performance.now() - start;
}

test(
	"a 240 s song's grid in under six times a 60 s one's time (linear is four)",
	() => {
		const short = input(60);
		const long = input(240);
		run(short);
		run(long);
		// The runs alternate, so a burst of load on the machine falls on both lengths alike.
		let [shortMs, longMs] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
		for (let k = 0; k < 3; k++) {
			shortMs = Math.min(shortMs, run(short));
			longMs = Math.min(longMs, run(long));
		}
		expect(longMs / shortMs).toBeLessThan(6);
	},
	TIMEOUT,
);
