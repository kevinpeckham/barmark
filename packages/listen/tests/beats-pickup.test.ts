/** The pickup of the tracker's grid (design §4.4). */
import { expect, test } from "bun:test";
import { chartFromDetections } from "@barmark/sync";
import { gridFromBeats, type TrackedGrid } from "../src/beats/grid.js";
import { lead, reading } from "./helpers/beats.js";
import { seeded } from "./helpers/seeded.js";

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

test("the beats-before-bar-one sentence reads right for one beat and for several", () => {
	const warning = (n: number, counts: number[]) => {
		const r = gridFromBeats(lead(reading(counts), n));
		if (!r.ok) throw new Error("refused");
		return r.warnings.find((w) => w.code === "beats-before-bar-one")?.message;
	};
	expect(warning(3, [4, 4, 4, 4])).toBe(
		"The 3 beats before bar one, from 0.00 s, are not written as a pickup; they are left off the chart.",
	);
	// One beat before an unusual bar one: within the bound, still not a pickup.
	expect(warning(1, [2, 4, 4, 4, 4, 4])).toBe(
		"The beat before bar one, at 0.00 s, is not written as a pickup; it is left off the chart.",
	);
});

test("two beats a bar, labelled 4/4: one leading beat is half a bar", () => {
	const r = gridFromBeats(lead(reading([2, 2, 2, 2, 2, 2]), 1));
	if (!r.ok) throw new Error("refused");
	expect(r.value.meter).toBe("4/4");
	expect(r.value.pickup).toEqual({ start: 0, beats: 2 });
});

test("a lone early beat more than a bar before bar one is not a pickup", () => {
	const base = reading([4, 4, 4, 4]);
	const r = gridFromBeats({
		beats: [0, ...base.beats.map((t) => t + 3)],
		downbeats: base.downbeats.map((t) => t + 3),
		duration: base.duration + 3,
	});
	if (!r.ok) throw new Error("refused");
	expect(r.value.pickup).toBeNull();
	expect(r.warnings[0]).toMatchObject({
		code: "beats-before-bar-one",
		detail: { beats: 1, start: 0 },
	});
});

test("twelve beats a bar, labelled 4/4: one leading beat rounds to no pickup", () => {
	const r = gridFromBeats(lead(reading(Array(6).fill(12)), 1));
	if (!r.ok) throw new Error("refused");
	expect(r.value.meter).toBe("4/4");
	expect(r.value.pickup).toBeNull();
	expect(r.warnings.map((w) => w.code)).toEqual(["beats-before-bar-one"]);
});

test("a pickup is measured against the joined bar one, not the unjoined", () => {
	const r = gridFromBeats(lead(reading([2, 2, 4, 4, 4, 4]), 1));
	if (!r.ok) throw new Error("refused");
	expect(r.value.pickup).toEqual({ start: 0, beats: 1 });
	expect(r.warnings.map((w) => w.code)).toEqual(["bars-joined", "pickup"]);
});

test("the pickup warning comes before meter-differs", () => {
	const r = gridFromBeats({ ...lead(reading([4, 4, 4, 4]), 1), declared: { meter: "3/4" } });
	expect(r.ok && r.warnings.map((w) => w.code)).toEqual(["pickup", "meter-differs"]);
});

test("a whole bar of leading beats is no pickup, even when the bound allows a whole bar", () => {
	const r = gridFromBeats(lead(reading([4, 4, 4, 4]), 4), { PICKUP_MAX_BAR_FRACTION: 1 });
	if (!r.ok) throw new Error("refused");
	expect(r.value.pickup).toBeNull();
	expect(r.warnings.map((w) => w.code)).toEqual(["beats-before-bar-one"]);
	expect(r.warnings[0]?.detail).toEqual({ beats: 4, start: 0 });
	const built = chartFromDetections({
		grid: r.value.grid,
		chords: { runs: [] },
		meter: r.value.meter,
	});
	expect(built.diagnostics.map((d) => d.code)).not.toContain("pickup-ignored");
	expect(agreesWithBuilder(r.value)).toBe(false);
});

test("the pickup is measured in bar one's own length: a stretched bar one gives the k the builder writes", () => {
	// One beat 0.8 s before a bar one of 2.6 s: in bar one's units (0.65 s) it is 1; in the nominal bar's (0.5 s) it would round to 2.
	const slow = [0.8, 1.45, 2.1, 2.75];
	const rest = Array.from({ length: 13 }, (_, i) => Math.round((3.4 + i * 0.5) * 1000) / 1000);
	const beats = [0, ...slow, ...rest];
	const downbeats = [0.8, 3.4, 5.4, 7.4, 9.4];
	const r = gridFromBeats({ beats, downbeats, duration: 10 });
	if (!r.ok) throw new Error("refused");
	expect(r.value.grid.bars.slice(0, 3)).toEqual([0.8, 3.4, 5.4]);
	expect(r.value.pickup).toEqual({ start: 0, beats: 1 });
	expect(agreesWithBuilder(r.value)).toBe(true);
});

/** A seeded reading: `perBar` beats a bar on a 20 ms frame grid with jitter, and 0 to 4 leading beats, some at another pace, some lone and early. */
function sweepReading(rand: () => number) {
	const perBar = [2, 3, 4, 5, 6, 7, 8, 12][Math.floor(rand() * 8)] as number;
	const pace = 0.02 * (15 + Math.floor(rand() * 16));
	const bars = 5 + Math.floor(rand() * 3);
	const jitter = () => (rand() * 2 - 1) * 0.015;
	const times: number[] = [];
	const downs: number[] = [];
	for (let b = 0; b < bars; b++) {
		downs.push(times.length);
		for (let k = 0; k < perBar; k++) times.push(times.length * pace);
	}
	const main = times.map((t) => Math.round(t / 0.02) * 0.02 + jitter());
	const first = main[0] as number;
	const barOne = perBar * pace;
	const kind = Math.floor(rand() * 3);
	const lead: number[] = [];
	if (kind === 0) {
		const n = Math.floor(rand() * 5);
		const step = pace * (rand() < 0.5 ? 1 : 0.7 + rand() * 0.7);
		for (let i = 1; i <= n; i++) lead.unshift(first - i * step + jitter());
	} else if (kind === 1) lead.push(first - barOne * (1.2 + rand() * 3));
	const all = [...lead, ...main];
	const shift = Math.max(0, -(all[0] as number)) + 0.02;
	const beats = all.map((t) => Math.round((t + shift) * 1000) / 1000);
	const ok = beats.every((t, i) => i === 0 || t > (beats[i - 1] as number));
	const downbeats = downs.map((i) => beats[lead.length + i] as number);
	const end = (beats.at(-1) as number) + pace;
	return ok ? { beats, downbeats: [...downbeats, end], duration: end + 0.5 } : null;
}

/** The grid put through the builder; asserts the chart's first bar agrees with the pickup, and says whether there was one. */
function agreesWithBuilder(value: TrackedGrid): boolean {
	const built = chartFromDetections({
		grid: value.grid,
		chords: { runs: [] },
		meter: value.meter,
		...(value.pickup ? { pickup: { start: value.pickup.start } } : {}),
	});
	const bar = /\|\s*\[(\d+)\/(\d+)\]/.exec(built.chart);
	if (!value.pickup) {
		expect(bar).toBeNull();
		return false;
	}
	expect(built.diagnostics.map((d) => d.code)).not.toContain("pickup-ignored");
	expect(Number(bar?.[1])).toBe(value.pickup.beats);
	expect(Number(bar?.[2])).toBe(value.meter === "6/8" ? 8 : 4);
	return true;
}

test("agrees with the builder: a pickup is written as [k/units], none is ignored", () => {
	const rand = seeded(20261113);
	let withPickup = 0;
	let without = 0;
	for (let i = 0; i < 600; i++) {
		const input = sweepReading(rand);
		const g = input ? gridFromBeats(input) : null;
		if (!g?.ok) continue;
		if (agreesWithBuilder(g.value)) withPickup++;
		else if (g.warnings.some((w) => w.code === "beats-before-bar-one")) without++;
	}
	expect(withPickup).toBeGreaterThan(30);
	expect(without).toBeGreaterThan(30);
});
