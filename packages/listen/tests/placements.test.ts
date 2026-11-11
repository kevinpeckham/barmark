/**
 * What an aligned chart places (design §6.3): the app's
 * `alignedPlacements.test.ts`, its chart-shaped bars written as barmark
 * text and read through `chartPadBars`; tempo in grammar 2.1's beat.
 */
import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { chartPadBars, type PadBar } from "../src/align/bars.js";
import { alignedPlacements } from "../src/align/placements.js";
import { DEFAULTS, resolveOptions } from "../src/options.js";
import { alignmentOf } from "./helpers/alignment.js";

/** The chart's pad bars, failing the test on a refusal. */
function padBars(chart: string): PadBar[] {
	const r = chartPadBars(parseChart(chart), undefined);
	if (!r.ok) throw new Error(`refused: ${r.reason}`);
	return r.bars;
}

/**
 * The app's fixture: eight bars of D in 4/4 at 100 in D major; Intro at
 * bar 1, Verse at 3, Chorus at 5 in E major, 120 from bar 6, Outro at 7.
 * `intro: false` leaves the first section off.
 */
function song({ intro = true, second = "| D |" } = {}): PadBar[] {
	return padBars(
		[
			"key: D",
			"time: 4/4, tempo: 100",
			...(intro ? ["## Intro"] : []),
			`| D ${second}`,
			"## Verse",
			"| D | D |",
			"## Chorus",
			"key: E",
			"| D |",
			"tempo: 120",
			"| D |",
			"## Outro",
			"| D | D |",
		].join("\n"),
	);
}
const bars = song();

const place = (b: PadBar[], over: Parameters<typeof alignmentOf>[0] = {}) =>
	alignedPlacements(b, alignmentOf(over), DEFAULTS);

describe("alignedPlacements: the app's alignedPlacements", () => {
	test("a one-bar meter is not a tempo change; a real change is in grammar 2.1's beat", () => {
		// A [6/8] bar in 4/4 at 100 keeps the tempo at 100.
		const odd = song({ second: "| [6/8] D |" });
		expect(odd[1]?.meter).toEqual({ n: 6, d: 8 });
		expect(place(odd).tempoChanges).toEqual([{ at: 10.4, bpm: 120, hedged: false }]);
		// time: 6/8, tempo: 40 counts dotted quarters: bpm 40, where the app's unit said 120.
		const compound = padBars("time: 4/4, tempo: 100\n| D | D |\ntime: 6/8, tempo: 40\n| D | D |");
		expect(place(compound).tempoChanges).toEqual([{ at: 4.4, bpm: 40, hedged: false }]);
	});

	test("sections, key and tempo changes at their bars; the first and last sections hedged; a first section near 0 at 0", () => {
		const placed = place(bars);
		expect(placed.sections).toEqual([
			{ name: "Intro", start: 0, hedged: true },
			{ name: "Verse", start: 4.4, hedged: false },
			{ name: "Chorus", start: 8.4, hedged: false },
			// LAST-SOUND: the Outro's own four seconds before the last sound at 16.
			{ name: "Outro", start: 12, hedged: true },
		]);
		expect(placed.keyChanges).toEqual([{ at: 8.4, key: "E major", hedged: false }]);
		expect(placed.tempoChanges).toEqual([{ at: 10.4, bpm: 120, hedged: false }]);
	});

	test("a bar whose local cost is over twice the median hedges what is placed there", () => {
		const localCost = [0.05, 0.05, 0.05, 0.05, 0.2, 0.05, 0.05, 0.05];
		const placed = place(bars, { localCost });
		expect(placed.sections.find((s) => s.name === "Chorus")?.hedged).toBe(true);
		expect(placed.keyChanges[0]?.hedged).toBe(true);
		expect(placed.tempoChanges[0]?.hedged).toBe(false);
	});

	test("a chart that is not this recording hedges everything", () => {
		const a = alignmentOf({ controlCost: 0.06 });
		expect(a.ratio).toBeCloseTo(1.2);
		expect(a.samePiece).toBe(false);
		const placed = alignedPlacements(bars, a, DEFAULTS);
		expect(
			[...placed.sections, ...placed.keyChanges, ...placed.tempoChanges].every((p) => p.hedged),
		).toBe(true);
	});

	test("not this recording: a first section later than a quarter second keeps its time, one within it starts at 0", () => {
		const late = place(bars, {
			barStarts: [0.6, 2.4, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2],
			controlCost: 0.06,
		});
		expect(late.sections[0]?.start).toBe(0.6);
		expect(late.sections.at(-1)?.start).toBe(12);
		const near = place(bars, {
			barStarts: [0.2, 2.4, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2],
			controlCost: 0.06,
		});
		expect(near.sections[0]?.start).toBe(0);
	});

	test("nothing is before 0; a perfect fit has a finite ratio", () => {
		expect(Number.isFinite(alignmentOf({ cost: 0 }).ratio)).toBe(true);
		const early = place(padBars("tempo: 100\nkey: D\n| D |\nkey: G\n| D |"), {
			barStarts: [-2, -1, 1],
		});
		expect(early.keyChanges[0]?.at).toBe(0);
	});

	test("Study 14's real-domain ratios: a correct chart's 2.04 is this recording, a wrong one's 1.24 is not", () => {
		expect(DEFAULTS.ALIGNMENT_SAME_PIECE_RATIO).toBe(1.6);
		const right = place(bars, { cost: 0.1, controlCost: 0.204 });
		expect(right.sections[1]?.hedged).toBe(false);
		const wrong = place(bars, { cost: 0.1, controlCost: 0.124 });
		expect(wrong.sections.every((s) => s.hedged)).toBe(true);
	});

	test("Study 16's wrong pairing: a ratio of 1.74 clears the gate, its median local cost of 0.323 does not; the same ratio with a low local cost is this recording", () => {
		expect(DEFAULTS.ALIGNMENT_SAME_PIECE_LOCAL_COST).toBe(0.3);
		const wrongAlignment = alignmentOf({
			cost: 0.1,
			controlCost: 0.174,
			localCost: Array(8).fill(0.323),
		});
		expect(wrongAlignment.ratio).toBeCloseTo(1.74);
		expect(wrongAlignment.samePiece).toBe(false);
		const wrong = alignedPlacements(bars, wrongAlignment, DEFAULTS);
		expect(wrong.sections.every((s) => s.hedged)).toBe(true);
		const right = place(bars, { cost: 0.1, controlCost: 0.174, localCost: Array(8).fill(0.12) });
		expect(right.sections[1]?.hedged).toBe(false);
	});

	test("FIRST-ONSET: a first section at the chart's first bar starts at the first sound, hedged, only when the chart is this recording", () => {
		const late = { barStarts: [7.15, 9, 11, 13, 15, 17, 19, 21, 23], lastSound: 25 };
		const placed = place(bars, { ...late, firstSound: 0.02 });
		expect(placed.sections[0]).toEqual({ name: "Intro", start: 0.02, hedged: true });
		const notThis = place(bars, { ...late, firstSound: 0.02, controlCost: 0.06 });
		expect(notThis.sections[0]?.start).toBe(7.15);
		// A chart whose first section starts after its first bar keeps the path's time.
		const kept = place(song({ intro: false }), { ...late, firstSound: 0.02 });
		expect(kept.sections[0]).toEqual({ name: "Verse", start: 11, hedged: true });
	});

	test("LAST-SOUND: the last section starts its chart length before the last sound, hedged, never within a bar of the section before", () => {
		// The Outro is two bars at 120 in 4/4: four seconds.
		const placed = place(bars, { lastSound: 20.03 });
		expect(placed.sections.at(-1)?.name).toBe("Outro");
		expect(placed.sections.at(-1)?.start).toBeCloseTo(16.03);
		expect(placed.sections.at(-1)?.hedged).toBe(true);
		// A last sound too early for the outro: one bar (2.4 s at 100) after the Chorus at 8.4.
		const floored = place(bars, { lastSound: 9 });
		expect(floored.sections.at(-1)?.start).toBeCloseTo(10.8);
		const notThis = place(bars, { lastSound: 20.03, controlCost: 0.06 });
		expect(notThis.sections.at(-1)?.start).toBe(12);
	});

	test("a chart of one section is untouched by LAST-SOUND", () => {
		const placed = place(padBars("tempo: 100\n## Song\n| D | D | D |"), {
			barStarts: [0, 2.4, 4.8, 7.2],
			firstSound: 0.3,
			lastSound: 30,
		});
		expect(placed.sections).toEqual([{ name: "Song", start: 0.3, hedged: true }]);
	});
});

describe("alignedPlacements: options and the alignment", () => {
	test("SECTION_START_SNAP_SEC and HEDGE_LOCAL_COST_FACTOR come from the settings", () => {
		const r = resolveOptions({ SECTION_START_SNAP_SEC: 0.7, HEDGE_LOCAL_COST_FACTOR: 5 }, "listen");
		if (!r.ok) throw new Error("options");
		const notThis = alignmentOf({
			barStarts: [0.6, 2.4, 4.4, 6.4, 8.4, 10.4, 12, 13.6, 15.2],
			controlCost: 0.06,
		});
		expect(alignedPlacements(bars, notThis, r.value.settings).sections[0]?.start).toBe(0);
		const costly = alignmentOf({ localCost: [0.05, 0.05, 0.05, 0.05, 0.2, 0.05, 0.05, 0.05] });
		expect(alignedPlacements(bars, costly, r.value.settings).keyChanges[0]?.hedged).toBe(false);
	});

	test("the alignment and the bars are read, never written", () => {
		const a = alignmentOf({ lastSound: 20.03, firstSound: 0.02 });
		const before = structuredClone({ a, bars });
		alignedPlacements(bars, a, DEFAULTS);
		expect({ a, bars }).toEqual(before);
	});
});
