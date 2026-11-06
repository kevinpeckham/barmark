/** The yardstick: every corpus chart without rhythm figures plays the same after export and import. */
import { expect, test } from "bun:test";
import { parseChart, printChart } from "barmark";
import { exportMusicXml, importMusicXml } from "../../src/index.js";
import { corpus } from "../charts.js";
import { played, usesRhythmFigures } from "./played.js";

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
	expect(printChart(back.text)).toBe(back.text);
});
