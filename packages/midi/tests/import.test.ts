import { describe, expect, test } from "bun:test";
import { parseChart, printChart } from "barmark";
import { importMidi, type MidiImportResult } from "../src/index.js";
import { type Event, smf } from "./helpers/smf.js";

const PPQ = 480;
const BAR = 4 * PPQ;

/** An event at an absolute tick; `at` turns a list of them into the helper's delta times. */
type At = { tick: number; e: Omit<Event, "dt"> };
const at = (tick: number, e: object): At => ({ tick, e: e as Omit<Event, "dt"> });

function track(events: At[]): Event[] {
	let last = 0;
	return events
		.map((x, i) => ({ ...x, i }))
		.sort((a, b) => a.tick - b.tick || a.i - b.i)
		.map(({ tick, e }) => {
			const dt = tick - last;
			last = tick;
			return { dt, ...e } as Event;
		});
}

/** A chord on channel `ch` from `start` for `length` ticks. */
const chord = (pitches: number[], start: number, length: number, ch = 0): At[] =>
	pitches.flatMap((p) => [at(start, { on: [ch, p, 80] }), at(start + length, { off: [ch, p] })]);

/** One bar each: C, F, G, C (with a bass), from tick `from`. */
const CFGC = (from = 0) => [
	...chord([36, 60, 64, 67], from, BAR),
	...chord([41, 60, 65, 69], from + BAR, BAR),
	...chord([43, 62, 67, 71], from + 2 * BAR, BAR),
	...chord([36, 60, 64, 67], from + 3 * BAR, BAR),
];

/** A format 1 file: a conductor track of `meta` events, then one track of `notes`. */
const file = (meta: At[], notes: At[], name?: string) =>
	smf({
		format: 1,
		ppq: PPQ,
		tracks: [track(meta), track([...(name ? [at(0, { name })] : []), ...notes])],
	});

/** Control characters, line and paragraph separators, a bidi override, a zero-width space. */
const HIDDEN = /[\p{Cc}\u2028\u2029\u202e\u200b]/u;

const errors = (r: MidiImportResult) => r.diagnostics.filter((d) => d.severity === "error");
const codes = (r: MidiImportResult) => r.diagnostics.map((d) => d.code);

/** Every import's chart: "" exactly on an error; else it parses with no errors and prints unchanged. */
function valid(r: MidiImportResult): MidiImportResult {
	if (errors(r).length > 0) expect(r.text).toBe("");
	else {
		expect(r.text).not.toBe("");
		expect(parseChart(r.text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(printChart(r.text)).toBe(r.text);
	}
	return r;
}

const read = (bytes: Uint8Array, options?: Parameters<typeof importMidi>[1]) =>
	valid(importMidi(bytes, options));

describe("importMidi", () => {
	test("a chord chart from a file", () => {
		const r = read(file([at(0, { tempo: 120 }), at(0, { time: [4, 4] })], CFGC()));
		expect(r.text).toBe("time: 4/4, tempo: 120\n| C | F | G | C |\n");
		expect(r.diagnostics).toEqual([]);
	});

	test("the tempo is the file's, and sync's nominal clock raises nothing", () => {
		const r = read(file([at(0, { tempo: 60 })], CFGC()));
		expect(r.text).toBe("time: 4/4, tempo: 60\n| C | F | G | C |\n");
		expect(r.diagnostics).toEqual([]);
	});

	test("never throws; text is empty exactly on an error", () => {
		const cases: [Uint8Array, string][] = [
			[new Uint8Array(), "not-midi"],
			[Uint8Array.from([0x4d, 0x54, 0x68, 0x64]), "not-midi"],
			[smf({ format: 2, tracks: [track(CFGC())] }), "format-2"],
			[
				smf({ format: 0, tracks: [track(CFGC().map((x) => ({ ...x, e: drum(x.e) })))] }),
				"no-notes",
			],
		];
		for (const [bytes, code] of cases) {
			const r = read(bytes);
			expect(r.text).toBe("");
			expect(codes(r)).toContain(code as never);
		}
	});

	test("an internal error is a diagnostic, never a throw", () => {
		const r = importMidi(null as unknown as Uint8Array);
		expect(r.text).toBe("");
		expect(r.diagnostics).toHaveLength(1);
		expect(r.diagnostics[0]?.code).toBe("not-midi");
		expect(r.diagnostics[0]?.message).toStartWith("internal error: ");
	});

	test("simile and barsPerLine are sync's", () => {
		const half = BAR / 2;
		const CG = (from: number) => [
			...chord([36, 60, 64, 67], from, half),
			...chord([43, 62, 67, 71], from + half, half),
		];
		const notes = [...CG(0), ...CG(BAR), ...CFGC(2 * BAR)];
		expect(read(file([], notes)).text).toBe(
			"time: 4/4, tempo: 120\n| C G | % | C | F |\n| G | C |\n",
		);
		expect(read(file([], notes), { simile: false, barsPerLine: 3 }).text).toBe(
			"time: 4/4, tempo: 120\n| C G | C G | C |\n| F | G | C |\n",
		);
	});

	test("markers are sections, the first on a bar kept", () => {
		const r = read(
			file(
				[at(0, { marker: "Verse" }), at(0, { marker: "A" }), at(4 * BAR, { marker: "Chorus" })],
				[...CFGC(), ...CFGC(4 * BAR)],
			),
		);
		expect(r.text).toBe(
			"time: 4/4, tempo: 120\n\n## Verse\n| C | F | G | C |\n\n## Chorus\n| C | F | G | C |\n",
		);
		const dropped = r.diagnostics.filter((d) => d.code === "marker-dropped");
		expect(dropped).toEqual([
			{ severity: "info", code: "marker-dropped", message: expect.any(String), bar: 1 },
		]);
	});

	test("a marker belongs to the bar line nearest it, as sync snaps it", () => {
		// "Late" is three quarters into bar 4, so nearer bar 5, where "Chorus" is: one heading
		const r = read(
			file(
				[at(3 * BAR + 3 * PPQ, { marker: "Late" }), at(4 * BAR, { marker: "Chorus" })],
				[...CFGC(), ...CFGC(4 * BAR)],
			),
		);
		expect(r.text).toBe("time: 4/4, tempo: 120\n| C | F | G | C |\n\n## Late\n| C | F | G | C |\n");
		expect(codes(r)).toEqual(["marker-dropped"]);
		expect(r.diagnostics[0]?.bar).toBe(5);
	});

	test("the title", () => {
		const conductor = smf({
			format: 1,
			ppq: PPQ,
			tracks: [track([at(0, { name: "Song" })]), track([at(0, { name: "Piano" }), ...CFGC()])],
		});
		expect(read(conductor).text).toStartWith("# Song\n");
		// MuseScore's shape: track 1 is the first part, with notes
		const voice = smf({
			format: 1,
			ppq: PPQ,
			tracks: [track([at(0, { name: "Voice" }), ...CFGC()]), track([at(0, { name: "Piano" })])],
		});
		expect(read(voice).text).toStartWith("time: 4/4");
		const zero = smf({
			format: 0,
			ppq: PPQ,
			tracks: [track([at(0, { name: "Tune" }), ...CFGC()])],
		});
		expect(read(zero).text).toStartWith("# Tune\n");
	});

	test("hostile names (Review Focus 3)", () => {
		const names = ["Intro\n| C |", "## Coda", "key: G", "x2", "\u001b[31mred"];
		const titles = ["Intro | C |", "## Coda", "key: G", "x2", "[31mred"];
		const markers = names.map((name, i) => at(i * BAR, { marker: name }));
		const notes = [...CFGC(), ...chord([36, 60, 64, 67], 4 * BAR, BAR)];
		// one heading a marker, x2 none (its bar joins the line before); each title one line
		const body =
			"time: 4/4, tempo: 120\n\n## Intro | C |\n| C |\n\n## ## Coda\n| F |\n\n## key: G\n| G | C |\n\n## [31mred\n| C |\n";
		for (const [i, title] of names.entries()) {
			const r = read(
				smf({
					format: 1,
					ppq: PPQ,
					tracks: [track([at(0, { name: title }), ...markers]), track(notes)],
				}),
			);
			expect(r.text).toBe(`# ${titles[i]}\n${body}`);
			expect(r.text.replace(/\n/g, "")).not.toMatch(HIDDEN);
			expect(r.diagnostics).toEqual([
				{ severity: "warning", code: "section-unnamed", message: expect.any(String), bar: 4 },
			]);
		}
	});

	test("text: a newline or a tab is a space, then other controls go", () => {
		const r = read(file([at(0, { marker: "Intro\n| C |" })], CFGC()));
		expect(r.text).toContain("\n## Intro | C |\n");
		const title = smf({
			format: 0,
			ppq: PPQ,
			tracks: [track([at(0, { name: "My\tSong\u2028\u202e\u200bOne" }), ...CFGC()])],
		});
		expect(read(title).text).toStartWith("# My SongOne\n");
	});

	test("sync's diagnostics come through with their codes", () => {
		const r = read(file([at(8 * BAR, { marker: "Coda" })], CFGC()));
		const after = r.diagnostics.filter((d) => d.code === "after-last-bar");
		expect(after).toEqual([
			{ severity: "warning", code: "after-last-bar", message: expect.any(String), bar: 4 },
		]);
		expect(r.text).toBe("time: 4/4, tempo: 120\n| C | F | G | C |\n");
	});

	test("sync's messages carry no names read from the file", () => {
		// a hundred markers, each a different name sync repairs
		const markers = Array.from({ length: 100 }, (_, i) => at(i * BAR, { marker: `Part ${i} x2` }));
		const notes = Array.from({ length: 100 }, (_, i) =>
			chord([36, 60, 64, 67], i * BAR, BAR),
		).flat();
		const r = read(file(markers, notes));
		const stripped = r.diagnostics.filter((d) => d.code === "section-marks-stripped");
		expect(stripped).toHaveLength(1);
		expect(stripped[0]?.message).not.toContain("Part");
		expect(stripped[0]?.bar).toBe(1);
	});

	test("one numbering: a pickup is bar 1 in the chart and in every diagnostic", () => {
		// a 1/4 pickup then 4/4: an unnameable cluster in played bar 3, a marker past the end
		const cluster = chord([60, 61, 62, 63, 64], PPQ + BAR, BAR);
		const notes = [
			...chord([43, 50, 67], 0, PPQ),
			...chord([36, 60, 64, 67], PPQ, BAR),
			...cluster,
			...chord([36, 60, 64, 67], PPQ + 2 * BAR, BAR),
		];
		const meta = [
			at(0, { time: [1, 4] }),
			at(PPQ, { time: [4, 4] }),
			at(PPQ + 9 * BAR, { marker: "Late" }),
		];
		const r = read(file(meta, notes));
		expect(r.text).toBe("time: 4/4, tempo: 120\n| [1/4] G5 | C | ? | C |\n");
		expect(r.diagnostics.find((d) => d.code === "chord-unnamed")?.bar).toBe(3);
		expect(r.diagnostics.find((d) => d.code === "after-last-bar")?.bar).toBe(4);
	});

	test("a first bar sync can't write as a pickup is a bar with its own meter", () => {
		// 1/8 then 4/4: not whole beats of 4/4, so `time: 1/8` and a change, not a pickup sync would drop
		const notes = [...chord([43, 50, 67], 0, PPQ / 2), ...CFGC(PPQ / 2)];
		const meta = [at(0, { time: [1, 8] }), at(PPQ / 2, { time: [4, 4] })];
		const r = read(file(meta, notes));
		expect(codes(r)).not.toContain("pickup-ignored");
		expect(r.text).toBe(
			"time: 1/8, tempo: 240\n| G5 |\ntime: 4/4, tempo: 120\n| C | F | G | C |\n",
		);
	});

	test("absurd tempos and meters are dropped with a diagnostic, never written", () => {
		// 1 microsecond a quarter (60,000,000 qpm), and 255/16
		const fast = file([at(0, { meta: [0x51, [0, 0, 1]] })], CFGC());
		const r = read(fast);
		expect(codes(r)).toContain("tempo-unreadable");
		expect(r.text).toBe("time: 4/4\n| C | F | G | C |\n");
		const wide = read(file([at(0, { time: [255, 16] })], CFGC()));
		expect(codes(wide)).toContain("meter-unreadable");
		const later = read(
			file([at(0, { tempo: 120 }), at(2 * BAR, { meta: [0x51, [0, 0, 1]] })], CFGC()),
		);
		expect(codes(later)).toContain("change-unreadable");
		expect(later.text).toBe("time: 4/4, tempo: 120\n| C | F | G | C |\n");
	});
});

/** The same event on channel 10. */
function drum(e: Omit<Event, "dt">): Omit<Event, "dt"> {
	const { on, off } = e as { on?: [number, number, number]; off?: [number, number] };
	if (on) return { on: [9, on[1], on[2]] };
	if (off) return { off: [9, off[1]] };
	return e;
}
