import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type RenderOptions, renderChart, stylesheet } from "../src/index.js";
import { DIAGRAMS_CSS, ROW_COLUMNS_CSS } from "../src/styles.js";
import { AMAZING_GRACE, EXAMPLE } from "./fixtures.js";

// `columns: "shared"`, the default, draws every chart byte for byte as
// render 0.18.0 did (Kevin, 2026-11-10), and with `chordDiagrams` off a chart
// draws as it did before diagrams existed. The stylesheet only gains the
// strip's rules and then the "row" rules, at its end, and the comparison takes
// both out, so what is hashed is the output as it was. The snapshot was taken
// from main's renderer at d32bdc6, before `columns` existed, over the charts
// pinned below (the render tests' own and the 39 chart files the repository
// held then). It is a record of that renderer: regenerate it only against
// main's, never from this branch's code, and a new fixture elsewhere in the
// repository does not join it.

const ROOT = join(import.meta.dir, "../../..");
const SNAPSHOT = join(import.meta.dir, "shared-columns.snapshot.json");

/** The repository's chart files at d32bdc6. */
const FILES = [
	"examples/morning-song.chart.md",
	"examples/peaceful-dreams.chart.md",
	"examples/shenandoah.chart.md",
	"packages/barmark/tests/conformance/fixtures/eat-all-the-clocks.chart.md",
	"packages/barmark/tests/conformance/fixtures/letter-lands.chart.md",
	"packages/barmark/tests/conformance/fixtures/mop-heart.chart.md",
	"packages/barmark/tests/conformance/fixtures/peaceful-dreams.chart.md",
	"packages/engraver/tests/fixtures/long.chart.md",
	"packages/midi/tests/fixtures/band.chart.md",
	"packages/midi/tests/fixtures/bass-and-chords.chart.md",
	"packages/midi/tests/fixtures/comping-guitar.chart.md",
	"packages/midi/tests/fixtures/hymn.chart.md",
	"packages/midi/tests/fixtures/lead-sheet.chart.md",
	"packages/midi/tests/fixtures/piano-comping.chart.md",
	"packages/midi/tests/fixtures/piano.chart.md",
	"packages/musicxml/tests/fixtures/import/band.chart.md",
	"packages/musicxml/tests/fixtures/import/comping-guitar.chart.md",
	"packages/musicxml/tests/fixtures/import/dorico-band.chart.md",
	"packages/musicxml/tests/fixtures/import/dorico-comping-guitar.chart.md",
	"packages/musicxml/tests/fixtures/import/dorico-hymn.chart.md",
	"packages/musicxml/tests/fixtures/import/dorico-lead-sheet.chart.md",
	"packages/musicxml/tests/fixtures/import/dorico-piano.chart.md",
	"packages/musicxml/tests/fixtures/import/harmony-edges.chart.md",
	"packages/musicxml/tests/fixtures/import/hymn.chart.md",
	"packages/musicxml/tests/fixtures/import/lead-sheet.chart.md",
	"packages/musicxml/tests/fixtures/import/melody-measure-rest.chart.md",
	"packages/musicxml/tests/fixtures/import/melody-rest.chart.md",
	"packages/musicxml/tests/fixtures/import/part-enters.chart.md",
	"packages/musicxml/tests/fixtures/import/piano.chart.md",
	"packages/musicxml/tests/fixtures/import/six-guitars.chart.md",
	"packages/musicxml/tests/fixtures/import/spoken.chart.md",
	"packages/musicxml/tests/fixtures/import/trading-fours.chart.md",
	"packages/musicxml/tests/fixtures/piano-lines.chart.md",
	"packages/musicxml/tests/fixtures/three-parts.chart.md",
	"packages/sync/tests/fixtures/eat-all-the-clocks.chart.md",
	"packages/sync/tests/fixtures/eat-all-the-clocks.symbols.chart.md",
	"packages/sync/tests/fixtures/letter-lands.chart.md",
	"packages/sync/tests/fixtures/letter-lands.symbols.chart.md",
	"site/src/lib/examples/peaceful-dreams.chart.md",
];

const charts: Record<string, string> = {
	"render:example": EXAMPLE,
	"render:amazing-grace": AMAZING_GRACE,
	"render:unreadable": "| C | CM7 |\n| D |\n",
	"render:error-row": "## A\n| C | D |\n| E :| F |\n| G7 | G7 C6/G Bbmaj7/F Fmaj9 |\n",
	"render:ending": "## A\n|: C | D |\n|1 E | F :|\n|2 G | A |\n",
};
for (const path of FILES) charts[path] = readFileSync(join(ROOT, path), "utf8");

const OPTIONS: Record<string, RenderOptions> = {
	default: {},
	"no-bar-numbers": { barNumbers: false },
	"rehearsal-letters": { rehearsalLetters: true },
	nashville: { numerals: "nashville" },
	"no-wrap": { wrap: false },
	diagnostics: { diagnostics: true },
	dark: { theme: "dark" },
};

const hash = (html: string) => createHash("sha256").update(html).digest("hex");
/** Today's markup with the strip's and the "row" rules taken out of its stylesheet: what 0.18.0 drew. */
const asBefore = (html: string) =>
	html.replace(stylesheet, () => stylesheet.replace(DIAGRAMS_CSS + ROW_COLUMNS_CSS, ""));

/** Every chart's hash under one option set, keyed as the snapshot keys them. */
function hashes(key: string, options: RenderOptions): Record<string, string> {
	const out: Record<string, string> = {};
	for (const name of Object.keys(charts).sort())
		out[`${name} ${key}`] = hash(asBefore(renderChart(charts[name] ?? "", options)));
	return out;
}

const recorded = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Record<string, string>;

describe('columns: "shared" draws as before', () => {
	test("the stylesheet only gains the row rules, at its end", () => {
		expect(ROW_COLUMNS_CSS.length).toBeGreaterThan(0);
		expect(stylesheet.endsWith(ROW_COLUMNS_CSS)).toBe(true);
		expect(ROW_COLUMNS_CSS).not.toContain('data-columns="shared"');
	});

	test("the stylesheet gains the strip's rules just before the row rules, and nothing else", () => {
		expect(DIAGRAMS_CSS).toContain(".bm-diagrams");
		expect(stylesheet.endsWith(DIAGRAMS_CSS + ROW_COLUMNS_CSS)).toBe(true);
		const before = stylesheet.slice(0, -(DIAGRAMS_CSS + ROW_COLUMNS_CSS).length);
		expect(before).not.toMatch(/bm-diagram|bm-dg-/);
	});

	test("the snapshot holds the pinned charts under every option set, and nothing else", () => {
		const keys = Object.keys(OPTIONS).flatMap((key) =>
			Object.keys(charts).map((name) => `${name} ${key}`),
		);
		expect(Object.keys(charts)).toHaveLength(44);
		expect(Object.keys(recorded).sort()).toEqual(keys.sort());
	});

	for (const [key, options] of Object.entries(OPTIONS))
		test(`every chart matches the snapshot taken before columns: ${key}`, () => {
			const expected = Object.fromEntries(
				Object.entries(recorded).filter(([name]) => name.endsWith(` ${key}`)),
			);
			expect(hashes(key, options)).toEqual(expected);
		});

	test('"shared", and any value but "row", is the default', () => {
		for (const text of [EXAMPLE, AMAZING_GRACE, charts["render:error-row"] ?? ""]) {
			const plain = renderChart(text);
			expect(renderChart(text, { columns: "shared" })).toBe(plain);
			for (const odd of ["Row", "grid", "", null, 3])
				expect(renderChart(text, { columns: odd as unknown as "row" })).toBe(plain);
		}
	});
});
