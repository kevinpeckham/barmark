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

	/** A singer and a guitar; `mel` is the singer's second bar of melody, `end` what ends the second system's Vox and Gtr lines. */
	const singer = (mel: string, end = " |") =>
		[
			"# Singer",
			"part: Vox = Voice, instrument: voice",
			"part: Gtr = Guitar",
			"key: C",
			"",
			"## Verse",
			"Vox     | C                   | Am                 |",
			`Vox.Mel | {E4}:Sail- {G4}:ing | ${mel} |`,
			"Gtr     | C G                 | Am7                |",
			`Vox     | F          | G${end}`,
			"Vox.Mel | {F4}:to    | {G4}:sea  |",
			`Gtr     | F          | G${end}`,
			"",
		].join("\n");

	test("with a part, an error in the singer's line refuses, with the whole chart's diagnostics", () => {
		const chart = singer("{A4}:out {H5}:past");
		const whole = exportLyricsheet(chart);
		const part = exportLyricsheet(chart, { part: "Gtr" });
		expect(whole.ok).toBe(false);
		expect(part.ok).toBe(false);
		expect(part.diagnostics).toEqual(whole.diagnostics);
		expect(part.diagnostics.map((d) => [d.line, d.severity])).toEqual([[8, "error"]]);
	});

	test("with a part, the whole chart's warnings come with the sheet, each once, in line order", () => {
		const r = exportLyricsheet(singer("{A4}:out {C5}:past", ""), { part: "Gtr" });
		expect(r.ok).toBe(true);
		expect(r.ok && r.text).toContain("past");
		expect(r.diagnostics.map((d) => [d.line, d.severity, d.message])).toEqual([
			[10, "warning", "missing trailing |"],
			[12, "warning", "missing trailing |"],
		]);
	});

	test("with a part, a problem the whole chart reports twice on one line is still reported twice", () => {
		const chart = "part: Vox = Voice\npart: Gtr = Guitar\n\nGtr | C | G |\nVox | H7 H7 | G |\n";
		const whole = exportLyricsheet(chart);
		const part = exportLyricsheet(chart, { part: "Gtr" });
		const onFive = (r: typeof whole) => r.diagnostics.filter((d) => d.line === 5).length;
		expect(onFive(whole)).toBe(2);
		expect(onFive(part)).toBe(2);
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
