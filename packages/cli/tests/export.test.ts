import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exportMusicXml } from "@barmark/musicxml";
import { parseChart } from "barmark";
import { exportCommand } from "../src/export.js";
import { COMMAND_HELP, HELP } from "../src/help.js";
import { main } from "../src/main.js";
import { textLine } from "../src/report.js";
import { folder, PROBLEMS } from "./charts.js";

const SONG =
	"# Song\npart: Gtr = Guitar\npart: Pno = Piano\n\n| D |\nGtr | G | C |\nPno | Em | C |\n";

const xml = (text: string, options = {}) => {
	const r = exportMusicXml(text, options);
	if (!r.ok) throw new Error("not ok");
	return r.xml;
};

describe("barmark export", () => {
	test("--musicxml prints the score", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await exportCommand(["--musicxml", "s.chart.md"], io)).toBe(0);
		expect(io.out()).toBe(xml(SONG));
	});
	test("a chart with no title is titled with its file name", async () => {
		const io = folder({ "untitled.chart.md": "| G |\n" });
		expect(await exportCommand(["--musicxml", "untitled.chart.md"], io)).toBe(0);
		expect(io.out()).toContain("<work-title>untitled.chart.md</work-title>");
	});
	test("--out writes the file", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await exportCommand(["--musicxml", "s.chart.md", "--out", "s.musicxml"], io)).toBe(0);
		expect(io.out()).toBe("");
		expect(readFileSync(join(io.dir, "s.musicxml"), "utf8")).toBe(xml(SONG));
	});
	test("--part exports one part; an undeclared one exits 1", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await exportCommand(["--musicxml", "s.chart.md", "--part", "Pno"], io)).toBe(0);
		expect(io.out()).toBe(xml(SONG, { part: "Pno" }));
		const bass = folder({ "s.chart.md": SONG });
		expect(await exportCommand(["--musicxml", "s.chart.md", "--part", "Bass"], bass)).toBe(1);
		expect(bass.err()).toContain("s.chart.md: no part labelled Bass");
	});
	test("an error goes to stderr and exits 1, and --out is not written", async () => {
		const io = folder({ "p.chart.md": PROBLEMS });
		expect(await exportCommand(["--musicxml", "p.chart.md", "--out", "p.musicxml"], io)).toBe(1);
		for (const d of parseChart(PROBLEMS).diagnostics)
			expect(io.err()).toContain(textLine("p.chart.md", d));
		expect(io.err()).toContain("p.musicxml not written: the chart has errors");
		expect(io.out()).toBe("");
	});
	test("export without --musicxml is a usage error", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await main(["export", "s.chart.md"], io)).toBe(2);
		expect(io.err()).toBe("barmark: give a format: --musicxml\n");
	});
	test("help lists export", () => {
		expect(HELP).toContain("export <file>");
		expect(COMMAND_HELP.export).toContain("--musicxml");
	});
});
