/** Import: lyrics as lyric rows (spec 5.8, grammar 7.7). */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { type ChartParse, parseChart, printChart, type Syllable } from "barmark";
import { AMAZING_GRACE } from "../../musicxml/tests/charts.js";
import { mulberry32 } from "../../sync/tests/helpers/fuzz.js";
import type { Grid } from "../src/import/grid.js";
import { withinRows, withLyrics } from "../src/import/lyrics.js";
import type { Note } from "../src/import/notes.js";
import { createReport } from "../src/import/report.js";
import { exportMidi, importMidi } from "../src/index.js";
import type { SmfEvent } from "../src/smf/types.js";
import { type Event, smf } from "./helpers/smf.js";

const PPQ = 480;
const BEAT = PPQ;
const BAR = 4 * PPQ;
const LYRIC = 0x05;
const utf8 = new TextEncoder();

/** A lyric event at `tick`. */
const lyric = (tick: number, text: string): SmfEvent => ({
	tick,
	kind: "meta",
	type: LYRIC,
	data: utf8.encode(text),
});

/** A note of the lyric track (track 2). */
const sung = (start: number, end: number, pitch = 69): Note => ({
	track: 2,
	channel: 0,
	pitch,
	start,
	end,
});

/** `bars` bars of 4/4 from tick 0. */
const grid4 = (bars: number): Grid => ({
	ppq: PPQ,
	bars: Array.from({ length: bars }, (_, i) => ({ start: i * BAR, meter: { n: 4, d: 4 } })),
	end: bars * BAR,
	pickup: false,
});

/** A chart of `bars` bars of C, four a line, as sync writes it. */
const chartOf = (bars: number) => {
	const lines: string[] = [];
	for (let i = 0; i < bars; i += 4)
		lines.push(
			`| ${Array(Math.min(4, bars - i))
				.fill("C")
				.join(" | ")} |`,
		);
	return printChart(`time: 4/4, tempo: 120\n${lines.join("\n")}\n`);
};

type Seam = Parameters<typeof withLyrics>[5];

/** `withLyrics` on a chart of `bars` bars, lyrics on track 2 (a conductor track 1 has none). */
function rows(bars: number, events: SmfEvent[], notes: Note[] = [], seam?: Seam) {
	const report = createReport();
	const chart = chartOf(bars);
	const text = withLyrics(
		chart,
		{ format: 1, ppq: PPQ, tracks: [[], events] },
		grid4(bars),
		notes,
		report,
		seam,
	);
	return { chart, text, diagnostics: report.list };
}

/** The chart with these rows under its lines, printed. */
const expected = (bars: number, ...lines: string[]) => {
	const out = chartOf(bars).split("\n");
	// Rows go after the bar line they cover: `@n` names the 1-based bar line.
	const barLines = out.flatMap((l, i) => (l.startsWith("|") ? [i] : []));
	const inserts = new Map<number, string[]>();
	for (const l of lines) {
		const m = /^@(\d+) (.*)$/.exec(l);
		const at = barLines[Number(m?.[1] ?? 1) - 1] ?? 0;
		inserts.set(at, [...(inserts.get(at) ?? []), m ? (m[2] ?? "") : l]);
	}
	return printChart(out.flatMap((l, i) => [l, ...(inserts.get(i) ?? [])]).join("\n"));
};

const written = (s: Syllable) =>
	s.kind === "sung" ? [s.parts.join("~") + (s.continues ? "-" : "")] : [];

/** Every verse's syllables in play order, as `text` or `text-`. */
function verses(parse: ChartParse): Map<number, string[]> {
	const out = new Map<number, string[]>();
	const sung = parse.bars.flatMap((bar) => bar.lyrics ?? []);
	for (const { verse, syllables } of sung)
		out.set(verse, [...(out.get(verse) ?? []), ...syllables.flatMap((s) => written(s.syllable))]);
	return out;
}

const noErrors = (text: string) => {
	expect(parseChart(text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	expect(printChart(text)).toBe(text);
};

describe("withLyrics", () => {
	test("two verses at one tick", () => {
		// MuseScore's lead sheet: bar 3 sings Hap- py / Whis- per on beats 1 and 3.
		const r = rows(
			4,
			[lyric(3840, "Hap"), lyric(3840, "Whis"), lyric(4800, "py "), lyric(4800, "per ")],
			[sung(3840, 4800), sung(4800, 5760, 72)],
		);
		// Two verses over the same bars are numbered (grammar 7.7: no unnumbered row among numbered ones).
		expect(r.text).toBe(
			expected(4, "lyrics 1: | -- | -- | Hap- py | -- |", "lyrics 2: | -- | -- | Whis- per | -- |"),
		);
		expect(r.diagnostics).toEqual([]);
		noErrors(r.text);
	});

	test("one verse is an unnumbered row", () => {
		const r = rows(1, [lyric(0, "la ")]);
		expect(r.text).toBe(expected(1, "lyrics: | la |"));
	});

	test("word ends", () => {
		const r = rows(4, [
			// No space after hel, but one before lo: two words.
			lyric(0, "hel"),
			lyric(2 * BEAT, " lo "),
			// No space: the word goes on; a trailing - continues it even with a space after.
			lyric(BAR, "a"),
			lyric(BAR + 2 * BEAT, "b- "),
			lyric(2 * BAR, "c "),
			lyric(2 * BAR + BEAT, "the‿end "),
			// MuseScore's elisions are SMuFL characters (U+E550–U+E552).
			lyric(2 * BAR + 2 * BEAT, "and\uE551I "),
			lyric(2 * BAR + 3 * BEAT, "a\uE550b\uE552c "),
			// The last syllable ends its word.
			lyric(3 * BAR, "last"),
		]);
		expect(r.text).toBe(expected(4, "lyrics: | hel lo | a- b- | c the~end and~I a~b~c | last |"));
	});

	test("placement on the coarsest grid", () => {
		const ring = (bar: number) => sung(bar * BAR, (bar + 1) * BAR);
		const r = rows(
			4,
			[
				// Beats 1 and 3: two slots.
				lyric(0, "a "),
				lyric(2 * BEAT, "b "),
				// Beat 1 and the "and" of 2: beats, the second in two.
				lyric(BAR, "c "),
				lyric(BAR + BEAT + BEAT / 2, "d "),
				// Off the sixteenth grid (370 is nearest the fourth sixteenth, 360).
				lyric(2 * BAR, "e "),
				lyric(2 * BAR + 370, "f "),
				// Ten ticks apart: one sixteenth, joined as an elision.
				lyric(3 * BAR, "g"),
				lyric(3 * BAR + 10, "h "),
			],
			[ring(0), ring(1), ring(2), ring(3)],
		);
		expect(r.text).toBe(expected(4, "lyrics: | a b | c /_d / / | e_/_/_f / / / | g~h |"));
		noErrors(r.text);
	});

	test("triplets and a compound meter", () => {
		const report = createReport();
		const text = withLyrics(
			printChart("time: 6/8, tempo: 60\n| C | C |\n"),
			{
				format: 1,
				ppq: PPQ,
				tracks: [
					[],
					[lyric(0, "a "), lyric(PPQ, "b "), lyric(3 * PPQ, "c "), lyric(3 * PPQ + PPQ / 2, "d ")],
				],
			},
			{
				ppq: PPQ,
				bars: [
					{ start: 0, meter: { n: 6, d: 8 } },
					{ start: 3 * PPQ, meter: { n: 6, d: 8 } },
				],
				end: 6 * PPQ,
				pickup: false,
			},
			[],
			report,
		);
		// 6/8 has two beats, each three eighths: a beat in three; no note sounds, so the rest are breaths.
		expect(text).toBe(
			printChart("time: 6/8, tempo: 60\n| C | C |\nlyrics: | a_--_b -- | c_d_-- -- |\n"),
		);
	});

	test("holds and breaths", () => {
		const r = rows(
			4,
			[
				lyric(0, "la "),
				lyric(3 * BEAT, "di "),
				lyric(3 * BAR, "do "),
				lyric(3 * BAR + 3 * BEAT, "re "),
			],
			[
				// la sounds through beat 2; nothing on beat 3; di is held into bar 2.
				sung(0, 2 * BEAT),
				sung(3 * BEAT, BAR + BEAT),
				// Another track's note sounding through bar 3 holds nothing.
				{ ...sung(2 * BAR, 3 * BAR), track: 3 },
				// A note struck with no syllable of its own (beat 3) holds from its start.
				sung(3 * BAR, 3 * BAR + BEAT),
				sung(3 * BAR + 2 * BEAT, 3 * BAR + 3 * BEAT),
				sung(3 * BAR + 3 * BEAT, 4 * BAR),
			],
		);
		expect(r.text).toBe(expected(4, "lyrics: | la / -- di | / | -- | do -- / re |"));
	});

	test("before a verse's first syllable a sounding note is a breath, not a hold", () => {
		const r = rows(2, [lyric(BAR + 2 * BEAT, "la ")], [sung(0, 2 * BAR)]);
		expect(r.text).toBe(expected(2, "lyrics: | -- | -- la |"));
	});

	test("hostile syllables", () => {
		const r = rows(4, [
			...["a|b ", "{C} ", "x_y ", '"q" '].map((t, i) => lyric(i * BEAT, t)),
			...["/ ", "-- ", "- ", "/- "].map((t, i) => lyric(BAR + i * BEAT, t)),
			...["~a ", "a~ ", "a~~b ", "c d "].map((t, i) => lyric(2 * BAR + i * BEAT, t)),
			// Every character a row can't hold as a syllable: nothing is left.
			lyric(3 * BAR, '|"{}_ '),
			lyric(3 * BAR + BEAT, "z"),
		]);
		expect(r.text).toBe(expected(4, "lyrics: | ab C xy q | -- | a a a~b c~d | -- z -- -- |"));
		noErrors(r.text);
	});

	test("a verse with no syllable on a bar line writes no row there", () => {
		const r = rows(8, [lyric(0, "one "), lyric(4 * BAR, "Two "), lyric(4 * BAR, "deux ")]);
		// Verse 2 sings only on the second line, so the first has verse 1's row alone.
		expect(r.text).toBe(
			expected(
				8,
				"@1 lyrics 1: | one | -- | -- | -- |",
				"@2 lyrics 1: | Two | -- | -- | -- |",
				"@2 lyrics 2: | deux | -- | -- | -- |",
			),
		);
		const none = rows(8, [lyric(0, "one ")]);
		expect(none.text).toBe(expected(8, "@1 lyrics: | one | -- | -- | -- |"));
	});

	test("syllables past the last bar are not placed", () => {
		const r = rows(1, [lyric(0, "in "), lyric(BAR, "out ")]);
		expect(r.text).toBe(expected(1, "lyrics: | in |"));
	});

	test("the self-check drops a verse, then all", () => {
		const events = [
			lyric(0, "Hap"),
			lyric(0, "Whis"),
			lyric(2 * BEAT, "py "),
			lyric(2 * BEAT, "per "),
		];
		// A brace makes verse 2's row an error.
		const brace = rows(1, events, [], (verse, row) =>
			verse === 2 ? row.replace("Whis-", "{Whis-") : row,
		);
		// Verse 1 alone is unnumbered again.
		expect(brace.text).toBe(expected(1, "lyrics: | Hap- py |"));
		expect(brace.diagnostics.map((d) => [d.code, d.severity])).toEqual([
			["lyrics-dropped", "warning"],
		]);
		expect(brace.diagnostics[0]?.message).toContain("verse 2");
		// A syllable that parses but isn't the one placed fails too.
		const wrong = rows(1, events, [], (verse, row) =>
			verse === 2 ? row.replace("per", "pear") : row,
		);
		expect(wrong.text).toBe(expected(1, "lyrics: | Hap- py |"));
		expect(wrong.diagnostics.map((d) => d.code)).toEqual(["lyrics-dropped"]);
		// A syllable sung where none was placed fails too.
		const extra = rows(2, [lyric(0, "a "), lyric(0, "b ")], [], (verse, row) =>
			verse === 2 ? row.replace("--", "x") : row,
		);
		expect(extra.text).toBe(expected(2, "lyrics: | a | -- |"));
		expect(extra.diagnostics.map((d) => d.message)).toEqual([
			"the lyric rows of verse 2 failed the import's check and are left out",
		]);
		// An error on no row: the last verse goes first, then the next.
		const stray = rows(1, events, [], (verse, row) => (verse === 1 ? `${row}\ntime: 99/0` : row));
		expect(stray.text).toBe(stray.chart);
		expect(stray.diagnostics.map((d) => d.message.match(/verse \d/)?.[0])).toEqual([
			"verse 2",
			"verse 1",
		]);
		// Rows that add a bar change the chart, so they fail even singing as placed.
		const bar = rows(1, [lyric(0, "a ")], [], (_, row) => `${row}\n| C |`);
		expect(bar.text).toBe(bar.chart);
		expect(bar.diagnostics.map((d) => d.code)).toEqual(["lyrics-dropped"]);
		// Every verse failing: the chart as it came, one warning a verse.
		const all = rows(1, events, [], (_, row) => row.replace("|", "| {"));
		expect(all.text).toBe(all.chart);
		expect(all.diagnostics.map((d) => d.code)).toEqual(["lyrics-dropped", "lyrics-dropped"]);
		expect(all.diagnostics.map((d) => d.message).join(" ")).toMatch(/verse 1.*verse 2/);
	});

	test("500 seeded hostile lyric tracks place without the self-check", () => {
		// Pieces a row could misread, joined at random; onsets anywhere; up to four verses at a tick.
		const pieces = [
			"a",
			"é",
			"|",
			'"',
			"{",
			"}",
			"_",
			"/",
			"-",
			"--",
			"~",
			"‿",
			" ",
			"\t",
			"x2",
			"%",
			":",
			"N.C.",
			"lyrics 2:",
			"\u200b",
			"\u202e",
			"\n",
		];
		const failures: string[] = [];
		for (let seed = 1; seed <= 500; seed++) {
			const r = mulberry32(seed);
			const pick = (n: number) => Math.floor(r() * n);
			const events: SmfEvent[] = [];
			for (let tick = pick(BEAT); tick < 4 * BAR; tick += 1 + pick(BAR / 2))
				for (let v = 1 + pick(4); v > 0; v--)
					events.push(
						lyric(
							tick,
							Array.from({ length: 1 + pick(4) }, () => pieces[pick(pieces.length)]).join(""),
						),
					);
			const out = rows(4, events, [sung(0, BAR), sung(2 * BAR + 7, 3 * BAR - 5)]);
			const errors = parseChart(out.text).diagnostics.filter((d) => d.severity === "error");
			// Verses vary in number at a tick here, so that warning is expected.
			const others = out.diagnostics.filter((d) => d.code !== "lyrics-verses-uncertain");
			if (others.length > 0 || errors.length > 0 || printChart(out.text) !== out.text)
				failures.push(`seed ${seed}: ${JSON.stringify([others, errors])}`);
		}
		expect(failures).toEqual([]);
	});

	test("verses past 100 at one tick are left out (a bound: the parser slows with rows per bar line)", () => {
		const events = Array.from({ length: 102 }, (_, i) => lyric(0, `v${i + 1} `));
		const r = rows(1, events);
		const verses = r.text.split("\n").filter((l) => l.startsWith("lyrics"));
		expect(verses).toHaveLength(100);
		expect(verses.at(-1)).toStartWith("lyrics 100: | v100");
		expect(r.diagnostics.map((d) => [d.code, d.severity, d.message])).toEqual([
			["lyrics-dropped", "warning", "verses past 100 at one tick are left out (2 times)"],
		]);
		noErrors(r.text);
	});

	test("at most 20,000 lyric rows: later verses are left out", () => {
		// 100 verses each singing under 201 one-bar lines: the 100th would make 20,100 rows.
		const lines = Array.from({ length: 201 }, (_, i) => ({ bars: [i] }));
		const sings = new Map(lines.map((_, i) => [i, { text: "a", sings: ["0 a"] }]));
		const cells = new Map(Array.from({ length: 100 }, (_, v) => [v + 1, sings]));
		let dropped = 0;
		const kept = withinRows([...cells.keys()], cells, lines, () => dropped++);
		expect(kept).toEqual(Array.from({ length: 99 }, (_, v) => v + 1));
		expect(dropped).toBe(1);
		// A verse counts only the bar lines it sings under.
		const one = new Map([[0, { text: "a", sings: ["0 a"] }]]);
		const sparse = new Map(Array.from({ length: 100 }, (_, v) => [v + 1, one]));
		expect(withinRows([...sparse.keys()], sparse, lines, () => dropped++)).toHaveLength(100);
	});

	test("a chart whose bars aren't the grid's drops every verse", () => {
		const report = createReport();
		const chart = chartOf(1);
		const events = [lyric(0, "a "), lyric(0, "b ")];
		const text = withLyrics(
			chart,
			{ format: 1, ppq: PPQ, tracks: [[], events] },
			grid4(2),
			[],
			report,
		);
		expect(text).toBe(chart);
		expect(report.list.map((d) => d.code)).toEqual(["lyrics-dropped", "lyrics-dropped"]);
	});

	test("no lyric events leave the chart unchanged", () => {
		const r = rows(2, [], [sung(0, BAR)]);
		expect(r.text).toBe(r.chart);
		expect(r.diagnostics).toEqual([]);
	});
});

/** An event at an absolute tick, for the end-to-end files. */
type At = { tick: number; e: Omit<Event, "dt"> };
const at = (tick: number, e: object): At => ({ tick, e: e as Omit<Event, "dt"> });
const track = (events: At[]): Event[] => {
	let last = 0;
	return [...events]
		.sort((a, b) => a.tick - b.tick)
		.map(({ tick, e }) => {
			const dt = tick - last;
			last = tick;
			return { dt, ...e } as Event;
		});
};
const held = (pitches: number[], start: number, end: number, ch: number): At[] =>
	pitches.flatMap((p) => [at(start, { on: [ch, p, 80] }), at(end, { off: [ch, p] })]);

/** Chords C and F, a sung track 3 with lyrics, and a track 4 with lyrics of its own. */
const band = () =>
	smf({
		format: 1,
		ppq: PPQ,
		tracks: [
			track([at(0, { tempo: 120 }), at(0, { time: [4, 4] })]),
			track([...held([48, 64, 67], 0, BAR, 0), ...held([53, 60, 65, 69], BAR, 2 * BAR, 0)]),
			track([
				...held([72], 0, BAR, 1),
				at(0, { lyric: "Sing " }),
				...held([74], BAR, 2 * BAR, 1),
				at(BAR, { lyric: "on " }),
			]),
			track([...held([79], 0, BAR, 2), at(0, { lyric: "Other " })]),
		],
	});

describe("importMidi's lyrics", () => {
	test("rows from the first track with lyrics; other tracks with lyrics named", () => {
		const r = importMidi(band());
		expect(r.text).toBe(printChart("time: 4/4, tempo: 120\n| C | F |\nlyrics: | Sing | on |\n"));
		const other = r.diagnostics.filter((d) => d.code === "lyrics-other-tracks");
		expect(other).toHaveLength(1);
		expect(other[0]?.severity).toBe("info");
		expect(other[0]?.track).toBe(4);
		expect(other[0]?.message).toContain("track 4");
	});

	test("the grid runs to the last lyric: a vocal tail past the last chord keeps its bars", () => {
		const chart =
			"time: 4/4, tempo: 120\n| C | G | N.C. | N.C. |\nlyrics: | one two three four | five six sev- en | eight nine ten e- | lev- en end / |\n";
		const out = exportMidi(chart);
		if (!out.ok) throw new Error("export failed");
		const back = importMidi(out.bytes);
		noErrors(back.text);
		expect(parseChart(back.text).bars).toHaveLength(4);
		expect(verses(parseChart(back.text))).toEqual(verses(parseChart(chart)));
		// A last lyric on a bar line brings its bar.
		const downbeat = exportMidi("time: 4/4, tempo: 120\n| C | N.C. |\nlyrics: | one | two |\n");
		if (!downbeat.ok) throw new Error("export failed");
		expect(importMidi(downbeat.bytes).text).toBe(
			printChart("time: 4/4, tempo: 120\n| C | N.C. |\nlyrics: | one | two |\n"),
		);
		// lyrics: false reads no lyric, so the grid ends with the chords.
		expect(parseChart(importMidi(out.bytes, { lyrics: false }).text).bars).toHaveLength(2);
	});

	test("verses told by order at a tick: a varying count warns", () => {
		// Verse 1 holds where verse 2 sings, so at those ticks verse 2's syllable is the only one, read as verse 1.
		const chart =
			"time: 4/4, tempo: 120\n| C | G |\nlyrics 1: | glo- / ri- a | men / / / |\nlyrics 2: | one two three four | five six sev- en |\n";
		const out = exportMidi(chart);
		if (!out.ok) throw new Error("export failed");
		const back = importMidi(out.bytes);
		noErrors(back.text);
		const uncertain = back.diagnostics.filter((d) => d.code === "lyrics-verses-uncertain");
		expect(uncertain.map((d) => [d.severity, d.track])).toEqual([["warning", 2]]);
		// The same count at every tick: no warning.
		const even = exportMidi(
			"time: 4/4, tempo: 120\n| C | G |\nlyrics 1: | a b | c d |\nlyrics 2: | e f | g h |\n",
		);
		if (!even.ok) throw new Error("export failed");
		expect(importMidi(even.bytes).diagnostics.map((d) => d.code)).not.toContain(
			"lyrics-verses-uncertain",
		);
	});

	test("MuseScore's hymn: its elision character is ~", () => {
		const bytes = new Uint8Array(readFileSync(new URL("fixtures/hymn.mid", import.meta.url)));
		const r = importMidi(bytes);
		noErrors(r.text);
		expect(r.text).toContain("heart / and~I");
		expect(r.diagnostics.map((d) => d.code)).toEqual(["melody-left-out"]);
	});

	test("a karaoke file's text events are its lyrics", () => {
		const kar = smf({
			format: 1,
			ppq: PPQ,
			tracks: [
				track([at(0, { tempo: 120 }), at(0, { time: [4, 4] })]),
				track([...held([48, 64, 67], 0, BAR, 0), ...held([53, 60, 65, 69], BAR, 2 * BAR, 0)]),
				track([
					at(0, { text: "@KMIDI KARAOKE FILE" }),
					at(0, { text: "@LENGL" }),
					at(0, { text: "@TMy Song" }),
					at(0, { text: "\\Hel" }),
					// No space after lo: the / before world ends its word.
					at(PPQ, { text: "lo" }),
					at(2 * PPQ, { text: "/world " }),
					at(BAR, { text: "\\next" }),
					...held([72], 0, 2 * BAR, 1),
				]),
			],
		});
		const r = importMidi(kar);
		noErrors(r.text);
		expect(r.text).toBe(
			printChart("time: 4/4, tempo: 120\n| C | F |\nlyrics: | Hel- lo world / | next |\n"),
		);
		// Text events in a track with no @ line are not lyrics.
		const plain = smf({
			format: 1,
			ppq: PPQ,
			tracks: [
				track([at(0, { tempo: 120 }), at(0, { time: [4, 4] })]),
				track([...held([48, 64, 67], 0, BAR, 0), at(0, { text: "solo" })]),
			],
		});
		expect(importMidi(plain).text).toBe("time: 4/4, tempo: 120\n| C |\n");
	});

	test("lyrics: false writes none", () => {
		const r = importMidi(band(), { lyrics: false });
		expect(r.text).toBe("time: 4/4, tempo: 120\n| C | F |\n");
		expect(r.diagnostics.map((d) => d.code)).not.toContain("lyrics-other-tracks");
	});

	test("the lead sheet round trip", () => {
		const leadSheet = readFileSync(
			new URL("../../musicxml/tests/fixtures/import/lead-sheet.chart.md", import.meta.url),
			"utf8",
		);
		for (const chart of [leadSheet, AMAZING_GRACE]) {
			const out = exportMidi(chart);
			if (!out.ok) throw new Error("export failed");
			const back = importMidi(out.bytes);
			expect(back.diagnostics.map((d) => d.code)).not.toContain("lyrics-dropped");
			noErrors(back.text);
			const theirs = verses(parseChart(chart));
			expect(theirs.size).toBe(2);
			expect(verses(parseChart(back.text))).toEqual(theirs);
		}
	});
});
