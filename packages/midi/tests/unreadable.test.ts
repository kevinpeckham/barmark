import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { exportMidi } from "../src/index.js";
import { perform } from "../src/perform/perform.js";

// An unreadable slot is unknown harmony with its text (barmark's grammar
// 2.3): it performs exactly as `?` does, and the bar still plays.

describe("an unreadable slot performs as ?", () => {
	const unread = "time: 4/4, tempo: 100\n| C | CM7 G |\n| % | {H} / |\n";
	const gap = "time: 4/4, tempo: 100\n| C | ? G |\n| % | ? / |\n";
	test("the same performance, as long as the chart is written", () => {
		const a = perform(parseChart(unread));
		expect(a).toEqual(perform(parseChart(gap)));
		expect(a.end).toEqual(perform(parseChart("time: 4/4\n| C | C | C | C |\n")).end);
	});
	test("export still refuses the chart, naming the slot's error", () => {
		const r = exportMidi("| CM7 |");
		expect(r.ok).toBe(false);
		expect(r.diagnostics.filter((d) => d.severity === "error").map((d) => d.token)).toEqual([
			"CM7",
		]);
	});
});
