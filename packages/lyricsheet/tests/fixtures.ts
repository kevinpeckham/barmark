/**
 * The golden fixtures and how each was made, read from its file name:
 * `name.cho` is `exportLyricsheet` of `name.chart.md`; `name@Label.cho`
 * the same chart with `{ part: "Label" }`; `name+guitar.cho` with
 * `{ diagrams: "guitar" }` (both may be given, the part first).
 * `scripts/chordpro-check.ts` reads the names the same way.
 *
 * The chart is the fixtures directory's `name.chart.md`, else the
 * repository's `examples/name.chart.md` (referenced, never copied), and
 * `at-a-glance` is the grammar's "At a glance" chart, read from the
 * grammar as barmark's own tests read it.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exportLyricsheet, type LyricsheetOptions } from "../src/index.js";

export const FIXTURES = join(import.meta.dir, "fixtures");
const ROOT = join(import.meta.dir, "../../..");
const EXAMPLES = join(ROOT, "examples");

export type Fixture = { cho: string; chart: string; options: LyricsheetOptions };

/** The chart and options a sheet's file name says it was made from. */
export function fixtureOf(cho: string): Fixture {
	const m = /^(.+?)(?:@([^+]+))?(\+guitar)?\.cho$/.exec(cho);
	if (!m) throw new Error(`not a sheet: ${cho}`);
	const [, name = "", part, guitar] = m;
	const options: LyricsheetOptions = {
		...(part !== undefined && { part }),
		...(guitar !== undefined && { diagrams: "guitar" as const }),
	};
	return { cho, chart: `${name}.chart.md`, options };
}

/** The grammar's "At a glance" chart. */
function atAGlance(): string {
	const spec = readFileSync(join(ROOT, "docs/grammar-v0.1-draft.md"), "utf8");
	const m = /## At a glance\n\n```\n([\s\S]*?)\n```/.exec(spec);
	if (!m?.[1]) throw new Error("At a glance example not found in the grammar");
	return m[1];
}

/** A fixture's chart text: beside the sheet (in `dir`), in `examples/`, or the grammar's "At a glance". */
export function chartOf(f: Pick<Fixture, "chart">, dir = FIXTURES): string {
	if (f.chart === "at-a-glance.chart.md") return atAGlance();
	for (const d of [dir, EXAMPLES]) {
		const path = join(d, f.chart);
		if (existsSync(path)) return readFileSync(path, "utf8");
	}
	throw new Error(`no chart ${f.chart} beside the sheet or in examples/`);
}

/** Every golden sheet the export writes, in name order. */
export const fixtures = (): Fixture[] =>
	readdirSync(FIXTURES)
		.filter((f) => f.endsWith(".cho"))
		.sort()
		.map(fixtureOf);

/** What the export writes for a fixture now. */
export function exported(f: Fixture): string {
	const r = exportLyricsheet(chartOf(f), f.options);
	if (!r.ok) throw new Error(`${f.cho}: ${JSON.stringify(r.diagnostics)}`);
	return r.text;
}

/** The golden text of a fixture. */
export const golden = (f: Fixture) => readFileSync(join(FIXTURES, f.cho), "utf8");
