import { expect, test } from "bun:test";
import { type ChartParse, parseChart, printChart } from "barmark";
import { chartFromDetections } from "../src/build/build.js";
import type { BuildResult } from "../src/build/types.js";
import { checkTimingMap, type TimingMap } from "../src/timing/index.js";
import { fuzzDetections, mulberry32 } from "./helpers/fuzz.js";

/** Each case builds, parses, prints and checks; 2,000 of them took ~7 s, over the suite's budget, so 700 (about 2.5 s). */
const CASES = 700;

type Built = { r: BuildResult; parse: ChartParse };
type Check = (b: Built) => string | null;

const CHECKS: Check[] = [
	({ parse }) =>
		parse.diagnostics.some((x) => x.severity === "error") ? "the chart has an error" : null,
	({ r }) => (printChart(r.chart) === r.chart ? null : "the chart is not canonical"),
	({ parse }) => (parse.bars[0]?.slots[0]?.kind === "hold" ? "the first slot is a hold" : null),
	// A section restates its chord rather than holding the one before it.
	({ parse }) => {
		const held = parse.sections.find(
			(s) => parse.bars.find((b) => b.index === s.firstBar)?.slots[0]?.kind === "hold",
		);
		return held ? `the first slot of "${held.name}" is a hold` : null;
	},
	({ parse }) => (parse.sections.some((s) => s.firstBar === null) ? "a heading has no bar" : null),
	({ r }) => (r.timing && r.confidence ? null : "a record is missing"),
	({ r }) => {
		const found = checkTimingMap(r.timing as TimingMap, { text: r.chart }).diagnostics[0];
		return found ? `the timing map is flagged: ${found.message}` : null;
	},
	({ r, parse }) =>
		r.timing?.bars.length === parse.bars.length ? null : "timing bars differ from the chart's",
	({ r, parse }) =>
		r.confidence?.bars.length === parse.bars.length
			? null
			: "confidence bars differ from the chart's",
	({ r, parse }) => {
		const bar = r.confidence?.bars.findIndex(
			(c, i) => c.slots.length !== parse.bars[i]?.slots.length,
		);
		return bar === undefined || bar < 0 ? null : `confidence slots differ in bar ${bar + 1}`;
	},
];

/** The first thing wrong with the build for this seed, or null. */
function problem(seed: number): string | null {
	const r = chartFromDetections(fuzzDetections(mulberry32(seed)));
	if (r.chart === "")
		return r.timing === null && r.confidence === null ? null : "empty chart with a record";
	const built = { r, parse: parseChart(r.chart) };
	for (const check of CHECKS) {
		const found = check(built);
		if (found) return found;
	}
	return null;
}

test(`${CASES} seeded cases keep every invariant`, () => {
	const failures: string[] = [];
	for (let seed = 1; seed <= CASES; seed++) {
		try {
			const found = problem(seed);
			if (found) failures.push(`seed ${seed}: ${found}`);
		} catch (e) {
			failures.push(`seed ${seed}: threw ${e instanceof Error ? e.message : String(e)}`);
		}
		if (failures.length >= 5) break;
	}
	expect(failures).toEqual([]);
}, 30_000);

/** Chords before the first bar and after the last, the one before sometimes reaching into the bars, beside a run that fills them. */
function outside(seed: number) {
	const rand = mulberry32(seed);
	const side = () => ({
		lost: [0, 0.25, 0.5, 1.25][Math.floor(rand() * 4)] as number,
		label: rand() < 0.3 ? "N" : "F#:min7",
	});
	const before = side();
	const after = side();
	const reach = rand() < 0.5 ? 0.25 : 0;
	// Bars of 2 s in 4/4 (a beat is 0.5 s) from 4 s to 12 s; every number is exact in binary.
	const runs = [{ start: 4, end: 12, label: "C:maj" }];
	if (before.lost > 0) runs.push({ start: 4 - before.lost, end: 4 + reach, label: before.label });
	if (after.lost > 0) runs.push({ start: 12, end: 12 + after.lost, label: after.label });
	const chords = { runs };
	const r = chartFromDetections({ grid: { bars: [4, 6, 8, 10, 12] }, meter: "4/4", chords });
	return { r, before, after };
}

test("chords outside the bars are cut, and a beat or more lost is reported", () => {
	for (let seed = 1; seed <= 200; seed++) {
		const { r, before, after } = outside(seed);
		const warned = r.diagnostics.filter((d) => d.code === "outside-bars").length;
		// N.C. is not reported; anything else only once a side has lost a whole beat.
		const expected = [before, after].filter((x) => x.label !== "N" && x.lost >= 0.5).length;
		expect({ seed, chart: r.chart.includes("F#m7") }).toEqual({ seed, chart: false });
		expect({ seed, warned }).toEqual({ seed, warned: expected });
	}
});
