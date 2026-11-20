import { describe, expect, test } from "bun:test";
import { page } from "./built.ts";

const PAGES = ["index.html", "syntax.html", "get-started.html", "faq.html", "try.html"];

describe("every page keeps the home page's gutters", () => {
	for (const path of PAGES)
		test(`${path}: the nav, the page and the footer share page-x-padding`, () => {
			const doc = page(path);
			for (const part of ["nav", "main", "footer"])
				expect({
					part,
					padded: doc.querySelector(part)?.classList.contains("page-x-padding"),
				}).toEqual({ part, padded: true });
			// The rule the home page had to itself is gone.
			expect(doc.querySelectorAll(".home-page-x-padding")).toHaveLength(0);
		}, 120_000);
});
