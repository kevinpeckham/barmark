/** The onset comb runs in time linear in the envelope's length (design 10). */
import { expect, test } from "bun:test";
import { jointOnsetComb } from "../src/comb/comb.js";
import { DEFAULTS } from "../src/options.js";
import { barsAndBeatsOf, envelope, FPS } from "./helpers/onsets.js";

// The ratio is of best-of-three timings; the timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = 60_000;
const PERIOD = 2.1;
/** Each run combs its envelope this often, so a run of the 60 s one (about 2 ms a comb) is long beside the timer's jitter. */
const REPEATS = 10;

/** `seconds` of bars and beats at 100 fps. */
function song(seconds: number): Float32Array {
	const bars = Array.from({ length: Math.floor(seconds / PERIOD) }, (_, i) => 0.5 + i * PERIOD);
	return envelope(barsAndBeatsOf(bars, PERIOD), seconds);
}

/** One run: `REPEATS` combs of `onset`, in milliseconds. */
function run(onset: Float32Array): number {
	const start = performance.now();
	for (let k = 0; k < REPEATS; k++) jointOnsetComb(onset, FPS, PERIOD * 1.03, DEFAULTS);
	return performance.now() - start;
}

test(
	"a 240 s envelope combs in under six times a 60 s one's time (linear is four)",
	() => {
		const short = song(60);
		const long = song(240);
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
