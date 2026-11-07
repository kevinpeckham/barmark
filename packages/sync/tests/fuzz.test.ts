import { expect, test } from "bun:test";
import { type ChartParse, type Line, parseChart, printChart } from "barmark";
import { chartFromDetections } from "../src/build/build.js";
import type { BuildResult, Detections } from "../src/build/types.js";
import { checkTimingMap, type TimingMap } from "../src/timing/index.js";
import { soundingByBeat } from "./helpers/fromChart.js";
import { fuzzDetections, mulberry32 } from "./helpers/fuzz.js";

/** Each case builds, parses, prints and checks; 2,000 of them took ~7 s, over the suite's budget, so 700 (about 2.5 s). */
const CASES = 700;

type Built = { r: BuildResult; parse: ChartParse };
type Check = (b: Built) => string | null;

const isDirectiveOfNote = (line: Line) =>
	line.kind === "directive" && !!(line.set.key || line.set.time || line.set.tempo);
const firstBarCell = (line: Line) =>
	line.kind === "bars"
		? line.cells.find((c) => c.kind === "slots" || c.kind === "simile")
		: undefined;

/** A bar after a key, meter or tempo line is never written `%`. */
function percentAfterDirective(parse: ChartParse): string | null {
	let changed = false;
	for (const line of parse.lines) {
		if (line.kind === "bars") {
			if (changed && firstBarCell(line)?.kind === "simile")
				return `a % follows a directive on line ${line.line}`;
			changed = false;
		} else changed ||= isDirectiveOfNote(line);
	}
	return null;
}

/** No `%` follows a bar with an unknown slot (Kevin's decision, 2026-11-07). */
function percentAfterUnknown(chart: string): string | null {
	const cells = chart
		.split("\n")
		.filter((l) => l.startsWith("|"))
		.flatMap((l) =>
			l
				.split("|")
				.slice(1, -1)
				.map((c) => c.trim()),
		);
	const at = cells.findIndex((c, i) => c === "%" && cells[i - 1]?.includes("?"));
	return at < 0 ? null : `bar ${at + 1} is a % of a bar with a ?`;
}

/** Whether slot `k` of played bar `i` is written `?`. */
const isUnknown = (parse: ChartParse, i: number, k: number) =>
	parse.bars[i]?.slots[k]?.kind === "unknown";

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
	({ parse }) => percentAfterDirective(parse),
	({ r }) => percentAfterUnknown(r.chart),
	({ r }) => (r.timing && r.confidence ? null : "a record is missing"),
	({ r, parse }) => {
		const c = r.confidence;
		const bad = c?.bars.some(
			(bar, i) =>
				bar.slots.some((v, k) => !(v >= 0 && v <= 1) || (v > 0 && isUnknown(parse, i, k))) ||
				!(bar.confidence >= 0 && bar.confidence <= 1),
		);
		return bad ? "a confidence is outside 0..1, or a ? slot has some" : null;
	},
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

/** The chords sounding on each beat and every slot's confidence, whatever way the chart spells them. */
function hearing(d: Detections) {
	const r = chartFromDetections(d);
	return {
		sounding: r.chart === "" ? [] : soundingByBeat(parseChart(r.chart)),
		confidence: r.confidence?.bars.map((b) => b.slots),
	};
}

/** Eight bars of 2 s and a few long, overlapping runs of four chords, some with a confidence. */
function overlapping(seed: number): Detections {
	const rand = mulberry32(seed);
	const labels = ["C:maj", "A:maj", "F:maj", "G:maj"];
	const runs = Array.from({ length: 2 + Math.floor(rand() * 6) }, () => {
		const start = Math.floor(rand() * 28) / 2;
		return {
			start,
			end: start + 0.5 + Math.floor(rand() * 20) / 2,
			label: labels[Math.floor(rand() * 4)] as string,
			...(rand() < 0.4 ? { confidence: Math.floor(rand() * 10) / 10 } : {}),
		};
	});
	return {
		grid: { bars: [0, 2, 4, 6, 8, 10, 12, 14, 16] },
		meter: "4/4",
		key: "C major",
		chords: { runs },
	};
}

test("a key change that respells nothing never changes what sounds", () => {
	const failures: number[] = [];
	for (let seed = 1; seed <= 300; seed++) {
		const bare = overlapping(seed);
		const bar = 1 + (seed % 7);
		const turned = {
			...bare,
			changes: [{ kind: "key" as const, start: bar * 2, value: "G major" }],
		};
		if (JSON.stringify(hearing(turned)) !== JSON.stringify(hearing(bare))) failures.push(seed);
	}
	expect(failures).toEqual([]);
});
