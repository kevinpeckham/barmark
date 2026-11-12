import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ENGRAVER_CDN_INTEGRITY, ENGRAVER_CDN_URL, ENGRAVER_WASM_INTEGRITY } from "@barmark/score";
import { chartHtml, scoreHtml } from "../src/lib/chart.ts";

// The ratio is of alternated best-of-three timings; the timeout only keeps a loaded machine from
// cutting a run short.
const TIMEOUT = 60_000;

/**
 * How much longer a 2,000-line paste renders than a 200-line one. Both warm
 * up, then the runs alternate, so a burst of load falls on both alike, and
 * a small run renders ten times, so both runs last about as long (the
 * repository's `test-support/growth.ts`, which the site can't import). The
 * small run is floored at 5 ms, so a quick one can't blow the ratio up.
 */
function pasteGrowth(): number {
	const [small, large] = [200, 2000].map((lines) => "| D | G |\n".repeat(lines)) as [
		string,
		string,
	];
	const time = (text: string, calls = 1) => {
		const start = performance.now();
		for (let k = 0; k < calls; k++) chartHtml(text);
		return performance.now() - start;
	};
	time(small);
	time(large);
	let [smallMs, largeMs] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
	for (let run = 0; run < 3; run++) {
		smallMs = Math.min(smallMs, time(small, 10));
		largeMs = Math.min(largeMs, time(large));
	}
	return (largeMs * 10) / Math.max(smallMs, 5);
}

const demo = await Bun.file(
	join(import.meta.dir, "../src/lib/examples/peaceful-dreams.chart.md"),
).text();

describe("chartHtml", () => {
	test("an empty source is an empty chart, not an exception", () => {
		expect(chartHtml("")).toStartWith("<barmark-chart");
	});
	test("the text is escaped, never markup", () => {
		const html = chartHtml("# A & <b>\n| D |");
		expect(html).toContain("A &amp; &lt;b&gt;");
		expect(html).not.toContain("<b>");
	});
	test("a chart can leave out bar numbers", () => {
		const host = (html: string) => html.slice(0, html.indexOf(">") + 1);
		expect(host(chartHtml("| C |", { barNumbers: false }))).toContain('bar-numbers="off"');
		expect(host(chartHtml("| C |"))).not.toContain("bar-numbers");
	});
	test("charts never wrap their rows: a wide section scrolls", () => {
		expect(chartHtml("| C |")).toContain('wrap="off"');
	});
	test("charts use the dark palette", () => {
		expect(chartHtml(demo)).toContain('data-theme="dark"');
	});
	test("sections are lettered A, B, C in play order", () => {
		expect(chartHtml(demo)).toContain('<span class="bm-rehearsal"');
	});
	test(
		"a 2,000-line paste renders in time linear in its length",
		() => {
			// Ten times the lines: linear is ten times as long, quadratic a hundred.
			expect(pasteGrowth()).toBeLessThan(30);
		},
		TIMEOUT,
	);
});

describe("scoreHtml", () => {
	test("is a <barmark-score> with the grid drawn and the Grid / Score switch, Grid checked", () => {
		const html = scoreHtml(demo);
		expect(html).toStartWith("<barmark-score");
		expect(html).toContain('<template shadowrootmode="open">');
		expect(html).toContain('role="radiogroup" aria-label="View"');
		expect(html).toContain('data-view="grid" aria-checked="true"');
		expect(html).toContain("Peaceful Dreams");
	});
	test("draws the grid as chartHtml does: dark, lettered, never wrapping", () => {
		const html = scoreHtml(demo);
		const host = html.slice(0, html.indexOf(">") + 1);
		expect(host).toContain('wrap="off"');
		expect(host).toContain('theme="dark"');
		expect(html).toContain('data-theme="dark"');
		expect(html).toContain('<span class="bm-rehearsal"');
		expect(scoreHtml("| C |", { barNumbers: false })).toContain('bar-numbers="off"');
	});
	test("carries the chart's text, escaped so it can't end its script", () => {
		const html = scoreHtml("# A </script><b>\n| D |");
		expect(html).toContain('<script type="text/barmark">');
		// Inside the script the text is never markup; only its own end tag closes it.
		expect(html.match(/<\/script>/gi)?.length).toBe(1);
		expect(html).toContain("# A <\\/script><b>");
	});
	test("an empty source is an empty chart, not an exception", () => {
		expect(scoreHtml("")).toStartWith("<barmark-score");
	});
	/** An attribute of the `<barmark-score>` host, or null. */
	const attr = (html: string, name: string) =>
		new RegExp(`^<barmark-score[^>]*\\s${name}="([^"]*)"`).exec(html)?.[1] ?? null;
	test("every score loads the lite build from jsDelivr with both digests", () => {
		for (const preload of ["none", "intent", "idle"] as const) {
			const html = scoreHtml(demo, { preload });
			expect(attr(html, "verovio-url")).toBe(ENGRAVER_CDN_URL);
			expect(attr(html, "verovio-integrity")).toBe(ENGRAVER_CDN_INTEGRITY);
			expect(attr(html, "verovio-wasm-integrity")).toBe(ENGRAVER_WASM_INTEGRITY);
		}
		expect(ENGRAVER_CDN_URL).toStartWith("https://cdn.jsdelivr.net/npm/@barmark/engraver@");
	});
	test("preloads only when asked", () => {
		expect(attr(scoreHtml(demo), "preload")).toBeNull();
		expect(attr(scoreHtml(demo, { preload: "intent" }), "preload")).toBe("intent");
		expect(attr(scoreHtml(demo, { preload: "idle" }), "preload")).toBe("idle");
	});
});
