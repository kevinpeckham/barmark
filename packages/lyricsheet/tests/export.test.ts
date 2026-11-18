import { describe, expect, test } from "bun:test";
import { corpus } from "../../musicxml/tests/charts.js";
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

	test("never throws", () => {
		expect(() => exportLyricsheet("")).not.toThrow();
		expect(() => exportLyricsheet("|".repeat(10000))).not.toThrow();
		for (const [, text] of corpus()) expect(() => exportLyricsheet(text)).not.toThrow();
	});
});
