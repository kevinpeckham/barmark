import { expect, test } from "bun:test";
import { parseChart } from "barmark";
import type { ImportedPart } from "../../src/import/parts.js";
import type { Source } from "../../src/import/rows.js";
import { mismatches } from "../../src/import/selfcheck.js";
import type { BarInfo } from "../../src/import/structure.js";

const bar = (index: number): BarInfo => ({
	index,
	measure: `${index + 1}`,
	meter: null,
	heading: null,
	rehearsal: null,
	directives: null,
	textLines: [],
	words: [],
	question: false,
	before: [],
	after: [],
	opens: false,
	closes: null,
	ending: null,
});

const part = (label: string, bars: (string | null)[]): ImportedPart => ({
	name: label,
	label,
	instrument: null,
	lines: [{ name: null, bars }],
	lyrics: [],
	hasChords: true,
	unread: [],
});

/** Trading fours: the guitar plays bars 1 to 4, the piano bars 5 to 8. */
const trade: Source = {
	parts: [
		part("G", ["A", "B", "C", "D", null, null, null, null]),
		part("P", [null, null, null, null, "E", "F", "G", "A"]),
	],
	labels: ["G", "P"],
	bars: Array.from({ length: 8 }, (_, i) => bar(i)),
	meters: Array.from({ length: 8 }, () => ({ n: 4, d: 4 })),
	previous: [],
};
const written = [0, 1, 2, 3, 4, 5, 6, 7];
const header = "part: G = Guitar\npart: P = Piano\n";

test("a chart that plays what the importer meant has no mismatch", () => {
	const chart = `${header}G | A | B | C | D |\nG tacet\nP | E | F | G | A |\n`;
	expect(mismatches(parseChart(chart), trade, written)).toEqual([]);
});

test("labelled systems that join into one are caught, though the chart parses cleanly", () => {
	const chart = `${header}G | A | B | C | D |\nP | E | F | G | A |\n`;
	const parsed = parseChart(chart);
	expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	const found = mismatches(parsed, trade, written);
	expect(found.slice(0, 2)).toEqual([
		"P plays 0:E in measure 1, not rest",
		"P plays 0:F in measure 2, not rest",
	]);
	expect(found).toContain("written bar 5 (measure 5) never plays");
});

test("a rest and a part that doesn't play compare alike", () => {
	const chart = `${header}| A | B | C | D | -- | -- | -- | -- |\n`;
	const src: Source = {
		...trade,
		parts: [
			part("G", ["A", "B", "C", "D", null, null, null, null]),
			part("P", ["A", "B", "C", "D", "--", null, "--", null]),
		],
	};
	expect(mismatches(parseChart(chart), src, written)).toEqual([]);
});
