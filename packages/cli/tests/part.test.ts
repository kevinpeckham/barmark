import { describe, expect, test } from "bun:test";
import { printPart } from "barmark";
import { HELP } from "../src/help.js";
import { part } from "../src/part.js";
import { render } from "../src/render.js";
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
