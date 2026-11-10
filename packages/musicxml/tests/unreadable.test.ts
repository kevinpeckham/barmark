import { describe, expect, test } from "bun:test";
import { parseChart } from "barmark";
import { applyHolds, applyPushes, eventsOf } from "../src/events.js";
import { writtenMeasures } from "../src/measures.js";
import { exportMusicXml } from "../src/score.js";

// An unreadable slot is unknown harmony with its text (barmark's grammar
// 2.3): what MusicXML would write for it is what it writes for `?`.

const stream = (chart: string) =>
	applyHolds(applyPushes(writtenMeasures(parseChart(chart)).map(eventsOf)));
/** The events as the writers read them: an unknown slot's `text` is never written. */
const written = (chart: string) =>
	JSON.parse(JSON.stringify(stream(chart), (k, v) => (k === "text" ? undefined : v)));

describe("an unreadable slot exports as ?", () => {
	const unread = "time: 4/4\n| C | CM7 G |\n| %  | <<<C / |\n";
	const gap = "time: 4/4\n| C | ? G |\n| %  | ? / |\n";
	test("the same measures and events", () => {
		expect(written(unread)).toEqual(written(gap));
		expect(stream(unread)).toHaveLength(4);
	});
	test("export still refuses the chart, naming the slot's error", () => {
		const r = exportMusicXml("| CM7 |");
		expect(r.ok).toBe(false);
		expect(r.diagnostics.filter((d) => d.severity === "error").map((d) => d.token)).toEqual([
			"CM7",
		]);
	});
});
