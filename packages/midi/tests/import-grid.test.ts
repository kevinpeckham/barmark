import { describe, expect, test } from "bun:test";
import { type Change, directivesOf } from "../src/import/directives.js";
import { gridOf } from "../src/import/grid.js";
import type { Note } from "../src/import/notes.js";
import { createReport, type Report } from "../src/import/report.js";
import { exportMidi } from "../src/index.js";
import { readSmf } from "../src/smf/read.js";
import type { Smf, SmfEvent } from "../src/smf/types.js";

const PPQ = 480;
const BAR = 1920;

/** A tempo event, as whole microseconds a quarter. */
const tempo = (tick: number, qpm: number, micros = Math.round(60_000_000 / qpm)): SmfEvent => ({
	tick,
	kind: "meta",
	type: 0x51,
	data: new Uint8Array([(micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff]),
});
const time = (tick: number, n: number, d: number): SmfEvent => ({
	tick,
	kind: "meta",
	type: 0x58,
	data: new Uint8Array([n, Math.log2(d), 24, 8]),
});
const key = (tick: number, sf: number, mi: number): SmfEvent => ({
	tick,
	kind: "meta",
	type: 0x59,
	data: new Uint8Array([sf & 0xff, mi]),
});

const file = (...tracks: SmfEvent[][]): Smf => ({ format: 1, ppq: PPQ, tracks });
const codes = (report: Report) => report.list.map((d) => [d.code, d.bar]);
const starts = (smf: Smf, lastTick: number, report = createReport()) =>
	gridOf(smf, lastTick, report).bars.map((b) => b.start);

/** A chord of `pitches` from `start` to `end`, on track 1. */
const chord = (pitches: number[], start: number, end: number): Note[] =>
	pitches.map((pitch) => ({ track: 1, channel: 0, pitch, start, end }));

/** The file's directives over a grid that ends with the harmony. */
function directives(smf: Smf, harmony: Note[] = chord([60], 0, 8 * BAR)) {
	const report = createReport();
	const end = harmony.reduce((last, n) => Math.max(last, n.end), 0);
	const grid = gridOf(smf, end, report);
	return { ...directivesOf(smf, grid, harmony, report), report, grid };
}
/** Nominal seconds: a quarter is half a second. */
const sec = (tick: number) => tick / PPQ / 2;
const tempos = (changes: Change[]) => changes.filter((c) => c.kind === "tempo");

describe("gridOf", () => {
	test("defaults", () => {
		const report = createReport();
		const grid = gridOf(file([]), 3 * BAR, report);
		expect(grid.ppq).toBe(PPQ);
		expect(grid.bars).toEqual([0, 1, 2].map((i) => ({ start: i * BAR, meter: { n: 4, d: 4 } })));
		expect(grid.end).toBe(3 * BAR);
		expect(grid.pickup).toBe(false);
		expect(directives(file([])).tempo).toBe(120);
		expect(report.list).toEqual([]);
	});

	test("bars follow the meter map", () => {
		const smf = file([time(0, 4, 4), time(2 * BAR, 3, 4)]);
		expect(starts(smf, 5300)).toEqual([0, 1920, 3840, 5280]);
		const grid = gridOf(smf, 5300, createReport());
		expect(grid.bars.map((b) => `${b.meter.n}/${b.meter.d}`)).toEqual(["4/4", "4/4", "3/4", "3/4"]);
		expect(grid.end).toBe(6720);
	});

	test("meter events from every track, the last at one tick winning", () => {
		const smf = file([time(0, 2, 4)], [time(0, 3, 4)]);
		expect(starts(smf, 2000)).toEqual([0, 1440]);
		expect(starts(file([time(0, 3, 4), time(0, 2, 4)]), 2000)).toEqual([0, 960, 1920]);
	});

	test("meter events are taken by tick, whatever their track", () => {
		const smf = file([time(2 * BAR, 3, 4)], [time(0, 2, 4)]);
		expect(starts(smf, 4000)).toEqual([0, 960, 1920, 2880, 3840]);
	});

	test("a signature inside a bar starts one", () => {
		const report = createReport();
		const grid = gridOf(file([time(0, 4, 4), time(960, 3, 4)]), 2500, report);
		expect(grid.bars).toEqual([
			{ start: 0, meter: { n: 2, d: 4 } },
			{ start: 960, meter: { n: 3, d: 4 } },
			{ start: 2400, meter: { n: 3, d: 4 } },
		]);
		expect(codes(report)).toEqual([["meter-mid-bar", 1]]);
		expect(report.list[0]?.severity).toBe("warning");
		// shorter than the bar after it, and a signature there changes the meter
		expect(grid.pickup).toBe(true);
	});

	test("a cut bar is in the signature's units when whole, else in sixteenths, rounded", () => {
		const meters = (smf: Smf) => gridOf(smf, 1, createReport()).bars[0]?.meter;
		expect(meters(file([time(0, 6, 8), time(720, 6, 8)]))).toEqual({ n: 3, d: 8 });
		expect(meters(file([time(0, 4, 4), time(600, 3, 4)]))).toEqual({ n: 5, d: 16 });
		expect(meters(file([time(0, 4, 4), time(650, 3, 4)]))).toEqual({ n: 5, d: 16 });
		expect(meters(file([time(0, 4, 4), time(700, 3, 4)]))).toEqual({ n: 6, d: 16 });
		expect(meters(file([time(0, 4, 4), time(10, 3, 4)]))).toEqual({ n: 1, d: 16 });
	});

	test("the end", () => {
		const grid = gridOf(
			file([{ tick: 20_000, kind: "meta", type: 0x2f, data: new Uint8Array() }]),
			2000,
			createReport(),
		);
		expect(grid.bars.map((b) => b.start)).toEqual([0, 1920]);
		expect(grid.end).toBe(3840);
	});

	test("the end is exclusive", () => {
		const grid = gridOf(file([]), 1920, createReport());
		expect(grid.bars.map((b) => b.start)).toEqual([0]);
		expect(grid.end).toBe(1920);
		expect(gridOf(file([]), 1921, createReport()).end).toBe(3840);
	});

	test("the bound counts the pickup", () => {
		const pickup = file([time(0, 1, 4), time(480, 4, 4)]);
		const fits = createReport();
		const grid = gridOf(pickup, 480 + 9_999 * BAR, fits);
		expect(grid.pickup).toBe(true);
		expect(grid.bars.length).toBe(10_000);
		expect(fits.list).toEqual([]);

		const over = createReport();
		const big = gridOf(pickup, 480 + 10_000 * BAR, over);
		expect(big.bars).toEqual([]);
		expect(over.list.map((d) => [d.severity, d.code])).toEqual([["error", "too-large"]]);
		expect(over.list[0]?.message).toContain("more than 10,000 bars");
		// without a pickup, 10,000 bars fit
		expect(gridOf(file([]), 10_000 * BAR, createReport()).bars.length).toBe(10_000);
	});

	test("a hostile end costs no more than the bound", () => {
		const report = createReport();
		const grid = gridOf(file([time(0, 1, 16)]), 2 ** 40, report);
		expect(grid.bars).toEqual([]);
		expect(codes(report)).toEqual([["too-large", undefined]]);
	});

	test("a pickup", () => {
		const hymn = directives(file([time(0, 1, 4), time(480, 3, 4)]), chord([60], 0, 480 + 2 * 1440));
		expect(hymn.grid.pickup).toBe(true);
		expect(hymn.grid.bars.map((b) => b.start)).toEqual([0, 480, 1920]);
		expect(hymn.meter).toBe("3/4");
		expect(hymn.changes.filter((c) => c.kind === "meter")).toEqual([]);
		// the count-in bar is kept
		const countIn = directives(file([]), chord([60], BAR, 2 * BAR));
		expect(countIn.grid.pickup).toBe(false);
		expect(countIn.grid.bars.map((b) => b.start)).toEqual([0, 1920]);
		expect(countIn.meter).toBe("4/4");
		// shorter but no signature at bar 2: none; a signature there that keeps the meter: none
		expect(gridOf(file([time(0, 4, 4), time(960, 4, 4)]), 3000, createReport()).pickup).toBe(false);
	});
});

describe("directivesOf", () => {
	test("meter changes", () => {
		const d = directives(file([time(0, 4, 4), time(2 * BAR, 3, 4)]), chord([60], 0, 5300));
		expect(d.meter).toBe("4/4");
		expect(d.changes).toEqual([{ kind: "meter", start: sec(3840), value: "3/4" }]);
	});

	test("changes come by start, whatever their kind", () => {
		const d = directives(
			file([
				time(0, 4, 4),
				time(2 * BAR, 3, 4),
				tempo(0, 120),
				tempo(BAR, 90),
				key(0, 0, 0),
				key(BAR, 2, 0),
			]),
			[...chord([60, 64, 67], 0, BAR), ...chord([62, 66, 69], BAR, 5000)],
		);
		expect(d.changes.map((c) => [c.kind, c.start])).toEqual([
			["tempo", sec(BAR)],
			["key", sec(BAR)],
			["meter", sec(2 * BAR)],
		]);
	});

	test("tempo in the beat", () => {
		expect(directives(file([time(0, 6, 8), tempo(0, 90)])).tempo).toBe(60);
		const step = directives(file([tempo(0, 120), tempo(2 * BAR, 96)]));
		expect(step.tempo).toBe(120);
		expect(tempos(step.changes)).toEqual([{ kind: "tempo", start: sec(2 * BAR), value: 96 }]);
		expect(step.report.list).toEqual([]);
		expect(directives(file([tempo(0, 87.50003, 685_714)])).tempo).toBe(87.5);
		// half notes in 2/2; a meter change at a steady qpm is a tempo change in the beat
		expect(directives(file([time(0, 2, 2), tempo(0, 120)])).tempo).toBe(60);
		const compound = directives(file([tempo(0, 120), time(BAR, 6, 8)]));
		expect(tempos(compound.changes)).toEqual([{ kind: "tempo", start: sec(BAR), value: 80 }]);
	});

	test("tempo events from every track, the last at one tick winning", () => {
		expect(directives(file([tempo(0, 100)], [tempo(0, 90)])).tempo).toBe(90);
		expect(directives(file([tempo(0, 90), tempo(0, 100)])).tempo).toBe(100);
		const late = directives(file([tempo(BAR, 90)], [tempo(0, 100)]));
		expect([late.tempo, tempos(late.changes)]).toEqual([
			100,
			[{ kind: "tempo", start: sec(BAR), value: 90 }],
		]);
		// a tempo after the downbeat is not the bar's
		expect(directives(file([tempo(1, 90)])).tempo).toBe(120);
	});

	test("a pickup's tempo counts the beat of the bar after it", () => {
		const d = directives(
			file([time(0, 1, 8), time(240, 6, 8), tempo(0, 90)]),
			chord([60], 0, 240 + 1440),
		);
		expect(d.grid.pickup).toBe(true);
		expect(d.tempo).toBe(60);
		expect(d.changes).toEqual([]);
	});

	test("a ramp writes its end", () => {
		// 100 to bar 2, then 95, 90, 85 at the downbeats of bars 3-5, each bar sliding on, and 80 at bar 6
		const five = directives(
			file([
				tempo(0, 100),
				tempo(2 * BAR, 95),
				tempo(2 * BAR + 960, 92.5),
				tempo(3 * BAR, 90),
				tempo(3 * BAR + 960, 87.5),
				tempo(4 * BAR, 85),
				tempo(4 * BAR + 960, 82.5),
				tempo(5 * BAR, 80),
			]),
		);
		expect(tempos(five.changes)).toEqual([{ kind: "tempo", start: sec(5 * BAR), value: 80 }]);
		expect(five.report.list.map((d) => [d.severity, d.code, d.bar])).toEqual([
			["info", "tempo-ramp", 6],
		]);

		const three = directives(
			file([tempo(0, 100), tempo(BAR, 90), tempo(BAR + 960, 85), tempo(2 * BAR, 80)]),
		);
		expect(three.tempo).toBe(100);
		expect(tempos(three.changes)).toEqual([{ kind: "tempo", start: sec(2 * BAR), value: 80 }]);
		expect(codes(three.report)).toEqual([["tempo-ramp", 3]]);

		// a ramp still sliding in the last bar ends at the last downbeat
		const sliding = directives(
			file([
				tempo(0, 100),
				tempo(BAR, 90),
				tempo(BAR + 960, 85),
				tempo(2 * BAR, 80),
				tempo(2 * BAR + 960, 75),
			]),
			chord([60], 0, 3 * BAR),
		);
		expect(tempos(sliding.changes)).toEqual([{ kind: "tempo", start: sec(2 * BAR), value: 80 }]);

		const single = directives(file([tempo(0, 100), tempo(BAR, 80)]));
		expect(tempos(single.changes)).toEqual([{ kind: "tempo", start: sec(BAR), value: 80 }]);
		expect(single.report.list).toEqual([]);

		// a ramp still sliding in its last bar, then a change the other way: the ramp's end, then a plain change
		const back = directives(
			file([
				tempo(0, 100),
				tempo(BAR, 90),
				tempo(BAR + 960, 85),
				tempo(2 * BAR, 80),
				tempo(2 * BAR + 960, 75),
				tempo(3 * BAR, 100),
			]),
		);
		expect(tempos(back.changes).map((c) => [c.start, c.value])).toEqual([
			[sec(2 * BAR), 80],
			[sec(3 * BAR), 100],
		]);
		// two plain changes a bar apart with a steady bar between are not a ramp
		const apart = directives(file([tempo(0, 100), tempo(BAR, 90), tempo(3 * BAR, 80)]));
		expect(tempos(apart.changes).map((c) => c.value)).toEqual([90, 80]);
		expect(apart.report.list).toEqual([]);
	});

	test("steps at bar lines are kept, not read as a ramp", () => {
		const steps = directives(
			file([
				tempo(0, 100),
				tempo(2 * BAR, 95),
				tempo(3 * BAR, 90),
				tempo(4 * BAR, 85),
				tempo(5 * BAR, 80),
			]),
		);
		expect(tempos(steps.changes).map((c) => [c.start, c.value])).toEqual([
			[sec(2 * BAR), 95],
			[sec(3 * BAR), 90],
			[sec(4 * BAR), 85],
			[sec(5 * BAR), 80],
		]);
		expect(steps.report.list).toEqual([]);
		// the chart's own steps come back as written
		const out = exportMidi("tempo: 100\n| C |\ntempo: 110\n| C |\ntempo: 120\n| C |\n");
		if (!out.ok) throw new Error("export failed");
		const read = readSmf(out.bytes);
		if (read.smf === null) throw new Error("read failed");
		const report = createReport();
		const grid = gridOf(read.smf, 3 * BAR, report);
		const d = directivesOf(read.smf, grid, chord([60], 0, 3 * BAR), report);
		expect([d.tempo, tempos(d.changes).map((c) => c.value)]).toEqual([100, [110, 120]]);
		expect(report.list).toEqual([]);
	});

	test("the export's ramp comes back as its target at its last bar", () => {
		const out = exportMidi("tempo: 100\n| C |\ntempo: rit. to 80\n| C | C |\n");
		if (!out.ok) throw new Error("export failed");
		const read = readSmf(out.bytes);
		if (read.smf === null) throw new Error("read failed");
		const report = createReport();
		const grid = gridOf(read.smf, 3 * BAR, report);
		const d = directivesOf(read.smf, grid, chord([60], 0, 3 * BAR), report);
		expect(d.tempo).toBe(100);
		expect(tempos(d.changes)).toEqual([{ kind: "tempo", start: sec(2 * BAR), value: 80 }]);
		expect(codes(report)).toEqual([["tempo-ramp", 3]]);
		// an accel. over four bars likewise
		const accel = exportMidi("tempo: 100\n| C |\ntempo: accel. to 140\n| C | C | C | C |\n");
		if (!accel.ok) throw new Error("export failed");
		const file2 = readSmf(accel.bytes).smf;
		if (file2 === null) throw new Error("read failed");
		const r2 = createReport();
		const a = directivesOf(file2, gridOf(file2, 5 * BAR, r2), chord([60], 0, 5 * BAR), r2);
		expect(tempos(a.changes)).toEqual([{ kind: "tempo", start: sec(4 * BAR), value: 140 }]);
		expect(codes(r2)).toEqual([["tempo-ramp", 5]]);
	});

	test("a cut bar counts the beat of the signature in force", () => {
		const d = directives(file([time(0, 4, 4), time(1000, 4, 4), tempo(0, 120)]));
		expect(d.grid.bars[0]?.meter).toEqual({ n: 8, d: 16 });
		expect([d.tempo, tempos(d.changes)]).toEqual([120, []]);
		const compound = directives(file([time(0, 6, 8), time(720, 6, 8), tempo(0, 90)]));
		expect(compound.grid.bars[0]?.meter).toEqual({ n: 3, d: 8 });
		expect([compound.tempo, tempos(compound.changes)]).toEqual([60, []]);
	});

	test("a stretch inside a bar writes nothing", () => {
		const d = directives(file([tempo(0, 120), tempo(1440, 40), tempo(BAR, 120)]));
		expect(d.tempo).toBe(120);
		expect(tempos(d.changes)).toEqual([]);
		expect(d.report.list.map((x) => [x.severity, x.code, x.bar])).toEqual([
			["info", "tempo-in-bar", 1],
		]);
		// counted, with its bars
		const twice = directives(
			file([
				tempo(0, 120),
				tempo(1440, 40),
				tempo(BAR, 120),
				tempo(3 * BAR + 1440, 40),
				tempo(4 * BAR, 120),
			]),
		);
		expect(twice.report.list.length).toBe(1);
		expect(twice.report.list[0]?.message).toContain("2 times; bars 1 and 4");
		// a change inside a bar that holds into the next is that bar's change, not a stretch
		const held = directives(file([tempo(0, 120), tempo(1440, 90)]));
		expect(tempos(held.changes)).toEqual([{ kind: "tempo", start: sec(BAR), value: 90 }]);
		expect(held.report.list).toEqual([]);
	});

	test("keys", () => {
		expect(directives(file([key(0, -1, 0)])).key).toBe("F");
		const fSharp = chord([66, 69, 73], 0, 8 * BAR);
		expect(directives(file([key(0, 3, 1)]), fSharp).key).toBe("F#m");
		expect(directives(file([key(0, -7, 0)]), chord([71], 0, BAR)).key).toBe("Cb");
		expect(directives(file([key(0, 7, 1)]), chord([70], 0, BAR)).key).toBe("A#m");
		const change = directives(file([key(0, 0, 0), key(4 * BAR, 2, 0)]), [
			...chord([60, 64, 67], 0, 4 * BAR),
			...chord([62, 66, 69], 4 * BAR, 8 * BAR),
		]);
		expect(change.key).toBe("C");
		expect(change.changes).toEqual([{ kind: "key", start: sec(4 * BAR), value: "D" }]);
		// a key repeated is no change; the last at one tick wins
		const same = directives(file([key(0, 0, 0), key(BAR, 0, 0)], [key(BAR, 0, 0)]));
		expect(same.changes).toEqual([]);
		expect(directives(file([key(0, 2, 0)], [key(0, -1, 0)])).key).toBe("F");
		// no key signature: no key
		expect(directives(file([])).key).toBe(null);
	});

	test("a doubtful key is dropped", () => {
		// E, B, C#m and F#m: C major covers 5 of 12 note-bars
		const eMajor = [
			...chord([64, 68, 71], 0, BAR),
			...chord([71, 75, 78], BAR, 2 * BAR),
			...chord([61, 64, 68], 2 * BAR, 3 * BAR),
			...chord([66, 69, 73], 3 * BAR, 4 * BAR),
		];
		const doubtful = directives(file([key(0, 0, 0)]), eMajor);
		expect(doubtful.key).toBe(null);
		expect(doubtful.report.list.map((d) => [d.severity, d.code, d.bar])).toEqual([
			["warning", "key-doubtful", 1],
		]);
		const cMajor = [
			...chord([60, 64, 67], 0, BAR),
			...chord([65, 69, 72], BAR, 2 * BAR),
			...chord([67, 71, 74], 2 * BAR, 3 * BAR),
			...chord([64, 68, 71], 3 * BAR, 4 * BAR), // E major: G# outside, 11 of 12
		];
		const fits = directives(file([key(0, 0, 0)]), cMajor);
		expect(fits.key).toBe("C");
		expect(fits.report.list).toEqual([]);
	});

	test("a key is judged while it is in force", () => {
		// C over C chords, then Eb over B D# F# from bar 3: the second key is dropped, the first kept
		const harmony = [...chord([60, 64, 67], 0, 2 * BAR), ...chord([71, 75, 78], 2 * BAR, 4 * BAR)];
		const d = directives(file([key(0, 0, 0), key(2 * BAR, -3, 0)]), harmony);
		expect(d.key).toBe("C");
		expect(d.changes).toEqual([]);
		expect(codes(d.report)).toEqual([["key-doubtful", 3]]);
		// the keys kept, for the chords' spelling (Task 12's chordRuns)
		expect(d.keys.map((k) => [k.tick, k.name])).toEqual([[0, "C"]]);
		// the first key is the chart's from bar 1, so it is judged from there
		const later = directives(file([key(2 * BAR, 0, 0)]), [
			...chord([60, 64, 67], 0, 2 * BAR),
			...chord([71, 75, 78], 2 * BAR, 4 * BAR),
		]);
		expect(later.key).toBe("C");
		// minor: natural minor plus the raised 7th; G# in A minor fits
		const aMinor = [...chord([57, 60, 64], 0, BAR), ...chord([64, 68, 71], BAR, 2 * BAR)];
		expect(directives(file([key(0, 0, 1)]), aMinor).key).toBe("Am");
		const leading = [...chord([57], 0, BAR), ...chord([68], 0, 2 * BAR)];
		expect(directives(file([key(0, 0, 1)]), leading).key).toBe("Am");
		// at 60% exactly, the key stays; just under, it goes
		const edge = (outside: number) =>
			directives(file([key(0, 0, 0)]), [
				...chord([60], 0, 60 * 10),
				...chord([61], 0, outside * 10),
			]).key;
		expect(edge(40)).toBe("C");
		expect(edge(41)).toBe(null);
	});

	test("a key past the end is not read", () => {
		const d = directives(file([key(0, 0, 0), key(9 * BAR, 2, 0)]), chord([60], 0, BAR));
		expect(d.changes).toEqual([]);
	});
});
