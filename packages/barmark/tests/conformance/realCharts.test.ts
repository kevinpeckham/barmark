import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Key } from "../../src/chart/types.js";
import { parseChart } from "../../src/index.js";
import { barText } from "../chart/fixtures.js";

/**
 * Conformance: the four public Badverbs charts, exactly as stored in Stem
 * Shovel, against expectations derived OUTSIDE this parser — the band's
 * declared section starts on their recordings and stem-bench's verified
 * bar lists (Study 16; see README.md in this directory). A change that
 * alters what one of these charts MEANS fails here before it ships.
 */

interface ExpectedSection {
	name: string;
	bars: number;
	first: string;
	key?: string;
}
interface Expected {
	key: string;
	tempo: number;
	meter: string;
	barCount: number;
	sections: ExpectedSection[];
}

const SLUGS = ["letter-lands", "peaceful-dreams", "eat-all-the-clocks", "mop-heart"];
const fixturesDir = join(import.meta.dir, "fixtures");
const keyText = (k: Key | null) => (k ? `${k.tonic} ${k.mode}` : null);

describe("conformance: the Badverbs charts read to their band-declared truth", () => {
	for (const slug of SLUGS) {
		test(slug, () => {
			const text = readFileSync(join(fixturesDir, `${slug}.chart.md`), "utf8");
			const expected: Expected = JSON.parse(
				readFileSync(join(fixturesDir, `${slug}.expected.json`), "utf8"),
			);
			const parse = parseChart(text);
			expect(parse.diagnostics).toEqual([]);
			expect(parse.bars).toHaveLength(expected.barCount);
			const first = parse.bars[0];
			if (!first) throw new Error("no bars");
			expect(keyText(first.key)).toBe(expected.key);
			expect(first.tempo).toBe(expected.tempo);
			expect(`${first.meter.n}/${first.meter.d}`).toBe(expected.meter);

			const starts = parse.sections.filter((s) => s.firstBar !== null);
			expect(starts.map((s) => s.name)).toEqual(expected.sections.map((s) => s.name));
			for (const [k, start] of starts.entries()) {
				const want = expected.sections[k];
				if (!want || start.firstBar === null) throw new Error("unreachable");
				const next = starts[k + 1]?.firstBar ?? parse.bars.length + 1;
				expect(next - start.firstBar).toBe(want.bars);
				const bar = parse.bars[start.firstBar - 1];
				if (!bar) throw new Error(`no bar at ${start.firstBar}`);
				expect(bar.index).toBe(start.firstBar);
				expect(barText(bar)).toBe(want.first);
				if (want.key) expect(keyText(bar.key)).toBe(want.key);
			}
		});
	}
});
