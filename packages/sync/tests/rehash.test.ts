import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { chartFromDetections } from "../src/build/build.js";
import { chartHash, checkTimingMap, rehashTiming } from "../src/timing/index.js";

const HEAD = "time: 4/4, tempo: 120\n";

/** A four-bar 4/4 chart built from one Harte run a bar, two seconds apiece. */
const build = (labels: string[]) =>
	chartFromDetections({
		grid: { bars: [0, 2, 4, 6, 8] },
		meter: "4/4",
		chords: { runs: labels.map((label, i) => ({ start: 2 * i, end: 2 * i + 2, label })) },
	});

const built = build(["C:maj", "G:maj", "A:min", "F:maj"]);
const named = `${HEAD}## Verse\n| C | G | A- | F |\n`;

describe("rehashTiming carries the map", () => {
	test("a refinement that names a section and respells a chord", () => {
		expect(built.chart).toBe(`${HEAD}| C | G | Am | F |\n`);
		const r = rehashTiming(built, named);
		if (!r.ok) throw new Error(r.message);
		expect(r.timing).toEqual({
			...(built.timing as NonNullable<typeof built.timing>),
			chart: { bars: 4, hash: chartHash(named) },
		});
		expect(r.timing.chart.hash).not.toBe(built.timing?.chart.hash);
		expect(checkTimingMap(r.timing, { text: named }).diagnostics).toEqual([]);
		expect(r.confidence).toEqual(built.confidence);
		expect(r.confidenceDropped).toBe(false);
	});

	test("the refined chart's parse, given, changes nothing", () => {
		expect(rehashTiming(built, named, { parse: parseChart(named) })).toEqual(
			rehashTiming(built, named),
		);
	});

	test("a `%` for a hold keeps the confidence record (the same played slots)", () => {
		const held = build(["C:maj", "G:maj", "G:maj", "F:maj"]);
		const r = rehashTiming(held, `${HEAD}| C | G | % | F |\n`);
		if (!r.ok) throw new Error(r.message);
		expect(r.confidence).toEqual(held.confidence);
		expect(r.confidenceDropped).toBe(false);
	});

	test("a regrouped bar drops the confidence record and keeps the map", () => {
		const refined = `${HEAD}| C G | G | Am | F |\n`;
		const r = rehashTiming(built, refined);
		if (!r.ok) throw new Error(r.message);
		expect(r.confidenceDropped).toBe(true);
		expect(r.confidence).toBeNull();
		expect(r.timing.bars).toEqual(built.timing?.bars ?? []);
		expect(r.timing.chart.hash).toBe(chartHash(refined));
	});

	test("no confidence record to carry", () => {
		const { confidence: _c, ...bare } = built;
		const r = rehashTiming(bare, named);
		if (!r.ok) throw new Error(r.message);
		expect(r.confidence).toBeNull();
		expect(r.confidenceDropped).toBe(false);
	});

	test("neither built nor its timing is mutated; the map returned is a copy", () => {
		const before = structuredClone(built);
		const r = rehashTiming(built, named);
		expect(built).toEqual(before);
		if (!r.ok) throw new Error(r.message);
		expect(r.timing).not.toBe(built.timing);
		expect(r.timing.bars).not.toBe(built.timing?.bars);
		expect(r.timing.bars[0]).not.toBe(built.timing?.bars[0]);
		expect(r.confidence).not.toBe(built.confidence);
		expect(r.confidence?.bars[0]?.slots).not.toBe(built.confidence?.bars[0]?.slots);
	});
});

describe("rehashTiming refuses", () => {
	test("no-timing: the built chart has no map", () => {
		expect(rehashTiming({ ...built, timing: null }, named)).toEqual({
			ok: false,
			reason: "no-timing",
			message: "The built chart has no timing map to carry.",
		});
	});

	test("unparsed: the refined chart has an error, named with its line", () => {
		const r = rehashTiming(built, `${HEAD}| C | G [2/4] Am | F |\n`);
		expect(r).toEqual({
			ok: false,
			reason: "unparsed",
			message:
				"The refined chart has errors (line 2: a [n/d] meter must start its cell); the timing map was dropped.",
		});
	});

	test("bars-differ: the refined chart plays three bars", () => {
		expect(rehashTiming(built, `${HEAD}| C | G | F |\n`)).toEqual({
			ok: false,
			reason: "bars-differ",
			message: "The refined chart plays 3 bars where the map has 4; the timing map was dropped.",
		});
	});

	test("meters-differ: bar 3 turns 2/4 with the count held", () => {
		expect(rehashTiming(built, `${HEAD}| C | G | [2/4] Am Am | F |\n`)).toEqual({
			ok: false,
			reason: "meters-differ",
			message:
				"The refined chart's bar 3 (in play order) is in 2/4 where the map's chart has 4/4; the timing map was dropped.",
		});
	});
});
