import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { renderChart, renderChartUnwrapped } from "@barmark/render";
import { parseHTML } from "linkedom";
import { decodeCarried, renderScoreHtml } from "../src/server.js";
import { switchHtml } from "../src/switch.js";

const chart = "# Song\n\n| C | G |\n";

const parse = (html: string) => {
	const { document } = parseHTML(`<!doctype html><body>${html}`);
	const host = document.querySelector("barmark-score");
	if (!host) throw new Error("no element");
	const template = host.querySelector("template");
	if (!template) throw new Error("no template");
	const inner = parseHTML(`<!doctype html><body>${template.innerHTML}`).document;
	return { host, inner, script: host.querySelector('script[type="text/barmark"]') };
};

const attrsOf = (el: Element) =>
	Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));

describe("renderScoreHtml", () => {
	test("draws the grid and the switch with no script needed", () => {
		const { inner } = parse(renderScoreHtml(chart));
		const grid = inner.querySelector(".bms-grid");
		expect(grid?.innerHTML).toBe(renderChartUnwrapped(chart));
		expect(inner.querySelector(".bm-grid")).not.toBeNull();
		const radios = [
			...inner.querySelectorAll('[role="radiogroup"][aria-label="View"] [role="radio"]'),
		];
		expect(radios.map((r) => r.textContent)).toEqual(["Grid", "Score"]);
		expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false"]);
		expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual([null, "-1"]);
		expect(inner.querySelector(".bms-pane")?.hasAttribute("hidden")).toBe(true);
		expect(inner.querySelector(".bms-score")).toBeNull();
	});

	test("the grid takes render's rehearsal letters: none beside the chart's own marks", () => {
		const own = "## Verse\n| @A | D |\n## Chorus\n| @B | G |";
		const plain = "## Verse\n| D |\n## Chorus\n| G |";
		const letters = (text: string) =>
			[
				...parse(renderScoreHtml(text, { rehearsalLetters: true })).inner.querySelectorAll(
					".bm-heading .bm-rehearsal",
				),
			].map((e) => e.textContent);
		expect(letters(own)).toEqual([]);
		expect(letters(plain)).toEqual(["A", "B"]);
	});

	test("carries chart text holding </script> intact", () => {
		const text = `${chart}</script><b>\n</SCRIPT >\n<!-- x -->\na < b & "c"\n`;
		const html = renderScoreHtml(text);
		const { script } = parse(html);
		expect(script?.textContent).not.toContain("</");
		expect(decodeCarried(script?.textContent ?? "")).toBe(text);
		expect(
			decodeCarried(html.split('<script type="text/barmark">')[1]?.split("</script>")[0] ?? ""),
		).toBe(text);
	});

	test("passes the grid options through as attributes", () => {
		const options = { theme: "dark", numerals: "roman", part: "Gtr", barNumbers: false } as const;
		const { host, inner } = parse(renderScoreHtml(chart, { ...options, view: "score" }));
		const plain = parseHTML(
			`<!doctype html><body>${renderChart(chart, options)}`,
		).document.querySelector("barmark-chart");
		expect(attrsOf(host)).toEqual({ ...attrsOf(plain as Element), view: "score" });
		// The grid is what shows before any script runs, so Grid is the checked radio; the upgrade switches.
		const radios = [...inner.querySelectorAll('[role="radio"]')];
		expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false"]);
	});

	test("writes the font rule before the element when fontUrl is given", () => {
		const html = renderScoreHtml(chart, { fontUrl: "/f.otf" });
		expect(
			html.startsWith(renderChart(chart, { fontUrl: "/f.otf" }).split("<barmark-chart")[0] ?? "?"),
		).toBe(true);
		expect(html).toContain("/f.otf");
	});

	test("an unknown view is the grid", () => {
		const { inner } = parse(renderScoreHtml(chart, { view: "bogus" as "grid" }));
		const radios = [...inner.querySelectorAll('[role="radio"]')];
		expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false"]);
		expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual([null, "-1"]);
	});

	test("switchHtml marks the current view", () => {
		expect(switchHtml("score")).toContain('aria-checked="true"');
	});
});

describe("the server path", () => {
	test("never imports Verovio", () => {
		const transpiler = new Bun.Transpiler({ loader: "ts" });
		const seen = new Set<string>();
		const walk = (file: string) => {
			if (seen.has(file)) return;
			seen.add(file);
			for (const { path } of transpiler.scanImports(readFileSync(file, "utf8"))) {
				expect(path === "verovio" || path.startsWith("verovio/")).toBe(false);
				if (!path.startsWith(".")) continue;
				const ts = resolve(dirname(file), path.replace(/\.js$/, ".ts"));
				expect(existsSync(ts)).toBe(true);
				walk(ts);
			}
		};
		walk(join(import.meta.dir, "../src/server.ts"));
		const names = [...seen].map((f) => f.split("/").pop());
		expect(names).not.toContain("engine.ts");
		expect(names).not.toContain("worker.ts");
		expect(names).toContain("server.ts");
	});
});
