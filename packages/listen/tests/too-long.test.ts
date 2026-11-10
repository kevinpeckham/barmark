/**
 * `too-long` comes first (design §10): the cell count is reckoned from the
 * bar seconds alone and checked before the chart is rendered or the step
 * table allocated, so a long song refuses at once.
 */
import { describe, expect, mock, test } from "bun:test";
import { parseChart } from "barmark";
import { chartPadBars, type PadBar } from "../src/align/bars.js";
import * as render from "../src/align/render.js";
import { resolveOptions } from "../src/options.js";
import { featuresOf } from "./helpers/features.js";

// The spy delegates to the real render, captured before the mock, so any
// file that imports the module after this one still renders.
const real = { ...render };
let renders = 0;
mock.module("../src/align/render.js", () => ({
	...real,
	renderChartPads: (...args: Parameters<typeof real.renderChartPads>) => {
		renders++;
		return real.renderChartPads(...args);
	},
}));
const { alignPath } = await import("../src/align/path.js");

/** `bars` bars of C in 4/4 at 120: two seconds each. */
function chartOf(bars: number): PadBar[] {
	const lines = ["time: 4/4, tempo: 120"];
	for (let b = 0; b < bars; b += 4) lines.push("| C | G | Am | F |");
	const r = chartPadBars(parseChart(lines.join("\n")), undefined);
	if (!r.ok) throw new Error(`refused: ${r.reason}`);
	return r.bars;
}

/** The settings with `options` over the defaults. */
function settingsOf(options: object) {
	const r = resolveOptions(options, "listen");
	if (!r.ok) throw new Error("bad options");
	return r.value.settings;
}

describe("too-long, before any render", () => {
	test("a 20-minute chart against a 20-minute recording refuses in under 50 ms, never rendering", () => {
		const bars = chartOf(600);
		const features = featuresOf({ duration: 20 * 60 });
		const settings = settingsOf({});
		renders = 0;
		const start = Bun.nanoseconds();
		const r = alignPath(bars, features, settings);
		const ms = (Bun.nanoseconds() - start) / 1e6;
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.refusals.map((x) => x.reason)).toEqual(["too-long"]);
		const detail = r.refusals[0]?.detail ?? {};
		expect(detail.cells).toBeGreaterThan(150_000_000);
		expect(detail.limit).toBe(150_000_000);
		expect(detail.cells).toBe((detail.chartFrames as number) * (detail.recordingFrames as number));
		expect(detail.recordingFrames).toBe(features.frames);
		expect(ms).toBeLessThan(50);
		expect(renders).toBe(0);
	});

	test("DTW_MAX_CELLS: 1,000 refuses a 10 s case at once", () => {
		const bars = chartOf(4); // 8 s
		const features = featuresOf({ duration: 10 });
		renders = 0;
		const r = alignPath(bars, features, settingsOf({ DTW_MAX_CELLS: 1_000 }));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.refusals.map((x) => x.reason)).toEqual(["too-long"]);
			expect(r.refusals[0]?.detail?.limit).toBe(1_000);
		}
		expect(renders).toBe(0);
	});

	test("the spy sees the render when the case fits", () => {
		renders = 0;
		alignPath(chartOf(4), featuresOf({ duration: 10 }), settingsOf({}));
		expect(renders).toBe(1);
	});
});
