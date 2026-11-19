import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { corpus } from "../../musicxml/tests/charts.js";
import { exportLyricsheet } from "../src/index.js";
import { readCho } from "./read-cho.js";
import { readBack } from "./yardstick.js";

/** Every directive this package writes. */
const DIRECTIVES = new Set([
	...["title", "composer", "lyricist", "copyright", "meta", "key", "time", "tempo", "comment"],
	...["start_of_verse", "end_of_verse", "start_of_chorus", "end_of_chorus", "chorus"],
	...["start_of_bridge", "end_of_bridge", "start_of_grid", "end_of_grid"],
]);

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

	test("every corpus chart without errors exports", () => {
		for (const [name, text] of corpus()) {
			const clean = !parseChart(text).diagnostics.some((d) => d.severity === "error");
			if (clean) expect([name, exportLyricsheet(text).ok]).toEqual([name, true]);
		}
	});

	test("every corpus sheet is well formed: balanced, no trailing spaces, one final newline, known directives", () => {
		for (const [name, text] of corpus()) {
			const r = exportLyricsheet(text);
			if (!r.ok) continue;
			const lines = readCho(r.text);
			expect([name, / $/m.test(r.text), r.text.endsWith("\n\n")]).toEqual([name, false, false]);
			const unknown = lines.flatMap((l) =>
				l.kind === "directive" && !DIRECTIVES.has(l.name) ? [l.name] : [],
			);
			expect([name, unknown]).toEqual([name, []]);
			expect(() => readBack(r.text)).not.toThrow();
		}
	});
});
