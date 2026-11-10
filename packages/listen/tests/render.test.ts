/**
 * The chart rendered as pads (design §10): the app's `renderChartPads`
 * tests rewritten as barmark text onto `renderWhole`, and the streamed
 * render, two passes in chunks, equal to the whole one bit for bit.
 */
import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { chartPadBars, type PadBar } from "../src/align/bars.js";
import { renderChartPads, renderLength, renderWhole } from "../src/align/render.js";
import { chromaFrameCount, chromagram } from "../src/features/chroma.js";
import { seeded } from "./helpers/seeded.js";

const RATE = 22050;
const RATES = [22050, 44100, 48000] as const;
const CHUNKS = [257, 4096, 65536] as const;
/** The streamed renders of 40 charts at three rates and three chunk sizes take a few seconds. */
const TIMEOUT = 120_000;

/** The chart's pad bars, failing the test on a refusal. */
function padBars(chart: string): PadBar[] {
	const r = chartPadBars(parseChart(chart), undefined);
	if (!r.ok) throw new Error(`refused: ${r.reason}`);
	return r.bars;
}

/** The loudest absolute sample from `from` to `to` seconds. */
const peakIn = (samples: Float32Array, from: number, to: number) => {
	let peak = 0;
	for (let i = Math.floor(from * RATE); i < Math.floor(to * RATE); i++)
		peak = Math.max(peak, Math.abs(samples[i] as number));
	return peak;
};

/**
 * The first index where `a` and `b` differ bit for bit (so -0 and 0
 * differ, as under `Object.is`, and so do two NaN payloads); -1 when none
 * does. The bytes are compared at once, and only a difference is looked for
 * sample by sample.
 */
function firstDifference(a: Float32Array, b: Float32Array): number {
	if (a.length !== b.length) return Math.min(a.length, b.length);
	const bytes = (x: Float32Array) => Buffer.from(x.buffer, x.byteOffset, x.byteLength);
	if (bytes(a).equals(bytes(b))) return -1;
	const [ua, ub] = [a, b].map((x) => new Uint32Array(x.buffer, x.byteOffset, x.length));
	for (let i = 0; i < a.length; i++) if (ua?.[i] !== ub?.[i]) return i;
	return -1;
}

describe("renderWhole: the app's renderChartPads", () => {
	test("bar starts follow each bar's tempo and meter; 6/8 counts eighths, as the song's changes do", () => {
		const bars = padBars(
			"tempo: 120\n| C |\ntime: 3/4, tempo: 60\n| G |\ntime: 6/8, tempo: 40\n| F |",
		);
		expect(bars.map((b) => b.seconds)).toEqual([2, 3, 3]);
		const { samples, barStarts } = renderWhole(bars, RATE);
		expect(barStarts).toEqual([0, 2, 5, 8]);
		expect(samples.length).toBe(8 * RATE);
		expect(renderLength(bars, RATE)).toBe(8 * RATE);
	});

	test("a held bar continues the chord before it; N.C. is silent, and holds its silence", () => {
		const held = renderWhole(padBars("tempo: 120\n| C | / |"), RATE).samples;
		expect(peakIn(held, 2.1, 3.9)).toBeGreaterThan(0.1);
		const silent = renderWhole(padBars("tempo: 120\n| C | N.C. | / |"), RATE).samples;
		expect(peakIn(silent, 2, 6)).toBe(0);
	});
});

/** A seeded chart: 2 to 40 bars in 4/4, 3/4 or 6/8 at 50 to 220, some [2/4] bars, holds and N.C. */
function seededChart(rand: () => number): string {
	const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)] as T;
	const CHORDS = ["C", "G7", "Am", "F#m7b5", "Bbmaj7/D", "E5", "Dsus4", "Ebdim7", "A13", "G/B"];
	const slot = () => (rand() < 0.15 ? "/" : rand() < 0.08 ? "N.C." : pick(CHORDS));
	const lines = [`time: ${pick(["4/4", "3/4", "6/8"])}, tempo: ${50 + Math.floor(rand() * 171)}`];
	const count = 2 + Math.floor(rand() * 39);
	const bars: string[] = [];
	for (let b = 0; b < count; b++) {
		const meter = rand() < 0.1 ? "[2/4] " : "";
		bars.push(`${meter}${Array.from({ length: 1 + Math.floor(rand() * 3) }, slot).join(" ")}`);
	}
	for (let b = 0; b < bars.length; b += 4) lines.push(`| ${bars.slice(b, b + 4).join(" | ")} |`);
	return `${lines.join("\n")}\n`;
}

const rand = seeded(11);
const CHARTS = Array.from({ length: 40 }, () => seededChart(rand));

/** Streams `chart` at `rate` in each of `chunks` and expects the whole render, bit for bit, with no chunk over its size and the same bar starts. */
function streamsWhole(c: number, chart: string, rate: number, chunks: readonly number[]): void {
	const bars = padBars(chart);
	const whole = renderWhole(bars, rate);
	expect(renderLength(bars, rate)).toBe(whole.samples.length);
	for (const chunk of chunks) {
		const out = new Float32Array(whole.samples.length);
		let at = 0;
		let tooLong = 0;
		const { barStarts } = renderChartPads(
			bars,
			rate,
			(part) => {
				if (part.length > chunk) tooLong++;
				out.set(part, at);
				at += part.length;
			},
			chunk,
		);
		const where = `chart ${c}, chunk ${chunk}`;
		expect([where, at, tooLong]).toEqual([where, whole.samples.length, 0]);
		expect([where, firstDifference(out, whole.samples)]).toEqual([where, -1]);
		expect(barStarts).toEqual(whole.barStarts);
	}
}

describe("the streamed render (design §10)", () => {
	test("the seeded charts read as charts of 2 to 40 bars", () => {
		const counts = CHARTS.map((c) => padBars(c).length);
		expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
		expect(Math.max(...counts)).toBeLessThanOrEqual(40);
	});

	for (const rate of RATES)
		test(
			`the windowed render equals the whole one bit for bit at ${rate} Hz`,
			() => {
				for (const [c, chart] of CHARTS.entries()) streamsWhole(c, chart, rate, CHUNKS);
			},
			TIMEOUT,
		);

	// A chunk of one sample streams every voice through every chunk boundary. It is the slowest
	// case by far, so it runs on four charts at one rate here; the bit-check script runs it on 400
	// random charts at 8 to 96 kHz against the app's own render.
	test("a chunk of one sample equals the whole render bit for bit", () => {
		for (const [c, chart] of CHARTS.slice(0, 4).entries()) streamsWhole(c, chart, RATE, [1]);
	});

	test("the default chunk is 65,536 samples", () => {
		const bars = padBars("time: 4/4, tempo: 60\n| C | G | Am | F |");
		const sizes: number[] = [];
		renderChartPads(bars, 44100, (part) => sizes.push(part.length));
		// 16 s at 44,100 Hz: ten whole chunks and the rest.
		expect(sizes).toEqual([...Array(10).fill(65536), 44100 * 16 - 10 * 65536]);
	});

	test("a chunk that is not a whole number of at least 1 takes the default", () => {
		const bars = padBars("time: 4/4, tempo: 60\n| C | G | Am | F |");
		// NaN first: unguarded, NaN streamed nothing, and 0 or less never finished.
		for (const chunk of [Number.NaN, 2.5, Number.POSITIVE_INFINITY, 0, -5]) {
			const sizes: number[] = [];
			renderChartPads(bars, 44100, (part) => sizes.push(part.length), chunk);
			expect([chunk, sizes]).toEqual([chunk, [...Array(10).fill(65536), 44100 * 16 - 10 * 65536]]);
		}
	});

	test(
		"the frame count from the bar seconds is the chromagram's of the whole render",
		() => {
			// Eight charts: the matrix above already pins renderLength to every chart's render, and
			// chroma.test.ts pins chromaFrameCount to chromagram on 200 seeded lengths and rates.
			for (const rate of RATES)
				for (const chart of CHARTS.slice(0, 8)) {
					const bars = padBars(chart);
					const { frames } = chromagram(renderWhole(bars, rate).samples, rate);
					expect(chromaFrameCount(renderLength(bars, rate), rate)).toBe(frames);
				}
		},
		TIMEOUT,
	);

	test("a silent chart streams zeros, unscaled", () => {
		const bars = padBars("tempo: 120\n| N.C. | / |");
		const out: number[] = [];
		renderChartPads(bars, RATE, (part) => out.push(...part), 4096);
		expect(out).toHaveLength(4 * RATE);
		expect(out.every((v) => Object.is(v, 0))).toBe(true);
	});
});
