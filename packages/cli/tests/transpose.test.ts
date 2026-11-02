import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transposeChart } from "barmark";
import { textLine } from "../src/report.js";
import { transpose } from "../src/transpose.js";
import { folder } from "./charts.js";

const SONG = "key: D\n\n## Verse\n| D | A | Bm | G |\n";

describe("barmark transpose", () => {
	test("--to prints the chart in the new key", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await transpose(["s.chart.md", "--to", "E"], io)).toBe(0);
		expect(io.out()).toBe(transposeChart(SONG, { to: "E" }).text);
		expect(io.out()).toContain("| E | B | C#m | A |");
	});
	test("--semitones -2, as two words or with =", async () => {
		const expected = transposeChart(SONG, { semitones: -2 }).text;
		for (const args of [["--semitones", "-2"], ["--semitones=-2"]]) {
			const io = folder({ "s.chart.md": SONG });
			expect(await transpose(["s.chart.md", ...args], io)).toBe(0);
			expect(io.out()).toBe(expected);
		}
	});
	test("diagnostics go to stderr as check's text lines; an error exits 1", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await transpose(["s.chart.md", "--to", "H"], io)).toBe(1);
		const [diagnostic] = transposeChart(SONG, { to: "H" }).diagnostics;
		expect(diagnostic).toBeDefined();
		if (diagnostic) expect(io.err()).toBe(`${textLine("s.chart.md", diagnostic)}\n`);
	});
	test("--to and --semitones together, or neither, is a usage error", async () => {
		const both = transpose(
			["s.chart.md", "--to", "E", "--semitones", "2"],
			folder({ "s.chart.md": SONG }),
		);
		await expect(both).rejects.toThrow("give --to or --semitones, not both");
		const neither = transpose(["s.chart.md"], folder({ "s.chart.md": SONG }));
		await expect(neither).rejects.toThrow("give --to <key> or --semitones <n>");
	});
	test("--semitones 1.5 is a usage error", async () => {
		const io = folder({ "s.chart.md": SONG });
		await expect(transpose(["s.chart.md", "--semitones", "1.5"], io)).rejects.toThrow(
			'--semitones must be a whole number, not "1.5"',
		);
	});
	test("--out writes the file", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await transpose(["s.chart.md", "--to", "E", "--out", "e.chart.md"], io)).toBe(0);
		expect(io.out()).toBe("");
		expect(readFileSync(join(io.dir, "e.chart.md"), "utf8")).toBe(
			transposeChart(SONG, { to: "E" }).text,
		);
	});
});
