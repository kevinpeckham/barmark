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
		expect(pkg.dependencies).toEqual({ barmark: "0.6.0", "@barmark/render": "0.5.0" });
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
