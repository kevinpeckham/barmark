import { describe, expect, test } from "bun:test";
import { readDocument } from "../../src/chart/document.js";
import { parseChart } from "../../src/chart/parse.js";
import { printChart } from "../../src/chart/print.js";
import { streamKey } from "../../src/chart/systems.js";
import type { Line } from "../../src/chart/types.js";

const MORNING = `# Morning Song
part: Pno = Piano, instrument: piano
part: Bs = Bass, instrument: electric bass

## Verse
Pno.RH | G{B3 D4 G4} | C{C4 E4 G4} | D{D4 F#4 A4} | G{B3 D4 G4} |
Pno.LH | {G2}        | {C3}        | {D3} / {F#2} / | {G2}       |
Bs     | {G1}        | {C2}        | {D2}         | {G1}         |
`;

type Bars = Extract<Line, { kind: "bars" | "invalid" }>;
const barLines = (text: string) =>
	readDocument(text).lines.filter((l): l is Bars => l.kind === "bars" || l.kind === "invalid");
const errors = (text: string) => parseChart(text).diagnostics.filter((d) => d.severity === "error");

describe("part lines (grammar 7.6)", () => {
	test("line labels", () => {
		const doc = readDocument(MORNING);
		const lines = barLines(MORNING);
		expect(lines.map((l) => [l.part, l.lineName, l.system])).toEqual([
			["Pno", "RH", 0],
			["Pno", "LH", 0],
			["Bs", undefined, 0],
		]);
		expect(doc.parts.map((p) => p.lines)).toEqual([["RH", "LH"], undefined]);
		expect(doc.diagnostics).toEqual([]);
	});
	test("single part with lines", () => {
		const text = "part: Pno = Piano\nPno.RH | {G4} |\nPno.LH | {G2} |\n";
		expect(barLines(text).map((l) => [l.part, l.lineName, l.system])).toEqual([
			["Pno", "RH", 0],
			["Pno", "LH", 0],
		]);
		expect(errors(text)).toEqual([]);
	});
	test("a single-part chart without lines is as before", () => {
		expect(barLines("part: Pno = Piano\nPno | G |\n")[0]?.part).toBeUndefined();
	});
	test("names match in any case and keep their first spelling", () => {
		const text =
			"part: Pno = Piano\nPno.RH | {G4} |\nPno.LH | {G2} |\npno.rh | {A4} |\nPNO.lh | {A2} |\n";
		expect(barLines(text).map((l) => [l.part, l.lineName, l.system])).toEqual([
			["Pno", "RH", 0],
			["Pno", "LH", 0],
			["Pno", "RH", 1],
			["Pno", "LH", 1],
		]);
	});
	test("exact label wins", () => {
		const text = "part: Gtr.1 = Guitar\npart: Bs = Bass\nGtr.1 | G |\nBs | {G1} |\n";
		const [gtr] = barLines(text);
		expect(gtr?.part).toBe("Gtr.1");
		expect(gtr?.lineName).toBeUndefined();
	});
	test("bad line name", () => {
		expect(errors("part: Pno = Piano\nPno.R-H | {G4} |\n").map((d) => d.message)).toEqual([
			"a line name is letters and digits",
		]);
	});
	test("chord on a second line errs", () => {
		const text = "part: Pno = Piano\nPno.RH | {G4} |\nPno.LH | G |\n";
		const e = errors(text);
		expect(e).toHaveLength(1);
		expect(e[0]?.line).toBe(3);
		expect(e[0]?.message).toContain("note set");
		expect(barLines(text)[1]).toMatchObject({ dropped: true });
		for (const slot of ["N.C.", "?", "Cmaj7{E3 G3}", "{G2}_D"])
			expect(errors(`part: Pno = Piano\nPno.RH | {G4} |\nPno.LH | ${slot} |\n`)).toHaveLength(1);
	});
	test("the first line written carries the harmony", () => {
		expect(errors("part: Pno = Piano\nPno.LH | G |\nPno.RH | {G4} |\n")).toEqual([]);
	});
	test("pedal on a second line errs", () => {
		const e = errors("part: Pno = Piano\nPno.RH | +{G4} |\nPno.LH | +{G2} |\n");
		expect(e.map((d) => d.message)).toEqual(["a pedal mark goes on the part's first line"]);
	});
	test("fifth line errs", () => {
		const text = `part: Pno = Piano\n${["A", "B", "C", "D", "E"].map((n) => `Pno.${n} | {G4} |`).join("\n")}\n`;
		const e = errors(text);
		expect(e.map((d) => d.line)).toEqual([6]);
		expect(e[0]?.message).toContain("four lines");
	});
	test("a bare line after its part's lines starts a new system, and they play one after the other", () => {
		const text =
			"part: Pno = Piano\npart: Bs = Bass\nPno.RH | {G4} |\nPno.LH | {G2} |\nPno | G |\nBs | {G1} |\n";
		expect(barLines(text).map((l) => l.system)).toEqual([0, 0, 1, 1]);
		expect(errors(text)).toEqual([]);
		expect(parseChart(text).parts[0]?.lines).toEqual(["RH", "LH"]);
		expect(parseChart(text).bars).toHaveLength(2);
	});
	test("structure across lines", () => {
		const text = "part: Pno = Piano\nPno.RH |: {G4} :|\nPno.LH | {G2} |\n";
		expect(errors(text)).toHaveLength(1);
	});
	test("canonical order", () => {
		const text = `part: Pno = Piano
part: Bs = Bass

Pno.RH | {G4} |
Pno.LH | {G2} |
Bs | {G1} |

Pno.LH | {A2} |
Bs | {A1} |
Pno.RH | {A4} |
`;
		const printed = printChart(text);
		expect(printed).toContain("Pno.RH | {A4} |\nPno.LH | {A2} |\nBs     | {A1} |");
		expect(printChart(printed)).toBe(printed);
	});
	test("score order comes from the first system writing two or more lines", () => {
		const text = `part: Pno = Piano, instrument: piano
## Intro
Pno.LH | {C3} | {G2} |
## Verse
Pno.RH | C{C4 E4 G4} | G{G4 B4 D5} |
Pno.LH | {C3} | {G2} |
`;
		const p = parseChart(text);
		expect(p.diagnostics).toEqual([]);
		expect(p.parts[0]?.lines).toEqual(["RH", "LH"]);
		const printed = printChart(text);
		expect(printed).toContain("Pno.RH | C{C4 E4 G4} | G{G4 B4 D5} |\nPno.LH | {C3}");
		const again = parseChart(printed);
		expect(again.diagnostics).toEqual([]);
		expect(again.bars.map((b) => b.lines?.map((l) => l.name))).toEqual(
			p.bars.map((b) => b.lines?.map((l) => l.name)),
		);
	});
	test("the harmony line is the first in score order, whatever order the system writes", () => {
		const text =
			"part: Pno = Piano\nPno.RH | G{G4} |\nPno.LH | {G2} |\n## B\nPno.LH | {C3} |\nPno.RH | C{C4} |\n";
		expect(errors(text)).toEqual([]);
		expect(
			errors(
				"part: Pno = Piano\nPno.RH | G{G4} |\nPno.LH | {G2} |\n## B\nPno.LH | C |\nPno.RH | {C4} |\n",
			),
		).toHaveLength(1);
	});
	test("streamKey", () => {
		expect(streamKey("Pno")).toBe("pno");
		expect(streamKey("Pno", "RH")).toBe("pno.rh");
	});
});
