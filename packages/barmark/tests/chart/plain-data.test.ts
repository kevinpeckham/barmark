/** The README promises the parse is plain data: JSON gives the same object back. */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChart } from "../../src/index.js";
import { ROOT } from "./fixtures.js";

describe("a parse is plain data", () => {
	const names = readdirSync(join(ROOT, "examples")).filter((f) => f.endsWith(".chart.md"));
	test.each(names)("%s survives JSON unchanged", (name) => {
		const chart = parseChart(readFileSync(join(ROOT, "examples", name), "utf8"));
		expect(JSON.parse(JSON.stringify(chart))).toStrictEqual(chart);
	});
	test("a chart with errors too", () => {
		const chart = parseChart("| G:la | {C4}:/- |\nlyrics 0: | x |");
		expect(chart.diagnostics.some((d) => d.severity === "error")).toBe(true);
		expect(JSON.parse(JSON.stringify(chart))).toStrictEqual(chart);
	});
});

test("two parses share no objects: changing one leaves the next parse alone", () => {
	const first = parseChart("| C | D |");
	const slot = first.bars[0]?.slots[0];
	if (slot?.kind !== "chord" || !slot.chord) throw new Error("expected a chord");
	const interval = slot.chord.intervals[0];
	if (!interval) throw new Error("expected an interval");
	interval.alter = 7;
	const next = parseChart("| C |").bars[0]?.slots[0];
	if (next?.kind !== "chord" || !next.chord) throw new Error("expected a chord");
	expect(next.chord.intervals[0]?.alter).toBe(0);
});
