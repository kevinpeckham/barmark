import { describe, expect, test } from "bun:test";
import { parseDirectiveLine } from "../../src/chart/directives.js";
import { parseChart, printChart } from "../../src/index.js";

const errors = (text: string) => parseChart(text).diagnostics.filter((d) => d.severity === "error");

describe("tempo range", () => {
	for (const bad of [
		"tempo: 100000000000000000000000",
		"tempo: 0.0000001",
		"tempo: 0.5",
		"tempo: 1000",
	]) {
		test(`${bad} is an error and prints as written`, () => {
			expect(errors(bad)).toHaveLength(1);
			expect(printChart(bad)).toBe(`${bad}\n`);
		});
	}
	for (const ok of ["tempo: 1", "tempo: 999", "tempo: 92.5"]) {
		test(`${ok} is accepted`, () => expect(errors(ok)).toEqual([]));
	}
});

describe("a directive given twice on one line", () => {
	test("is an error naming it", () => {
		const d = parseDirectiveLine("key: D, tempo: 90, key: E", 1)?.diagnostics ?? [];
		expect(d.map((x) => [x.severity, x.token])).toEqual([["error", "key"]]);
	});
	test("prints as written", () => {
		expect(printChart("KEY: D, key: E")).toBe("KEY: D, key: E\n");
	});
});

describe("module layout", () => {
	test("the printer imports parseChart from its own module", async () => {
		const src = await Bun.file(new URL("../../src/chart/print.ts", import.meta.url)).text();
		expect(src).toContain('from "./parse.js"');
		expect(src).not.toContain("flattenBars(played");
	});
});
