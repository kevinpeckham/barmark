import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fontFaceCss, renderChart } from "@barmark/render";
import { parseHTML } from "linkedom";
import { COMMAND_HELP } from "../src/help.js";
import { render } from "../src/render.js";
import { folder, PEACEFUL_DREAMS } from "./charts.js";

const PD = readFileSync(PEACEFUL_DREAMS, "utf8");
const FONT = new Uint8Array([1, 2, 3, 4]);
const DATA_URL = `data:font/otf;base64,${Buffer.from(FONT).toString("base64")}`;

async function rendered(args: string[], files: Record<string, string> = { "pd.chart.md": PD }) {
	const io = folder(files);
	const code = await render(args, io);
	return { code, html: io.out(), io };
}

describe("barmark render", () => {
	test("a complete document", async () => {
		const { code, html } = await rendered(["pd.chart.md"]);
		expect(code).toBe(0);
		expect(html.startsWith("<!doctype html>\n")).toBe(true);
		expect(html).toContain('<html lang="en">');
		expect(html).toContain('<meta charset="utf-8">');
		expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
		expect(html).toContain("<title>Peaceful Dreams</title>");
	});
	test("the title falls back to the file name", async () => {
		const { html } = await rendered(["song.chart.md"], { "song.chart.md": "| D | A |\n" });
		expect(html).toContain("<title>song</title>");
	});
	test("the title is HTML-escaped", async () => {
		const { html } = await rendered(["r.chart.md"], { "r.chart.md": "# Rock & <Roll>\n| D |\n" });
		expect(html).toContain("<title>Rock &amp; &lt;Roll&gt;</title>");
	});
	test("the body is renderChart's output with the flags as options", async () => {
		const { html } = await rendered([
			"pd.chart.md",
			"--theme",
			"dark",
			"--numerals",
			"roman",
			"--no-bar-numbers",
			"--rehearsal-letters",
			"--no-wrap",
			"--diagnostics",
		]);
		const expected = renderChart(PD, {
			theme: "dark",
			numerals: "roman",
			barNumbers: false,
			rehearsalLetters: true,
			wrap: false,
			diagnostics: true,
			fontUrl: DATA_URL,
		});
		expect(html).toContain(expected);
	});
	test("with no flags, the body is renderChart's defaults", async () => {
		const { html } = await rendered(["pd.chart.md"]);
		expect(html).toContain(renderChart(PD, { fontUrl: DATA_URL }));
	});
	test("Edwin is embedded by default, once", async () => {
		const { html } = await rendered(["pd.chart.md"]);
		const { document } = parseHTML(html);
		const outside = [...document.querySelectorAll("style")].filter((s) => !s.closest("template"));
		expect(outside.map((s) => s.textContent)).toEqual([fontFaceCss(DATA_URL)]);
		expect(html.split("data:font/otf").length - 1).toBe(1);
	});
	test("--font-url links instead", async () => {
		const { html } = await rendered(["pd.chart.md", "--font-url", "/fonts/Edwin-Roman.otf"]);
		expect(html).toContain(fontFaceCss("/fonts/Edwin-Roman.otf"));
		expect(html).not.toContain("data:");
	});
	test("--out writes the file and prints nothing", async () => {
		const { code, html, io } = await rendered(["pd.chart.md", "--out", "pd.html"]);
		expect(code).toBe(0);
		expect(html).toBe("");
		expect(readFileSync(join(io.dir, "pd.html"), "utf8")).toContain(
			"<title>Peaceful Dreams</title>",
		);
	});
	test("--out into a missing folder is a usage error", async () => {
		const io = folder({ "pd.chart.md": PD });
		await expect(render(["pd.chart.md", "--out", "nope/x.html"], io)).rejects.toThrow(
			"cannot write nope/x.html",
		);
	});
	test("--numerals names is a usage error", async () => {
		const io = folder({ "pd.chart.md": PD });
		await expect(render(["pd.chart.md", "--numerals", "names"], io)).rejects.toThrow(
			'--numerals must be nashville or roman, not "names"',
		);
	});
	test("two files is a usage error", async () => {
		const io = folder({ "a.chart.md": PD, "b.chart.md": PD });
		await expect(render(["a.chart.md", "b.chart.md"], io)).rejects.toThrow(
			"render takes one chart",
		);
	});
});

describe("render help", () => {
	test("--rehearsal-letters says it adds none to a chart that marks its own", () => {
		expect(COMMAND_HELP.render).toMatch(
			/--rehearsal-letters\s+Letter each section A, B, C… \(none when the chart marks its own\)/,
		);
	});
});
