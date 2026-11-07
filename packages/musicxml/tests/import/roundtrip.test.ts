/** The yardstick: every corpus chart without rhythm figures plays the same after export and import, its text lines where they were. */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { parseChart, printChart } from "barmark";
import { exportMusicXml, importMusicXml } from "../../src/index.js";
import { corpus, NESTED } from "../charts.js";
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
		expect(texts(back)).toEqual([
			{ occurrence: 0, section: null, place: "alone", text: "title: Lead Sheet Test" },
		]);
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
	test.each([
		["first section written out", "intro\n\n## Verse x2\n|: G | C :|\n| D |\n\n## Chorus\n| D |\n"],
		[
			"first section written out, two parts",
			"part: A = Alpha\npart: B = Beta\n\nintro\n\n## Verse x2\nA |: G | C :|\nB |: {G2} | {C3} :|\nA | D |\nB | {D3} |\n\n## Chorus\nA | D |\nB | {D3} |\n",
		],
		[
			"first section written out, then a jump",
			"intro\n\n## Verse x2\n|: G | C :|\n| D |\n\n## Chorus\n| D | D.C. |\n",
		],
		[
			"a written-out section's foot",
			"# T\n\n## Verse x2\n|: G | C :|\n| D |\nWatch\n\n## Chorus\n| D | G |\n",
		],
		[
			"two parts that agree, imported as one line",
			"part: A = Alpha\npart: B = Beta\n\n## Verse\nA | G | C |\nB | G | C |\nmid\nA | D |\nB | D |\nWatch\n\n## Chorus\nA | D |\nB | D |\n",
		],
	])("%s: text lines stay where they were", (_name, text) => {
		const back = roundTrip(text);
		expect(texts(back)).toEqual(texts(text));
		expect(texts(text).length).toBeGreaterThan(0);
	});
});

describe("the texts() yardstick", () => {
	test("sees text move from a replay heading's foot", () => {
		const moved = texts(
			"## Chorus\n| D | G |\n\n## Verse\n| G | C |\n\n## Chorus x2\nfoot\n| D | G |\n",
		);
		const there = texts(
			"## Chorus\n| D | G |\n\n## Verse\n| G | C |\n\n## Chorus x2\nfoot\n\n## Outro",
		);
		expect(moved).not.toEqual(there);
	});
	test("a line among a section's bars, before them and after them", () => {
		expect(texts("a\n## V\nb\n| G |\nc\n| C |\nd\n## W\n| D |").map((t) => t.place)).toEqual([
			"alone",
			"before",
			1,
			"after",
		]);
	});
});

const importFixtures = readdirSync(new URL("../fixtures/import/", import.meta.url))
	.filter((f) => f.endsWith(".chart.md"))
	.map((f): [string, string] => [
		f,
		readFileSync(new URL(`../fixtures/import/${f}`, import.meta.url), "utf8"),
	]);

test.each(importFixtures)(
	"%s keeps its text lines in place after export and import",
	(_name, text) => {
		expect(texts(roundTrip(text))).toEqual(texts(text));
	},
);

// Known limit: the import writes a replay heading with `x2` out as a section
// of its own bars (`## Chorus` then `| D | G | D | G |`), so its text, alone
// under the heading, comes back before those bars. Where it lands is right;
// the replay itself isn't recovered.
test.todo("a replay heading's own text after it stays there", () => {
	const text =
		"## Chorus\n| D | G |\n\n## Verse\n| G | C |\n\n## Chorus x2\nfoot\n\n## Outro\n| G |\n";
	expect(texts(roundTrip(text))).toEqual(texts(text));
});

test.each(NESTED)("a repeat inside a repeat plays the same after export and import: %p", (text) => {
	expect(played(roundTrip(text))).toEqual(played(text));
});

test.each([
	[
		"after bars no pass plays",
		"## A x2\n|: C | D :|\n## B\n| E | Fine |\n| F | D.C. al Fine |\nmid\n| G |\nwatch\n",
	],
	[
		"under a replay no pass plays",
		"## A\n| C | Fine |\n|: D | E :|\n| D.C. al Fine |\n## A\nwatch\n",
	],
	[
		"in a section no pass plays, imported in played order",
		"| Am | To Coda |\n| D.C. al Coda |\n\n## Verse x2\n| E7 |\n| G7 | x3\nplay softly\n\n## Coda\n| Coda | Em |\n",
	],
	[
		"under a replay, after a repeat holding one with the jump inside it",
		"## Intro\n|: G7 | x2\n| Em | Segno |\n| D.S. |\n| Em | Am :|\n\n## Intro\nwatch\n",
	],
	["among a repeated section's bars", "## V x2\n| E7 | Fine | D.C. al Fine | x3\nwatch\n| E7 |\n"],
	[
		"after a repeat holding one, through a jump",
		"|: E7 | To Coda | x2\n| G7 | D.C. al Coda | E7 :|\n### hits\n| Coda | Dm |\n",
	],
])("a chart written in play order keeps its text lines %s", (_name, text) => {
	expect(texts(roundTrip(text)).map((t) => t.text)).toEqual(texts(text).map((t) => t.text));
});
