import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/chart/parse.js";
import { printChart } from "../../src/chart/print.js";
import { memberShares } from "../../src/chart/shares.js";
import { transposeChart } from "../../src/chart/transpose.js";
import type { SimpleSlot, Slot } from "../../src/chart/types.js";

const firstSlot = (text: string): Slot | undefined => parseChart(text).bars[0]?.slots[0];
const members = (text: string): SimpleSlot[] => {
	const s = firstSlot(text);
	return s?.kind === "group" ? s.members : [];
};
const errors = (text: string) => parseChart(text).diagnostics.filter((d) => d.severity === "error");

describe("dotted figures (grammar 2.2)", () => {
	test("a dotted first member", () => {
		const m = members("| {C4}._{D4} {E4} {F4} {G4} |");
		expect(m.map((s) => s.dotted)).toEqual([true, undefined]);
		expect(memberShares(m)).toEqual([0.75, 0.25]);
	});
	test("a scotch snap", () => {
		expect(memberShares(members("| C_D. / / / |"))).toEqual([0.25, 0.75]);
	});
	test("undotted groups share equally", () => {
		expect(memberShares(members("| C_D_E / |"))).toEqual([1 / 3, 1 / 3, 1 / 3]);
	});
	test("dots with marks and N.C. spellings", () => {
		const accented = members("| >C._D |")[0];
		expect(accented).toMatchObject({ kind: "chord", articulation: "accent", dotted: true });
		for (const nc of ["NC._G", "N.C._G"]) {
			const [a, b] = members(`| ${nc} |`);
			expect(a).toEqual({ kind: "nc" });
			expect(b?.kind).toBe("chord");
			expect(errors(`| ${nc} |`)).toEqual([]);
		}
		expect(members("| N.C.._G |")[0]).toEqual({ kind: "nc", dotted: true });
		expect(members("| /._C |")[0]).toEqual({ kind: "hold", dotted: true });
	});
	test("dot errors", () => {
		for (const bad of ["| C._D._E |", "| C. |", "| C._D. |"]) {
			const e = errors(bad);
			expect(e).toHaveLength(1);
			expect(e[0]?.message).toContain("/");
		}
	});
	test("print and transpose keep the dot", () => {
		expect(printChart("| C._D / / |")).toContain("| C._D / / |");
		expect(printChart("| {C4}_{D4}. |")).toContain("{C4}_{D4}.");
		expect(transposeChart("| C._D |", { semitones: 2 }).text).toContain("D._E");
	});
	test("lengths: a push borrows from the dotted figure's short note", () => {
		// D lasts a sixteenth after a dotted eighth: too short to lend an eighth.
		expect(errors("| C._D <E / / |")[0]?.message).toContain("longer than the slot before it");
		expect(errors("| C_D. <E / / |")).toEqual([]);
	});
});
