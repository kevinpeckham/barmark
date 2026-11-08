/**
 * A variable-length quantity: seven bits a byte, most significant first, the
 * high bit set on all but the last. SMF allows at most four bytes, so `n` is
 * a whole number from 0 to 0x0fffffff; anything else is a RangeError (the
 * writer is internal, and its callers pass whole ticks).
 */
export function writeVlq(n: number): number[] {
	if (!Number.isInteger(n) || n < 0 || n > 0x0fffffff)
		throw new RangeError(
			`a MIDI variable-length quantity must be a whole number from 0 to 0x0fffffff: ${n}`,
		);
	const bytes = [n & 0x7f];
	for (let rest = n >>> 7; rest > 0; rest >>>= 7) bytes.unshift((rest & 0x7f) | 0x80);
	return bytes;
}
