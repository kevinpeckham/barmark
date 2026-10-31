import { describe, expect, test } from "bun:test";
import { parseBarLine } from "../../src/chart/barLine.js";
import type { Cell, Slot } from "../../src/chart/types.js";

const read = (text: string) => parseBarLine(text, 7);
const bars = (text: string) => {
	const r = read(text);
	if (!r.bars) throw new Error(`${text}: ${r.diagnostics.map((d) => d.message).join("; ")}`);
	return r.bars;
};
const errors = (text: string) => read(text).diagnostics.filter((d) => d.severity === "error");
const warnings = (text: string) => read(text).diagnostics.filter((d) => d.severity === "warning");
const slots = (cell: Cell | undefined): Slot[] => (cell?.kind === "slots" ? cell.slots : []);
const kinds = (cell: Cell | undefined) => slots(cell).map((s) => s.kind);

describe("cells and slots", () => {
	test("four one-chord bars", () => {
		const b = bars("| D | A | Bm | G |");
		expect(b.cells).toHaveLength(4);
		expect(b.cells.map(kinds)).toEqual([["chord"], ["chord"], ["chord"], ["chord"]]);
		expect([b.opens, b.closes, b.repeat, b.line]).toEqual([false, false, null, 7]);
	});
	test("holds", () =>
		expect(kinds(bars("| Am7 / / G7 |").cells[0])).toEqual(["chord", "hold", "hold", "chord"]));
	test("a group of three", () => {
		const s = slots(bars("| C / / D_E_F |").cells[0])[3];
		expect(s?.kind).toBe("group");
		if (s?.kind === "group")
			expect(s.members.map((m) => m.kind)).toEqual(["chord", "chord", "chord"]);
	});
	test("one-bar meter", () => {
		const c = bars("| [2/4] G |").cells[0];
		expect(c?.kind === "slots" && c.meter).toEqual({ n: 2, d: 4 });
		expect(errors("| G [2/4] |")).toHaveLength(1);
		expect(errors("| [4/3] G |")).toHaveLength(1);
	});
	test("simile", () => expect(bars("| C G | % |").cells[1]).toEqual({ kind: "simile" }));
	test("fermata, both spellings", () => {
		expect(bars("| D | ... |").cells[1]).toEqual({ kind: "fermata" });
		expect(bars("| D | … |").cells[1]).toEqual({ kind: "fermata" });
		expect(errors("| D ... |")).toHaveLength(1);
		expect(errors("| D % |")).toHaveLength(1);
	});
	test("silence and its dash substitutes", () => {
		expect(kinds(bars("| G -- -- -- |").cells[0])).toEqual([
			"chord",
			"silence",
			"silence",
			"silence",
		]);
		expect(kinds(bars("| G – — / |").cells[0])).toEqual(["chord", "silence", "silence", "hold"]);
		const g = slots(bars("| G_– |").cells[0])[0];
		expect(g?.kind === "group" && g.members.map((m) => m.kind)).toEqual(["chord", "silence"]);
	});
	test("a lone hyphen suggests --", () => {
		const e = errors("| G - |");
		expect(e).toHaveLength(1);
		expect(e[0]?.suggestion).toBe("--");
	});
	test("no-chord spellings", () => {
		expect(bars("| N.C. | NC | n.c. | N.C |").cells.map(kinds)).toEqual([
			["nc"],
			["nc"],
			["nc"],
			["nc"],
		]);
	});
	test("? is valid and warns", () => {
		expect(read("| ? |").bars).not.toBeNull();
		expect(warnings("| ? |")).toHaveLength(1);
	});
	test("a note set is a chord slot", () => {
		const s = slots(bars("| {D E! G} |").cells[0])[0];
		expect(s?.kind === "chord" && s.chord.kind).toBe("notes");
	});
});

describe("repeats and marks", () => {
	test("brackets with a count", () => {
		const b = bars("|: D | A :| x3");
		expect([b.opens, b.closes, b.repeat]).toEqual([true, true, 3]);
		expect(b.cells).toHaveLength(2);
	});
	test("open repeat, both spellings", () => {
		expect(bars("| E7 | / | x ...").repeat).toBe("open");
		expect(bars("| E7 | / | x …").repeat).toBe("open");
		expect(bars("| E7 | / | x2").repeat).toBe(2);
	});
	test("x1 is an error, x9 warns", () => {
		expect(errors("| D | x1")).toHaveLength(1);
		expect(read("| D | x9").bars?.repeat).toBe(9);
		expect(warnings("| D | x9")).toHaveLength(1);
	});
	test("a close mark mid-line is an error", () => expect(errors("| D :| A |")).toHaveLength(1));
	test("endings are reserved", () => {
		const e = errors("|1 D | A |");
		expect(e).toHaveLength(1);
		expect(e[0]?.message).toContain("endings are not supported in v0.1");
	});
});

describe("errors drop the line", () => {
	test("an empty cell", () => {
		expect(read("| D | | A |").bars).toBeNull();
		expect(errors("| D | | A |")).toHaveLength(1);
	});
	test("a missing trailing pipe warns and still reads", () => {
		const r = read("| D | A");
		expect(r.bars?.cells).toHaveLength(2);
		expect(warnings("| D | A")[0]?.message).toContain("missing trailing |");
	});
	test("an unknown chord names its token", () => {
		const e = errors("| D | Hm |");
		expect(e).toHaveLength(1);
		expect(e[0]?.token).toBe("Hm");
		expect(e[0]?.line).toBe(7);
	});
	test("a chord suggestion is kept", () => expect(errors("| CM7 |")[0]?.suggestion).toBe("Cmaj7"));
	test("a markdown table names its first non-chord", () => {
		const r = read("| Name | Part |");
		expect(r.bars).toBeNull();
		expect(r.diagnostics[0]?.token).toBe("Name");
	});
	test("an empty group member", () => expect(errors("| D_ |")).toHaveLength(1));
});
