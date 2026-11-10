import { describe, expect, test } from "bun:test";
import { parseBarLine } from "../../src/chart/barLine.js";
import type { Cell, Slot } from "../../src/chart/types.js";
import { parseChart, printChart } from "../../src/index.js";

// Kevin's decision (2026-11-10, stem-shovel issue 16): stacked spellings read
// as their comma-separated form, with a warning whose suggestion is that
// spelling; an altered fifth before the parenthesis stays an error.

const read = (text: string) => parseBarLine(text, 3);
const slots = (cell: Cell | undefined): Slot[] => (cell?.kind === "slots" ? cell.slots : []);

describe("a stacked spelling in a chart", () => {
	const accepted: [string, string, string][] = [
		["D6(omit5add9)", "D6(omit5,add9)", "D6(9,no5)"],
		["D6(no5add9)", "D6(no5,add9)", "D6(9,no5)"],
		["Gadd9omit3", "Gadd9(omit3)", "G5(9)"],
		["Gomit5", "G(omit5)", "G(no5)"],
		["Gno5", "G(no5)", "G(no5)"],
	];
	for (const [symbol, suggestion, canonical] of accepted) {
		test(`${symbol} is a chord, not an unread slot, with a warning suggesting ${suggestion}`, () => {
			const r = read(`| ${symbol} | G |`);
			const slot = slots(r.bars?.cells[0])[0];
			expect(slot?.kind).toBe("chord");
			if (slot?.kind === "chord") expect(slot.chord.canonical).toBe(canonical);
			expect(r.diagnostics).toEqual([
				{
					line: 3,
					severity: "warning",
					message: expect.stringContaining(`${symbol}: `),
					token: symbol,
					suggestion,
				},
			]);
		});
		test(`the printer writes ${symbol} as ${canonical}, and that is stable`, () => {
			const printed = printChart(`| ${symbol} | G |\n`);
			expect(printed).toBe(`| ${canonical} | G |\n`);
			expect(printChart(printed)).toBe(printed);
			expect(parseChart(printed).diagnostics).toEqual([]);
		});
	}
	test("the played chart sounds the chord the comma form names", () => {
		const stacked = parseChart("| D6(omit5add9) | Gadd9omit3 |\n");
		const comma = parseChart("| D6(omit5,add9) | Gadd9(omit3) |\n");
		const harmony = (p: typeof stacked) =>
			p.bars.flatMap((b) => b.slots.map((s) => (s.kind === "chord" ? s.chord.harte : s.kind)));
		expect(harmony(stacked)).toEqual(harmony(comma));
		expect(harmony(stacked)).toEqual(["D:maj6(9,*5)", "G:sus2"]);
	});
	test("a voiced stacked chord carries the suggestion too", () => {
		const w = read("| Gomit5{G3 B3} |").diagnostics.filter((d) => d.severity === "warning");
		expect(w).toContainEqual(expect.objectContaining({ token: "Gomit5", suggestion: "G(omit5)" }));
	});
});

describe("an altered fifth before the parenthesis in a chart", () => {
	test("F#b5(omit3) keeps its bar as unknown harmony, an error suggesting F#(b5,omit3)", () => {
		const r = read("| F#b5(omit3) | G |");
		expect(slots(r.bars?.cells[0])).toEqual([{ kind: "unknown", text: "F#b5(omit3)" }]);
		expect(r.diagnostics).toEqual([
			{
				line: 3,
				severity: "error",
				message: expect.stringContaining("F#b5(omit3): "),
				token: "F#b5(omit3)",
				suggestion: "F#(b5,omit3)",
			},
		]);
	});
	test("Gb5(omit3) is ambiguous: an error with no suggestion", () => {
		const [d] = read("| Gb5(omit3) | G |").diagnostics;
		expect(d?.severity).toBe("error");
		expect(d?.message).toContain("ambiguous");
		expect(d?.suggestion).toBeUndefined();
	});
});
