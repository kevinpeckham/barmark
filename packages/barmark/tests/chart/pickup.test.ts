import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	extractPart,
	opensWithPickup,
	parseChart,
	printChart,
	printPart,
} from "../../src/index.js";

const written = (text: string) => parseChart(text).bars.map((b) => b.written);
const indices = (text: string) => parseChart(text).bars.map((b) => b.index);
const pickup = (text: string) => parseChart(text).pickup;

describe("a pickup (grammar 2.4)", () => {
	test("a short first bar before a full one is bar 0", () => {
		const text = "time: 4/4\n| [1/4] G | C | D |";
		expect(pickup(text)).toBe(true);
		expect(written(text)).toEqual([0, 1, 2]);
		expect(indices(text)).toEqual([1, 2, 3]);
	});

	test("the default meter counts when no time: line is written", () => {
		expect(pickup("| [1/4] G | C |")).toBe(true);
		expect(written("| [1/4] G | C |")).toEqual([0, 1]);
	});

	test("lengths compare by value: [4/4] in 4/4 is a full bar", () => {
		const text = "time: 4/4\n| [1/4] G | [4/4] C |";
		expect(pickup(text)).toBe(true);
		expect(written(text)).toEqual([0, 1]);
	});

	test("the next bar's meter is the one in force there, after a time: line", () => {
		const text = "| [1/4] G |\ntime: 3/4\n| C | D |";
		expect(pickup(text)).toBe(true);
		expect(written(text)).toEqual([0, 1, 2]);
	});

	test("6/8: [2/8] and [1/4] are pickups", () => {
		expect(pickup("time: 6/8\n| [2/8] G | C |")).toBe(true);
		expect(pickup("time: 6/8\n| [1/4] G | C |")).toBe(true);
		expect(written("time: 6/8\n| [1/4] G | C |")).toEqual([0, 1]);
	});

	test("a fermata after the pickup is skipped", () => {
		const text = "| [2/8] C | ... | G |";
		expect(pickup(text)).toBe(true);
		expect(written(text)).toEqual([0, 1]);
	});

	test("inside a repeat: every pass plays bar 0", () => {
		const text = "|: [1/4] G | C :|";
		expect(pickup(text)).toBe(true);
		expect(written(text)).toEqual([0, 1, 0, 1]);
		expect(indices(text)).toEqual([1, 2, 3, 4]);
	});

	test("a D.C. replays the pickup as bar 0, at new play positions", () => {
		const text = "| [1/4] G | C | D | D.C. |";
		expect(written(text)).toEqual([0, 1, 2, 0, 1, 2]);
		expect(indices(text)).toEqual([1, 2, 3, 4, 5, 6]);
	});

	test("a replayed first section plays bar 0 again", () => {
		const text = "## A\n| [1/4] G | C |\n## B\n| D |\n## A";
		expect(written(text)).toEqual([0, 1, 2, 0, 1]);
		expect(indices(text)).toEqual([1, 2, 3, 4, 5]);
	});

	describe("not a pickup: numbered from 1", () => {
		const cases: [string, string][] = [
			["a % of the first bar", "| [2/4] G | % | D |"],
			["two short bars in a row", "| [1/4] G | [2/4] C | D |"],
			["a lone short bar", "| [1/4] G |"],
			["a longer first bar", "| [5/4] G | C |"],
			["a first bar as long as the meter", "time: 6/8\n| [3/4] G | C |"],
			["a short second bar", "| G | [1/4] C | D |"],
			["a short bar after ...", "| G | ... | [1/4] C | D |"],
			["a short bar opening a later section", "## A\n| G | D |\n## B\n| [1/4] C | D |"],
		];
		for (const [name, text] of cases)
			test(name, () => {
				const parse = parseChart(text);
				expect(parse.pickup).toBe(false);
				expect(parse.bars[0]?.written).toBe(1);
				expect(parse.bars.every((b) => b.written >= 1)).toBe(true);
			});

		test("a first bar on an error line: its bars keep their numbers", () => {
			expect(pickup("| [1/4] G | x[ |\n| [1/4] G | C |")).toBe(false);
			expect(written("| [1/4] G | x[ |\n| [1/4] G | C |")).toEqual([3, 4]);
		});
	});

	test("several parts with one tacet in the first system share the pickup", () => {
		const text =
			"part: Gtr = Guitar\npart: Bs = Bass\ntime: 4/4\nGtr | [1/4] G | C | D |\n\nGtr | C | D |\nBs  | C | D |\n";
		const parse = parseChart(text);
		expect(parse.pickup).toBe(true);
		expect(parse.bars.map((b) => b.written)).toEqual([0, 1, 2, 3, 4]);
		expect(parse.bars[0]?.parts?.[1]).toBeNull();
		const bass = extractPart(text, "Bs");
		expect(bass?.pickup).toBe(true);
		expect(bass?.bars[0]?.written).toBe(0);
		const reparsed = parseChart(printPart(text, "Bs") ?? "");
		expect(reparsed.pickup).toBe(true);
		expect(reparsed.bars.map((b) => b.written)).toEqual([0, 1, 2, 3, 4]);
	});

	test("opensWithPickup reads played bars alone", () => {
		expect(opensWithPickup(parseChart("| [1/4] G | C |").bars)).toBe(true);
		expect(opensWithPickup(parseChart("| [1/4] G | [2/4] C |").bars)).toBe(false);
		expect(opensWithPickup([])).toBe(false);
	});

	test("Shenandoah: written from 0; index and the printed chart as before", () => {
		const text = readFileSync(
			new URL("../../../../examples/shenandoah.chart.md", import.meta.url),
			"utf8",
		);
		const parse = parseChart(text);
		expect(parse.pickup).toBe(true);
		expect(parse.bars.map((b) => b.index)).toEqual([1, 2, 3, 4]);
		expect(parse.bars.map((b) => b.written)).toEqual([0, 1, 2, 3]);
		expect(printChart(text)).toBe(text);
	});
});
