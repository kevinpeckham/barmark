import { describe, expect, test } from "bun:test";
import { parseChart, printPart } from "barmark";
import { HELP } from "../src/help.js";
import { part } from "../src/part.js";
import { render } from "../src/render.js";
import { textLine } from "../src/report.js";
import { folder } from "./charts.js";

const SONG = "part: Gtr = Guitar\npart: Pno = Piano\n\n| D |\nGtr | G | C |\nPno | Em | C |\n";

describe("barmark part", () => {
	test("prints one part's chart", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await part(["Pno", "s.chart.md"], io)).toBe(0);
		expect(io.out()).toBe(printPart(SONG, "Pno") ?? "");
	});
	test("an undeclared label exits 1", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await part(["Bass", "s.chart.md"], io)).toBe(1);
		expect(io.err()).toContain("no part labelled Bass");
	});
	test("the chart's problems go to stderr; an error exits 1 and --out is not written", async () => {
		const DROP =
			"part: Gtr = Guitar\npart: Pno = Piano\n\nGtr | G | C | D |\nPno | Em | C |\n| E |\n";
		const io = folder({ "d.chart.md": DROP });
		expect(await part(["Pno", "d.chart.md"], io)).toBe(1);
		const [diagnostic] = parseChart(DROP).diagnostics;
		if (diagnostic) expect(io.err()).toContain(textLine("d.chart.md", diagnostic));
		const out = folder({ "d.chart.md": DROP });
		expect(await part(["Pno", "d.chart.md", "--out", "p.chart.md"], out)).toBe(1);
		expect(out.err()).toContain("p.chart.md not written: the chart has errors");
	});
	test("help lists it", () => {
		expect(HELP).toContain("part <label> <file>");
	});
});

describe("barmark render --part", () => {
	test("draws one part", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await render(["s.chart.md", "--part", "Pno", "--font-url", "f.otf"], io)).toBe(0);
		expect(io.out()).not.toContain('class="bm-system"');
		expect(io.out()).toContain("E minor");
	});
	test("an undeclared label exits 1", async () => {
		const io = folder({ "s.chart.md": SONG });
		expect(await render(["s.chart.md", "--part", "Bass", "--font-url", "f.otf"], io)).toBe(1);
		expect(io.err()).toContain("no part labelled Bass");
	});
});
