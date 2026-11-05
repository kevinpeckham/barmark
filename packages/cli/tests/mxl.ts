/** A one-entry .mxl (zip) archive, deflated, for tests that need compressed input. */
import { deflateRawSync } from "node:zlib";

const utf8 = (s: string) => new TextEncoder().encode(s);
const fields = (...pairs: [number, 2 | 4][]): number[] =>
	pairs.flatMap(([v, n]) => Array.from({ length: n }, (_, i) => (v >>> (8 * i)) & 0xff));

export function mxl(name: string, text: string): Uint8Array {
	const raw = utf8(text);
	const body = new Uint8Array(deflateRawSync(raw));
	const nm = utf8(name);
	// CRC-32 0: the reader doesn't check it.
	const sizes: [number, 4][] = [
		[0, 4],
		[body.length, 4],
		[raw.length, 4],
	];
	const local = fields(
		[0x04034b50, 4],
		[20, 2],
		[0, 2],
		[8, 2],
		[0, 4],
		...sizes,
		[nm.length, 2],
		[0, 2],
	);
	const central = fields(
		[0x02014b50, 4],
		[20, 2],
		[20, 2],
		[0, 2],
		[8, 2],
		[0, 4],
		...sizes,
		[nm.length, 2],
		[0, 2],
		[0, 2],
		[0, 2],
		[0, 2],
		[0, 4],
		[0, 4],
	);
	const dirAt = local.length + nm.length + body.length;
	const end = fields(
		[0x06054b50, 4],
		[0, 2],
		[0, 2],
		[1, 2],
		[1, 2],
		[central.length + nm.length, 4],
		[dirAt, 4],
		[0, 2],
	);
	return new Uint8Array([...local, ...nm, ...body, ...central, ...nm, ...end]);
}
