/**
 * Equivalence with the app's tracker grid (design §10): `gridFromBeats`
 * against the golden `scripts/listen-beats-equivalence.ts` wrote from the
 * app's own `trackerBarGrid` and `beatThisGrid` (stem-shovel, the commit
 * the golden records). Values must match exactly. The pickup is not
 * compared: the app has none (design §9).
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gridFromBeats } from "../src/beats/grid.js";
import { BEATS_CASES, type BeatsCase } from "./helpers/beats-cases.js";
import { fromGoldenJson } from "./helpers/equivalence.js";

type AppGrid = { bars: number[]; meter: string; barSeconds: number };
type AppLabel = {
	tempo: number;
	beatsPerBar: number;
	meter: string;
	chartTempo: number;
	counts: Record<number, number>;
};
type BeatsGolden = {
	app: { commit: string };
	cases: {
		name: string;
		input: { beats: number[]; downbeats: number[]; duration: number };
		app: { grid: AppGrid | null; label: AppLabel };
	}[];
};

const golden = fromGoldenJson(
	readFileSync(new URL("./fixtures/beats/equivalence.json", import.meta.url), "utf8"),
) as BeatsGolden;

test("the golden: one entry per case, from one app commit", () => {
	expect(golden.app.commit).toMatch(/^[0-9a-f]{40}$/);
	expect(golden.cases.map((c) => c.name)).toEqual(BEATS_CASES.map((c) => c.name));
	for (const [i, c] of golden.cases.entries())
		expect(c.input).toEqual((BEATS_CASES[i] as BeatsCase).input);
});

test("the golden is not vacuous: some app nulls, at least ten app grids", () => {
	expect(golden.cases.filter((c) => c.app.grid === null).length).toBeGreaterThanOrEqual(1);
	expect(golden.cases.filter((c) => c.app.grid !== null).length).toBeGreaterThanOrEqual(10);
});

for (const c of golden.cases)
	test(`${c.name}: the app's grid`, () => {
		const r = gridFromBeats(c.input);
		if (c.app.grid === null) {
			expect(r.ok).toBe(false);
			if (!r.ok)
				expect(["too-few-bars", "bars-unsteady"]).toContain(r.refusals[0]?.reason as string);
			return;
		}
		if (!r.ok) throw new Error(`${c.name}: refused`);
		expect(r.value.grid.bars).toEqual(c.app.grid.bars);
		expect(r.value.meter).toBe(c.app.grid.meter as typeof r.value.meter);
		expect(r.value.reading.barSeconds).toBe(c.app.grid.barSeconds);
		expect(r.value.reading.beatTempo).toBe(c.app.label.tempo);
		expect(r.value.reading.tempo).toBe(c.app.label.chartTempo);
		expect(r.value.reading.beatsPerBar).toBe(c.app.label.beatsPerBar);
		expect(r.value.reading.counts).toEqual(c.app.label.counts);
	});
