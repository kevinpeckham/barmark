import { describe, expect, test } from "bun:test";
import { parseChart, parseChord } from "barmark";
import { corpus } from "../../musicxml/tests/charts.js";
import { exportLyricsheet } from "../src/index.js";
import { chartOf, fixtures } from "./fixtures.js";
import { type Read, readBack, yardstick } from "./yardstick.js";

/** Every chart with no errors: the corpus and our fixtures, with the part each is exported for. */
function cleanCharts(): [string, string, string | undefined][] {
	const ours = fixtures().map((f): [string, string, string | undefined] => [
		f.cho,
		chartOf(f),
		f.options.part,
	]);
	const theirs = corpus().map(([name, text]): [string, string, string | undefined] => [
		name,
		text,
		undefined,
	]);
	return [...theirs, ...ours].filter(([, text]) => {
		const p = parseChart(text);
		return p.bars.length > 0 && !p.diagnostics.some((d) => d.severity === "error");
	});
}

/** The chord names an occurrence writes, in order. */
const chordsOf = (r: Read) =>
	"tokens" in r ? r.tokens.flatMap((t) => ("chord" in t ? [t.chord] : [])) : r.bars.flat();

describe("the played yardstick (spec 5.2)", () => {
	const charts = cleanCharts();

	test("the corpus has sung charts and charts with no words to measure", () => {
		const sings = (text: string) => parseChart(text).bars.some((b) => b.lyrics?.length);
		expect(charts.filter(([, text]) => sings(text)).length).toBeGreaterThan(8);
		expect(charts.filter(([, text]) => !sings(text)).length).toBeGreaterThan(8);
	});

	for (const [name, text, part] of charts)
		test(`${name}${part ? ` (${part})` : ""}: every occurrence, sung or a grid, in play order`, () => {
			const r = exportLyricsheet(text, part === undefined ? {} : { part });
			if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
			const want = yardstick(text, part);
			const got = readBack(r.text);
			expect(got).toEqual(want.map(({ records: _, ...read }) => read));
			// Every chord written reads back in barmark as the chord the bar attacks.
			const records = want.flatMap((w) => w.records);
			const read = got.flatMap(chordsOf).map((c) => parseChord(c));
			expect(read.length).toBe(records.length);
			read.forEach((back, i) => {
				const at = records[i];
				expect(back.ok && at && [back.value.intervals, back.value.bass]).toEqual(
					at ? [at.intervals, at.bass] : false,
				);
			});
		});
});
