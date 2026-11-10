/**
 * The charts the engraver equivalence gate engraves (scripts/engraver-equivalence.ts):
 * the musicxml corpus (examples, fixtures, grammar blocks), the import
 * fixtures' charts and the long chart, so page breaks are covered.
 */
import { readdirSync, readFileSync } from "node:fs";
import { corpus } from "../packages/musicxml/tests/charts.js";

const IMPORT = new URL("../packages/musicxml/tests/fixtures/import/", import.meta.url);
const LONG = new URL("../packages/engraver/tests/fixtures/long.chart.md", import.meta.url);

/** Each chart's name and text, every name once (the first wins). */
export function engraverCorpus(): [name: string, text: string][] {
	const imports = readdirSync(IMPORT)
		.filter((f) => f.endsWith(".chart.md"))
		.sort()
		.map((f): [string, string] => [`import-${f}`, readFileSync(new URL(f, IMPORT), "utf8")]);
	const all: [string, string][] = [
		...corpus(),
		...imports,
		["long.chart.md", readFileSync(LONG, "utf8")],
	];
	const seen = new Set<string>();
	return all.filter(([name]) => !seen.has(name) && Boolean(seen.add(name)));
}
