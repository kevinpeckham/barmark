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
