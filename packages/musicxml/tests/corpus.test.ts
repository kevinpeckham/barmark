import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { parseChart } from "barmark";
import { exportMusicXml } from "../src/index.js";
import { expected, play } from "./play.js";
import { validate } from "./schema.js";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

/** Every fenced block of the grammar that parses as a chart without errors. */
function grammarCharts(): [string, string][] {
	const grammar = read("docs/grammar-v0.1-draft.md");
	return [...grammar.matchAll(/```[a-z]*\n([\s\S]*?)\n```/g)]
		.map((m, i): [string, string] => [`grammar block ${i + 1}`, m[1] ?? ""])
		.filter(([, text]) => {
			const p = parseChart(text);
			return p.bars.length > 0 && !p.diagnostics.some((d) => d.severity === "error");
		});
}

const examples = readdirSync(new URL("examples/", root))
	.filter((f) => f.endsWith(".chart.md"))
	.map((f): [string, string] => [f, read(`examples/${f}`)]);

describe("real charts", () => {
	const charts = [...examples, ...grammarCharts()];
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
