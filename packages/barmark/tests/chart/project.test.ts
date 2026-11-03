import { describe, expect, test } from "bun:test";
import { readDocument } from "../../src/chart/document.js";
import { expand, flattenBars } from "../../src/chart/expand.js";
import { projectPart } from "../../src/chart/parts.js";
import { printSlot } from "../../src/chart/print.js";
import type { Line } from "../../src/chart/types.js";
import { MORNING_SONG } from "./morning-song.js";

const project = (text: string, label: string) => {
	const doc = readDocument(text);
	return projectPart(doc.lines, doc.parts, label);
};
const played = (text: string, label: string) => {
	const r = expand(project(text, label), label);
	return {
		bars: flattenBars(r.events),
		errors: r.diagnostics.filter((d) => d.severity === "error"),
	};
};
const bars = (ls: Line[]) => ls.filter((l) => l.kind === "bars");
const TWO = "part: Gtr = Guitar\npart: Pno = Piano\n";

describe("projecting one part (grammar 7.4)", () => {
	test("a part sees the tutti lines, its own lines, and a stand-in where it is tacet", () => {
		const ls = project(MORNING_SONG, "Pno");
		expect(ls.filter((l) => l.kind === "part")).toEqual([
			{ kind: "part", line: 3, label: "Pno", name: "Piano" },
		]);
		const b = bars(ls);
		expect(b.map((l) => l.line)).toEqual([7, 11, 12, 15]);
		const stand = b[2];
		expect(stand?.kind === "bars" && stand.cells).toEqual(
			Array.from({ length: 4 }, () => ({
				kind: "slots",
				meter: null,
				slots: [{ kind: "nc" }],
				tacet: true,
			})),
		);
		expect(b.every((l) => !("part" in l) && !("system" in l))).toBe(true);
	});
	test("a stand-in keeps the system's structure", () => {
		const ls = project(`${TWO}Gtr |: [2/4] G | @B | C :| x2`, "Pno");
		const [l] = bars(ls);
		expect(l?.kind === "bars" && [l.opens, l.closes, l.repeat]).toEqual([true, true, 2]);
		expect(l?.kind === "bars" && l.cells.map((c) => c.kind)).toEqual([
			"slots",
			"rehearsal",
			"slots",
		]);
		const first = l?.kind === "bars" ? l.cells[0] : undefined;
		expect(first?.kind === "slots" && first.meter).toEqual({ n: 2, d: 4 });
	});
	test("headings, directives and text pass through; other parts' lines don't", () => {
		const kinds = project(MORNING_SONG, "Gtr").map((l) => l.kind);
		expect(kinds).toEqual([
			"title",
			"part",
			"directive",
			"section",
			"bars",
			"section",
			"bars",
			"bars",
			"section",
			"bars",
		]);
	});
	test("% after the part was tacet is an error", () => {
		const r = played(`${TWO}Gtr | G |\n| % |`, "Pno");
		expect(r.errors.map((e) => e.message)).toEqual([
			"Pno was tacet in the bar before; % has nothing to copy",
		]);
	});
	test("a leading / after the part was tacet is an error", () => {
		const r = played(`${TWO}Gtr | G |\nGtr | C |\nPno | / G |`, "Pno");
		expect(r.errors.map((e) => e.message)).toEqual([
			"Pno was tacet in the bar before; / has nothing to hold",
		]);
	});
	test("a push after the part was tacet is fine", () => {
		expect(played(`${TWO}Gtr | G |\nGtr | C |\nPno | <G |`, "Pno").errors).toEqual([]);
	});
	test("a tutti % repeats each part's own bar", () => {
		const text = `${TWO}Gtr | D |\nPno | Em |\n| % |`;
		const sym = (label: string) =>
			played(text, label).bars.map((b) => b.slots.map(printSlot).join(" "));
		expect(sym("Gtr")).toEqual(["D", "D"]);
		expect(sym("Pno")).toEqual(["Em", "Em"]);
	});
	test("tacet bars are marked tacet", () => {
		expect(played(`${TWO}Gtr | G |`, "Pno").bars.map((b) => b.tacet)).toEqual([true]);
	});
});
