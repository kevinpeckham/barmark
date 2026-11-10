import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { renderScoreHtml } from "../src/server.js";

// The grid is @barmark/render's HTML: a line whose only errors are
// unreadable slots draws as a row, the slot in error styling (barmark's
// grammar 2.3, 8).

describe("renderScoreHtml: an unreadable slot", () => {
	test("its line draws in the grid, the slot marked with its error", () => {
		const html = renderScoreHtml("| C | CM7 |\n");
		const { document } = parseHTML(`<!doctype html><body>${html}`);
		const template = document.querySelector("barmark-score template");
		const inner = parseHTML(`<!doctype html><body>${template?.innerHTML ?? ""}`).document;
		expect(inner.querySelector(".bm-error")).toBeNull();
		const unread = inner.querySelector(".bm-unread");
		expect(unread?.textContent).toBe("CM7");
		expect(unread?.getAttribute("title")).toContain("write maj");
	});
});
