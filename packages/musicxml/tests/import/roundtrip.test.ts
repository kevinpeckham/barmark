/** The yardstick: every corpus chart without rhythm figures plays the same after export and import, its text lines where they were. */
import { describe, expect, test } from "bun:test";
import { parseChart, printChart } from "barmark";
import { exportMusicXml, importMusicXml } from "../../src/index.js";
import { corpus } from "../charts.js";
import { played, texts, usesRhythmFigures } from "./played.js";

const inScope = corpus().filter(([, t]) => !usesRhythmFigures(parseChart(t)));

test("the examples and the export's three-part chart are in scope", () => {
	expect(inScope.map(([name]) => name)).toEqual(
		expect.arrayContaining([
			"morning-song.chart.md",
			"peaceful-dreams.chart.md",
			"three-parts.chart.md",
		]),
	);
});

test.each(inScope)("%s plays the same after export and import", (_name, text) => {
	const exported = exportMusicXml(text);
	if (!exported.ok) throw new Error(exported.diagnostics.map((d) => d.message).join("; "));
	const back = importMusicXml(exported.xml);
	expect(back.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	expect(played(back.text)).toEqual(played(text));
	expect(texts(back.text)).toEqual(texts(text));
	expect(printChart(back.text)).toBe(back.text);
});

/** The chart after export and import. */
function roundTrip(text: string): string {
	const exported = exportMusicXml(text);
	if (!exported.ok) throw new Error(exported.diagnostics.map((d) => d.message).join("; "));
	return importMusicXml(exported.xml).text;
}

describe("text lines stay where they were (issue #173)", () => {
	test("text before the first heading stays above it", () => {
		const text = "title: Lead Sheet Test\nkey: G\n\n## Verse\n| G | C |\n";
		const back = roundTrip(text);
		expect(texts(back)).toEqual([{ section: null, bars: 0, text: "title: Lead Sheet Test" }]);
		expect(back.indexOf("title: Lead Sheet Test")).toBeLessThan(back.indexOf("## Verse"));
	});
	test("text at a section's foot stays in that section", () => {
		const text = "# T\n\n## Verse\n| G | C |\nWatch\n\n## Chorus\n| D | G |\n";
		expect(roundTrip(text)).toBe(text);
	});
	test("text after the last bar stays at the end", () => {
		const text = "# T\n\n## Verse\n| G | C |\nFine\n";
		expect(roundTrip(text)).toBe(text);
	});
});
