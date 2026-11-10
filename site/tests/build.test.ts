import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FILES, LINKS } from "../src/lib/site.ts";
import { build, out, page, site } from "./built.ts";

beforeAll(build, 120_000);

describe("the site builds", () => {
	test("the home page is prerendered", () => {
		expect(readFileSync(join(out, "index.html"), "utf8")).toContain('<html lang="en"');
	});
	test("the packages come from npm at exact versions", () => {
		const pkg = JSON.parse(readFileSync(join(site, "package.json"), "utf8"));
		expect(pkg.dependencies).toEqual({
			barmark: "0.22.0",
			"@barmark/render": "0.18.0",
			"@barmark/score": "0.3.0",
			"@vercel/analytics": "2.0.1",
			"@vercel/speed-insights": "2.0.0",
		});
	});
	test("the Noto fonts are served from the site, with long-cached hashed names", () => {
		const assets = join(out, "_app/immutable/assets");
		const css = readdirSync(assets)
			.filter((f) => f.endsWith(".css"))
			.map((f) => readFileSync(join(assets, f), "utf8"))
			.join("\n");
		expect(css).not.toContain("fonts.bunny.net");
		const faces = css.match(/@font-face\{[^}]*\}/g) ?? [];
		const noto = faces.filter((f) => /font-family:\s*"?Noto (Sans|Serif|Mono)"?;/.test(f));
		const has = (family: string, style: string, weight: string) =>
			noto.some(
				(f) =>
					f.includes(family) &&
					new RegExp(`font-style:\\s*${style}`).test(f) &&
					new RegExp(`font-weight:\\s*${weight}`).test(f),
			);
		for (const weight of ["400", "600", "700"])
			expect(has("Noto Sans", "normal", weight)).toBe(true);
		expect(has("Noto Serif", "normal", "400")).toBe(true);
		expect(has("Noto Serif", "italic", "400")).toBe(true);
		expect(has("Noto Mono", "normal", "400")).toBe(true);
		for (const face of noto)
			for (const [, url] of face.matchAll(/url\(([^)]+)\)/g)) {
				// Relative to the stylesheet, which sits in the same hashed folder.
				expect(url).toMatch(/^\.\/[^/]+\.[\w-]{8}\.woff2?$/);
				expect(existsSync(join(assets, url ?? ""))).toBe(true);
			}
	});
	test("Noto's licence ships with the site", () => {
		expect(readFileSync(join(out, "fonts/Noto-OFL.txt"), "utf8")).toContain(
			"SIL OPEN FONT LICENSE",
		);
	});
	test("Verovio's licences ship with the site, as the CLI's release carries them", () => {
		for (const [name, heading] of [
			["Verovio-LGPL-3.0.txt", "GNU LESSER GENERAL PUBLIC LICENSE"],
			["Verovio-GPL-3.0.txt", "GNU GENERAL PUBLIC LICENSE"],
		] as const) {
			const served = readFileSync(join(out, "licenses", name), "utf8");
			expect(served.trimStart()).toStartWith(heading);
			expect(served).toBe(readFileSync(join(site, "../packages/cli/licenses", name), "utf8"));
		}
	});
	test("every page's footer credits Verovio, and each of its links on the site resolves", () => {
		for (const path of ["index.html", "syntax.html", "try.html", "get-started.html", "faq.html"]) {
			const footer = page(path).querySelector("footer");
			const hrefs = [...(footer?.querySelectorAll("a") ?? [])].map(
				(a) => a.getAttribute("href") ?? "",
			);
			expect(hrefs).toContain(LINKS.verovioBundled);
			expect(hrefs).toContain(FILES.verovioLgpl);
			expect(hrefs).toContain(LINKS.siteSource);
			expect(footer?.textContent?.replace(/\s+/g, " ")).toContain(
				"Verovio © Laurent Pugin and others, LGPL-3.0",
			);
			// The version linked is the version the score package bundles.
			const verovio = JSON.parse(
				readFileSync(join(site, "node_modules/verovio/package.json"), "utf8"),
			).version;
			expect(LINKS.verovioBundled).toEndWith(`/tree/version-${verovio}`);
			for (const href of hrefs.filter((h) => h.startsWith("/")))
				expect([href, existsSync(join(out, href))]).toEqual([href, true]);
		}
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
	test("every page names its icons, each one shipped: a 48px .ico for Google, the SVG and a touch icon", () => {
		for (const path of ["index.html", "syntax.html", "try.html", "get-started.html", "faq.html"]) {
			const links = [
				...page(path).querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]'),
			];
			const hrefs = links.map((l) => l.getAttribute("href"));
			expect(hrefs).toEqual(["/favicon.ico", "/favicon.svg", "/apple-touch-icon.png"]);
			for (const href of hrefs) expect(existsSync(join(out, href ?? ""))).toBe(true);
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
	test("the score's worker leaves Verovio in a chunk of its own, fetched only if jsDelivr's copy fails", () => {
		const workers = join(out, "_app/immutable/workers");
		const files = readdirSync(workers).filter((f) => f.endsWith(".js"));
		expect(files).toHaveLength(1);
		// Verovio's module is about 8 MB; the worker without it is a few hundred KB.
		expect(readFileSync(join(workers, files[0] ?? "")).length).toBeLessThan(1_000_000);
		const chunks = readdirSync(join(workers, "chunks")).map(
			(f) => readFileSync(join(workers, "chunks", f)).length,
		);
		expect(Math.max(...chunks)).toBeGreaterThan(5_000_000);
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
