import { describe, expect, test } from "bun:test";
import { readDocument } from "../../src/chart/document.js";
import { extractPart, parseChart } from "../../src/chart/parse.js";
import { printChart, printPart } from "../../src/chart/print.js";
import type { Line } from "../../src/chart/types.js";

const VOX = "part: Vox = Voice, instrument: voice\n";
const LEAD = `${VOX}Vox | G | C |\nVox.Mel | {G4} / | {E4} |\n`;
type Bars = Extract<Line, { kind: "bars" | "invalid" }>;
const systems = (text: string) =>
	readDocument(text)
		.lines.filter((l): l is Bars => l.kind === "bars" || l.kind === "invalid")
		.map((l) => l.system);
const errors = (text: string) => parseChart(text).diagnostics.filter((d) => d.severity === "error");
const names = (text: string) =>
	parseChart(text).bars.map((b) => (b.lines ?? []).map((l) => `${l.name}:${l.line}`));

describe("a bare line beside its part's named lines (grammar 7.6, amended 2026-11-06)", () => {
	test("they share a system, and the bare line plays as the part's first line", () => {
		expect(systems(LEAD)).toEqual([0, 0]);
		const p = parseChart(LEAD);
		expect(p.diagnostics).toEqual([]);
		expect(p.parts[0]?.lines).toEqual(["", "Mel"]);
		expect(p.bars).toHaveLength(2);
		expect(names(LEAD)).toEqual([
			[":2", "Mel:3"],
			[":2", "Mel:3"],
		]);
		expect(p.bars[0]?.slots).toMatchObject([{ kind: "chord", chord: { canonical: "G" } }]);
	});
	test("only a bare line written first joins: Vox.Mel then Vox is two systems", () => {
		const text = `${VOX}Vox.Mel | {G4} |\nVox | G |\n`;
		expect(systems(text)).toEqual([0, 1]);
		expect(parseChart(text).parts[0]?.lines).toEqual(["Mel"]);
		expect(parseChart(text).bars).toHaveLength(2);
		// The printer keeps them as written: sorting them would join them.
		expect(printChart(text)).toBe(`${VOX}Vox.Mel | {G4} |\nVox     | G |\n`);
	});
	test("lines written with another part between still sort with the bare line first", () => {
		const text = `${VOX}part: Gtr = Guitar\nVox | G |\nGtr | G |\nVox.Mel | {G4} |\n`;
		expect(systems(text)).toEqual([0, 0, 0]);
		const once = printChart(text);
		expect(once.split("\n").slice(2, 5)).toEqual([
			"Vox     | G    |",
			"Vox.Mel | {G4} |",
			"Gtr     | G    |",
		]);
		expect(systems(once)).toEqual([0, 0, 0]);
	});
	test("a repeated bare line or a repeated named line starts a new system", () => {
		expect(systems(`${VOX}Vox | G |\nVox.Mel | {G4} |\nVox | C |\n`)).toEqual([0, 0, 1]);
		expect(systems(`${VOX}Vox | G |\nVox.Mel | {G4} |\nVox.Mel | {C4} |\n`)).toEqual([0, 0, 1]);
	});
	test("beside a bare line, a named line holds notes only", () => {
		expect(errors(`${VOX}Vox | G |\nVox.Mel | C |\n`)).toMatchObject([
			{ line: 3, message: expect.stringContaining("chord symbols go on the part's first line") },
		]);
	});
	test("a bare line counts toward the four lines", () => {
		const text = `part: Pno = Piano\nPno | G |\n${["A", "B", "C", "D"].map((n) => `Pno.${n} | {G4} |`).join("\n")}\n`;
		expect(errors(text).map((d) => d.message)).toContain("a part has at most four lines");
	});
	test("a part that never writes them together reads as before", () => {
		const text = "part: Pno = Piano\nPno.RH | {G4} |\nPno.LH | {G2} |\n---\nPno | G |\n";
		const p = parseChart(text);
		expect(p.parts[0]?.lines).toEqual(["RH", "LH"]);
		expect(names(text)).toEqual([["RH:2", "LH:3"], ["RH:5"]]);
	});
	test("a named line alone in a system rests the bare line", () => {
		const text = `${LEAD}---\nVox.Mel | {D4} |\n`;
		expect(names(text).at(-1)).toEqual(["Mel:5"]);
	});
	test("an extract keeps both lines; a single line extracts alone", () => {
		const part = extractPart(LEAD, "Vox");
		expect(part?.diagnostics).toEqual([]);
		expect(part?.bars.map((b) => b.lines?.map((l) => l.name))).toEqual([
			["", "Mel"],
			["", "Mel"],
		]);
		expect(extractPart(LEAD, "Vox", "Mel")?.bars[0]?.slots).toMatchObject([
			{ chord: { canonical: "{G4}" } },
			{ kind: "hold" },
		]);
		expect(extractPart(LEAD, "Vox", "")?.bars[0]?.slots).toMatchObject([
			{ chord: { canonical: "G" } },
		]);
		expect(printPart(LEAD, "Vox")).toBe(printChart(LEAD));
	});
	test("a bare line after another part's line and its own named line starts a new system", () => {
		const text = `${VOX}part: Gtr = Guitar\nVox.Mel | {G4} |\nGtr | G |\nVox | G |\n`;
		expect(systems(text)).toEqual([0, 0, 1]);
	});
});
