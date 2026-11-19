import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exportLyricsheet } from "../src/index.js";

const root = join(import.meta.dir, "..");
const readme = readFileSync(join(root, "README.md"), "utf8");
const types = readFileSync(join(root, "src/export/types.ts"), "utf8");

/** Every loss code, read from the type that declares them. */
function codes(): string[] {
	const union = /export type LyricsheetLossCode =([\s\S]*?);\n/.exec(types)?.[1] ?? "";
	return [...union.matchAll(/\|\s*"([a-z-]+)"/g)].map((m) => m[1] ?? "");
}

test("the losses table has a row for every loss code", () => {
	const found = codes();
	expect(found.length).toBeGreaterThan(10);
	for (const code of found) expect(readme).toContain(`| \`${code}\` |`);
});

test("the README names no loss code that does not exist", () => {
	const known = new Set(codes());
	const rows = [...readme.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1] ?? "");
	expect(rows.filter((r) => !known.has(r))).toEqual([]);
});

/** The text of the first fenced block after `marker`. */
function blockAfter(marker: string): string {
	const at = readme.indexOf(marker);
	const m = at < 0 ? null : /```\n([\s\S]*?)```/.exec(readme.slice(at));
	if (!m) throw new Error(`no block after ${marker}`);
	return m[1] ?? "";
}

test("the README's example is what the export writes, with and without diagrams", () => {
	const chart = blockAfter("## An example");
	const plain = exportLyricsheet(chart);
	const guitar = exportLyricsheet(chart, { diagrams: "guitar" });
	expect(plain.ok && plain.text).toBe(blockAfter("The sheet:"));
	expect(guitar.ok && guitar.text).toBe(blockAfter('With `diagrams: "guitar"`, the same'));
});
