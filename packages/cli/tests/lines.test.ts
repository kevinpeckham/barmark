/** The commands on a piano writing its hands as lines, with pedal and a dotted figure (barmark's grammar 7.6, 2.9, 2.2). */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validate } from "../../musicxml/tests/schema.js";
import { check } from "../src/check.js";
import { exportCommand } from "../src/export.js";
import { format } from "../src/format.js";
import { folder, ROOT } from "./charts.js";

const PIANO = readFileSync(
	join(ROOT, "packages/musicxml/tests/fixtures/piano-lines.chart.md"),
	"utf8",
);

describe("a chart with part lines", () => {
	test("check passes it", async () => {
		const io = folder({ "p.chart.md": PIANO });
		expect(await check(["p.chart.md"], io)).toBe(0);
	});
	test("format --check finds it canonical", async () => {
		const io = folder({ "p.chart.md": PIANO });
		expect(await format(["--check", "p.chart.md"], io)).toBe(0);
	});
	test("export --musicxml writes a valid score, the piano's lines as voices", async () => {
		const io = folder({ "p.chart.md": PIANO });
		expect(await exportCommand(["--musicxml", "p.chart.md"], io)).toBe(0);
		const xml = io.out();
		expect(validate(xml)).toEqual([]);
		expect(xml).toContain("<voice>5</voice>");
		expect(xml).toContain('<pedal type="start" sign="yes"/>');
	});
	test("export --part Pno keeps both hands", async () => {
		const io = folder({ "p.chart.md": PIANO });
		expect(await exportCommand(["--musicxml", "p.chart.md", "--part", "Pno"], io)).toBe(0);
		expect(validate(io.out())).toEqual([]);
		expect(io.out()).toContain("<voice>5</voice>");
		expect(io.out()).not.toContain("Bass");
	});
});
