import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withoutQuery } from "../src/lib/without-query.ts";

describe("analytics", () => {
	test("a page view never carries what the reader typed", () => {
		expect(
			withoutQuery({ type: "pageview", url: "https://www.barmark.dev/try?q=%7C+D+%7C" }),
		).toEqual({
			type: "pageview",
			url: "https://www.barmark.dev/try",
		});
		expect(withoutQuery({ type: "pageview", url: "https://www.barmark.dev/faq#who" })).toEqual({
			type: "pageview",
			url: "https://www.barmark.dev/faq",
		});
	});
	test("every page loads Vercel Analytics and reports each route", () => {
		const read = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");
		expect(read("routes/+layout.ts")).toContain('import "#lib/analytics.js"');
		expect(read("routes/+layout.svelte")).toContain("afterNavigate(() => trackRoute(");
		expect(read("lib/analytics.ts")).toContain("beforeSend: withoutQuery");
	});
});
