/** A variable-length quantity: seven bits a byte, most significant first, the high bit set on all but the last. */
export function writeVlq(n: number): number[] {
	const bytes = [n & 0x7f];
	for (let rest = Math.floor(n / 0x80); rest > 0; rest = Math.floor(rest / 0x80))
		bytes.unshift((rest & 0x7f) | 0x80);
	return bytes;
}
