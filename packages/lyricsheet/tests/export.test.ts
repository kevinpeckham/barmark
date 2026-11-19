import { describe, expect, test } from "bun:test";
import { exportLyricsheet } from "../src/index.js";

describe("exportLyricsheet refusals", () => {
	test("a chart with an error writes nothing", () => {
		const r = exportLyricsheet("| C | [bad |\n");
		expect(r.ok).toBe(false);
		expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
	});

	test("an unknown part is refused, first", () => {
		const r = exportLyricsheet("| C | G |\n", { part: "Nope" });
		expect(r.ok).toBe(false);
		expect(r.diagnostics[0]?.message).toBe("no part labelled Nope");
	});

	test("a chart with no bars is refused", () => {
		const r = exportLyricsheet("# Only a title\n");
		expect(r.ok).toBe(false);
		expect(r.diagnostics[0]?.message).toBe("the chart has no bars to export");
	});

	test("hostile inputs neither throw nor hang", () => {
		for (const text of [
			"",
			"|".repeat(10000),
			"\0\t{}[]|",
			"# \u2028\n|: :|\n",
			"x".repeat(100000),
		]) {
			const start = performance.now();
			expect(() => exportLyricsheet(text)).not.toThrow();
			expect(performance.now() - start).toBeLessThan(5000);
		}
	});
});
