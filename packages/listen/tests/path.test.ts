/**
 * The alignment path and its re-phase (design §6.3): the app's `alignChart`
 * tests of `audio/chartAlignment.test.ts`, ported onto `alignPath` and
 * `rephaseAlignment`, the charts as barmark text; its "nothing to align"
 * errors now as refusals; and a silent recording's flat envelope.
 */
import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { chartPadBars, type PadBar } from "../src/align/bars.js";
import { alignPath, type PathResult } from "../src/align/path.js";
import { renderWhole } from "../src/align/render.js";
import { rephaseAlignment } from "../src/align/rephase.js";
import { type Features, recordingFeatures } from "../src/features/index.js";
import { DEFAULTS } from "../src/options.js";
import { seeded } from "./helpers/seeded.js";

const RATE = 22050;
const PROGRESSION = ["D", "A", "Bm", "G", "Em", "F#m", "C", "E7", "Dsus4", "Am", "Bb", "F"];

/** Every bar a new chord, twice through the progression, in 4/4 at `bpm`: a boundary between two bars of one chord is invisible to chroma, and no test of placement. */
function barsAt(bpm: number): PadBar[] {
	const bars = [...PROGRESSION, ...PROGRESSION];
	const lines = [`time: 4/4, tempo: ${bpm}`];
	for (let b = 0; b < bars.length; b += 4) lines.push(`| ${bars.slice(b, b + 4).join(" | ")} |`);
	const r = chartPadBars(parseChart(lines.join("\n")), undefined);
	if (!r.ok) throw new Error(`refused: ${r.reason}`);
	return r.bars;
}

/** The recording's features, failing the test on a refusal. */
function featuresOf(samples: Float32Array): Features {
	const r = recordingFeatures(samples, RATE);
	if (!r.ok) throw new Error(`refused: ${r.refusals[0]?.reason}`);
	return r.value;
}

/** The path, failing the test on a refusal. */
function pathOf(bars: PadBar[], features: Features): PathResult {
	const r = alignPath(bars, features, DEFAULTS);
	if (!r.ok) throw new Error(`refused: ${r.refusals.map((x) => x.reason).join(", ")}`);
	return r.value;
}

const truth = renderWhole(barsAt(120), RATE);
const features = featuresOf(truth.samples);
const path = pathOf(barsAt(108), features);
const { alignment, flat } = rephaseAlignment(path, features, DEFAULTS);

describe("alignPath and rephaseAlignment: the app's alignChart", () => {
	test("a chart declared 10 % slow still puts every path bar start within a hop of its true time", () => {
		expect(alignment.rawBarStarts).toHaveLength(truth.barStarts.length);
		const errors = alignment.rawBarStarts
			.slice(0, -1)
			.map((at, i) => Math.abs(at - (truth.barStarts[i] as number)));
		// The path moves a frame at a time, so a boundary lands within a hop of where it is; one bar
		// here lands 0.4 ms past it (1.004 hops), hence the tenth of a hop of slack.
		for (const error of errors) expect(error).toBeLessThanOrEqual(1.1 * alignment.hopSec);
		expect(errors.reduce((a, b) => a + b, 0) / errors.length).toBeLessThan(alignment.hopSec / 2);
		expect(alignment.localCost).toHaveLength(barsAt(108).length);
	});

	test("the tritone control costs at least twice the right chart", () => {
		expect(alignment.controlCost).toBeGreaterThanOrEqual(2 * alignment.cost);
		expect(alignment.controlCost).toBeGreaterThan(0.1);
	});

	test("the ratio, the local median and the same-piece gate follow from the costs (§6.3)", () => {
		expect(alignment.ratio).toBe(alignment.controlCost / Math.max(alignment.cost, 1e-6));
		const sorted = alignment.localCost.toSorted((a, b) => a - b);
		expect(alignment.localMedian).toBe(
			((sorted[11] as number) + (sorted[12] as number)) / 2, // 24 bars: the two middle ones
		);
		expect(alignment.samePiece).toBe(
			alignment.ratio >= DEFAULTS.ALIGNMENT_SAME_PIECE_RATIO &&
				alignment.localMedian <= DEFAULTS.ALIGNMENT_SAME_PIECE_LOCAL_COST,
		);
		expect(alignment.samePiece).toBe(true);
		expect([alignment.chartBar, path.chartBar]).toEqual([(4 * 60) / 108, (4 * 60) / 108]);
		expect([alignment.beatsPerBar, path.beatsPerBar]).toEqual([4, 4]);
	});

	test("the recording's first and last sound come with the alignment", () => {
		expect(alignment.firstSound).toBeLessThanOrEqual(0.05);
		expect(Math.abs(alignment.lastSound - truth.samples.length / RATE)).toBeLessThanOrEqual(0.05);
	});

	test("the grid re-phase finds the recording's bar from the 10 % slow declaration and, the path being clean, keeps every start on it", () => {
		expect(flat).toBe(false);
		const repair = alignment.repair;
		if (repair === null) throw new Error("the re-phase refused");
		expect(Math.abs(repair.period - 2) / 2).toBeLessThan(0.005);
		expect(repair.rephased).toBe(0);
		expect(repair.confidence).toHaveLength(alignment.barStarts.length);
		expect(repair.confidence.every((c) => c === "aligned")).toBe(true);
		// The onset envelope reads a hard onset about 70 ms early (ONSET_ENVELOPE_LEAD_SEC); with
		// the lead added back the slid line sits on the pads: every start within 25 ms of the truth
		// and the mean signed error within 15 ms, where the uncorrected line sat 70 ms early.
		expect(alignment.barStarts).toHaveLength(truth.barStarts.length);
		const signed = alignment.barStarts
			.slice(0, -1)
			.map((t, i) => t - (truth.barStarts[i] as number));
		for (const e of signed) expect(Math.abs(e)).toBeLessThanOrEqual(0.025);
		expect(Math.abs(signed.reduce((a, b) => a + b, 0) / signed.length)).toBeLessThanOrEqual(0.015);
	});

	test("a path whose bar starts sit 0.1 s off the pads comes back re-phased, delta 0.1 s more negative, on the same line", () => {
		const at120 = pathOf(barsAt(120), features);
		const withStarts = (starts: number[]) =>
			rephaseAlignment(
				{ ...at120, alignment: { ...at120.alignment, barStarts: starts, rawBarStarts: starts } },
				features,
				DEFAULTS,
			).alignment;
		// The reference: the true bar starts re-phased, which lands on the envelope's stamp of the pads.
		const onPads = withStarts([...truth.barStarts]);
		const late = withStarts(truth.barStarts.map((t) => t + 0.1));
		if (onPads.repair === null || late.repair === null) throw new Error("the re-phase refused");
		expect(Math.abs(late.repair.delta - onPads.repair.delta + 0.1)).toBeLessThanOrEqual(0.02);
		for (const [i, t] of late.barStarts.entries())
			expect(Math.abs(t - (onPads.barStarts[i] as number))).toBeLessThanOrEqual(0.02);
	});

	test("nothing to align, or a chart that cannot fit, is a refusal with a reason", () => {
		// Under one chroma window (4,096 samples at 22,050 Hz): no frame.
		const rand = seeded(3);
		const short = featuresOf(Float32Array.from({ length: 4000 }, () => 0.2 * (rand() * 2 - 1)));
		const tooShort = alignPath(barsAt(120), short, DEFAULTS);
		expect(tooShort.ok).toBe(false);
		if (!tooShort.ok) expect(tooShort.refusals.map((r) => r.reason)).toEqual(["too-short"]);
		// 24 bars at 40 run 144 s, three times the 48 s recording.
		const tooLong = alignPath(barsAt(40), features, DEFAULTS);
		expect(tooLong.ok).toBe(false);
		if (!tooLong.ok) {
			expect(tooLong.refusals.map((r) => r.reason)).toEqual(["chart-too-long"]);
			expect(tooLong.refusals[0]?.message).toContain("twice as long");
		}
	});
});

describe("rephaseAlignment on a silent envelope", () => {
	test("an all-zero onset is flat: no re-phase, the path's starts kept", () => {
		const silent = { ...features, onset: new Float32Array(features.onset.length) };
		const r = rephaseAlignment(path, silent, DEFAULTS);
		expect(r.flat).toBe(true);
		expect(r.alignment.repair).toBeNull();
		expect(r.alignment.barStarts).toEqual(path.alignment.rawBarStarts);
	});
});
