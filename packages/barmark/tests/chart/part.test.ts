import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/chart/parse.js";
import { printChart } from "../../src/chart/print.js";
import { transposeChart } from "../../src/chart/transpose.js";

const messages = (text: string) =>
	parseChart(text).diagnostics.map((d) => `${d.severity}: ${d.message}`);

describe("part: names the chart's part (grammar 7.3)", () => {
	test("a name, alone on its line", () => {
		const p = parseChart("# Song\npart: Electric Guitar 1\nkey: G\n| G | D |");
		expect(p.part).toEqual({ name: "Electric Guitar 1" });
		expect(p.diagnostics).toEqual([]);
		expect(p.lines.map((l) => l.kind)).toEqual(["title", "part", "directive", "bars"]);
	});
	test("a label, then = and the name", () => {
		expect(parseChart("part: Gtr = Electric Guitar 1\n| G |").part).toEqual({
			label: "Gtr",
			name: "Electric Guitar 1",
		});
		expect(parseChart("Part: E.Gtr.1=Electric Guitar 1\n| G |").part).toEqual({
			label: "E.Gtr.1",
			name: "Electric Guitar 1",
		});
	});
	test("the name runs to the end of the line, commas and all", () => {
		expect(parseChart("part: Guitar, rhythm\n| G |").part).toEqual({ name: "Guitar, rhythm" });
	});
	test("a chart without one has none", () => {
		expect(parseChart("| G |").part).toBeNull();
	});
	test("it names the whole chart, so it comes before the first bar", () => {
		const p = parseChart("| G |\npart: Piano\n| D |");
		expect(p.part).toBeNull();
		expect(messages("| G |\npart: Piano\n| D |")).toEqual([
			"error: part: names the whole chart; put it before the first bar",
		]);
	});
	test("a name is required", () => {
		expect(messages("part:\n| G |")).toEqual(["error: part: needs a name"]);
		expect(messages("part: Gtr =\n| G |")).toEqual(["error: part: needs a name after the label"]);
		expect(messages("part: = Piano\n| G |")).toEqual(["error: part: needs a label before ="]);
	});
	test("it goes on a line of its own", () => {
		expect(messages("part: Guitar, key: G\n| G |")).toEqual([
			"error: part: goes on a line of its own; the name runs to the end of the line",
		]);
		expect(messages("key: G, part: Guitar\n| G |")).toEqual([
			"error: part: goes on a line of its own; the name runs to the end of the line",
		]);
	});
	test("near misses are suggested", () => {
		const d = parseChart("instrument: Piano\n| G |").diagnostics[0];
		expect([d?.severity, d?.message, d?.suggestion]).toEqual([
			"warning",
			"not a directive; did you mean part:?",
			"part: Piano",
		]);
	});
	test("prints canonically, and transposing keeps it", () => {
		expect(printChart("part:   Gtr=Electric   Guitar 1\n| G |")).toBe(
			"part: Gtr = Electric Guitar 1\n| G |\n",
		);
		expect(transposeChart("part: Piano\nkey: G\n| G |", { to: "A" }).text).toBe(
			"part: Piano\nkey: A\n| A |\n",
		);
	});
});
