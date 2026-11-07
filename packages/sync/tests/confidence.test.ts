import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { chartFromDetections } from "../src/build/build.js";
import type { Detections } from "../src/build/types.js";

type Run = { start: number; end: number; symbol: string; confidence?: number };
const run = (start: number, end: number, symbol: string, confidence?: number): Run =>
	confidence === undefined ? { start, end, symbol } : { start, end, symbol, confidence };

const build = (bars: number[], runs: Run[], extra: Partial<Detections> = {}) =>
	chartFromDetections({ grid: { bars }, meter: "4/4", chords: { runs }, ...extra });

const near = (got: number[] | undefined, want: number[]) => {
	expect(got).toHaveLength(want.length);
	for (const [i, w] of want.entries()) expect(got?.[i]).toBeCloseTo(w, 9);
};

describe("slots and bars", () => {
	test("agreement times detector confidence", () => {
		const r = build([0, 2], [run(0, 1, "C", 0.8), run(1, 2, "G")]);
		expect(r.chart).toContain("| C G |");
		const bar = r.confidence?.bars[0];
		near(bar?.slots, [0.8, 1]);
		expect(bar?.bar).toBe(1);
		expect(bar?.confidence).toBeCloseTo(0.9, 9);
	});

	test("disagreement lowers agreement", () => {
		const r = chartFromDetections({
			grid: { bars: [0, 2] },
			meter: "2/4",
			chords: { runs: [run(0, 1.3, "C"), run(1.3, 2, "G")] },
		});
		expect(r.chart).toContain("| C G |");
		const bar = r.confidence?.bars[0];
		near(bar?.slots, [1, 0.7]);
		expect(bar?.confidence).toBeCloseTo(0.85, 9);
	});

	test("a slot the printer merged takes its span", () => {
		const r = build([0, 2], [run(0, 0.9, "C"), run(0.9, 2, "G")]);
		expect(r.chart).toContain("| C G |");
		near(r.confidence?.bars[0]?.slots, [0.9, 1]);
	});

	test("a hold counts as the chord it holds", () => {
		const r = build([0, 2, 4], [run(0, 4, "C")]);
		expect(r.chart).toContain("| C | / |");
		near(r.confidence?.bars[1]?.slots, [1]);
	});

	test("? is 0", () => {
		const r = build([0, 2, 4], [run(2, 4, "C", 0.5)]);
		expect(r.chart).toContain("| ? | C |");
		const bar = r.confidence?.bars[0];
		near(bar?.slots, [0]);
		expect(bar?.confidence).toBe(0);
		near(r.confidence?.bars[1]?.slots, [0.5]);
	});

	test("a % bar has its own values", () => {
		const runs = [run(0, 1, "C", 1), run(1, 2, "G", 1), run(2, 3, "C", 0.5), run(3, 4, "G", 0.25)];
		const r = build([0, 2, 4], runs);
		expect(r.chart).toContain("| C G | % |");
		near(r.confidence?.bars[0]?.slots, [1, 1]);
		near(r.confidence?.bars[1]?.slots, [0.5, 0.25]);
	});

	test("run confidence is clamped", () => {
		const r = build([0, 2], [run(0, 1, "C", 1.5), run(1, 2, "G", -1)]);
		near(r.confidence?.bars[0]?.slots, [1, 0]);
		const n = build([0, 2], [run(0, 1, "C", Number.NaN), run(1, 2, "G")]);
		near(n.confidence?.bars[0]?.slots, [1, 1]);
	});

	test("one entry per played bar, slots line up", () => {
		const r = chartFromDetections({
			grid: { bars: [1, 3, 5, 7, 9] },
			meter: "4/4",
			pickup: { start: 0.5 },
			chords: {
				runs: [
					run(0.5, 1, "G", 0.9),
					run(1, 2, "C"),
					run(2, 3, "F", 0.7),
					run(3, 4, "C"),
					run(4, 5, "F", 0.7),
					run(5, 9, "C"),
				],
			},
		});
		const parse = parseChart(r.chart);
		const bars = r.confidence?.bars ?? [];
		expect(parse.bars.length).toBe(5);
		expect(bars).toHaveLength(parse.bars.length);
		for (const [i, b] of bars.entries()) {
			expect(b.bar).toBe((parse.bars[i] as { index: number }).index);
			expect(b.slots).toHaveLength((parse.bars[i] as { slots: unknown[] }).slots.length);
		}
		expect(bars[0]?.slots[0]).toBeCloseTo(0.9, 9);
	});
});

describe("key, meter, tempo and sections", () => {
	const runs = [run(0, 4, "C")];
	test("from their wrappers", () => {
		const r = chartFromDetections({
			grid: { bars: [0, 2, 4] },
			key: { value: "D major", confidence: 0.6 },
			meter: { value: "4/4", confidence: 0.7 },
			tempo: { value: 120, confidence: 0.8 },
			sections: [
				{ name: "Intro", start: 0, confidence: 0.5 },
				{ name: "Verse", start: 2, confidence: 1.4 },
			],
			chords: { runs },
		});
		expect(r.confidence).toMatchObject({
			format: "barmark-confidence",
			version: 1,
			key: 0.6,
			meter: 0.7,
			tempo: 0.8,
			sections: [
				{ bar: 1, confidence: 0.5 },
				{ bar: 2, confidence: 1 },
			],
		});
	});

	test("a bare value gives no field", () => {
		const r = chartFromDetections({
			grid: { bars: [0, 2, 4] },
			key: "D major",
			meter: "4/4",
			tempo: 120,
			sections: [{ name: "Intro", start: 0 }],
			chords: { runs },
		});
		expect(r.confidence).not.toBeNull();
		for (const k of ["key", "meter", "tempo", "sections"])
			expect(k in (r.confidence ?? {})).toBe(false);
	});

	test("a section's bar counts the pickup", () => {
		const r = chartFromDetections({
			grid: { bars: [1, 3, 5] },
			meter: "4/4",
			pickup: { start: 0.5 },
			sections: [{ name: "Verse", start: 1, confidence: 0.4 }],
			chords: { runs: [run(0.5, 5, "C")] },
		});
		expect(r.confidence?.sections).toEqual([{ bar: 2, confidence: 0.4 }]);
	});
});

describe("presence", () => {
	test("null exactly when the chart is empty", () => {
		const bad = chartFromDetections({ grid: { bars: [0] }, chords: { runs: [] } });
		expect(bad.chart).toBe("");
		expect(bad.confidence).toBeNull();
		const ok = build([0, 2], []);
		expect(ok.chart).not.toBe("");
		expect(ok.confidence).not.toBeNull();
	});
});
