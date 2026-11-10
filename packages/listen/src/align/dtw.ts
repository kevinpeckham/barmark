/**
 * Dynamic time warping over chroma (design §6.3, §10), ported from the
 * app's `audio/chartAlignment.ts` (`isZero`, `distance`, `fillRow`,
 * `fillTable`, `backtrack`, `mapperOf`, `frameCostOf`, `dtwAlign`,
 * `tritone`, `barCosts`) with the arithmetic in the app's order. One
 * change of shape: the step table is the caller's (`dtwTable`), so the
 * tritone control reuses the right chart's table instead of allocating a
 * second one (§10: the same numbers, half the peak memory). Every cell the
 * backtrack reads is written by the fill first, so a reused table gives
 * what a fresh one does.
 */

/** A warping: the path, its mean step cost, and each reference frame's cost. */
export type Dtw = {
	/** The path as [reference frame, recording frame] pairs, start to end. */
	path: [number, number][];
	/** Mean step cost along the path; Infinity when no path fits. */
	normalizedCost: number;
	/** Per reference frame, the mean step cost of the path's points on it (a frame the path steps over takes the one before). */
	frameCost: Float32Array;
};

/** The step table for `n` reference frames against `m` recording frames: a byte a cell, `(n + 1) × (m + 1)`. */
export function dtwTable(n: number, m: number): Uint8Array {
	return new Uint8Array((n + 1) * (m + 1));
}

const isZero = (f: Float32Array) => f.every((v) => Math.abs(v) < 1e-6);

/** Cosine distance of normalized frames; a zero frame is as far as can be from all but another zero frame. */
function distance(a: Float32Array, b: Float32Array, aZero: boolean, bZero: boolean): number {
	if (aZero || bZero) return aZero && bZero ? 0 : 1;
	let dot = 0;
	for (let i = 0; i < 12; i++) dot += (a[i] as number) * (b[i] as number);
	return 1 - dot;
}

/** Rows of cumulative cost: this one, the one before and the one before that. */
type Rows = { cur: Float64Array; prev: Float64Array; older: Float64Array };

/** Row `i` of the table: each cell the cheapest of its three predecessors plus its own distance; the step taken goes in `steps`. */
function fillRow(i: number, rows: Rows, steps: Uint8Array, cost: (j: number) => number): void {
	const { cur, prev, older } = rows;
	const m = cur.length - 1;
	cur[0] = Number.POSITIVE_INFINITY;
	for (let j = 1; j <= m; j++) {
		const d12 = j >= 2 ? (prev[j - 2] as number) : Number.POSITIVE_INFINITY;
		const d21 = i >= 2 ? (older[j - 1] as number) : Number.POSITIVE_INFINITY;
		let [best, step] = [prev[j - 1] as number, 1];
		if (d12 < best) [best, step] = [d12, 2];
		if (d21 < best) [best, step] = [d21, 3];
		cur[j] = best + cost(j - 1);
		steps[i * (m + 1) + j] = step;
	}
}

/** The cumulative costs, two rows behind at a time, and every cell's step: 1 diagonal, 2 the reference slower, 3 faster. Returns the last row. */
function fillTable(
	ref: Float32Array[],
	rec: Float32Array[],
	refZero: boolean[],
	recZero: boolean[],
	subsequence: boolean,
	steps: Uint8Array,
): Float64Array {
	const [n, m] = [ref.length, rec.length];
	let rows: Rows = {
		cur: new Float64Array(m + 1),
		prev: new Float64Array(m + 1).fill(subsequence ? 0 : Number.POSITIVE_INFINITY),
		older: new Float64Array(m + 1).fill(Number.POSITIVE_INFINITY),
	};
	rows.prev[0] = 0;
	for (let i = 1; i <= n; i++) {
		const [a, aZero] = [ref[i - 1] as Float32Array, refZero[i - 1] as boolean];
		fillRow(i, rows, steps, (j) =>
			distance(a, rec[j] as Float32Array, aZero, recZero[j] as boolean),
		);
		rows = { cur: rows.older, prev: rows.cur, older: rows.prev };
	}
	return rows.prev;
}

/** The path back from `(n, endJ)` by the steps taken. */
function backtrack(
	steps: Uint8Array,
	n: number,
	m: number,
	endJ: number,
	subsequence: boolean,
): [number, number][] {
	const path: [number, number][] = [];
	let [i, j] = [n, endJ];
	while (i >= 1 && j >= 1) {
		path.push([i - 1, j - 1]);
		const s = steps[i * (m + 1) + j];
		if (s === 2) [i, j] = [i - 1, j - 2];
		else if (s === 3) [i, j] = [i - 2, j - 1];
		else [i, j] = [i - 1, j - 1];
		if (subsequence && i === 0) break;
	}
	return path.reverse();
}

/**
 * Reference seconds to recording seconds, linear between the path's
 * points, straight on past either end: the app's `mapperOf`. Stage-only.
 */
export function mapSeconds(path: [number, number][], hopSec: number): (refSec: number) => number {
	const knotsRef = path.map(([r]) => r * hopSec);
	const knotsRec = path.map(([, c]) => c * hopSec);
	return (refSec) => {
		if (path.length === 0) return refSec;
		if (refSec <= (knotsRef[0] as number))
			return (knotsRec[0] as number) + (refSec - (knotsRef[0] as number));
		for (let k = 1; k < knotsRef.length; k++) {
			if (refSec <= (knotsRef[k] as number)) {
				const span = (knotsRef[k] as number) - (knotsRef[k - 1] as number);
				const t = span > 1e-9 ? (refSec - (knotsRef[k - 1] as number)) / span : 0;
				return (
					(knotsRec[k - 1] as number) + t * ((knotsRec[k] as number) - (knotsRec[k - 1] as number))
				);
			}
		}
		return (knotsRec.at(-1) as number) + (refSec - (knotsRef.at(-1) as number));
	};
}

/** Each reference frame's mean step cost on the path; a frame the path steps over takes the one before. */
function frameCostOf(
	path: [number, number][],
	n: number,
	cost: (r: number, c: number) => number,
): Float32Array {
	const sum = new Float32Array(n);
	const count = new Uint16Array(n);
	for (const [r, c] of path) {
		sum[r] = (sum[r] as number) + cost(r, c);
		count[r] = (count[r] as number) + 1;
	}
	const out = new Float32Array(n);
	for (let r = 0; r < n; r++)
		out[r] = count[r]
			? (sum[r] as number) / (count[r] as number)
			: r > 0
				? (out[r - 1] as number)
				: 0;
	return out;
}

/**
 * The app's `dtwAlign`: cosine distance, steps (1,1), (1,2) and (2,1), so
 * the reference never stalls and a bar cannot map to no time (the
 * recording runs at half to twice the chart's tempo). `subsequence` frees
 * the recording's start and end (a count-in, a tail). A path that cannot
 * fit costs Infinity. `steps` is `dtwTable(ref.length, rec.length)` or a
 * table reused from a warping of the same size; its contents are
 * overwritten.
 */
export function dtwAlign(
	ref: Float32Array[],
	rec: Float32Array[],
	steps: Uint8Array,
	subsequence: boolean,
): Dtw {
	const [n, m] = [ref.length, rec.length];
	const refZero = ref.map(isZero);
	const recZero = rec.map(isZero);
	const last = fillTable(ref, rec, refZero, recZero, subsequence, steps);
	let endJ = m;
	if (subsequence)
		for (let j = 1; j <= m; j++) if ((last[j] as number) < (last[endJ] as number)) endJ = j;
	const path = backtrack(steps, n, m, endJ, subsequence);
	const cost = (r: number, c: number) =>
		distance(
			ref[r] as Float32Array,
			rec[c] as Float32Array,
			refZero[r] as boolean,
			recZero[c] as boolean,
		);
	return {
		path,
		normalizedCost: (last[endJ] as number) / Math.max(1, path.length),
		frameCost: frameCostOf(path, n, cost),
	};
}

/** The frames a tritone away: the chart with every chord transposed six semitones, for chroma's purposes (the app's `tritone`). */
export const tritone = (frames: Float32Array[]): Float32Array[] =>
	frames.map((f) => Float32Array.from({ length: 12 }, (_, pc) => f[(pc + 6) % 12] as number));

/**
 * Per bar, the mean frame cost over the frames from its start to the next
 * bar's (rounded up); a bar within one frame takes the frame nearest its
 * start. `starts` has one more entry than there are bars. The app's `barCosts`.
 */
export function barCosts(starts: number[], frameCost: Float32Array, hopSec: number): number[] {
	return starts.slice(0, -1).map((start, b) => {
		const from = Math.ceil(start / hopSec);
		const to = Math.min(frameCost.length, Math.ceil((starts[b + 1] as number) / hopSec));
		if (to <= from)
			return frameCost[Math.min(frameCost.length - 1, Math.round(start / hopSec))] ?? 0;
		let sum = 0;
		for (let k = from; k < to; k++) sum += frameCost[k] as number;
		return sum / (to - from);
	});
}
