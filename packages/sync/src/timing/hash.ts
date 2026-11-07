import { type ChartParse, parseChart, printParsed } from "barmark";

const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/** The UTF-8 bytes of `text` (by hand: the build has no `TextEncoder` type). */
function utf8(text: string): number[] {
	const bytes: number[] = [];
	for (const ch of text) {
		// A lone surrogate is U+FFFD, as TextEncoder encodes it.
		let cp = ch.codePointAt(0) ?? 0xfffd;
		if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
		if (cp < 0x80) bytes.push(cp);
		else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
		else if (cp < 0x10000)
			bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
		else
			bytes.push(
				0xf0 | (cp >> 18),
				0x80 | ((cp >> 12) & 0x3f),
				0x80 | ((cp >> 6) & 0x3f),
				0x80 | (cp & 0x3f),
			);
	}
	return bytes;
}

/** FNV-1a 64 over the UTF-8 bytes of `text`, as 16 lowercase hex digits. */
export function fnv1a64(text: string): string {
	let h = OFFSET;
	for (const byte of utf8(text)) h = ((h ^ BigInt(byte)) * PRIME) & MASK;
	return h.toString(16).padStart(16, "0");
}

/**
 * The hash a timing map records for a chart: FNV-1a 64 of the chart's
 * canonical print, so formatting that the printer normalizes doesn't change it.
 * Pass `parse` if you already have `parseChart(text)`.
 */
export function chartHash(text: string, parse?: ChartParse): string {
	return fnv1a64(printParsed(text, parse ?? parseChart(text)));
}
