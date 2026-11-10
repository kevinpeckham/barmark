import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { exportMidi, importMidi } from "../src/index.js";
import { perform } from "../src/perform/index.js";
import { type Event, smf } from "./helpers/smf.js";

const PPQ = 480;
const BAR = 4 * PPQ;

type At = { tick: number; e: Omit<Event, "dt"> };
const at = (tick: number, e: object): At => ({ tick, e: e as Omit<Event, "dt"> });
const track = (events: At[]): Event[] => {
	let last = 0;
	return events
		.map((x, i) => ({ ...x, i }))
		.sort((a, b) => a.tick - b.tick || a.i - b.i)
		.map(({ tick, e }) => {
			const dt = tick - last;
			last = tick;
			return { dt, ...e } as Event;
		});
};
const chord = (pitches: number[], start: number, length: number): At[] =>
	pitches.flatMap((p) => [at(start, { on: [0, p, 80] }), at(start + length, { off: [0, p] })]);

describe("a pickup is bar 0 in losses and import diagnostics", () => {
	test("a loss names the play position and the written number", () => {
		// The pickup is play position 1 (written 0); C is position 2 (written 1), D.C. plays it again as 5.
		const text = "tempo: 120\n| [1/4] G |\ntempo: 2\n| C | D | D.C. |\n";
		const parse = parseChart(text);
		expect(parse.bars.map((b) => [b.index, b.written])).toEqual([
			[1, 0],
			[2, 1],
			[3, 2],
			[4, 0],
			[5, 1],
			[6, 2],
		]);
		const r = exportMidi(text);
		expect(r.ok && r.losses.map(({ code, bar, written }) => ({ code, bar, written }))).toEqual([
			{ code: "tempo-range", bar: 2, written: 1 },
		]);
		const p = perform(parse);
		expect(p.bars.map((b) => [b.index, b.written])).toEqual([
			[1, 0],
			[2, 1],
			[3, 2],
			[4, 0],
			[5, 1],
			[6, 2],
		]);
	});

	test("a loss in the pickup is bar 0", () => {
		const r = exportMidi("tempo: 2\n| [1/4] G | C |\n");
		expect(r.ok && r.losses.map(({ bar, written }) => [bar, written])).toEqual([[1, 0]]);
	});

	test("an import numbers the first full bar 1, the pickup would be 0", () => {
		// a 1/4 pickup, then 4/4 whose first bar holds a tempo stretch that is back by the next
		const meta = [
			at(0, { time: [1, 4] }),
			at(PPQ, { time: [4, 4] }),
			at(0, { tempo: 120 }),
			at(PPQ + 1440, { tempo: 40 }),
			at(PPQ + BAR, { tempo: 120 }),
		];
		const notes = [
			...chord([43, 50, 67], 0, PPQ),
			...chord([36, 60, 64, 67], PPQ, BAR),
			...chord([41, 60, 65, 69], PPQ + BAR, BAR),
		];
		const r = importMidi(smf({ format: 1, ppq: PPQ, tracks: [track(meta), track(notes)] }));
		expect(r.text).toContain("[1/4]");
		expect(r.diagnostics.find((d) => d.code === "tempo-in-bar")?.bar).toBe(1);
	});
});
