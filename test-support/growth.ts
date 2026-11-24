/**
 * How many times longer one call of `large` takes than one of `small`,
 * measured so a loaded machine can't fail a linear-time test (FINDINGS.md,
 * "A timing test that a loaded machine fails").
 *
 * - Each side warms up once, then the runs alternate, small and large, so a
 *   burst of load falls on both alike, and the best run of each is kept.
 * - A run of the small side calls it `balance` times (pass the ratio of the
 *   sizes), so both runs last about as long. A run of a few milliseconds
 *   can finish inside one time slice while a long one is always shared, so
 *   unbalanced runs make a loaded machine look superlinear.
 * - A run calls its side `repeat` times more, when even the large side is
 *   quick beside the timer and a pause.
 * - Each run starts from a collected heap, so one side doesn't pay for the
 *   other's garbage.
 * - The small run's time is floored at `floorMs`, so a run that happens to
 *   be very quick can't blow the ratio up; keep the floor well under what
 *   the small run takes, or it hides real growth.
 *
 * - Pass the test's limit as `under` and a measurement at or over it is taken
 *   again (`settled`): balanced runs still leave a rare spike, when the load
 *   lands on every large run and misses a small one.
 *
 * `GROWTH_LOG=1` prints each measurement.
 */
export function growth(
	small: () => unknown,
	large: () => unknown,
	{
		runs = 3,
		balance = 1,
		repeat = 1,
		floorMs = 5,
		under,
	}: { runs?: number; balance?: number; repeat?: number; floorMs?: number; under?: number } = {},
): number {
	const time = (f: () => unknown, calls: number) => {
		Bun.gc(true);
		const start = performance.now();
		for (let k = 0; k < calls; k++) f();
		return performance.now() - start;
	};
	small();
	large();
	const measure = () => {
		let [smallMs, largeMs] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
		for (let run = 0; run < runs; run++) {
			smallMs = Math.min(smallMs, time(small, repeat * balance));
			largeMs = Math.min(largeMs, time(large, repeat));
		}
		const ratio = (largeMs * balance) / Math.max(smallMs, floorMs);
		if (process.env.GROWTH_LOG)
			console.error(
				`growth: small run ${smallMs.toFixed(1)} ms, large run ${largeMs.toFixed(1)} ms, ${ratio.toFixed(2)}`,
			);
		return ratio;
	};
	return under === undefined ? measure() : settled(measure, under);
}

/**
 * A measurement that is taken again before it fails a test: `measure` runs up
 * to `attempts` times, stopping at the first result under `under`, and the
 * smallest is the answer. Growth that is really there shows in every
 * measurement; a spike of load shows in one.
 */
export function settled(measure: () => number, under: number, attempts = 3): number {
	let least = Number.POSITIVE_INFINITY;
	for (let attempt = 0; attempt < attempts && least >= under; attempt++)
		least = Math.min(least, measure());
	return least;
}

/** The timeout of a timing test: the ratio is the test, and this only keeps a loaded machine from cutting it short. */
export const TIMING_TIMEOUT = 120_000;
