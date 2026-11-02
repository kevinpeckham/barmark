import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LINKS } from "../src/lib/site.ts";
import { build, out, page, site } from "./built.ts";

beforeAll(build, 120_000);

describe("the site builds", () => {
	test("the home page is prerendered", () => {
		expect(readFileSync(join(out, "index.html"), "utf8")).toContain('<html lang="en"');
	});
	test("the packages come from npm at exact versions", () => {
		const pkg = JSON.parse(readFileSync(join(site, "package.json"), "utf8"));
		expect(pkg.dependencies).toEqual({ barmark: "0.7.0", "@barmark/render": "0.7.0" });
	});
	test("Edwin and its licence ship with the site", () => {
		expect(existsSync(join(out, "fonts/Edwin-Roman.otf"))).toBe(true);
		expect(existsSync(join(out, "fonts/OFL.txt"))).toBe(true);
	});
	test("every page registers Edwin once, where the element looks for it", () => {
		for (const path of ["index.html", "syntax.html", "get-started.html"]) {
			const html = readFileSync(join(out, path), "utf8");
			const marked = html.match(/<style data-barmark-font>[^<]*<\/style>/g) ?? [];
			expect(marked.length).toBe(1);
			expect(marked[0]).toContain("/fonts/Edwin-Roman.otf");
			expect(html.match(/font-family:\s*"?barmark Edwin"?\s*;/g)?.length).toBe(1);
		}
	});
	test("every page names an icon that ships, so browsers don't ask for /favicon.ico", () => {
		for (const path of ["index.html", "syntax.html", "try.html", "get-started.html", "faq.html"]) {
			const href = page(path).querySelector('link[rel="icon"]')?.getAttribute("href") ?? "";
			expect(href).toStartWith("/");
			expect(existsSync(join(out, href))).toBe(true);
		}
	});
	test("no page keeps its URL with SvelteKit's deprecated replaceState", () => {
		const glob = new Bun.Glob("src/**/*.{svelte,ts}");
		const users = [...glob.scanSync(site)].filter((f) =>
			/import\s*\{[^}]*\breplaceState\b[^}]*\}\s*from\s*"\$app\/navigation"/.test(
				readFileSync(join(site, f), "utf8"),
			),
		);
		expect(users).toEqual([]);
	});
	test("the OG image is a 1200×630 PNG", () => {
		const png = readFileSync(join(out, "og.png"));
		expect(png.subarray(1, 4).toString()).toBe("PNG");
		expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
	});
	for (const path of ["index.html", "syntax.html"])
		test(`${path} shares the OG image as a large card`, () => {
			const meta = (key: string) =>
				page(path)
					.querySelector(`meta[property="${key}"], meta[name="${key}"]`)
					?.getAttribute("content");
			expect(meta("og:image")).toBe(`${LINKS.origin}/og.png`);
			expect([meta("og:image:width"), meta("og:image:height")]).toEqual(["1200", "630"]);
			expect(meta("og:image:alt")).toContain("chord chart");
			expect(meta("twitter:card")).toBe("summary_large_image");
		});
});
