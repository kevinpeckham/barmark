import { describe, expect, test } from "bun:test";
import { parseChart, parseChord } from "barmark";
import { matches, readQuery, sorted, writeQuery } from "../src/lib/guide/query.ts";
import { CATEGORIES, ROWS } from "../src/lib/guide/rows.ts";

describe("guide rows", () => {
	test("ids are unique", () => {
		expect(new Set(ROWS.map((r) => r.id)).size).toBe(ROWS.length);
	});
	test("every section of the grammar has a row", () => {
		const refs = new Set(ROWS.map((r) => r.ref));
		for (const ref of [
			"§1",
			"§2",
			"§2.1",
			"§2.2",
			"§2.3",
			"§2.4",
			"§3",
			"§4",
			"§4.1",
			"§5",
			"§6",
			"§7",
			"§7.1",
		])
			expect(refs).toContain(ref);
	});
	test("every slot symbol, repeat form and directive has a row", () => {
		const syntax = new Set(ROWS.map((r) => r.syntax));
		for (const s of [
			"/",
			"%",
			"N.C.",
			"--",
			"?",
			"...",
			"{E}",
			"x2",
			"|: :|",
			"x ...",
			"->",
			"key:",
			"time:",
			"tempo:",
			"feel:",
			"### Note",
		])
			expect(syntax).toContain(s);
	});
	test("at least two rows show an error", () => {
		const errors = ROWS.filter((r) =>
			parseChart(r.example).diagnostics.some((d) => d.severity === "error"),
		);
		expect(errors.length).toBeGreaterThanOrEqual(2);
	});
	for (const row of ROWS)
		test(`${row.id}: the parser agrees`, () => {
			const chart = parseChart(row.example);
			const messages = chart.diagnostics.map((d) => d.message);
			const expected = row.expect?.diagnostics ?? [];
			expect(messages.length).toBe(expected.length);
			for (const [i, part] of expected.entries()) expect(messages[i]).toContain(part);
			if (row.expect?.bars !== undefined) expect(chart.bars.length).toBe(row.expect.bars);
			const chord = row.expect?.chord;
			if (chord) {
				const parsed = parseChord(chord.symbol);
				expect(parsed.ok).toBe(true);
				if (parsed.ok) {
					expect(parsed.value.canonical).toBe(chord.canonical);
					expect(parsed.value.harte).toBe(chord.harte);
				}
			}
		});
});

describe("guide query", () => {
	test("reads a shared link", () => {
		expect(readQuery(new URLSearchParams("q=repeat&cat=repeats"))).toEqual({
			q: "repeat",
			cat: "repeats",
			sort: "category",
		});
	});
	test("ignores an unknown category and sort", () => {
		const query = readQuery(new URLSearchParams("cat=nope&sort=sideways"));
		expect(query.cat).toBeNull();
		expect(query.sort).toBe("category");
	});
	test("writes only what differs from the default", () => {
		expect(writeQuery(readQuery(new URLSearchParams("")))).toBe("");
		expect(writeQuery(readQuery(new URLSearchParams("q=repeat&cat=repeats")))).toBe(
			"q=repeat&cat=repeats",
		);
		expect(writeQuery({ q: "", cat: null, sort: "name" })).toBe("sort=name");
	});
	test("search matches syntax, meaning and category, ignoring case", () => {
		const q = (text: string) => ({ q: text, cat: null, sort: "category" as const });
		expect(ROWS.filter((r) => matches(r, q("REPEAT"))).map((r) => r.syntax)).toContain("x2");
		expect(ROWS.filter((r) => matches(r, q("N.C."))).map((r) => r.id)).toContain("no-chord");
		expect(ROWS.filter((r) => matches(r, q("directives"))).length).toBeGreaterThanOrEqual(4);
	});
	test("a category narrows exactly", () => {
		const rows = ROWS.filter((r) => matches(r, { q: "", cat: "notes", sort: "category" }));
		expect(rows.every((r) => r.category === "notes")).toBe(true);
		expect(rows.length).toBeGreaterThan(0);
	});
	test("sorting by category follows the category order, then the guide's", () => {
		const rows = sorted(ROWS, "category");
		expect(rows[0]?.category).toBe(CATEGORIES[0]);
		const order = rows.map((r) => CATEGORIES.indexOf(r.category));
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});
	test("sorting by name follows the syntax", () => {
		const names = sorted(ROWS, "name").map((r) => r.syntax);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});
	test("sorting never changes the rows it was given", () => {
		const before = ROWS.map((r) => r.id);
		sorted(ROWS, "name");
		expect(ROWS.map((r) => r.id)).toEqual(before);
	});
});
