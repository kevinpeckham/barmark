/**
 * A chart's played bars as pads (design §6.3): the app's
 * `chordPitchClasses.test.ts` cases and the slot rules of
 * `barmarkChartBars.test.ts`, rewritten as barmark text, the bar seconds
 * of barmark's tempo rule, and Review Focus 2, chart tempo in odd places.
 */
import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import {
	barSeconds,
	chartBar,
	chartBeatsPerBar,
	chartPadBars,
	type PadBar,
	type Pitches,
	pitchesOf,
} from "../src/align/bars.js";

/** The chart's pad bars, failing the test on a refusal. */
function padBars(chart: string, fallback: number | undefined = 120): PadBar[] {
	const r = chartPadBars(parseChart(chart), fallback);
	if (!r.ok) throw new Error(`refused: ${r.reason}`);
	return r.bars;
}
const padsOf = (chart: string) => padBars(chart).map((b) => b.pads);
const secondsOf = (chart: string, fallback?: number) =>
	padBars(chart, fallback).map((b) => b.seconds);

/** The first played bar's seconds. */
function firstSeconds(chart: string, fallback?: number): number | null {
	const bar = parseChart(chart).bars[0];
	if (!bar) throw new Error("no bar");
	return barSeconds(bar, fallback);
}

/** One chord as a chart's only slot: its pad. */
function padOf(symbol: string): Pitches | null {
	const [bar] = padBars(`| ${symbol} |`);
	expect(bar?.pads).toHaveLength(1);
	return bar?.pads[0] ?? null;
}
/** The pad's tones sorted, as the app's test reads them. */
const tones = (symbol: string) => padOf(symbol)?.tones.toSorted((a, b) => a - b) ?? null;

const C = { root: 0, tones: [0, 4, 7] };
const F = { root: 5, tones: [5, 9, 0] };
const G = { root: 7, tones: [7, 11, 2] };

describe("barSeconds: barmark's tempo rule (design §6.3)", () => {
	test("tempo: counts the beat of the time: meter; a bar lasts its own meter", () => {
		expect(firstSeconds("tempo: 120\n| C |")).toBe(2.0);
		expect(firstSeconds("time: 6/8, tempo: 40\n| C |")).toBe(3.0);
		expect(firstSeconds("time: 12/8, tempo: 60\n| C |")).toBe(4.0);
		expect(firstSeconds("time: 3/4, tempo: 90\n| C |")).toBe(2.0);
		const six = parseChart("time: 4/4, tempo: 120\n| C | [6/8] C |").bars[1];
		if (!six) throw new Error("no bar");
		expect(barSeconds(six, undefined)).toBe(1.5);
	});

	test("a bar without a tempo takes the fallback, in grammar 2.1's beat, else is null", () => {
		expect(firstSeconds("| C |", 120)).toBe(2.0);
		expect(firstSeconds("time: 6/8\n| C |", 40)).toBe(3.0);
		expect(firstSeconds("| C |")).toBeNull();
		// The chart's own tempo wins over the fallback.
		expect(firstSeconds("tempo: 60\n| C |", 120)).toBe(4.0);
	});
});

describe("Review Focus 2: chart tempo in odd places", () => {
	const late = "| C | G |\ntempo: 100\n| Am | F |";

	test("bars before the first tempo take the fallback", () => {
		const bars = padBars(late, 120);
		expect(bars.map((b) => b.seconds)).toEqual([2, 2, 2.4, 2.4]);
		expect(bars.map((b) => b.tempo)).toEqual([120, 120, 100, 100]);
		expect(chartPadBars(parseChart(late), undefined)).toEqual({
			ok: false,
			reason: "no-tempo",
			index: 1,
		});
	});

	test("a rit. bar reads the steady tempo", () => {
		const chart = "tempo: 100\n| C | G |\ntempo: rit. to 60\n| Am | F |\ntempo: 60\n| C |";
		const parse = parseChart(chart);
		expect(parse.bars.map((b) => b.tempoChange?.kind ?? null)).toEqual([
			null,
			null,
			"rit",
			"rit",
			null,
		]);
		const bars = padBars(chart);
		expect(bars.map((b) => b.seconds)).toEqual([2.4, 2.4, 2.4, 2.4, 4]);
		expect(bars.map((b) => b.tempo)).toEqual([100, 100, 100, 100, 60]);
	});

	test("a time: change mid-chart changes the seconds from its bar on", () => {
		const bars = padBars("tempo: 120\n| C | G |\ntime: 3/4\n| Am | F |");
		expect(bars.map((b) => b.seconds)).toEqual([2, 2, 1.5, 1.5]);
		expect(bars.map((b) => `${b.meter.n}/${b.meter.d}`)).toEqual(["4/4", "4/4", "3/4", "3/4"]);
		expect(bars.map((b) => b.tempo)).toEqual([120, 120, 120, 120]);
	});

	test("a [6/8] bar in 4/4 lasts 1.5 s at the same tempo: no tempo change", () => {
		const bars = padBars("time: 4/4, tempo: 120\n| C | [6/8] G | Am |");
		expect(bars.map((b) => b.seconds)).toEqual([2, 1.5, 2]);
		expect(bars.map((b) => b.tempo)).toEqual([120, 120, 120]);
		expect(bars[1]?.meter).toEqual({ n: 6, d: 8 });
	});

	test("a compound chart without a tempo takes the fallback in its beat", () => {
		expect(secondsOf("time: 6/8\n| C | G |", 40)).toEqual([3, 3]);
	});
});

describe("slots: the app's adapter rules on records", () => {
	test("chords divide the bar; a hold repeats the chord before it", () => {
		expect(padsOf("| C G |")).toEqual([[C, G]]);
		expect(padsOf("| C / G / |")).toEqual([[C, C, G, G]]);
	});

	test("an all-hold bar is one pad of what was sounding", () => {
		expect(padsOf("| C |\n| / |")).toEqual([[C], [C]]);
		expect(padsOf("| C | / / / / |")).toEqual([[C], [C]]);
		expect(padsOf("| C G | ? / |")).toEqual([[C, G], [G]]);
		expect(padsOf("| N.C. | / |")).toEqual([[null], [null]]);
		expect(padsOf("| / |")).toEqual([[null]]);
		expect(padsOf("| C | ?_G |")).toEqual([[C], [C]]);
	});

	test("N.C. and silence are silent; a leading hold carries across the bar line", () => {
		expect(padsOf("| C | -- G |")).toEqual([[C], [null, G]]);
		expect(padsOf("| C G | / F |")).toEqual([
			[C, G],
			[G, F],
		]);
		expect(padsOf("| -- | / G |")).toEqual([[null], [null, G]]);
	});

	test("? holds what was sounding", () => {
		expect(padsOf("| C | ? G |")).toEqual([[C], [C, G]]);
	});

	test("a group plays its first member", () => {
		expect(padsOf("| C_G |")).toEqual([[C]]);
	});

	test("a note set holds what was sounding", () => {
		expect(padsOf("| F | {C E G} |")).toEqual([[F], [F]]);
		expect(padsOf("| F | {C E G} / G |")).toEqual([[F], [F, F, G]]);
	});

	test("a first bar's leading hold with nothing before it is dropped", () => {
		expect(padsOf("| / G |")).toEqual([[G]]);
	});
});

describe("pitchesOf: the app's chordPitchClasses cases barmark reads", () => {
	test("triads by quality, the root first", () => {
		expect(padOf("C")).toEqual({ root: 0, tones: [0, 4, 7] });
		expect(padOf("Am")).toEqual({ root: 9, tones: [9, 0, 4] });
		expect(tones("Bdim")).toEqual([2, 5, 11]);
		expect(tones("B°")).toEqual([2, 5, 11]);
		expect(tones("Caug")).toEqual([0, 4, 8]);
		expect(tones("C+")).toEqual([0, 4, 8]);
		expect(tones("Dsus2")).toEqual([2, 4, 9]);
		expect(tones("Dsus4")).toEqual([2, 7, 9]);
		expect(tones("Dsus")).toEqual([2, 7, 9]);
		expect(tones("E5")).toEqual([4, 11]);
		expect(tones("Cmin")).toEqual([0, 3, 7]);
	});

	test("accidentals in either spelling", () => {
		expect(padOf("F#m")?.root).toBe(6);
		expect(padOf("F♯m")?.root).toBe(6);
		expect(padOf("Bb")?.root).toBe(10);
		expect(padOf("B♭maj7")?.root).toBe(10);
		expect(padOf("Cb")?.root).toBe(11);
	});

	test("sevenths, sixths and ninths where the suffix says so", () => {
		expect(tones("G7")).toEqual([2, 5, 7, 11]);
		expect(tones("Cmaj7")).toEqual([0, 4, 7, 11]);
		expect(tones("CMaj7")).toEqual([0, 4, 7, 11]);
		expect(tones("CΔ")).toEqual([0, 4, 7, 11]);
		expect(tones("Am7")).toEqual([0, 4, 7, 9]);
		expect(tones("C6")).toEqual([0, 4, 7, 9]);
		expect(tones("C9")).toEqual([0, 2, 4, 7, 10]);
		expect(tones("Cadd9")).toEqual([0, 2, 4, 7]);
		expect(tones("Cdim7")).toEqual([0, 3, 6, 9]);
		expect(tones("Cø")).toEqual([0, 3, 6, 10]);
		expect(tones("Cm7b5")).toEqual([0, 3, 6, 10]);
		expect(tones("C6/9")).toEqual([0, 2, 4, 7, 9]);
	});

	test("a 5 keeps no third whatever is added; parentheses add", () => {
		expect(tones("G5(7)")).toEqual([2, 5, 7]);
		expect(tones("F#(5)(7)")).toEqual([1, 4, 6]);
		expect(tones("E5(7)")).toEqual([2, 4, 11]);
		expect(tones("Gsus2")).toEqual([2, 7, 9]);
		expect(tones("C#(7)")).toEqual([1, 5, 8, 11]);
	});

	test("extensions mean what barmark says they mean", () => {
		expect(tones("C11")).toEqual([0, 2, 5, 7, 10]);
		expect(tones("Am13")).toEqual([0, 2, 4, 6, 7, 9, 11]);
		expect(tones("C7alt")).toEqual([0, 4, 10]);
		expect(tones("Am(add9)")).toEqual([0, 4, 9, 11]);
		expect(padOf("B♭maj7/F")).toEqual({ root: 10, tones: [10, 2, 5, 9] });
	});

	test("a slash bass adds its pitch class", () => {
		expect(padOf("C/E")).toEqual({ root: 0, tones: [0, 4, 7] });
		expect(padOf("D/F#")?.tones).toEqual([2, 6, 9]);
		expect(padOf("C/Bb")?.tones).toEqual([0, 4, 7, 10]);
	});

	test("a record's pitches directly; a note set, rootless, is null", () => {
		const record = (symbol: string) => {
			const slot = parseChart(`| ${symbol} |`).bars[0]?.slots[0];
			if (slot?.kind !== "chord") throw new Error(symbol);
			return slot.chord;
		};
		expect(pitchesOf(record("Cdim7"))).toEqual({ root: 0, tones: [0, 3, 6, 9] });
		expect(pitchesOf(record("{C E G}"))).toBeNull();
	});

	test("the seven spellings barmark does not read: the line plays no bar, the parse has an error", () => {
		// The spec (§6.3) expected a `?` slot that holds. barmark reads a bar
		// line with an unreadable chord as no bars at all, as the app's
		// adapter does too (it parses with barmark before its SPELLINGS run),
		// so the bar is lost, not held: F then G, two bars.
		for (const spelling of ["CM7", "CSus4", "CmMaj7", "CmM7", "C69", "C(7)sus4", "C−7"]) {
			const chart = `| F |\n| ${spelling} |\n| G |`;
			const parse = parseChart(chart);
			expect(parse.diagnostics.some((d) => d.severity === "error" && d.line === 2)).toBe(true);
			expect(padsOf(chart)).toEqual([[F], [G]]);
		}
	});
});

describe("the bar's index, meter, key and section", () => {
	test("index is the play-order position; a repeat plays its heading's bars again", () => {
		const bars = padBars("## Verse\n|: C | G :|\n## Chorus\n| F |");
		expect(bars.map((b) => b.index)).toEqual([1, 2, 3, 4, 5]);
		expect(bars.map((b) => b.section)).toEqual(["Verse", null, null, null, "Chorus"]);
	});

	test("a heading names its bar over a rehearsal mark; words name nothing (Ruling 4)", () => {
		expect(padBars("## Verse\n| @A | C | G |").map((b) => b.section)).toEqual(["Verse", null]);
		expect(padBars('| C | @B | G | "Chorus" F |').map((b) => b.section)).toEqual([null, "B", null]);
		expect(padBars("|: @A | C | G :|").map((b) => b.section)).toEqual(["A", null, "A", null]);
	});

	test("the key in force as the app's keyText; none is null", () => {
		expect(padBars("key: F#m\n| C |")[0]?.key).toBe("F# minor");
		expect(padBars("key: A mixolydian\n| C |")[0]?.key).toBe("A mixolydian");
		expect(padBars("| C |")[0]?.key).toBeNull();
	});

	test("a chart without time: is 4/4 (Ruling 3)", () => {
		expect(padBars("| C |")[0]?.meter).toEqual({ n: 4, d: 4 });
	});
});

describe("refusals", () => {
	test("no-bars for a chart that plays none, before the tempo is looked at", () => {
		for (const chart of ["", "## A\n## B\n", "# Title\n"]) {
			expect(chartPadBars(parseChart(chart), 120)).toEqual({ ok: false, reason: "no-bars" });
			expect(chartPadBars(parseChart(chart), undefined)).toEqual({ ok: false, reason: "no-bars" });
		}
	});

	test("no-tempo names the first bar without one", () => {
		expect(chartPadBars(parseChart("| C | G |"), undefined)).toEqual({
			ok: false,
			reason: "no-tempo",
			index: 1,
		});
	});
});

describe("chartBar and chartBeatsPerBar", () => {
	const bar = (seconds: number, n: number, d: number): PadBar => ({
		index: 1,
		pads: [null],
		seconds,
		tempo: 120,
		meter: { n, d },
		key: null,
		section: null,
	});

	test("chartBar is the median of the bar seconds", () => {
		expect(chartBar([bar(2, 4, 4), bar(3, 4, 4), bar(2, 4, 4)])).toBe(2);
		expect(chartBar([bar(2, 4, 4), bar(3, 4, 4)])).toBe(2.5);
	});

	test("chartBeatsPerBar is the most common meter's numerator, the first seen on a tie", () => {
		const three = bar(1.5, 3, 4);
		const four = bar(2, 4, 4);
		expect(chartBeatsPerBar([four, three, three, four, three])).toBe(3);
		expect(chartBeatsPerBar([four, three, three, four])).toBe(4);
		expect(chartBeatsPerBar([three, four, four, three])).toBe(3);
		// Meters count by n/d: 6/8 is not 3/4, and a 6/8 bar has six.
		expect(chartBeatsPerBar([bar(3, 6, 8), bar(1.5, 3, 4), bar(3, 6, 8)])).toBe(6);
	});
});
