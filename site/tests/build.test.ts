import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build, out, site } from "./built.ts";

beforeAll(build, 120_000);

describe("the site builds", () => {
	test("the home page is prerendered", () => {
		expect(readFileSync(join(out, "index.html"), "utf8")).toContain('<html lang="en"');
	});
	test("the packages come from npm at exact versions", () => {
		const pkg = JSON.parse(readFileSync(join(site, "package.json"), "utf8"));
		expect(pkg.dependencies).toEqual({ barmark: "0.3.0", "@barmark/render": "0.2.1" });
	});
	test("Edwin and its licence ship with the site", () => {
		expect(existsSync(join(out, "fonts/Edwin-Roman.otf"))).toBe(true);
		expect(existsSync(join(out, "fonts/OFL.txt"))).toBe(true);
	});
	test("every page registers Edwin once, where the element looks for it", () => {
		for (const path of ["index.html", "syntax.html"]) {
			const html = readFileSync(join(out, path), "utf8");
			const marked = html.match(/<style data-barmark-font>[^<]*<\/style>/g) ?? [];
			expect(marked.length).toBe(1);
			expect(marked[0]).toContain("/fonts/Edwin-Roman.otf");
			expect(html.match(/font-family:\s*"?barmark Edwin"?\s*;/g)?.length).toBe(1);
		}
	});
});
