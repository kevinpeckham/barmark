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

const found = (q: string) => ROWS.filter((r) => matches(r, { q, cat: null, sort: "category" }));

describe("the guide covers the grammar", () => {
	test("the grammar has the sections this test expects", () => {
		expect(sections).toContain("7.4");
		expect(sections.length).toBeGreaterThan(20);
	});
	test.each(sections)("§%s has a row", (n) => {
		expect(ROWS.map((r) => r.ref)).toContain(`§${n}`);
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
