import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import { render } from "../src/render.js";
import { folder, PEACEFUL_DREAMS, ROOT } from "./charts.js";

const PD = readFileSync(PEACEFUL_DREAMS, "utf8");
const MORNING_SONG = readFileSync(join(ROOT, "examples/morning-song.chart.md"), "utf8");

async function scored(args: string[], files: Record<string, string> = { "pd.chart.md": PD }) {
	const io = folder(files);
	const code = await render(args, io);
	return { code, html: io.out(), err: io.err(), io };
}

/** The viewBox width of each engraved page's outer svg. */
const pageWidths = (html: string) =>
	[...parseHTML(html).document.querySelectorAll(".bms-score-page > svg")].map(
		(svg) => svg.getAttribute("viewBox")?.split(" ")[2],
	);

describe("barmark render --score", () => {
	test("a complete page holding the engraved score, one image", async () => {
		const { code, html, err } = await scored(["--score", "pd.chart.md"]);
		expect(err).toBe("");
		expect(code).toBe(0);
		expect(html.startsWith("<!doctype html>\n")).toBe(true);
		expect(html).toContain("<title>Peaceful Dreams</title>");
		const { document } = parseHTML(html);
		const pane = document.querySelector('.bms-score[role="img"]');
		expect(pane?.getAttribute("aria-label")).toBe("Peaceful Dreams");
		expect(pane?.querySelector("svg")).not.toBeNull();
		// The bar grid is not drawn.
		expect(html).not.toContain("<barmark-chart");
		expect(document.querySelector(".bm-grid")).toBeNull();
	});
	test("the page carries the grid's palette and the score's layout", async () => {
		const { html } = await scored(["--score", "pd.chart.md"]);
		const { stylesheet } = await import("@barmark/render");
		const { scoreStyles } = await import("@barmark/score");
		expect(html).toContain(stylesheet);
		expect(html).toContain(scoreStyles);
	});
	test("themed by --theme, auto by default", async () => {
		const dark = await scored(["--score", "pd.chart.md", "--theme", "dark"]);
		expect(dark.html).toContain('<div class="bm-chart" data-theme="dark">');
		const auto = await scored(["--score", "pd.chart.md"]);
		expect(auto.html).toContain('<div class="bm-chart" data-theme="auto">');
	});
	test("engraved 900 pixels wide by default; --width changes it", async () => {
		const wide = await scored(["--score", "pd.chart.md"]);
		expect(pageWidths(wide.html)).toEqual(["900"]);
		const narrow = await scored(["--score", "pd.chart.md", "--width", "500"]);
		expect(pageWidths(narrow.html)[0]).toBe("500");
		expect(pageWidths(narrow.html).length).toBeGreaterThanOrEqual(1);
	});
	test("Edwin is not embedded: the score's text is Verovio's own", async () => {
		const { html } = await scored(["--score", "pd.chart.md"]);
		expect(html).not.toContain("data:font/otf");
	});
	test("--part engraves that part alone", async () => {
		const files = { "ms.chart.md": MORNING_SONG };
		const all = await scored(["--score", "ms.chart.md"], files);
		const keys = await scored(["--score", "ms.chart.md", "--part", "Pno"], files);
		expect(keys.code).toBe(0);
		const staves = (html: string) =>
			parseHTML(html).document.querySelectorAll(".bms-score-page g.staff").length;
		expect(staves(keys.html)).toBeGreaterThan(0);
		expect(staves(keys.html)).toBeLessThan(staves(all.html));
	});
	test("--part that names no part exits 1", async () => {
		const { code, html, err } = await scored(["--score", "pd.chart.md", "--part", "Bass"]);
		expect(code).toBe(1);
		expect(html).toBe("");
		expect(err).toBe("pd.chart.md: no part labelled Bass\n");
	});
	test("--out writes the file and prints nothing", async () => {
		const { code, html, io } = await scored(["--score", "pd.chart.md", "--out", "pd.html"]);
		expect(code).toBe(0);
		expect(html).toBe("");
		const page = readFileSync(join(io.dir, "pd.html"), "utf8");
		expect(page).toContain('role="img"');
		expect(page).toContain("<svg");
	});
	test("a chart that won't engrave: the reason on stderr, exit 1, nothing written", async () => {
		const files = { "bad.chart.md": "| D | Q |\n" };
		const { code, html, err, io } = await scored(
			["--score", "bad.chart.md", "--out", "bad.html"],
			files,
		);
		expect(code).toBe(1);
		expect(html).toBe("");
		expect(err).toMatch(/^bad\.chart\.md: Line 1: .+\n$/);
		expect(existsSync(join(io.dir, "bad.html"))).toBe(false);
	});
	test("--part of a chart with errors: the chart's reason, exit 1", async () => {
		const files = { "ms.chart.md": `${MORNING_SONG}\n| Q |\n` };
		const { code, html, err } = await scored(["--score", "ms.chart.md", "--part", "Pno"], files);
		expect(code).toBe(1);
		expect(html).toBe("");
		expect(err).toMatch(/^ms\.chart\.md: Line \d+: .+\n$/);
	});
	test("--part of a chart with no bars: the export's reason", async () => {
		const files = { "p.chart.md": "part: Pno = Piano\n\n# Empty\n" };
		const { code, err } = await scored(["--score", "p.chart.md", "--part", "Pno"], files);
		expect(code).toBe(1);
		expect(err).toBe("p.chart.md: the chart has no bars to export\n");
	});
	test("a chart with no bars won't engrave either", async () => {
		const { code, err } = await scored(["--score", "e.chart.md"], { "e.chart.md": "# Empty\n" });
		expect(code).toBe(1);
		expect(err).toBe("e.chart.md: the chart has no bars to export\n");
	});
	for (const flag of [
		["--numerals", "roman"],
		["--no-bar-numbers"],
		["--rehearsal-letters"],
		["--no-wrap"],
		["--diagnostics"],
		["--columns", "row"],
		["--diagrams", "guitar"],
		["--font-url", "/fonts/Edwin-Roman.otf"],
	])
		test(`${flag[0]} with --score is a usage error`, async () => {
			const io = folder({ "pd.chart.md": PD });
			await expect(render(["--score", "pd.chart.md", ...flag], io)).rejects.toThrow(
				`${flag[0]} does not apply to --score`,
			);
		});
	test("--left-handed with --score alone is refused as a grid flag, not as needing --diagrams", async () => {
		const io = folder({ "pd.chart.md": PD });
		await expect(render(["--score", "pd.chart.md", "--left-handed"], io)).rejects.toThrow(
			"--left-handed does not apply to --score",
		);
	});
	test("--width without --score is a usage error", async () => {
		const io = folder({ "pd.chart.md": PD });
		await expect(render(["pd.chart.md", "--width", "500"], io)).rejects.toThrow(
			"--width needs --score",
		);
	});
	for (const width of ["wide", "319", "40001", "500.5", "-1"])
		test(`--width ${width} is a usage error`, async () => {
			const io = folder({ "pd.chart.md": PD });
			await expect(render(["--score", "pd.chart.md", `--width=${width}`], io)).rejects.toThrow(
				`--width must be a whole number of pixels from 320 to 40000, not "${width}"`,
			);
		});
});
