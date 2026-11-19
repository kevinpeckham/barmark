/** A long chart exports in time linear in its length. */
import { describe, expect, test } from "bun:test";
import { exportLyricsheet, type LyricsheetOptions } from "../src/index.js";

// The ratio is of best-of-three timings; the timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = 60_000;

const CHORDS = ["C", "F", "G7", "Am", "Dm7", "Em", "Bb", "E7"];

/** `bars` bars of four chords each, in lines of four; sung (a word on every chord) or with no words. */
function chart(bars: number, sung: boolean): string {
	const out = ["# Scale", "key: C, time: 4/4", "", "## Verse"];
	for (let b = 0; b < bars; b += 4) {
		const row: string[] = [];
		const words: string[] = [];
		for (let i = 0; i < Math.min(4, bars - b); i++) {
			const chord = (k: number) => CHORDS[(b + i + k) % CHORDS.length];
			row.push(` ${chord(0)} ${chord(1)} ${chord(2)} ${chord(3)} `);
			words.push(" la la la la ");
		}
		out.push(`|${row.join("|")}|`);
		if (sung) out.push(`lyrics: |${words.join("|")}|`);
	}
	return `${out.join("\n")}\n`;
}

/** The best of three exports of `text`, after one to warm up, and the text the last one wrote. */
function timed(text: string, options: LyricsheetOptions): { ms: number; text: string } {
	exportLyricsheet(chart(4, true), options);
	let ms = Number.POSITIVE_INFINITY;
	let out = "";
	for (let run = 0; run < 3; run++) {
		const start = performance.now();
		const r = exportLyricsheet(text, options);
		ms = Math.min(ms, performance.now() - start);
		if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
		out = r.text;
	}
	return { ms, text: out };
}

describe("a 1,000-bar chart exports in linear time", () => {
	const variants: [string, boolean, LyricsheetOptions][] = [
		["sung", true, {}],
		["with no words", false, {}],
		["with diagrams", true, { diagrams: "guitar" }],
	];
	for (const [name, sung, options] of variants)
		test(
			name,
			() => {
				const small = timed(chart(100, sung), options);
				const large = timed(chart(1000, sung), options);
				// Every bar is written: four chords each, and a define for each of the eight names.
				const body = large.text.split("\n").filter((l) => l.includes(sung ? "[" : "|"));
				expect(body.length).toBeGreaterThanOrEqual(250);
				expect(large.text.includes("{define:")).toBe(options.diagrams !== undefined);
				// Ten times the bars, at most twenty times as long.
				expect(large.ms / small.ms).toBeLessThan(20);
			},
			TIMEOUT,
		);
});
