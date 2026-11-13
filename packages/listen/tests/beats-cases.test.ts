/** Every equivalence case is an input `gridFromBeats` accepts, so none is an `invalid-input` on both sides. */
import { expect, test } from "bun:test";
import { gridFromBeats } from "../src/beats/grid.js";
import { snapDownbeats } from "../src/beats/snap.js";
import { BEATS_CASES } from "./helpers/beats-cases.js";

test("there are at least 27 named cases", () => {
	expect(BEATS_CASES.length).toBeGreaterThanOrEqual(27);
	expect(new Set(BEATS_CASES.map((c) => c.name)).size).toBe(BEATS_CASES.length);
});

for (const c of BEATS_CASES)
	test(`${c.name}: an accepted input, already snapped`, () => {
		const r = gridFromBeats(c.input);
		if (!r.ok) expect(r.refusals[0]?.reason).not.toBe("invalid-input");
		expect(snapDownbeats(c.input.beats, c.input.downbeats)).toEqual(c.input.downbeats);
	});

test("the half-bar stretches case joins on its frame-grid times, with 4 the modal count", () => {
	const c = BEATS_CASES.find((x) => x.name.endsWith("with half-bar stretches"));
	const r = gridFromBeats((c as (typeof BEATS_CASES)[number]).input);
	if (!r.ok) throw new Error("refused");
	expect(r.value.reading.joined).toBeGreaterThan(0);
	expect(r.value.reading.beatsPerBar).toBe(4);
});

test("every case is strictly ascending, with every downbeat one of the beats and every beat within the duration", () => {
	for (const c of BEATS_CASES) {
		const { beats, downbeats, duration } = c.input;
		expect(
			beats.every((t, i) => i === 0 || t > (beats[i - 1] as number)),
			c.name,
		).toBe(true);
		expect(
			downbeats.every((t) => beats.includes(t)),
			c.name,
		).toBe(true);
		expect(beats.at(-1) as number, c.name).toBeLessThanOrEqual(duration);
	}
});
