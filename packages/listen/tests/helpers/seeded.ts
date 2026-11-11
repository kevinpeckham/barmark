/**
 * A seeded uniform draw in [0, 1): the app's Lehmer generator (multiplier
 * 48271, modulus 2³¹ − 1, as stem-shovel's `chartlessGrid.test.ts`), so a
 * seed here draws what it draws there.
 */
export function seeded(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 48271) % 2147483647;
		return state / 2147483647;
	};
}
