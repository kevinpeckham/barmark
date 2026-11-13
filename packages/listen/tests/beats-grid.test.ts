/** `gridFromBeats`: the app's `trackerBarGrid` cases, and listen's own. */
import { expect, test } from "bun:test";
import { type BeatsInput, beatsGridWith, gridFromBeats } from "../src/beats/grid.js";
import { MAX_BEATS } from "../src/beats/input.js";
import { DEFAULTS, type ListenOptions } from "../src/options.js";
import { evenBeats, reading } from "./helpers/beats.js";

const grid = (r: BeatsInput, o?: ListenOptions) => gridFromBeats(r, o);

/** The grid's value, or a failed test. */
function value(r: BeatsInput, o?: ListenOptions) {
	const g = grid(r, o);
	if (!g.ok) throw new Error(`refused: ${g.refusals[0]?.reason}`);
	return g;
}

/** The first refusal's reason, detail and the reading beside it. */
function why(r: unknown, o?: ListenOptions) {
	const g = gridFromBeats(r as BeatsInput, o);
	if (g.ok) throw new Error("not refused");
	return { reason: g.refusals[0]?.reason, detail: g.refusals[0]?.detail, reading: g.reading };
}

test("too few bars: three bars, and no beats at all", () => {
	expect(why(reading([4, 4, 4])).reason).toBe("too-few-bars");
	expect(why(reading([4, 4, 4])).detail).toEqual({ bars: 3, beats: 13 });
	expect(why(reading([4, 4, 4])).reading).toBeNull();
	const none = why({ beats: [], downbeats: [], duration: 30 });
	expect([none.reason, none.detail]).toEqual(["too-few-bars", { bars: 0, beats: 0 }]);
});

test("steady 4/4: every downbeat a bar line, the usual bar's seconds", () => {
	const r = value(reading([4, 4, 4, 4]));
	expect(r.value.grid.bars).toEqual([0, 2, 4, 6, 8]);
	expect(r.value.meter).toBe("4/4");
	expect(r.value.reading.barSeconds).toBe(2);
	expect(r.value.pickup).toBeNull();
});

test("3/4 and 6/8 by the modal count", () => {
	expect(value(reading([3, 3, 3, 3])).value.meter).toBe("3/4");
	const six = value(reading([6, 6, 6, 6]));
	expect(six.value.meter).toBe("6/8");
	expect(six.value.reading.barSeconds).toBe(3);
});

test("joins two adjacent half bars into one bar", () => {
	const r = value(reading([2, 2, 4, 4, 4, 4]));
	expect(r.value.grid.bars).toEqual([0, 2, 4, 6, 8, 10]);
	expect(r.value.meter).toBe("4/4");
	expect(r.value.reading.barSeconds).toBe(2);
	expect(value(reading([6, 6, 3, 3, 6, 6])).value.grid.bars).toEqual([0, 3, 6, 9, 12, 15]);
});

test("leaves a half bar with no partner as read", () => {
	const r = value(reading([4, 4, 2, 4, 4, 4]));
	expect(r.value.grid.bars).toEqual([0, 2, 4, 5, 7, 9, 11]);
	expect(r.value.reading.barSeconds).toBe(2);
});

test("joins only pairs: three half bars in a row leave the third as read", () => {
	expect(value(reading([2, 2, 2, 4, 4, 4, 4, 4])).value.grid.bars).toEqual([
		0, 2, 3, 5, 7, 9, 11, 13,
	]);
});

test("never joins bars when the usual bar has an odd count of beats", () => {
	expect(value(reading([3, 3, 3, 3, 3, 3, 1, 1])).value.grid.bars).toEqual([
		0, 1.5, 3, 4.5, 6, 7.5, 9, 9.5, 10,
	]);
});

test("closes with a bar to the audio's end when at least half a bar remains", () => {
	expect(value(reading([4, 4, 4, 4], 1)).value.grid.bars).toEqual([0, 2, 4, 6, 8, 9]);
	expect(value(reading([4, 4, 4, 4], 1.5)).value.grid.bars).toEqual([0, 2, 4, 6, 8, 9.5]);
	expect(value(reading([4, 4, 4, 4], 0.99)).value.grid.bars).toEqual([0, 2, 4, 6, 8]);
});

test("barSeconds is the median bar of the joined grid", () => {
	expect(value(reading([4, 2, 2, 4, 4, 4, 2, 5])).value.reading.barSeconds).toBe(2);
});

test("fewer than 40% of the bars holding the usual count is bars-unsteady", () => {
	const nine = why(reading([3, 3, 3, 2, 4, 5, 2, 4, 5]));
	expect(nine.reason).toBe("bars-unsteady");
	expect(nine.reading?.steadyShare).toBe(3 / 9);
	expect(nine.reading?.beatsPerBar).toBe(3);
	expect(nine.detail).toEqual({ share: 3 / 9, beatsPerBar: 3 });
	const eight = why(reading([3, 3, 3, 2, 4, 5, 2, 4]));
	expect(eight.reason).toBe("bars-unsteady");
	expect(eight.reading?.steadyShare).toBe(3 / 8);
	expect(eight.reading?.beatsPerBar).toBe(3);
});

test("a grid when the steady share reaches 40%", () => {
	expect(value(reading([3, 3, 3, 3, 2, 4, 5, 2, 4, 5])).value.meter).toBe("3/4");
	expect(value(reading([3, 3, 3, 3, 3, 3, 4, 2, 5, 6])).value.meter).toBe("3/4");
	const over = value(reading([3, 3, 3, 3, 3, 3, 3, 4, 2, 5, 6]));
	expect(over.value.meter).toBe("3/4");
	expect(over.value.grid.bars).toHaveLength(12);
});

test("the steady share counts the bars after half bars are joined", () => {
	expect(value(reading([2, 2, 4, 4, 4, 4, 4, 2, 2])).value.grid.bars).toEqual([
		0, 2, 4, 6, 8, 10, 12, 14,
	]);
});

test("the reading: the label, the counts, the joins and the share", () => {
	const r = grid(reading([2, 2, 4, 4, 4, 4]));
	if (!r.ok) throw new Error("refused");
	expect(r.value.reading).toEqual({
		beatTempo: 120,
		tempo: 120,
		beatsPerBar: 4,
		counts: { 2: 2, 4: 4 },
		joined: 1,
		steadyShare: 1,
		barSeconds: 2,
	});
	expect(r.warnings.map((w) => w.code)).toEqual(["bars-joined"]);
	expect(r.warnings[0]?.detail).toEqual({ lines: 1 });
});

test("a too-few-bars after joining carries the reading so far and the join warning", () => {
	const g = gridFromBeats(reading([4, 4, 4, 2, 2]), { TRACKER_MIN_BARS: 5 });
	if (g.ok) throw new Error("not refused");
	expect(g.refusals[0]?.reason).toBe("too-few-bars");
	expect(g.refusals[0]?.detail).toEqual({ bars: 4, beats: 17 });
	expect(g.reading).toEqual({
		beatTempo: 120,
		tempo: 120,
		beatsPerBar: 4,
		counts: { 2: 2, 4: 3 },
		joined: 1,
	});
	expect(g.warnings.map((w) => w.code)).toEqual(["bars-joined"]);
});

test("6/8: the tempo is a third of the beat's", () => {
	const r = value({ ...evenBeats(143, 6, 8), duration: (48 * 60) / 143 });
	expect([r.value.meter, r.value.reading.beatTempo, r.value.reading.tempo]).toEqual([
		"6/8",
		143,
		48,
	]);
});

test("every beat a downbeat: one-beat bars labelled 4/4", () => {
	const beats = Array.from({ length: 9 }, (_, i) => i * 0.5);
	const r = value({ beats, downbeats: beats, duration: 4 });
	expect(r.value.meter).toBe("4/4");
	expect(r.value.reading.beatsPerBar).toBe(1);
	expect(r.value.grid.bars).toEqual(beats);
});

test("a recording that ends on the last bar line closes no extra bar", () => {
	expect(value(reading([4, 4, 4, 4], 0)).value.grid.bars).toEqual([0, 2, 4, 6, 8]);
});

test("downbeats that snap onto too few beats are too-few-bars", () => {
	const r = why({ beats: [0, 10], downbeats: [1, 2, 3, 6, 7, 8], duration: 10 });
	expect(r.reason).toBe("too-few-bars");
});

test("the options move the rules", () => {
	expect(grid(reading([4, 4, 4]), { TRACKER_MIN_BARS: 3 }).ok).toBe(true);
	expect(grid(reading([3, 3, 3, 2, 4, 5, 2, 4, 5]), { TRACKER_MIN_STEADY_SHARE: 0.3 }).ok).toBe(
		true,
	);
	const closing = grid(reading([4, 4, 4, 4], 0.5), { TRACKER_MIN_CLOSING_SHARE: 0.25 });
	expect(closing.ok && closing.value.grid.bars.at(-1)).toBe(8.5);
});

test("more than MAX_GRID_BARS bars: the first MAX_GRID_BARS, with grid-truncated", () => {
	const r = value(reading(Array(12).fill(4)), { MAX_GRID_BARS: 10 });
	expect(r.value.grid.bars).toHaveLength(11);
	const w = r.warnings.find((x) => x.code === "grid-truncated");
	expect(w?.detail).toEqual({ bars: 10 });
	expect(w?.message).toBe("The grid stops at 10 bars, before the recording's end.");
});

test("exactly MAX_GRID_BARS bars is not truncated", () => {
	const r = value(reading(Array(10).fill(4)), { MAX_GRID_BARS: 10 });
	expect(r.value.grid.bars).toHaveLength(11);
	expect(r.warnings).toEqual([]);
});

test("an unknown option is invalid-option, with no reading", () => {
	const r = gridFromBeats(reading([4, 4, 4, 4]), { NOPE: 1 } as unknown as ListenOptions);
	expect(!r.ok && r.refusals[0]?.reason).toBe("invalid-option");
	expect(!r.ok && r.reading).toBeNull();
});

const ok4 = reading([4, 4, 4, 4]);

/** The refusal's field and index for a bad input. */
function field(input: unknown) {
	const r = why(input);
	expect(r.reason).toBe("invalid-input");
	expect(r.reading).toBeNull();
	return r.detail;
}

test("input: not an object", () => {
	expect(field(null)).toEqual({ field: "input" });
	expect(field("beats")).toEqual({ field: "input" });
});

test("input: the duration", () => {
	for (const duration of [0, Number.NaN, "8"])
		expect(field({ ...ok4, duration })).toEqual({ field: "duration" });
});

test("input: the lists", () => {
	expect(field({ ...ok4, beats: "x" })).toEqual({ field: "beats" });
	expect(field({ ...ok4, downbeats: undefined })).toEqual({ field: "downbeats" });
});

test("input: a bad element names its index, in beats and in downbeats", () => {
	const bad: [string, number[], number][] = [
		["NaN", [0, 1, Number.NaN, 3], 2],
		["negative", [-1, 1, 2, 3], 0],
		["beyond the duration", [0, 1, 2, 9], 3],
		["an equal neighbour", [0, 1, 1, 3], 2],
		["descending", [0, 2, 1, 3], 2],
	];
	for (const [, list, index] of bad) {
		expect(field({ ...ok4, beats: list })).toEqual({ field: "beats", index });
		expect(field({ ...ok4, downbeats: list })).toEqual({ field: "downbeats", index });
	}
});

test("input: 200,001 elements are refused from the length alone", () => {
	let reads = 0;
	const huge = new Proxy(new Array(MAX_BEATS + 1).fill(0), {
		get(target, key, receiver) {
			if (typeof key === "string" && /^\d+$/.test(key)) reads++;
			return Reflect.get(target, key, receiver);
		},
	});
	expect(field({ ...ok4, beats: huge })).toEqual({ field: "beats" });
	expect(field({ ...ok4, downbeats: huge })).toEqual({ field: "downbeats" });
	expect(reads).toBe(0);
});

test("input: declared", () => {
	expect(field({ ...ok4, declared: "4/4" })).toEqual({ field: "declared" });
	expect(field({ ...ok4, declared: { meter: "nope" } })).toEqual({ field: "declared.meter" });
	expect(field({ ...ok4, declared: { tempo: 0 } })).toEqual({ field: "declared.tempo" });
	for (const declared of [null, undefined, {}, { meter: "3/4" }, { tempo: 120 }])
		expect(beatsGridWith({ ...ok4, declared }, DEFAULTS).ok).toBe(true);
});

const sparse: number[] = [0, 1];
delete sparse[1];
sparse.length = 3;
sparse[2] = 1;

test("never throws: getters, Proxies, array-likes and holes are invalid-input", () => {
	const getter = {
		get beats(): number[] {
			throw new Error("boom");
		},
		downbeats: [],
		duration: 8,
	};
	const proxy = new Proxy(
		{},
		{
			get() {
				throw new Error("boom");
			},
			has() {
				throw new Error("boom");
			},
		},
	);
	expect(field(getter)).toEqual({ field: "input" });
	expect(field(proxy)).toEqual({ field: "input" });
	expect(field({ ...ok4, beats: { length: 2, 0: 0, 1: 1 } })).toEqual({ field: "beats" });
	expect(field({ ...ok4, beats: sparse })).toEqual({ field: "beats", index: 1 });
});

test("input: a declared part that is null counts as not given; an array is not declared", () => {
	for (const declared of [
		{ meter: null },
		{ tempo: null },
		{ meter: null, tempo: null },
		{ meter: "3/4", tempo: null },
		{ meter: null, tempo: 120 },
	])
		expect(beatsGridWith({ ...ok4, declared }, DEFAULTS).ok).toBe(true);
	expect(field({ ...ok4, declared: [] })).toEqual({ field: "declared" });
	expect(field({ ...ok4, declared: { meter: "nope", tempo: null } })).toEqual({
		field: "declared.meter",
	});
});

test("input: a length that changes after it was read does not widen the copy", () => {
	let reads = 0;
	const shifty = new Proxy([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], {
		get(target, key, receiver) {
			if (key === "length") return ++reads === 1 ? 10 : MAX_BEATS + 50_000;
			return Reflect.get(target, key, receiver);
		},
	});
	const r = beatsGridWith({ beats: shifty, downbeats: [0], duration: 100 }, DEFAULTS);
	if (r.ok) throw new Error("accepted");
	expect(r.refusals[0]?.reason).toBe("too-few-bars");
});

test("input: a bad element's message counts from 1 and reads as a sentence", () => {
	const r = gridFromBeats({ ...ok4, beats: [0, 1, 99, 3] });
	if (r.ok) throw new Error("accepted");
	expect(r.refusals[0]?.message).toBe(
		"Beat 3 of 4 is not a time in seconds between 0 and the recording's length.",
	);
	const d = gridFromBeats({ ...ok4, downbeats: [0, 2, 2] });
	if (d.ok) throw new Error("accepted");
	expect(d.refusals[0]?.message).toBe("Downbeat 3 does not come after the one before it.");
	expect(d.refusals[0]?.detail).toEqual({ field: "downbeats", index: 2 });
});

test("downbeats off the beats are snapped: the bars are the beats they snap to", () => {
	const base = reading([4, 4, 4, 4, 4]);
	const late = { ...base, downbeats: base.downbeats.map((t) => t + 0.02) };
	const r = value({ ...late, duration: base.duration + 1 });
	expect(r.value.grid.bars.slice(0, -1)).toEqual(base.downbeats);
	expect(r.value.reading.counts).toEqual({ 4: 5 });
});

test("barSeconds is the median of the joined bars, not the unjoined", () => {
	const r = value(reading([2, 2, 2, 2, 3, 4, 4, 4, 4, 4]));
	expect(r.value.reading.joined).toBeGreaterThan(0);
	expect(r.value.reading.barSeconds).toBe(2);
});

test("the cap: MAX_BEATS times are not refused for length, one more is", () => {
	const times = (n: number) => Array.from({ length: n }, (_, i) => i * 0.001);
	const at = gridFromBeats({ beats: times(MAX_BEATS), downbeats: times(MAX_BEATS), duration: 300 });
	expect(at.ok).toBe(true);
	const over = gridFromBeats({
		beats: times(MAX_BEATS + 1),
		downbeats: times(MAX_BEATS + 1),
		duration: 300,
	});
	expect(!over.ok && over.refusals[0]?.reason).toBe("invalid-input");
});

test("input: an over-long downbeats is refused before any beat is read", () => {
	let reads = 0;
	const watched = new Proxy([0, 0.5, 1, 1.5, 2], {
		get(target, key, receiver) {
			if (typeof key === "string" && /^\d+$/.test(key)) reads++;
			return Reflect.get(target, key, receiver);
		},
	});
	const long = new Array(MAX_BEATS + 1).fill(0);
	expect(field({ beats: watched, downbeats: long, duration: 8 })).toEqual({ field: "downbeats" });
	expect(reads).toBe(0);
});

test("the result is a copy: not the caller's arrays, and not changed by changing them", () => {
	const input = reading([4, 4, 4, 4]);
	const r = value(input);
	const bars = [...r.value.grid.bars];
	expect(r.value.grid.bars).not.toBe(input.downbeats);
	input.downbeats.fill(0);
	input.beats.fill(0);
	expect(r.value.grid.bars).toEqual(bars);
});

test("each time of beats and downbeats is read exactly once", () => {
	const base = reading([4, 4, 4, 4]);
	const reads: Record<string, Map<string, number>> = { beats: new Map(), downbeats: new Map() };
	const counted = (name: string, list: number[]) => {
		const seen = new Map<string, number>();
		reads[name] = seen;
		return new Proxy(list, {
			get(target, key, receiver) {
				if (typeof key === "string" && /^\d+$/.test(key)) seen.set(key, (seen.get(key) ?? 0) + 1);
				return Reflect.get(target, key, receiver);
			},
		});
	};
	const r = gridFromBeats({
		beats: counted("beats", base.beats),
		downbeats: counted("downbeats", base.downbeats),
		duration: base.duration,
	});
	expect(r.ok).toBe(true);
	expect([...(reads.beats?.values() ?? [])].every((n) => n === 1)).toBe(true);
	expect(reads.beats?.size).toBe(base.beats.length);
	expect([...(reads.downbeats?.values() ?? [])].every((n) => n === 1)).toBe(true);
	expect(reads.downbeats?.size).toBe(base.downbeats.length);
});

test("declared: null parts type-check as not given, and compare nothing", () => {
	const input: BeatsInput = { ...reading([4, 4, 4, 4]), declared: { meter: null, tempo: 120 } };
	const r = gridFromBeats(input);
	expect(r.ok).toBe(true);
	const both: BeatsInput = { ...reading([4, 4, 4, 4]), declared: { meter: "3/4", tempo: null } };
	expect(gridFromBeats(both).warnings.map((w) => w.code)).toEqual(["meter-differs"]);
});

test("a closing share so small the product underflows to 0 does not close a bar of no length", () => {
	const r = value(reading([1, 1, 1, 1, 1], 0), { TRACKER_MIN_CLOSING_SHARE: 5e-324 });
	const bars = r.value.grid.bars;
	expect(bars.at(-1)).toBe(2.5);
	expect(new Set(bars).size).toBe(bars.length);
});
