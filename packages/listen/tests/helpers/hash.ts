/**
 * FNV-1a 64 over an array's bytes, for the equivalence goldens (Task 16):
 * a features array (Float32, little-endian as the VM and CI store it) is
 * recorded as its hash, so no audio-sized array is checked in. Shared by
 * `scripts/listen-equivalence.ts` and `tests/equivalence.test.ts`.
 */

const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/** FNV-1a 64 of the view's bytes, as 16 lowercase hex digits. */
export function fnv1a64Bytes(view: ArrayBufferView): string {
	const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
	let h = OFFSET;
	for (const byte of bytes) h = ((h ^ BigInt(byte)) * PRIME) & MASK;
	return h.toString(16).padStart(16, "0");
}
