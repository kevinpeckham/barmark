import { describe, expect, test } from "bun:test";
import { extractPart, parseChart } from "../../src/chart/parse.js";
import { printChart, printPart, printSlot } from "../../src/chart/print.js";
import type { LineBar, PlayedBar } from "../../src/chart/types.js";

const MORNING = `# Morning Song
part: Pno = Piano, instrument: piano
part: Bs = Bass, instrument: electric bass

## Verse
Pno.RH | G{B3 D4 G4} | C{C4 E4 G4} | D{D4 F#4 A4} | G{B3 D4 G4} |
Pno.LH | {G2}        | {C3}        | {D3} / {F#2} / | {G2}       |
Bs     | {G1}        | {C2}        | {D2}         | {G1}         |
`;

const show = (l: LineBar) => [l.name, l.slots.map(printSlot).join(" ")];
const pianoLines = (b: PlayedBar | undefined) => (b?.parts?.[0]?.lines ?? []).map(show);
const errors = (text: string) => parseChart(text).diagnostics.filter((d) => d.severity === "error");

describe("playing part lines (grammar 7.6)", () => {
	test("each line plays its own", () => {
		const p = parseChart(MORNING);
		expect(p.diagnostics).toEqual([]);
		expect(p.bars).toHaveLength(4);
		expect(pianoLines(p.bars[2])).toEqual([
			["RH", "D{D4 F#4 A4}"],
			["LH", "{D3} / {F#2} /"],
		]);
		const piano = p.bars[2]?.parts?.[0];
		expect(piano?.slots.map(printSlot)).toEqual(["D{D4 F#4 A4}"]);
		expect(p.bars[2]?.slots.map(printSlot)).toEqual(["D{D4 F#4 A4}"]);
		expect(p.bars[2]?.parts?.[1]?.lines).toBeUndefined();
		expect(p.bars[2]?.parts?.[1]?.slots.map(printSlot)).toEqual(["{D2}"]);
	});
	test("tutti line plays as the first line", () => {
		const p = parseChart(`${MORNING}\n## Outro\n| G | C |\n`);
		expect(p.bars).toHaveLength(6);
		expect(pianoLines(p.bars[4])).toEqual([["RH", "G"]]);
		expect(p.bars[4]?.parts?.[1]?.slots.map(printSlot)).toEqual(["G"]);
	});
	test("a bare part line plays as the first line", () => {
		const p = parseChart(`${MORNING}\nPno | Em |\nBs | {E1} |\n`);
		expect(pianoLines(p.bars[4])).toEqual([["RH", "Em"]]);
	});
	test("a line not written rests; the part plays its first playing line", () => {
		const p = parseChart(`${MORNING}\nPno.LH | {E2} |\nBs | {E1} |\n`);
		expect(pianoLines(p.bars[4])).toEqual([["LH", "{E2}"]]);
		expect(p.bars[4]?.parts?.[0]?.slots.map(printSlot)).toEqual(["{E2}"]);
		expect(p.bars[4]?.slots.map(printSlot)).toEqual(["{E2}"]);
		expect(p.bars[4]?.tacet).toBeUndefined();
	});
	test("a part with no line in a system is tacet", () => {
		const p = parseChart(`${MORNING}\nBs | {E1} |\n`);
		expect(p.bars[4]?.parts?.[0]).toBeNull();
	});
	test("percent after a system without the line errs", () => {
		const text = `${MORNING}\nPno.RH | Em |\nBs | {E1} |\n\nPno.RH | % |\nPno.LH | % |\nBs | % |\n`;
		const e = errors(text);
		expect(e.map((d) => d.line)).toEqual([14]);
		expect(e[0]?.message).toContain("Pno.LH");
	});
	test("slash and percent per line", () => {
		const text = `${MORNING}\nPno.RH | Em | % |\nPno.LH | {E2} | % |\nBs | {E1} | / |\n`;
		const p = parseChart(text);
		expect(errors(text)).toEqual([]);
		expect(pianoLines(p.bars[5])).toEqual([
			["RH", "Em"],
			["LH", "{E2}"],
		]);
	});
	test("extractPart keeps lines", () => {
		const piano = extractPart(MORNING, "Pno");
		expect(piano?.parts[0]?.lines).toEqual(["RH", "LH"]);
		expect(piano?.bars[2]?.lines?.map(show)).toEqual([
			["RH", "D{D4 F#4 A4}"],
			["LH", "{D3} / {F#2} /"],
		]);
		expect(piano?.bars[2]?.parts).toBeUndefined();
		const printed = printPart(MORNING, "Pno") ?? "";
		expect(printed).toContain("Pno.RH | G{B3 D4 G4}");
		expect(printed).toContain("Pno.LH | {G2}");
		expect(printed).not.toContain("Bs");
		// The canonical form writes the LH's held notes without their / holds; the music is the same.
		expect(parseChart(printed).bars[2]?.lines?.map(show)).toEqual([
			["RH", "D{D4 F#4 A4}"],
			["LH", "{D3} {F#2}"],
		]);
		const bass = extractPart(MORNING, "Bs");
		expect(bass?.bars[2]?.slots.map(printSlot)).toEqual(["{D2}"]);
		expect(bass?.diagnostics).toEqual([]);
	});
	test("a single-part chart with lines", () => {
		const p = parseChart("part: Pno = Piano\nPno.RH | G{B3 D4 G4} |\nPno.LH | {G2} |\n");
		expect(p.bars[0]?.lines?.map(show)).toEqual([
			["RH", "G{B3 D4 G4}"],
			["LH", "{G2}"],
		]);
		expect(p.bars[0]?.parts).toBeUndefined();
		expect(printChart(printChart(MORNING))).toBe(printChart(MORNING));
	});
});
