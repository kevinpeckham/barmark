import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { exportMusicXml, importMusicXml } from "@barmark/musicxml";
import { barAt, chartFromDetections, secondsAtBar } from "@barmark/sync";
import { parseChart, printChart, transposeChart } from "barmark";
import { LINKS } from "../src/lib/site.ts";
import {
	CLI_CI,
	SAMPLE_CHART,
	SYNC_DETECTIONS,
	USE_CLI,
	USE_MUSICXML,
	USE_SYNC,
} from "../src/lib/start.ts";
import { build, page, site } from "./built.ts";

beforeAll(build, 120_000);

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim();

describe("the sample chart Get Started shows", () => {
	test("reads cleanly, as the page says it does", () => {
		const chart = parseChart(SAMPLE_CHART);
		expect(chart.diagnostics).toEqual([]);
		expect(chart.title).toBe("Example Song");
		expect(chart.bars.length).toBe(16);
		expect(chart.sections.map((s) => s.name)).toEqual(["Verse", "Chorus"]);
	});
	test("transposes and prints as the page says", () => {
		expect(transposeChart(SAMPLE_CHART, { to: "E" }).text).toContain("|: E | B | C#m | A :|");
		expect(printChart("| D / A / |")).toBe("| D A |\n");
	});
});

describe("the MusicXML code Get Started shows", () => {
	test("exports the sample chart and imports it back as the page says", () => {
		const exported = exportMusicXml(SAMPLE_CHART);
		if (!exported.ok) throw new Error(exported.diagnostics.map((d) => d.message).join("; "));
		expect(exported.xml).toContain("<score-partwise");
		const imported = importMusicXml(exported.xml);
		expect(imported.text).toStartWith("# Example Song\nkey: D, tempo: 145\n\n## Verse\n");
		expect(USE_MUSICXML).toContain('"# Example Song\\nkey: D, tempo: 145\\n\\n## Verse\\n…"');
		expect(imported.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});
});

describe("the sync code Get Started shows", () => {
	test("builds the chart and timing map the page says", () => {
		const { chart, timing, diagnostics } = chartFromDetections(SYNC_DETECTIONS);
		expect(diagnostics).toEqual([]);
		for (const r of SYNC_DETECTIONS.chords.runs)
			expect(USE_SYNC).toContain(`{ start: ${r.start}, end: ${r.end}, label: "${r.label}" }`);
		expect(chart).toBe("# Example Song\ntime: 4/4, tempo: 120\n\n## Verse\n| D | / | A | Bm |\n");
		expect(USE_SYNC).toContain(
			'chart; // "# Example Song\\ntime: 4/4, tempo: 120\\n\\n## Verse\\n| D | / | A | Bm |\\n"',
		);
		if (!timing) throw new Error("no timing map");
		expect(secondsAtBar(timing, 3)).toBe(4);
		expect(USE_SYNC).toContain("secondsAtBar(timing, 3); // 4");
		expect(barAt(timing, 5)).toEqual({ entry: 2, bar: 3, fraction: 0.5 });
		expect(USE_SYNC).toContain("barAt(timing, 5); // { entry: 2, bar: 3, fraction: 0.5 }");
	});
});

describe("the commands Get Started shows", () => {
	const bin = join(dirname(Bun.resolveSync("@barmark/cli/package.json", site)), "dist/cli.js");
	const version = JSON.parse(readFileSync(join(site, "package.json"), "utf8")).devDependencies[
		"@barmark/cli"
	];
	/** Runs a line of the snippet with the installed CLI, in a folder holding the sample chart. */
	const run = (line: string, cwd: string) => {
		const args = line
			.replace(/\s+#.*$/, "")
			.split(/\s+/)
			.slice(2); // drop "npx @barmark/cli"
		return Bun.spawnSync(["node", bin, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	};
	const folder = () => {
		const dir = mkdtempSync(join(tmpdir(), "barmark-start-"));
		mkdirSync(join(dir, "songs"));
		writeFileSync(join(dir, "example-song.chart.md"), SAMPLE_CHART);
		writeFileSync(join(dir, "songs/example-song.chart.md"), SAMPLE_CHART);
		return dir;
	};
	test("every line runs, with the npx form", () => {
		const lines = USE_CLI.split("\n");
		expect(lines.length).toBeGreaterThan(3);
		const dir = folder();
		for (const line of lines) {
			expect(line).toStartWith("npx @barmark/cli ");
			const result = run(line, dir);
			expect([line, result.exitCode, result.stderr.toString()]).toEqual([line, 0, ""]);
		}
	});
	test("check reads the sample chart cleanly, and transpose, render, export and import do what they say", () => {
		const dir = folder();
		const line = (command: string) =>
			USE_CLI.split("\n").find((l) => l.includes(` ${command} `)) ?? "";
		expect(run(line("check"), dir).stdout.toString()).toContain("1 file, 0 errors, 0 warnings");
		expect(run(line("transpose"), dir).stdout.toString()).toContain("|: E | B | C#m | A :|");
		run(line("render"), dir);
		expect(existsSync(join(dir, "example-song.html"))).toBe(true);
		run(line("export"), dir);
		expect(readFileSync(join(dir, "example-song.musicxml"), "utf8")).toContain("<score-partwise");
		expect(run(line("import"), dir).exitCode).toBe(0);
		expect(readFileSync(join(dir, "imported.chart.md"), "utf8")).toContain("| D | A | Bm | G | x2");
	});
	test("the CI example pins the version the site installs", () => {
		expect(version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(CLI_CI).toContain(`npx -y @barmark/cli@${version} check --strict --format github`);
		expect(CLI_CI).toContain(`npx -y @barmark/cli@${version} format --check`);
	});
});

describe("Get Started, prerendered", () => {
	const doc = () => page("get-started.html");
	test("has its title and canonical link", () => {
		expect(doc().title).toBe("Get Started · Barmark");
		expect(doc().querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
			`${LINKS.origin}/get-started`,
		);
	});
	test("walks from writing a chart to the parser, the renderer and the element", () => {
		const steps = [...doc().querySelectorAll("main section > h2")].map(text);
		expect(steps).toEqual([
			"1. Write a chart",
			"2. Read it with the parser",
			"3. Render it as HTML",
			"4. Or use the web component",
			"5. Convert to and from MusicXML",
			"6. Check charts from the terminal",
			"7. Sync a chart with a recording",
		]);
		const page = text(doc().querySelector("main")) ?? "";
		for (const line of [
			"npm install barmark",
			"npm install @barmark/render",
			"npm install @barmark/musicxml",
			"npm install @barmark/sync",
			"chartFromDetections(",
			"exportMusicXml(",
			"importMusicXml(",
			'import "@barmark/render/element";',
			"<barmark-chart",
			"renderChart(",
			"parseChart(",
			"npx @barmark/cli check",
		])
			expect(page).toContain(line);
	});
	test("shows the sample chart rendered", () => {
		expect(doc().querySelector("main barmark-chart template[shadowrootmode=open]")).not.toBeNull();
	});
});

describe("the FAQ, prerendered", () => {
	const doc = () => page("faq.html");
	test("has its title and canonical link", () => {
		expect(doc().title).toBe("FAQ · Barmark");
		expect(doc().querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
			`${LINKS.origin}/faq`,
		);
	});
	test("answers the questions asked, each with its own link", () => {
		const questions = [...doc().querySelectorAll("main h2[id]")].map(text);
		for (const q of [
			"What is Barmark?",
			"What is Stem Shovel?",
			"Who is behind Barmark?",
			"How is Barmark different from other chord notations?",
			"What is Barmark a good fit for?",
			"Is Barmark open source?",
		])
			expect(questions).toContain(q);
		const ids = [...doc().querySelectorAll("main h2[id]")].map((h) => h.id);
		expect(new Set(ids).size).toBe(ids.length);
		const contents = [...doc().querySelectorAll("main nav a")].map((a) => a.getAttribute("href"));
		expect(contents).toEqual(ids.map((id) => `#${id}`));
	});
	test("names the five packages, and answers how to check charts without code", () => {
		const what = text(doc().querySelector("#what")?.parentElement) ?? "";
		for (const name of [
			"barmark",
			"@barmark/render",
			"@barmark/musicxml",
			"@barmark/sync",
			"@barmark/cli",
		])
			expect(what).toContain(name);
		const cli = doc().querySelector("#cli")?.parentElement;
		expect(text(cli)).toContain("npx @barmark/cli check");
		const hrefs = [...(cli?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
		expect(hrefs).toContain("/get-started#terminal");
		expect(hrefs).toContain(LINKS.songs);
	});
	test("links to Stem Shovel, the code and the licence", () => {
		const hrefs = [...doc().querySelectorAll("main a")].map((a) => a.getAttribute("href"));
		expect(hrefs).toContain(LINKS.stemShovel);
		expect(hrefs).toContain(LINKS.syncReadme);
		expect(hrefs).toContain(LINKS.github);
		expect(hrefs).toContain(LINKS.license);
	});
});

describe("the nav", () => {
	test("leads with Get Started and ends the pages with the FAQ", () => {
		const links = [...page("index.html").querySelectorAll("nav a")].map((a) => [
			a.getAttribute("href"),
			text(a),
		]);
		const pages = links.filter(([href]) => href?.startsWith("/") && href !== "/");
		expect(pages).toEqual([
			["/get-started", "Get Started"],
			["/syntax", "Syntax Guide"],
			["/try", "Try It"],
			["/faq", "FAQ"],
		]);
	});
});

describe("the name in prose", () => {
	// Barmark, the notation, is capitalized in text; the package name stays in code.
	for (const path of ["index.html", "syntax.html", "try.html", "get-started.html", "faq.html"])
		test(`${path} writes Barmark with a capital B`, () => {
			const doc = page(path);
			for (const el of doc.querySelectorAll("code, pre, script, style, template, barmark-chart"))
				el.remove();
			doc.querySelector("nav a[href='/']")?.remove(); // the wordmark
			const words = [doc.title, doc.querySelector("main")?.textContent ?? ""].join(" ");
			expect(words.match(/\bbarmark\b(?![./-])/g) ?? []).toEqual([]);
		});
});

describe("licences", () => {
	test("the FAQ names both: MIT for the code, CC BY 4.0 for the grammar", () => {
		const doc = page("faq.html");
		const hrefs = [...doc.querySelectorAll("main a")].map((a) => a.getAttribute("href"));
		expect(hrefs).toContain(LINKS.license);
		expect(hrefs).toContain(LINKS.specLicense);
		expect(text(doc.querySelector("#open-source")?.parentElement)).toContain("CC BY 4.0");
	});
	test("the Syntax Guide says it is CC BY 4.0, as the grammar is", () => {
		const doc = page("syntax.html");
		const note = [...doc.querySelectorAll("main p")].find((p) => text(p)?.includes("CC BY 4.0"));
		expect(note).toBeDefined();
		expect([...(note?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"))).toContain(
			LINKS.specLicense,
		);
	});
	test("the FAQ says the Syntax Guide is CC BY 4.0", () => {
		expect(text(page("faq.html").querySelector("#open-source")?.parentElement)).toContain(
			"Syntax Guide",
		);
	});
	for (const path of ["index.html", "faq.html"])
		test(`${path}'s footer links both licences`, () => {
			const hrefs = [...page(path).querySelectorAll("footer a")].map((a) => a.getAttribute("href"));
			expect(hrefs).toContain(LINKS.license);
			expect(hrefs).toContain(LINKS.specLicense);
		});
});
