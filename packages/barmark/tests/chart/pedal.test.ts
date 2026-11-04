import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/chart/parse.js";
import { pedalStates } from "../../src/chart/pedal.js";
import { printChart } from "../../src/chart/print.js";

const slots = (text: string) => parseChart(text).bars.flatMap((b) => b.slots);
const of = (text: string, severity: "error" | "warning") =>
	parseChart(text).diagnostics.filter((d) => d.severity === severity);

describe("sustain pedal marks (grammar 2.9)", () => {
	test("reads + and *", () => {
		const s = slots("| +G / +C / | *D |");
		expect(s.map((x) => (x.kind === "chord" ? x.pedal : null))).toEqual([
			"press",
			null,
			"press",
			null,
			"release",
		]);
		expect(slots("| +>G |")[0]).toMatchObject({ pedal: "press", articulation: "accent" });
		expect(slots("| +<G |")[0]).toMatchObject({ pedal: "press", push: "eighth" });
		expect(slots("| +{C3 G3} |")[0]).toMatchObject({ pedal: "press" });
		expect(of("| +G / +C / | *D |", "error")).toEqual([]);
	});
	test("wrong order", () => {
		const e = of("| >+G |", "error");
		expect(e).toHaveLength(1);
		expect(e[0]?.suggestion).toBe("+>G");
		expect(of("| <*G |", "error")[0]?.suggestion).toBe("*<G");
	});
	test("pedal on a non-chord errs", () => {
		for (const bad of ["+/", "+N.C.", "*--", "+?"])
			expect(of(`| G ${bad} |`, "error")).toHaveLength(1);
	});
	test("release with the pedal up warns", () => {
		expect(of("| *G |", "warning").map((d) => d.token)).toEqual(["*"]);
		expect(of("| +G -- *C / |", "warning")).toHaveLength(1);
		expect(of("| +G | *C |", "warning")).toEqual([]);
	});
	test("pedal state in play order", () => {
		const p = parseChart("|: +G | C :|\n| D -- | +E |");
		expect(pedalStates(p.bars)).toEqual([[true], [true], [true], [true], [true, false], [true]]);
		const jump = parseChart("| +G | *C | D.C. |");
		expect(pedalStates(jump.bars)).toEqual([[true], [false], [true], [false]]);
		expect(of("| +G | *C | D.C. |", "warning")).toEqual([]);
	});
	test("a group's members: the pedal is down from the group's first press", () => {
		expect(pedalStates(parseChart("| G_+C D |").bars)).toEqual([[true, true]]);
	});
	test("print round-trips", () => {
		const text = "| +G *C +>G +<{C3 G3} |\n";
		expect(printChart(text)).toContain("| +G *C +>G +<{C3 G3} |");
	});
});
