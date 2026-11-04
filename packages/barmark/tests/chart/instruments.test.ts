import { describe, expect, test } from "bun:test";
import { INSTRUMENTS, instrumentInfo } from "../../src/chart/instruments.js";
import { parseChart } from "../../src/chart/parse.js";
import { printChart } from "../../src/chart/print.js";

const errors = (text: string) =>
	parseChart(text)
		.diagnostics.filter((d) => d.severity === "error")
		.map((d) => d.message);

describe("instrument: and clef: on the part line (grammar 7.3)", () => {
	test("reads instrument: after the name", () => {
		const p = parseChart("part: Tpt = Trumpet, instrument: trumpet in Bb\n| C |");
		expect(p.parts[0]).toMatchObject({
			label: "Tpt",
			name: "Trumpet",
			instrument: "trumpet in Bb",
		});
		expect(p.diagnostics).toEqual([]);
		expect(parseChart("part: Pno = Piano, instrument: PIANO\n| C |").parts[0]?.instrument).toBe(
			"piano",
		);
	});
	test("reads clef:", () => {
		expect(parseChart("part: Ld = Lead, clef: bass\n| C |").parts[0]?.clef).toBe("bass");
		expect(
			parseChart("part: Bs = Bass, instrument: electric bass, clef: treble\n| C |").parts[0],
		).toMatchObject({ instrument: "electric bass", clef: "treble" });
	});
	test("unknown instrument errs with near names", () => {
		const p = parseChart("part: Bs = Bass, instrument: bass\n| C |");
		const e = p.diagnostics.find((d) => d.severity === "error");
		expect(e?.message).toContain("electric bass");
		expect(e?.message).toContain("double bass");
		expect(p.lines[0]?.kind).toBe("text");
	});
	test("an unknown clef errs", () => {
		expect(errors("part: Ld = Lead, clef: tenor\n| C |")).toHaveLength(1);
	});
	test("an attribute twice errs", () => {
		expect(errors("part: Ld = Lead, clef: bass, clef: treble\n| C |")).toEqual([
			"part: names its clef once",
		]);
	});
	test("an empty instrument errs", () => {
		expect(errors("part: Ld = Lead, instrument:\n| C |")).toHaveLength(1);
	});
	test("clef on a keyboard errs", () => {
		expect(errors("part: Pno = Piano, instrument: piano, clef: bass\n| C |")).toHaveLength(1);
	});
	test("other attributes still err", () => {
		expect(errors("part: Guitar, key: G\n| G |")).toEqual([
			"part: goes on a line of its own; the name runs to the end of the line",
		]);
	});
	test("the table", () => {
		expect(INSTRUMENTS.length).toBe(16);
		expect(instrumentInfo("electric guitar")).toMatchObject({
			clef: "treble 8vb",
			written: { diatonic: 0, chromatic: 0 },
		});
		expect(instrumentInfo("Tenor Sax")?.written).toEqual({ diatonic: 8, chromatic: 14 });
		expect(instrumentInfo("bass")).toBeNull();
	});
	test("prints canonically", () => {
		const printed = printChart("part: Ld = Lead, clef: alto, instrument: FLUTE\n| C |");
		expect(printed).toContain("part: Ld = Lead, instrument: flute, clef: alto");
		expect(printChart(printed)).toBe(printed);
	});
});
