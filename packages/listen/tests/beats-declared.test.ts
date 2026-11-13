/** `declared` against the tracker's reading: compared, never obeyed (design §5). */
import { expect, test } from "bun:test";
import { gridFromBeats } from "../src/beats/grid.js";
import { reading } from "./helpers/beats.js";

const four = reading([4, 4, 4, 4]); // bars of 2 s: 4/4 at 120

test("declared and read agree: no warning", () => {
	const r = gridFromBeats({ ...four, declared: { meter: "4/4", tempo: 120 } });
	expect(r.ok && r.warnings).toEqual([]);
});

test("tempo-drift carries the raw ratio and the fold", () => {
	const drift = (tempo: number) => {
		const r = gridFromBeats({ ...four, declared: { meter: "4/4", tempo } });
		if (!r.ok) throw new Error("refused");
		return r.warnings.find((w) => w.code === "tempo-drift")?.detail;
	};
	expect(drift(125)).toMatchObject({ fold: 1, period: 2, declaredBar: 1.92 });
	expect(drift(125)?.ratio).toBeCloseTo(2 / 1.92 - 1, 12);
	expect(drift(125)?.foldRatio).toBeCloseTo(2 / 1.92 - 1, 12);
	expect(drift(240)).toMatchObject({ fold: 2, ratio: 1, foldRatio: 0 });
	expect(drift(60)).toMatchObject({ fold: 0.5, ratio: -0.5, foldRatio: 0 });
});

test("a declared 3/4 against a read 6/8: meter-differs, and a fold of two", () => {
	const six = reading([6, 6, 6, 6], 0, 0.25); // bars of 1.5 s
	const r = gridFromBeats({ ...six, declared: { meter: "3/4", tempo: 240 } }); // bars of 0.75 s
	if (!r.ok) throw new Error("refused");
	expect(r.warnings.map((w) => w.code)).toEqual(["meter-differs", "tempo-drift"]);
	expect(r.warnings[0]?.detail).toEqual({ meter: "6/8", declared: "3/4" });
	expect(r.warnings[1]?.detail).toMatchObject({ fold: 2, foldRatio: 0 });
});

test("each part alone: a meter compares the meter, a tempo compares nothing", () => {
	const meter = gridFromBeats({ ...four, declared: { meter: "3/4" } });
	expect(meter.ok && meter.warnings.map((w) => w.code)).toEqual(["meter-differs"]);
	const tempo = gridFromBeats({ ...four, declared: { tempo: 60 } });
	expect(tempo.ok && tempo.warnings).toEqual([]);
});

test("declared never moves the grid, the meter or the tempo", () => {
	const plain = gridFromBeats(four);
	const told = gridFromBeats({ ...four, declared: { meter: "3/4", tempo: 77 } });
	if (!plain.ok || !told.ok) throw new Error("refused");
	expect(told.value).toEqual(plain.value);
});
