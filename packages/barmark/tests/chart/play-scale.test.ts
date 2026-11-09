/**
 * A played bar shares its written bar's data: a chart's parse costs its
 * written size plus its played bars, never their product (Vercel findings
 * 01M6V24KFCCKSRW0JSQ2FVE2NE, lyrics, and 01M6MJK1SBHEYJ9NK946Y0W7D1, pedal).
 */
import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/chart/parse.js";

// The ratio is of best-of-five timings; the timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = 60_000;

/** One bar of `n` slots, the pedal pressed on the first and lifted on the last, played `plays` times. */
const pedalled = (n: number, plays: number) =>
	`| +C ${Array(n - 2)
		.fill("C")
		.join(" ")} *C | x${plays}\n`;
/** One chord under a lyric row of `n` syllables, played `plays` times. */
const worded = (n: number, plays: number) =>
	`| C | x${plays}\nlyrics: | ${Array(n).fill("la").join(" ")} |\n`;
/** One bar of `n` notes, each with its syllable, played `plays` times. */
const melodic = (n: number, plays: number) =>
	`| ${Array(n).fill("{C4}:la").join(" ")} | x${plays}\n`;

/** The best of five parses of `text`, after one to warm up. */
function timed(text: string): number {
	parseChart(text);
	let ms = Number.POSITIVE_INFINITY;
	for (let run = 0; run < 5; run++) {
		const start = performance.now();
		parseChart(text);
		ms = Math.min(ms, performance.now() - start);
	}
	return ms;
}

describe("a played bar shares its written bar's data", () => {
	test("two plays of one bar share its slots and its words", () => {
		const [a, b] = parseChart('| +C /  *G "go" | x2\nlyrics: | la la la |\n').bars;
		expect(a?.slots).toBe(b?.slots as never);
		expect(a?.words).toBe(b?.words as never);
		expect(a?.lyrics?.[0]?.syllables).toBe(b?.lyrics?.[0]?.syllables as never);
	});
	test("two plays of a melody share its syllables", () => {
		const [a, b] = parseChart("| {C4}:la {D4}:di | x2\n").bars;
		expect(a?.lyrics?.[0]?.syllables).toHaveLength(2);
		expect(a?.lyrics?.[0]?.syllables).toBe(b?.lyrics?.[0]?.syllables as never);
	});
	test("plays of a part's lines share them", () => {
		const [a, b] = parseChart("part: P = Piano\nP.RH | {C4}:la {D4} | x2\nP.LH | C | x2\n").bars;
		expect(a?.lines?.[0]?.slots).toBe(b?.lines?.[0]?.slots as never);
		expect(a?.lines?.[1]?.slots).toBe(b?.lines?.[1]?.slots as never);
	});
});

describe("parse time grows with written size plus plays, not their product", () => {
	// Ten times the written and ten times the plays: linear is ten times as long, the product a hundred.
	// Each small side takes at least 5 ms, so a pause in one run can't swing the ratio.
	for (const [shape, chart, written, plays] of [
		["slots with the pedal", pedalled, 300, 300],
		["a lyric row's syllables", worded, 6000, 100],
		["a melody's syllables", melodic, 300, 300],
	] as const)
		test(
			shape,
			() => {
				const small = timed(chart(written, plays));
				const large = timed(chart(written * 10, plays * 10));
				expect(parseChart(chart(written * 10, plays * 10)).bars).toHaveLength(plays * 10);
				expect(large / small).toBeLessThan(30);
			},
			TIMEOUT,
		);
});

describe("the verses a bar sings count toward the expansion's budget", () => {
	/** One bar under `rows` verses, then `replays` plain replays of its section: each replay sings every verse. */
	const replayed = (rows: number, replays: number) =>
		[
			"## A",
			"| C |",
			...Array.from({ length: rows }, (_, v) => `lyrics ${v + 1}: | la |`),
			...Array(replays).fill("## A"),
		].join("\n");
	const sungVerses = (text: string) => {
		const p = parseChart(text);
		return {
			verses: p.bars.reduce((n, b) => n + (b.lyrics?.length ?? 0), 0),
			stopped: p.diagnostics.some((d) => d.message.startsWith("expansion stopped")),
		};
	};
	test("many verses replayed many times stop at the budget instead of singing them all", () => {
		// 1,560 verses × 5,001 plays would be 7.8 million verse references.
		const { verses, stopped } = sungVerses(replayed(1560, 5000));
		expect(stopped).toBe(true);
		expect(verses).toBeLessThanOrEqual(100_000);
		const why = parseChart(replayed(1560, 5000)).diagnostics.filter((d) =>
			d.message.startsWith("expansion stopped"),
		);
		expect(why.map((d) => d.message)).toEqual([
			"expansion stopped after 64 bars: the bars played again sing too many verses (98,280)",
		]);
	});
	test("a hymn of 100 verses, replayed, sings them all", () => {
		const hymn = [
			"## Verse",
			"| G | C | D | G |",
			...Array.from({ length: 100 }, (_, v) => `lyrics ${v + 1}: | la | la | la | la |`),
			"## Verse",
			"## Verse",
		].join("\n");
		expect(sungVerses(hymn)).toEqual({ verses: 1200, stopped: false });
	});
	test("the bar count it names is the bars played, after a replay's -> cuts its last", () => {
		const chart = [
			"## A",
			"| C | D |",
			...Array.from({ length: 1560 }, (_, v) => `lyrics ${v + 1}: | la | li |`),
			...Array(5000).fill("## A ->"),
		].join("\n");
		const p = parseChart(chart);
		const stopped = p.diagnostics.filter((d) => d.message.startsWith("expansion stopped"));
		// Each written bar's first play sings its 1,560 verses for nothing; the plays after count.
		const sung = p.bars.reduce((n, b) => n + (b.lyrics?.length ?? 0), 0) - 2 * 1560;
		expect(stopped.map((d) => d.message)).toEqual([
			`expansion stopped after ${p.bars.length} bars: the bars played again sing too many verses (${sung.toLocaleString("en-US")})`,
		]);
	});
	test("a verse its repeat never reaches is still reported when a later stop cuts play", () => {
		// Verse 3 under `x2` is never sung, stop or not; the stop comes thousands of bars later.
		const chart = ["## A", "| C | x2", "lyrics 2: | la |", "lyrics 3: | li |", "## B", "| D |"]
			.concat(Array(10_001).fill("## B"))
			.join("\n");
		const messages = parseChart(chart).diagnostics.map((d) => `${d.line}: ${d.message}`);
		expect(messages).toContain("4: verse 3 is never sung: no pass of its repeat is pass 3");
		expect(messages).toContain("6: expansion stopped at 10000 bars");
	});

	test("a verse the stop cut off before its pass is not reported", () => {
		// 2,000 parts may each play 5 bars: pass 2 of the x3 is cut, so verse 3's pass never came.
		const parts = Array.from({ length: 2000 }, (_, i) => `part: P${i} = Piano`);
		const chart = [...parts, "| C | C | C | x3", "lyrics 3: | a | b | c |"].join("\n");
		const messages = parseChart(chart).diagnostics.map((d) => d.message);
		expect(messages).toEqual([
			"expansion stopped at 5 bars",
			"passes 1 and 2 of this repeat sing nothing: its bars have verse 3",
		]);
	});

	test("a bar the budget stops is not sung, and the stop alone is reported", () => {
		// 100 parts may each do 1,000 work. Two replays sing 300 verses each; the third replay's own 400 rows don't fit.
		const parts = Array.from({ length: 100 }, (_, i) => `part: P${i} = Piano`);
		const system = Array.from({ length: 100 }, (_, i) => `P${i} | C |`);
		const rows = (n: number, word: string) =>
			Array.from({ length: n }, (_, v) => `lyrics ${v + 1}: | ${word} |`);
		const chart = [
			...parts,
			"## A",
			...system,
			...rows(300, "la"),
			"## A",
			"## A",
			"## A",
			...rows(400, "x"),
		].join("\n");
		const p = parseChart(chart);
		expect(p.bars).toHaveLength(3);
		// The stop explains the rest: the singing part falling out of step and the rows it left unsung.
		expect(p.diagnostics.map((d) => d.message)).toEqual([
			"expansion stopped after 3 bars: the bars played again sing too many verses (600)",
		]);
	});
});
