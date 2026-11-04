/** The corpus: every example chart, and every block of the grammar that parses without errors. */
import { readdirSync, readFileSync } from "node:fs";
import { parseChart } from "barmark";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

function grammarCharts(): [string, string][] {
	const grammar = read("docs/grammar-v0.1-draft.md");
	return [...grammar.matchAll(/```[a-z]*\n([\s\S]*?)\n```/g)]
		.map((m, i): [string, string] => [`grammar block ${i + 1}`, m[1] ?? ""])
		.filter(([, text]) => {
			const p = parseChart(text);
			return p.bars.length > 0 && !p.diagnostics.some((d) => d.severity === "error");
		});
}

export const examples = readdirSync(new URL("examples/", root))
	.filter((f) => f.endsWith(".chart.md"))
	.map((f): [string, string] => [f, read(`examples/${f}`)]);

/** A three-part arrangement with real notes: a bass line, piano voicings and arpeggios, a guitar lick. */
const threeParts: [string, string] = [
	"three-parts.chart.md",
	readFileSync(new URL("fixtures/three-parts.chart.md", import.meta.url), "utf8"),
];

/** Each chart's name and text. */
export const corpus = (): [string, string][] => [...examples, threeParts, ...grammarCharts()];
