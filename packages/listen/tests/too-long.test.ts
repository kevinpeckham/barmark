/**
 * `too-long` comes first (design §10): the cell count is reckoned from the
 * bar seconds alone and checked before the chart is rendered or the step
 * table allocated, so a long song refuses at once.
 */
import { describe, expect, mock, test } from "bun:test";
import { parseChart } from "barmark";
import { chartPadBars, type PadBar } from "../src/align/bars.js";
import * as render from "../src/align/render.js";
import { chromaFrameCount } from "../src/features/chroma.js";
import { resolveOptions } from "../src/options.js";
import { featuresOf } from "./helpers/features.js";

// The spy delegates to the real render, captured before the mock, so any
// file that imports the module after this one still renders.
const real = { ...render };
let renders = 0;
/** Set where a render would be the bug: the spy throws instead of rendering hours of audio. */
let forbid = false;
mock.module("../src/align/render.js", () => ({
	...real,
	renderChartPads: (...args: Parameters<typeof real.renderChartPads>) => {
		renders++;
		if (forbid) throw new Error("rendered a chart that cannot fit");
		return real.renderChartPads(...args);
	},
}));
const { alignPath } = await import("../src/align/path.js");

/** `bars` bars in 4/4 at `tempo` (120 unless given: two seconds a bar). */
function chartOf(bars: number, tempo = 120): PadBar[] {
	const lines = [`time: 4/4, tempo: ${tempo}`];
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
		// The step table's cells, (n + 1)(m + 1): what dtwTable allocates.
		expect(detail.cells).toBe(
			((detail.chartFrames as number) + 1) * ((detail.recordingFrames as number) + 1),
		);
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

	test("the cells counted are the step table's, (n + 1)(m + 1), not n × m", () => {
		const bars = chartOf(4); // 8 s
		const features = featuresOf({ duration: 10 });
		const n = chromaFrameCount(8 * 22050, 22050);
		const m = features.frames;
		renders = 0;
		const r = alignPath(bars, features, settingsOf({ DTW_MAX_CELLS: n * m }));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.refusals[0]?.detail?.cells).toBe((n + 1) * (m + 1));
		expect(renders).toBe(0);
	});

	test("a 10,000-bar chart at 20 against a one-second recording refuses in under 50 ms, never rendering", () => {
		// 12 s a bar: 33 hours of chart, about 1.3 M chroma frames against 9, under the cell limit.
		const bars = chartOf(10_000, 20);
		const features = featuresOf({ duration: 1 });
		renders = 0;
		forbid = true;
		const start = Bun.nanoseconds();
		const r = (() => {
			try {
				return alignPath(bars, features, settingsOf({}));
			} finally {
				forbid = false;
			}
		})();
		const ms = (Bun.nanoseconds() - start) / 1e6;
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.refusals.map((x) => x.reason)).toEqual(["chart-too-long"]);
			expect(r.refusals[0]?.detail).toEqual({ chartSeconds: 120_000, recordingSeconds: 1 });
		}
		expect(ms).toBeLessThan(50);
		expect(renders).toBe(0);
	});

	test("the spy sees the render when the case fits", () => {
		renders = 0;
		alignPath(chartOf(4), featuresOf({ duration: 10 }), settingsOf({}));
		expect(renders).toBe(1);
	});
});
