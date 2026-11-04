import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matches } from "../src/lib/guide/query.ts";
import { ROWS } from "../src/lib/guide/rows.ts";

const grammar = readFileSync(join(import.meta.dir, "../../docs/grammar-v0.1-draft.md"), "utf8");
/** The grammar's syntax sections, §1 to §7.x: what a chart can say (§8 on are form, errors, migration). */
const sections = [...grammar.matchAll(/^#{2,3} (\d+(?:\.\d+)?)[. ]/gm)]
	.map((m) => m[1] ?? "")
	.filter((n) => Number.parseInt(n, 10) <= 7);

/**
 * Sections the grammar has gained that the barmark this site installs from
 * npm can't read yet, with the release that brings them. Their guide rows
 * come with the site's bump to that release.
 */
const PENDING: Record<string, string> = { "2.9": "0.16.0", "7.6": "0.16.0" };
const installed: string = JSON.parse(
	readFileSync(join(import.meta.dir, "../node_modules/barmark/package.json"), "utf8"),
).version;
const before = (a: string, b: string) => {
	const [x, y] = [a, b].map((v) => v.split(".").map(Number));
	for (let i = 0; i < 3; i++)
		if ((x?.[i] ?? 0) !== (y?.[i] ?? 0)) return (x?.[i] ?? 0) < (y?.[i] ?? 0);
	return false;
};
const awaited = (n: string) => PENDING[n] !== undefined && before(installed, PENDING[n] ?? "");

const found = (q: string) => ROWS.filter((r) => matches(r, { q, cat: null, sort: "category" }));

describe("the guide covers the grammar", () => {
	test("the grammar has the sections this test expects", () => {
		expect(sections).toContain("7.4");
		expect(sections.length).toBeGreaterThan(20);
	});
	test.each(sections.filter((n) => !awaited(n)))("§%s has a row", (n) => {
		expect(ROWS.map((r) => r.ref)).toContain(`§${n}`);
	});
	test("a section waits for a release only until the site installs it", () => {
		for (const [n, version] of Object.entries(PENDING)) {
			expect(sections).toContain(n);
			expect(before(installed, version)).toBe(true);
		}
	});
	test.each([
		"several parts",
		"labelled",
		"tutti",
		"tacet",
		"system",
		"score",
		"B minor",
		"145 bpm",
		"@17",
		"curly quotes",
		"omit3",
		"×2",
		"…",
		"–",
		"→",
	])("searching %p finds a row", (q) => {
		expect(found(q).length).toBeGreaterThan(0);
	});
});
