/**
 * The round trip's property test: random small charts with one jump among
 * repeats, endings, `x N`, replays, elisions, text lines and several parts
 * (`jump-charts.ts`) play the same after export and import, and keep every
 * text line, in order. Where a line lands among bars written out in play
 * order isn't asked: writing passes out moves it among more bars.
 */
import { expect, test } from "bun:test";
import { parseChart, printChart } from "barmark";
import { exportMusicXml, importMusicXml } from "../../src/index.js";
import { expected, play } from "../play.js";
import { jumpChart } from "./jump-charts.js";
import { played, texts } from "./played.js";

const exported = (text: string) => {
	const r = exportMusicXml(text);
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
	return r.xml;
};

const roundTrip = (text: string) => importMusicXml(exported(text)).text;

const lines = (text: string) => texts(text).map((t) => t.text);

/** Each played bar without its section, for a chart with bars before its first heading (below). */
const unsectioned = (text: string) => played(text).map((bar) => bar.filter((_, i) => i !== 4));

const unnamedStart = (text: string) => parseChart(text).bars[0]?.section === null;

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
	// Two readers: the export as the tests' player plays it, and the import.
	expect(play(exported(text))).toEqual(expected(text));
	if (unnamedStart(text)) expect(unsectioned(back)).toEqual(unsectioned(text));
	else expect(played(back)).toEqual(played(text));
	expect(lines(back)).toEqual(lines(text));
	expect(printChart(back)).toBe(back);
});

// Found by this test (seeds 1827 and 3674, before the generator changed),
// and a grammar question Kevin decided (2026-11-08, grammar 6): `->` cuts the
// replay's last bar as written, so a Fine that ends the replay early (after
// the jump) leaves the cut bar unreached, and the replay plays E7. barmark
// used to cut the last bar played, here the only one.
test("an elided replay that a Fine ends early", () => {
	const text =
		"## Intro\n| E7 | Fine |\n| Segno | G |\n| D.S. al Fine |\n\n## Intro ->\n\n## Bridge\n| C |\n";
	expect(played(roundTrip(text))).toEqual(played(text));
});

// Known limit: a chart written in play order (by the export or the import's
// fallback) can't name the unnamed section again, since barmark writes no
// heading for it mid-chart, so bars before the first heading that a jump
// plays again sit under the heading before them. The bars are right; their
// section isn't. The property test compares such charts without sections.
test.todo("bars before the first heading keep their section after a jump", () => {
	const text = "| C | G |\n\n## Verse\n|: Am | F :|\n| D.C. |\n";
	expect(played(roundTrip(text))).toEqual(played(text));
});
