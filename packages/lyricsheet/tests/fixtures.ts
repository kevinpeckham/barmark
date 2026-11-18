/**
 * The golden fixtures and how each was made, read from its file name:
 * `name.cho` is `exportLyricsheet` of `name.chart.md`; `name@Label.cho`
 * the same chart with `{ part: "Label" }`; `name+guitar.cho` with
 * `{ diagrams: "guitar" }` (both may be given, the part first).
 * `scripts/chordpro-check.ts` reads the names the same way.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exportLyricsheet, type LyricsheetOptions } from "../src/index.js";

export const FIXTURES = join(import.meta.dir, "fixtures");

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

/**
 * Sheets not yet the export's output: `spellings.cho` is the grids the
 * next task writes, checked by `spell.test.ts` until then.
 */
const PENDING = new Set(["spellings.cho"]);

/** Every golden sheet the export writes, in name order. */
export const fixtures = (): Fixture[] =>
	readdirSync(FIXTURES)
		.filter((f) => f.endsWith(".cho") && !PENDING.has(f))
		.sort()
		.map(fixtureOf);

/** What the export writes for a fixture now. */
export function exported(f: Fixture): string {
	const r = exportLyricsheet(readFileSync(join(FIXTURES, f.chart), "utf8"), f.options);
	if (!r.ok) throw new Error(`${f.cho}: ${JSON.stringify(r.diagnostics)}`);
	return r.text;
}

/** The golden text of a fixture. */
export const golden = (f: Fixture) => readFileSync(join(FIXTURES, f.cho), "utf8");
