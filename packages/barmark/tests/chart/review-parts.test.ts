import { describe, expect, test } from "bun:test";
import { extractPart, parseChart } from "../../src/chart/parse.js";
import { printPart } from "../../src/chart/print.js";

const TWO = "part: Gtr = Guitar\npart: Pno = Piano\n";

describe("stage A review fixes", () => {
	test("a part's own errored line prints as written, with its error", () => {
		const t = `${TWO}Gtr | G | C |\nPno | Em | C_ |\n`;
		expect(printPart(t, "Pno")).toBe("part: Pno = Piano\nPno | Em | C_ |\n");
		expect(extractPart(t, "Pno")?.diagnostics.filter((d) => d.severity === "error")).toHaveLength(
			1,
		);
	});
	test("a part's own dropped line prints as written, with its error", () => {
		const t = `${TWO}Gtr | G | C | D |\nPno | Em | D |\n`;
		expect(printPart(t, "Pno")).toBe("part: Pno = Piano\nPno | Em | D |\n");
		expect(
			extractPart(t, "Pno")
				?.diagnostics.map((d) => d.message)
				.join(),
		).toContain("this system's lines have 3 bars");
	});
	test("a tacet part's chart never borrows another part's errored line", () => {
		const t =
			"part: Gtr = Guitar\npart: Pno = Piano\npart: Bs = Bass\nGtr | G | Xq |\nPno | Em | D |\n| A |\n";
		expect(printPart(t, "Bs")).toBe("part: Bs = Bass\n| N.C. | N.C. |\n| A |\n");
		expect(extractPart(t, "Bs")?.diagnostics).toEqual([]);
	});
	test("a missing leading pipe is not mistaken for a part label", () => {
		const d = parseChart("G | C | D |").diagnostics;
		expect(d.map((x) => x.message).join()).not.toContain("is not a part");
		expect(d[0]?.message).toContain("a bar line starts with |");
		expect(d[0]?.suggestion).toBe("| G | C | D |");
	});
});
