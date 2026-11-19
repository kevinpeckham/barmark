/**
 * Lists of any length. A spread into a call (`push(...x)`, `Math.max(...x)`)
 * passes each item as an argument, and V8 throws a RangeError past about
 * 120,000 of them (Bun's limit is far higher, so only a run under Node
 * shows it); the export never throws, so none is used on a list a chart can
 * make long.
 */

/** Adds every item to the end of `target`. */
export function pushAll<T>(target: T[], items: readonly T[]): void {
	for (const item of items) target.push(item);
}

/** The largest of the numbers, or -Infinity for none (as `Math.max()`). */
export function maxOf(values: Iterable<number>): number {
	let max = Number.NEGATIVE_INFINITY;
	for (const v of values) if (v > max) max = v;
	return max;
}

/** The items by key, each key's in their order (`Map.groupBy`, which Node 20 lacks). */
export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
	const out = new Map<K, T[]>();
	for (const item of items) {
		const k = key(item);
		const list = out.get(k);
		if (list) list.push(item);
		else out.set(k, [item]);
	}
	return out;
}
