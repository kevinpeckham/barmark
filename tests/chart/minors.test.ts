import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/index.js";

const diags = (text: string) => parseChart(text).diagnostics;
const errors = (text: string) => diags(text).filter((d) => d.severity === "error");

describe("final-review minors", () => {
	test("## with no name is an error, not text", () => {
		expect(errors("##   \n| D |").map((d) => d.line)).toEqual([1]);
		expect(errors("##").map((d) => d.line)).toEqual([1]);
	});
	test("distinct problems on one line are each reported", () => {
		expect(diags("| C D E | F G A |").filter((d) => d.message.includes("uneven"))).toHaveLength(2);
		expect(errors("| % | % |")).toHaveLength(2);
	});
	test("an open repeat inside another is reported once however often it plays", () => {
		expect(errors("## Out x ...\n| D | x ...\n## Out\n## Out")).toHaveLength(1);
	});
	test("a one-bar meter on % or ... gets a direct message", () => {
		for (const t of ["| D | [2/4] % |", "| D | [2/4] ... |"]) {
			const e = errors(t);
			expect(e).toHaveLength(1);
			expect(e[0]?.message).toContain("one-bar meter");
		}
	});
	test("_ inside braces is one note-set error", () => {
		const e = errors("| {C_E} |");
		expect(e).toHaveLength(1);
		expect(e[0]?.token).toBe("{C_E}");
	});
	test("a group may hold a note set", () => {
		expect(parseChart("| {C E}_G |").bars[0]?.slots[0]?.kind).toBe("group");
	});
	test("a repeat count past the safe integers is an error", () => {
		const r = parseChart(`| D | x ${"9".repeat(400)}`);
		expect(r.diagnostics.map((d) => d.severity)).toContain("error");
		expect(r.lines.every((l) => l.kind !== "bars" || l.repeat !== Number.POSITIVE_INFINITY)).toBe(
			true,
		);
	});

	test("a repeat written inside the last cell suggests moving it", () => {
		const e = errors("| D | A | x2 |");
		expect(e).toHaveLength(1);
		expect(e[0]?.suggestion).toBe("x2");
	});
	test("Ax2 with no trailing pipe is not A twice", () => {
		const r = parseChart("| D | Ax2");
		expect(r.bars).toHaveLength(0);
		expect(r.diagnostics.some((d) => d.severity === "error" && d.token === "Ax2")).toBe(true);
	});
	test("a trailing comma on a directive line is harmless", () => {
		expect(diags("key: D, tempo: 90,")).toEqual([]);
	});
	test("a section with no bars has no bar numbers", () => {
		const s = parseChart("## A\n| ... |").sections[0];
		expect([s?.firstBar, s?.lastBar]).toEqual([null, null]);
	});
	test("elided records only a real cut", () => {
		const r = parseChart("## A\n| ... |\n## A ->");
		expect(r.sections.map((s) => s.elided)).toEqual([false, false]);
	});
	test("a pathological line yields a bounded number of diagnostics", () => {
		expect(diags(`| ${"_".repeat(20_000)} |`).length).toBeLessThanOrEqual(21);
		expect(diags(`| ${"Q ".repeat(50_000)}|`).length).toBeLessThanOrEqual(21);
	});
});
