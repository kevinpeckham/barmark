import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractPart, parseChart } from "../../src/chart/parse.js";
import { printSlot } from "../../src/chart/print.js";
import type { PlayedBar } from "../../src/chart/types.js";
import { MORNING_SONG } from "./morning-song.js";

const TWO = "part: Gtr = Guitar\npart: Pno = Piano\n";
const sym = (slots: PlayedBar["slots"] | undefined) => (slots ?? []).map(printSlot).join(" ");

describe("one timeline for every part (grammar 7.4)", () => {
	const p = parseChart(MORNING_SONG);
	test("the parts share bars", () => {
		expect(p.diagnostics).toEqual([]);
		expect(p.bars).toHaveLength(4 + 4 + 4 + 8);
		const bar5 = p.bars[4];
		expect(sym(bar5?.parts?.[0]?.slots)).toBe("G");
		expect(sym(bar5?.parts?.[1]?.slots)).toBe("G/B");
		expect(bar5?.parts?.[1]?.line).toBe(11);
		expect(p.bars.slice(8, 12).map((b) => b.parts?.[1])).toEqual([null, null, null, null]);
		expect(p.bars.every((b) => sym(b.slots) === sym(b.parts?.[0]?.slots ?? undefined))).toBe(true);
	});
	test("a tutti bar has every part", () => {
		expect(p.bars[0]?.parts?.map((x) => sym(x?.slots))).toEqual(["G", "G"]);
	});
	test("where the first part is tacet, the bar reads N.C. and says tacet", () => {
		const q = parseChart(`${TWO}Pno | C |`);
		expect(q.bars[0]?.slots).toEqual([{ kind: "nc" }]);
		expect(q.bars[0]?.tacet).toBe(true);
		expect(q.bars[0]?.parts?.[0]).toBeNull();
	});
	test("a single-part chart's bars have no parts", () => {
		const text = readFileSync(
			new URL("../../../../examples/peaceful-dreams.chart.md", import.meta.url),
			"utf8",
		);
		expect(parseChart(text).bars.some((b) => "parts" in b || "tacet" in b)).toBe(false);
	});
	test("a replayed section of systems brings every part back", () => {
		const q = parseChart(`${TWO}## Verse\nGtr | G | C |\nPno | Em | D |\nGtr | A |\n## Verse`);
		expect(q.diagnostics).toEqual([]);
		expect(q.bars).toHaveLength(6);
		const first = q.bars.slice(0, 3).map((b) => [b.written, b.parts]);
		const again = q.bars.slice(3).map((b) => [b.written, b.parts]);
		expect(again).toEqual(first);
	});
	test("a repeat opens in a system and closes on tutti endings", () => {
		const q = parseChart(`${TWO}Gtr |: G | C |\nPno |: Em | C |\n|1 D :|\n|2 G |`);
		expect(q.diagnostics).toEqual([]);
		expect(q.bars).toHaveLength(6);
		expect(q.bars.map((b) => sym(b.parts?.[1]?.slots))).toEqual(["Em", "C", "D", "Em", "C", "G"]);
	});
	test("diagnostics are reported once", () => {
		const q = parseChart(`${TWO}| G | ? |`);
		expect(q.diagnostics.filter((d) => d.severity === "warning")).toHaveLength(1);
	});
	test("parts that disagree on a bar's meter are an error", () => {
		const q = parseChart(`${TWO}| G |\nGtr | % |\nPno | C |`.replace("| G |", "| [2/4] G |"));
		expect(q.diagnostics.map((d) => d.message)).toContain("the parts disagree on this bar's meter");
	});
});

describe("extractPart", () => {
	test("one part as a single-part chart", () => {
		const x = extractPart(MORNING_SONG, "pno");
		expect(x?.parts).toEqual([{ label: "Pno", name: "Piano" }]);
		expect(x?.part).toEqual({ label: "Pno", name: "Piano" });
		expect(x?.bars).toHaveLength(parseChart(MORNING_SONG).bars.length);
		expect(x?.bars.slice(8, 12).map((b) => sym(b.slots))).toEqual(["N.C.", "N.C.", "N.C.", "N.C."]);
		expect(x?.diagnostics).toEqual([]);
	});
	test("an undeclared label has none", () => {
		expect(extractPart(MORNING_SONG, "Bass")).toBeNull();
	});
});
