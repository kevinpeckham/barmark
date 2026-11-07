/**
 * The round trip's property test: random small charts with one jump among
 * repeats, endings, `x N`, replays, elisions, text lines and several parts
 * (`jump-charts.ts`) play the same after export and import, and keep every
 * text line, in order. Where a line lands among bars written out in play
 * order isn't asked: writing passes out moves it among more bars.
 */
import { expect, test } from "bun:test";
import { printChart } from "barmark";
import { exportMusicXml, importMusicXml } from "../../src/index.js";
import { jumpChart } from "./jump-charts.js";
import { played, texts } from "./played.js";

const roundTrip = (text: string) => {
	const exported = exportMusicXml(text);
	if (!exported.ok) throw new Error(exported.diagnostics.map((d) => d.message).join("; "));
	return importMusicXml(exported.xml).text;
};

const lines = (text: string) => texts(text).map((t) => t.text);

/** The seeds whose charts parse cleanly: about two in three. */
const CHARTS = Array.from({ length: 300 }, (_, k) => k + 1).flatMap((seed) => {
	const chart = jumpChart(seed);
	return chart ? [[seed, chart] as const] : [];
});

test("most seeds make a chart", () => {
	expect(CHARTS.length).toBeGreaterThan(150);
});

test.each(CHARTS)("random chart %i plays the same after export and import", (_seed, text) => {
	const back = roundTrip(text);
	expect(played(back)).toEqual(played(text));
	expect(lines(back)).toEqual(lines(text));
	expect(printChart(back)).toBe(back);
});

// Found by this test (seeds 1827 and 3674), and a grammar question: barmark
// cuts an elided replay's last bar from what it plays, so a Fine or To Coda
// that ends the replay early (after the jump) takes the cut from a bar
// before it: here the replay plays nothing. The export writes the replay's
// bars as played, which carry no directions, so programs play on.
test.todo("an elided replay that a Fine ends early", () => {
	const text =
		"## Intro\n| E7 | Fine |\n| Segno | G |\n| D.S. al Fine |\n\n## Intro ->\n\n## Bridge\n| C |\n";
	expect(played(roundTrip(text))).toEqual(played(text));
});
