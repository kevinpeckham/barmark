import { beforeAll, describe, expect, test } from "bun:test";
import { sorted } from "../src/lib/guide/query.ts";
import { CATEGORIES, ROWS } from "../src/lib/guide/rows.ts";
import { LINKS } from "../src/lib/site.ts";
import { page } from "./built.ts";

let doc: Document;
beforeAll(() => {
	doc = page("syntax.html");
}, 120_000);

describe("the syntax guide, prerendered", () => {
	test("has every row, in category order, none hidden", () => {
		const rows = [...doc.querySelectorAll("[data-row]")];
		expect(rows.map((r) => r.getAttribute("data-row"))).toEqual(
			sorted(ROWS, "category").map((r) => r.id),
		);
		expect(rows.filter((r) => r.hasAttribute("hidden"))).toEqual([]);
	});
	test("each row shows its syntax, meaning and rendered example", () => {
		for (const row of ROWS) {
			const el = doc.querySelector(`[data-row="${row.id}"]`);
			expect(el?.textContent).toContain(row.syntax);
			expect(el?.textContent).toContain(row.meaning);
			expect(el?.querySelector("barmark-chart template[shadowrootmode=open]")).not.toBeNull();
		}
	});
	test("has a labelled search box and a chip per category plus All", () => {
		const input = doc.querySelector('input[type="search"]');
		expect(input).not.toBeNull();
		expect(doc.querySelector(`label[for="${input?.getAttribute("id")}"]`)).not.toBeNull();
		const chips = [...doc.querySelectorAll("[data-chip]")].map((c) => c.getAttribute("data-chip"));
		expect(chips).toEqual(["all", ...CATEGORIES]);
	});
	test("links to the grammar, and has its title", () => {
		const hrefs = [...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"));
		expect(hrefs).toContain(LINKS.grammar);
		expect(doc.title).toBe("Syntax · barmark");
		expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
			"https://www.barmark.dev/syntax",
		);
	});
});
