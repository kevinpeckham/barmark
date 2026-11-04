import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { layoutChart, renderChartUnwrapped } from "../src/index.js";

const MORNING = `# Morning Song
part: Pno = Piano, instrument: piano
part: Bs = Bass, instrument: electric bass

## Verse
Pno.RH | G{B3 D4 G4} | C{C4 E4 G4} | D{D4 F#4 A4} | G{B3 D4 G4} |
Pno.LH | {G2}        | {C3}        | {D3} / {F#2} / | {G2}       |
Bs     | {G1}        | {C2}        | {D2}         | {G1}         |
`;

const doc = (text: string, part?: string) =>
	parseHTML(`<body>${renderChartUnwrapped(text, part ? { part } : {})}</body>`).document;
const rowLabels = (text: string, part?: string) =>
	[...doc(text, part).querySelectorAll(".bm-system")].map((s) =>
		[...s.querySelectorAll(".bm-part-row")].map(
			(r) => r.querySelector(".bm-part-label")?.textContent,
		),
	);
const spoken = (text: string) =>
	[...doc(text).querySelectorAll(".bm-bar .bm-sr")].map((e) => e.textContent);

describe("part lines (barmark's grammar 7.6)", () => {
	test("a row per line", () => {
		expect(rowLabels(MORNING)).toEqual([["Pno.RH", "Pno.LH", "Bs"]]);
		// The label column is as wide as the widest row label.
		expect(doc(MORNING).querySelector(".bm-chart")?.getAttribute("style")).toContain(
			"--bm-label-chars:6",
		);
		const system = layoutChart(MORNING).blocks[0]?.items.find((i) => i.kind === "system");
		const lh = system?.kind === "system" ? system.rows[1]?.row : undefined;
		const third = lh?.kind === "row" ? lh.cells[2] : undefined;
		expect(third?.kind === "slots" && third.slots.length).toBe(4);
	});
	test("a system writing only RH", () => {
		expect(rowLabels(`${MORNING}\nPno.RH | Em |\nBs | {E1} |\n`)[1]).toEqual(["Pno.RH", "Bs"]);
	});
	test("a part with no line in a system has its tacet row", () => {
		const labels = rowLabels(`${MORNING}\nBs | {E1} |\n`)[1];
		expect(labels).toEqual(["Pno", "Bs"]);
	});
	test("render --part Pno shows both lines", () => {
		expect(rowLabels(MORNING, "Pno")).toEqual([["Pno.RH", "Pno.LH"]]);
	});
	test("a single-part chart with lines", () => {
		expect(rowLabels("part: Pno = Piano\nPno.RH | {G4} |\nPno.LH | {G2} |\n")).toEqual([
			["Pno.RH", "Pno.LH"],
		]);
	});
});

describe("pedal marks (barmark's grammar 2.9)", () => {
	test("Ped. under a press and ✱ under a release", () => {
		const d = doc("| +G / / / | *C |");
		const marks = [...d.querySelectorAll("[data-pedal]")];
		expect(marks.map((m) => m.getAttribute("data-pedal"))).toEqual(["press", "release"]);
		expect(marks.map((m) => m.querySelector(".bm-pedal")?.textContent)).toEqual(["Ped.", "✱"]);
	});
	test("speech", () => {
		expect(spoken("| +G / / / | *C |")).toEqual([
			"bar 1: pedal G, hold, hold, hold",
			"bar 2: pedal up C",
		]);
	});
});

describe("dotted figures (barmark's grammar 2.2)", () => {
	test("a dotted group has no tuplet number, and a dot after its dotted member", () => {
		const group = doc("| C._D / / |").querySelector(".bm-group");
		expect(group?.hasAttribute("data-dotted")).toBe(true);
		expect(group?.querySelector(".bm-tuplet")).toBeNull();
		expect(group?.querySelectorAll(".bm-dot")).toHaveLength(1);
		// The dot hugs its member: both inside one span, so the group's gap falls after the dot.
		expect(group?.querySelector(".bm-dotted")?.textContent).toMatch(/^C\.$/);
	});
	test("speech", () => {
		expect(spoken("| C._D / / |")[0]).toBe("bar 1: C dotted, D, hold, hold");
	});
});
