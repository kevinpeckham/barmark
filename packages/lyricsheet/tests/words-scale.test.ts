/**
 * A bar's words and a section's stacked verses are indexed once: no scan
 * of every word for each slot, nor of each bar's lyrics for each verse.
 */
import { describe, expect, test } from "bun:test";
import { exportLyricsheet } from "../src/index.js";

// The ratio is of best-of-two timings; the timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = 120_000;

/** One sung bar of `n` chords, a word before each. */
const wordsBar = (n: number) => `# T\n## A\n|${' "w" C'.repeat(n)} |\nlyrics: | la |\n`;

/** Two bars with `n` verses stacked on them. */
const stacked = (n: number) =>
	`# T\n## Verse\n| C | G |\n${Array.from({ length: n }, (_, i) => `lyrics ${i + 1}: | la${i} | la |\n`).join("")}`;

/** The best of two exports of `text`, in milliseconds, and the text the last one wrote. */
function timed(text: string): { ms: number; text: string } {
	let ms = Number.POSITIVE_INFINITY;
	let out = "";
	for (let run = 0; run < 2; run++) {
		const start = performance.now();
		const r = exportLyricsheet(text);
		ms = Math.min(ms, performance.now() - start);
		if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
		out = r.text;
	}
	return { ms, text: out };
}

describe("words and verses scale", () => {
	test(
		"a bar of 32,000 words costs sixteen times 2,000's, not 256",
		() => {
			timed(wordsBar(200));
			const small = timed(wordsBar(2000));
			const large = timed(wordsBar(32_000));
			expect(large.text.split("[*w]").length - 1).toBe(32_000);
			// Linear is 16 (the parse is most of it). A scan of the bar's words for each slot measures 50 or more.
			expect(large.ms / small.ms).toBeLessThan(30);
		},
		TIMEOUT,
	);

	test(
		"32,000 stacked verses cost sixteen times 2,000's, not 256",
		() => {
			timed(stacked(200));
			const small = timed(stacked(2000));
			const large = timed(stacked(32_000));
			expect(large.text.split("{start_of_verse").length - 1).toBe(32_000);
			// Linear is 16. A filter of each bar's lyrics for each verse measures 100 or more.
			expect(large.ms / small.ms).toBeLessThan(30);
		},
		TIMEOUT,
	);
});
