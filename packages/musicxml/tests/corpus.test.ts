import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { exportMusicXml } from "../src/index.js";
import { corpus, examples } from "./charts.js";
import { expected, play } from "./play.js";
import { validate } from "./schema.js";

describe("real charts", () => {
	const charts = corpus();
	test("there are charts to try", () => {
		expect(examples.length).toBeGreaterThan(0);
		expect(charts.length).toBeGreaterThan(5);
	});
	for (const [name, text] of charts)
		test(`${name} exports, validates and plays as parsed`, () => {
			const r = exportMusicXml(text);
			if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
			expect(validate(r.xml)).toEqual([]);
			const parts = parseChart(text).parts.length;
			expect(play(r.xml)).toEqual(expected(text));
			for (let p = 2; p <= parts; p++)
				expect(play(r.xml, `P${p}`).shown).toEqual(expected(text).shown);
		});
});
