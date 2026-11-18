import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChart, parseChord } from "barmark";
import { corpus } from "../../musicxml/tests/charts.js";
import { exportLyricsheet } from "../src/index.js";
import { FIXTURES, fixtures } from "./fixtures.js";
import { readBack, yardstick } from "./yardstick.js";

/** Every chart with words and no errors: the corpus and our fixtures, with the part each is exported for. */
function sungCharts(): [string, string, string | undefined][] {
	const ours = fixtures().map((f): [string, string, string | undefined] => [
		f.cho,
		readFileSync(join(FIXTURES, f.chart), "utf8"),
		f.options.part,
	]);
	const theirs = corpus().map(([name, text]): [string, string, string | undefined] => [
		name,
		text,
		undefined,
	]);
	return [...theirs, ...ours].filter(([, text]) => {
		const p = parseChart(text);
		const clean = !p.diagnostics.some((d) => d.severity === "error");
		return clean && p.bars.some((b) => b.lyrics?.length);
	});
}

describe("the played yardstick (spec 5.2)", () => {
	const charts = sungCharts();

	test("the corpus has sung charts to measure", () => {
		expect(charts.length).toBeGreaterThan(8);
	});

	for (const [name, text, part] of charts)
		test(`${name}${part ? ` (${part})` : ""}: chords and words per occurrence, in one sequence, in play order`, () => {
			const r = exportLyricsheet(text, part === undefined ? {} : { part });
			if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
			const want = yardstick(text, part);
			const got = readBack(r.text);
			expect(got).toEqual(want.map(({ label, tokens }) => ({ label, tokens })));
			// Every chord written reads back in barmark as the chord the bar attacks.
			const records = want.flatMap((w) => w.records);
			const read = got
				.flatMap((g) => g.tokens)
				.flatMap((t) => ("chord" in t ? [parseChord(t.chord)] : []));
			expect(read.length).toBe(records.length);
			read.forEach((back, i) => {
				const at = records[i];
				expect(back.ok && at && [back.value.intervals, back.value.bass]).toEqual(
					at ? [at.intervals, at.bass] : false,
				);
			});
		});
});
