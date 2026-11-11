/** The warping runs in time linear in its cells (design §10): quadratic in frames, no worse. */
import { expect, test } from "bun:test";
import { dtwAlign, dtwTable } from "../src/align/dtw.js";
import { seeded } from "./helpers/seeded.js";

// The ratio is of best-of-three timings; the timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = 60_000;

/** `count` seeded unit chroma frames. */
function frames(rand: () => number, count: number): Float32Array[] {
	return Array.from({ length: count }, () => {
		const f = Float32Array.from({ length: 12 }, rand);
		const norm = Math.hypot(...f);
		return f.map((v) => v / norm);
	});
}

/** One warping of `ref` against `rec`, in milliseconds. */
function run(ref: Float32Array[], rec: Float32Array[], table: Uint8Array): number {
	const start = performance.now();
	dtwAlign(ref, rec, table, true);
	return performance.now() - start;
}

test(
	"4 M cells warp in under six times 1 M cells' time (linear is four)",
	() => {
		const rand = seeded(4);
		const [small, large] = [frames(rand, 1000), frames(rand, 2000)];
		const [smallTable, largeTable] = [dtwTable(1000, 1000), dtwTable(2000, 2000)];
		run(small, small, smallTable);
		run(large, large, largeTable);
		// The runs alternate, so a burst of load on the machine falls on both sizes alike.
		let [smallMs, largeMs] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
		for (let k = 0; k < 3; k++) {
			smallMs = Math.min(smallMs, run(small, small, smallTable));
			largeMs = Math.min(largeMs, run(large, large, largeTable));
		}
		expect(largeMs / smallMs).toBeLessThan(6);
	},
	TIMEOUT,
);
