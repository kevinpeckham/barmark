import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { type RenderOptions, renderChart, stylesheet } from "../src/index.js";
import { ROW_COLUMNS_CSS } from "../src/styles.js";
import { AMAZING_GRACE, EXAMPLE } from "./fixtures.js";

// `columns: "shared"`, the default, draws every chart byte for byte as
// render 0.18.0 did (Kevin, 2026-11-10). The hashes were taken on main at
// d32bdc6, before `columns` existed, over every chart in the repository and
// the render tests' own; the stylesheet only gains the "row" rules at its end.
// `UPDATE_SHARED_SNAPSHOT=1 bun test shared-columns` writes them again: only
// for a change meant to alter the shared look.

const ROOT = join(import.meta.dir, "../../..");
const SNAPSHOT = join(import.meta.dir, "shared-columns.snapshot.json");

const charts: Record<string, string> = {
	"render:example": EXAMPLE,
	"render:amazing-grace": AMAZING_GRACE,
	"render:unreadable": "| C | CM7 |\n| D |\n",
	"render:error-row": "## A\n| C | D |\n| E :| F |\n| G7 | G7 C6/G Bbmaj7/F Fmaj9 |\n",
	"render:ending": "## A\n|: C | D |\n|1 E | F :|\n|2 G | A |\n",
};
for (const path of new Bun.Glob("**/*.chart.md").scanSync({ cwd: ROOT, dot: false })) {
	if (path.includes("node_modules")) continue;
	charts[relative(ROOT, join(ROOT, path))] = readFileSync(join(ROOT, path), "utf8");
}

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
/** Today's markup with the "row" rules taken out of its stylesheet: what 0.18.0 drew. */
const asBefore = (html: string) =>
	html.replace(stylesheet, () => stylesheet.replace(ROW_COLUMNS_CSS, ""));

function hashes(): Record<string, string> {
	const out: Record<string, string> = {};
	for (const name of Object.keys(charts).sort())
		for (const [key, options] of Object.entries(OPTIONS))
			out[`${name} ${key}`] = hash(asBefore(renderChart(charts[name] ?? "", options)));
	return out;
}

if (process.env.UPDATE_SHARED_SNAPSHOT === "1")
	writeFileSync(SNAPSHOT, `${JSON.stringify(hashes(), null, "\t")}\n`);

describe('columns: "shared" draws as before', () => {
	test("the stylesheet only gains the row rules, at its end", () => {
		expect(ROW_COLUMNS_CSS.length).toBeGreaterThan(0);
		expect(stylesheet.endsWith(ROW_COLUMNS_CSS)).toBe(true);
		expect(ROW_COLUMNS_CSS).not.toContain('data-columns="shared"');
	});

	test("every chart, under every option, matches the snapshot taken before columns", () => {
		const recorded = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Record<string, string>;
		expect(Object.keys(recorded).length).toBeGreaterThan(40 * Object.keys(OPTIONS).length);
		expect(hashes()).toEqual(recorded);
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
