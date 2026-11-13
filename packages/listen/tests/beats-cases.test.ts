/** Every equivalence case is an input `gridFromBeats` accepts, so none is an `invalid-input` on both sides. */
import { expect, test } from "bun:test";
import { gridFromBeats } from "../src/beats/grid.js";
import { snapDownbeats } from "../src/beats/snap.js";
import { BEATS_CASES } from "./helpers/beats-cases.js";

test("there are at least 16 named cases", () => {
	expect(BEATS_CASES.length).toBeGreaterThanOrEqual(16);
	expect(new Set(BEATS_CASES.map((c) => c.name)).size).toBe(BEATS_CASES.length);
});

for (const c of BEATS_CASES)
	test(`${c.name}: an accepted input, already snapped`, () => {
		const r = gridFromBeats(c.input);
		if (!r.ok) expect(r.refusals[0]?.reason).not.toBe("invalid-input");
		expect(snapDownbeats(c.input.beats, c.input.downbeats)).toEqual(c.input.downbeats);
	});
