/** The define block takes time linear in the chords written: no search of the names or lines so far for each one. */
import { expect, test } from "bun:test";
import { parseChart, parseChord } from "barmark";
import { defineLines } from "../src/export/defines.js";
import { Losses } from "../src/export/losses.js";
import type { Use } from "../src/export/types.js";
import { distinctNames } from "./names.js";

/** `count` distinct chords, each used five times, the uses interleaved. */
function usesOf(count: number): Use[] {
	const bar = parseChart("| C |").bars[0];
	if (!bar) throw new Error("no bar");
	const chords = distinctNames()
		.slice(0, count)
		.map((n) => {
			const c = parseChord(n);
			if (!c.ok) throw new Error(n);
			return c.value;
		});
	return Array.from({ length: 5 }, (_, round) =>
		chords.map((chord, i) => ({
			chord: chords[(i + round * 7) % chords.length] ?? chord,
			voicing: null,
			bar,
		})),
	).flat();
}

/** The fastest of two runs, in milliseconds, and the lines the last one gave. */
function best(uses: Use[]): { ms: number; lines: string[] } {
	let ms = Number.POSITIVE_INFINITY;
	let lines: string[] = [];
	for (let run = 0; run < 2; run++) {
		const start = performance.now();
		lines = defineLines(uses, { lines: [], losses: new Losses() });
		ms = Math.min(ms, performance.now() - start);
	}
	return { ms, lines };
}

test("20,000 distinct names (100,000 uses) cost four times 5,000's, not sixteen", () => {
	const small = usesOf(5000);
	const large = usesOf(20_000);
	defineLines(usesOf(500), { lines: [], losses: new Losses() });
	const [a, b] = [best(small), best(large)];
	// Each name once, in the order first used; some have no shape.
	expect(new Set(b.lines).size).toBe(b.lines.length);
	expect(b.lines.length).toBeGreaterThan(10_000);
	// Linear is 4. An `entries.find` for each use, or a search of the lines so far for each name, measures 10 or more.
	expect(b.ms / a.ms).toBeLessThan(7);
}, 120_000);
