import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { parseChart } from "../../src/chart/parse.js";
import { printChart } from "../../src/chart/print.js";

describe("the grammar riders (section 8 of the voice-and-lyrics design)", () => {
	test("--- ends a labelled system", () => {
		const chart = "part: G = Gtr\npart: P = Pno\nG | A | B |\n---\nP | C | D |\n";
		const p = parseChart(chart);
		expect(p.diagnostics).toEqual([]);
		expect(p.bars.length).toBe(4); // two systems, not one
		expect(printChart(chart)).toBe(chart);
	});
	test("three or more hyphens alone are a break; -- and --- with words are not", () => {
		expect(parseChart("| C |\n-----\n| D |\n").lines.map((l) => l.kind)).toEqual([
			"bars",
			"break",
			"bars",
		]);
		expect(parseChart("--- intro ---\n| C |\n").lines[0]?.kind).toBe("text");
		expect(parseChart("| C |\n--\n").lines[1]?.kind).toBe("text");
	});
	test("a leading backslash makes a text line and isn't shown", () => {
		const p = parseChart("| C |\n\\| la la |\n\\key: G\n");
		expect(p.lines.slice(1)).toMatchObject([
			{ kind: "text", text: "| la la |", escaped: true },
			{ kind: "text", text: "key: G", escaped: true },
		]);
		expect(p.bars.length).toBe(1);
		expect(printChart("| C |\n\\| la la |\n")).toBe("| C |\n\\| la la |\n");
	});
	test("escaped pipes after the first still warn", () => {
		expect(parseChart("\\| D \\| A \\|\n").diagnostics.map((d) => d.severity)).toEqual(["warning"]);
	});
	test("a bare replay of a section written x2 plays once", () => {
		const p = parseChart("## A x2\n| C | D |\n## B\n| E |\n## A\n");
		expect(p.bars.map((b) => b.section)).toEqual(["A", "A", "A", "A", "B", "A", "A"]);
	});
	test("every example chart prints unchanged", () => {
		const dir = new URL("../../../../examples/", import.meta.url);
		for (const f of readdirSync(dir)) {
			const text = readFileSync(new URL(f, dir), "utf8");
			expect(printChart(text)).toBe(text);
		}
	});
});
