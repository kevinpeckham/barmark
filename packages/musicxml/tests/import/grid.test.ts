import { describe, expect, test } from "bun:test";
import { parseChart, parseMeter } from "barmark";
import { type Event, placeBar } from "../../src/import/grid.js";
import { barLength, frac } from "../../src/rhythm.js";

const q = (text: string) => {
	const [n, d] = text.split("/");
	return frac(Number(n), Number(d ?? 1));
};
const place = (events: [string, string][], meterText: string, exact = true) => {
	const meter = parseMeter(meterText);
	if (!meter) throw new Error(`bad meter ${meterText}`);
	const list: Event[] = events.map(([at, symbol]) => ({ at: q(at), symbol }));
	return { meter, result: placeBar(list, barLength(meter), meter, exact) };
};
/** The cell must read back with no error and no uneven-slot warning. */
const readsClean = (cell: string, meterText: string) => {
	const parsed = parseChart(`time: ${meterText}\n\n| ${cell} |\n`);
	expect(
		parsed.diagnostics.filter((d) => d.severity === "error" || /slot/.test(d.message)),
	).toEqual([]);
};

describe("placeBar", () => {
	test.each([
		[[["0", "C"]], "4/4", "C"],
		[
			[
				["0", "C"],
				["2", "G"],
			],
			"4/4",
			"C G",
		],
		[
			[
				["0", "Am7"],
				["3", "G7"],
			],
			"4/4",
			"Am7 / / G7",
		],
		[
			[
				["0", "C"],
				["2", "D"],
				["8/3", "E"],
				["10/3", "F"],
			],
			"4/4",
			"C D_E_F",
		],
		[
			[
				["0", "C"],
				["3/4", "D"],
			],
			"4/4",
			"C._D / / /",
		],
		[
			[
				["0", "D"],
				["7/2", "G"],
			],
			"4/4",
			"D / / /_G",
		],
		[[["0", "C"]], "6/8", "C"],
		[
			[
				["0", "C"],
				["1", "D"],
			],
			"4/4",
			"C D / /",
		],
		[
			[
				["0", "{C3}"],
				["1/4", "{E3}"],
				["1/2", "{G3}"],
				["3/4", "{C4}"],
			],
			"4/4",
			"{C3}_{E3}_{G3}_{C4} / / /",
		],
		[
			[
				["0", "C"],
				["1/2", "D"],
				["3/4", "E"],
			],
			"4/4",
			"C_/_D_E / / /",
		],
		[[["1", "C"]], "4/4", "/ C / /"],
		[
			[
				["0", "{C4}"],
				["1/4", "{D4}"],
			],
			"4/4",
			"{C4}_{D4}. / / /",
		],
	] as [[string, string][], string, string][])("places %j in %s as %s", (events, meter, cell) => {
		const { result } = place(events, meter);
		expect(result).toEqual({ cell, moved: false });
		// a leading hold has nothing to hold in a chart of its own; the caller supplies the held symbol
		if (!cell.startsWith("/")) readsClean(cell, meter);
	});

	test("a chord off every grid snaps to the nearest beat", () => {
		const { result } = place(
			[
				["0", "C"],
				["17/8", "G"],
			],
			"4/4",
			false,
		);
		expect(result).toEqual({ cell: "C G", moved: true });
	});

	test("chords that each fit alone but not together still snap", () => {
		const { result } = place(
			[
				["0", "C"],
				["1/4", "D"],
				["1/3", "E"],
			],
			"4/4",
			false,
		);
		expect(result?.moved).toBe(true);
		expect(result?.cell).toBeDefined();
	});

	test("a chord snapping onto an occupied beat is dropped, and still counts as moved", () => {
		const { result } = place(
			[
				["0", "C"],
				["1/8", "D"],
			],
			"4/4",
			false,
		);
		expect(result).toEqual({ cell: "C", moved: true });
	});

	test("a chord late in the bar clamps to the last beat", () => {
		const { result } = place(
			[
				["0", "C"],
				["31/8", "G"],
			],
			"4/4",
			false,
		);
		expect(result).toEqual({ cell: "C / / G", moved: true });
	});

	test("a voicing never moves", () => {
		const events: [string, string][] = [
			["0", "C"],
			["1/8", "Cmaj7{E3 G3 B3}"],
		];
		expect(place(events, "4/4", false).result).toBeNull();
	});

	test("a meter barmark can't write is null, quickly", () => {
		const t = performance.now();
		expect(
			placeBar([{ at: q("0"), symbol: "C" }], frac(4), { n: 1000000000, d: 4 }, true),
		).toBeNull();
		expect(performance.now() - t).toBeLessThan(100);
	});

	test("an event outside the bar is null", () => {
		expect(place([["4", "C"]], "4/4").result).toBeNull();
		expect(place([["-1", "C"]], "4/4", false).result).toBeNull();
	});

	test("a note off every grid is null, exact or not", () => {
		const events: [string, string][] = [
			["0", "{C4}"],
			["1/8", "{D4}"],
		];
		expect(place(events, "4/4").result).toBeNull();
		expect(place(events, "4/4", false).result).toBeNull();
	});

	test("a chord off every grid is null when exact", () => {
		expect(
			place(
				[
					["0", "C"],
					["17/8", "G"],
				],
				"4/4",
			).result,
		).toBeNull();
	});

	test("pickup bar: the caller's one-bar meter, never a prefix", () => {
		const meter = { n: 1, d: 4 };
		expect(placeBar([{ at: q("0"), symbol: "C" }], frac(1), meter, true)).toEqual({
			cell: "C",
			moved: false,
		});
	});

	test("3/4 is never cut into 2 slots", () => {
		const { result } = place(
			[
				["0", "C"],
				["3/2", "G"],
			],
			"3/4",
		);
		expect(result?.cell).toBe("C /_G /");
		readsClean("C /_G /", "3/4");
	});

	test("6/8 beats in dotted quarters", () => {
		const { result } = place(
			[
				["0", "C"],
				["3/2", "G"],
			],
			"6/8",
		);
		expect(result?.cell).toBe("C G");
	});

	test("no events is a hold", () => {
		expect(place([], "4/4").result?.cell).toBe("/");
	});
});
