/** The pickup of the tracker's grid (design §4.4). */
import { expect, test } from "bun:test";
import { gridFromBeats } from "../src/beats/grid.js";
import { lead, reading } from "./helpers/beats.js";

test("one beat before bar one is a pickup", () => {
	const r = gridFromBeats(lead(reading([4, 4, 4, 4]), 1));
	if (!r.ok) throw new Error("refused");
	expect(r.value.pickup).toEqual({ start: 0, beats: 1 });
	expect(r.value.grid.bars[0]).toBe(0.5);
	expect(r.warnings.map((w) => w.code)).toEqual(["pickup"]);
});

test("half a bar is still a pickup; more is beats-before-bar-one", () => {
	const two = gridFromBeats(lead(reading([4, 4, 4, 4]), 2));
	expect(two.ok && two.value.pickup?.beats).toBe(2);
	const three = gridFromBeats(lead(reading([4, 4, 4, 4]), 3));
	if (!three.ok) throw new Error("refused");
	expect(three.value.pickup).toBeNull();
	expect(three.warnings[0]).toMatchObject({
		code: "beats-before-bar-one",
		detail: { beats: 3, start: 0 },
	});
});

test("3/4: one beat is a pickup, two are not", () => {
	const one = gridFromBeats(lead(reading([3, 3, 3, 3]), 1));
	expect(one.ok && one.value.pickup).toEqual({ start: 0, beats: 1 });
	const two = gridFromBeats(lead(reading([3, 3, 3, 3]), 2));
	expect(two.ok && two.value.pickup).toBeNull();
});

test("no pickup when bar one is not a usual bar", () => {
	// Bar one is an unpaired half bar: the builder would measure two beats as a whole bar.
	const r = gridFromBeats(lead(reading([2, 4, 4, 4, 4, 4]), 2));
	if (!r.ok) throw new Error("refused");
	expect(r.value.pickup).toBeNull();
	expect(r.warnings.map((w) => w.code)).toContain("beats-before-bar-one");
});

test("the grid's bars are the same with and without the leading beats", () => {
	const plain = gridFromBeats(reading([4, 4, 4, 4]));
	const led = gridFromBeats(lead(reading([4, 4, 4, 4]), 1));
	if (!plain.ok || !led.ok) throw new Error("refused");
	expect(led.value.grid.bars).toEqual(plain.value.grid.bars.map((t) => t + 0.5));
});

test("a truncated grid keeps its pickup", () => {
	const r = gridFromBeats(lead(reading(Array(12).fill(4)), 1), { MAX_GRID_BARS: 10 });
	if (!r.ok) throw new Error("refused");
	expect(r.value.pickup).toEqual({ start: 0, beats: 1 });
	expect(r.warnings.map((w) => w.code)).toEqual(["grid-truncated", "pickup"]);
});
