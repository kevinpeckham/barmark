import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { renderChartUnwrapped } from "../src/index.js";

const doc = (html: string) =>
	parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
const spoken = (text: string) =>
	[...doc(renderChartUnwrapped(text)).querySelectorAll(".bm-bar .bm-sr")].map((e) => e.textContent);

describe("omissions", () => {
	test("print in the chord's superscript", () => {
		const chord = doc(renderChartUnwrapped("| C7(no3) |")).querySelector("[part=chord]");
		expect(chord?.querySelector("sup")?.textContent).toBe("7(no3)");
	});
	test("are spoken as what is left out", () => {
		expect(spoken("| C7(no3) | Cmaj9(no5) |")).toEqual([
			"bar 1: C seven no third",
			"bar 2: C major nine no fifth",
		]);
	});
});

describe("articulation", () => {
	test("an accent and a hit draw their mark over the chord", () => {
		const marks = [
			...doc(renderChartUnwrapped("| >D ^G |")).querySelectorAll("[data-articulation]"),
		];
		expect(marks.map((m) => m.getAttribute("data-articulation"))).toEqual(["accent", "hit"]);
		expect(marks.map((m) => m.querySelector(".bm-artic")?.textContent)).toEqual([">", "^"]);
	});
	test("and are spoken", () => {
		expect(spoken("| >D ^G |")).toEqual(["bar 1: accented D, G short hit"]);
	});
});

describe("pushes", () => {
	test("a push draws a mark before its slot", () => {
		const pushed = [
			...doc(renderChartUnwrapped("| N.C. |\n| <D | <<G | <-- |")).querySelectorAll("[data-push]"),
		];
		expect(pushed.map((p) => p.getAttribute("data-push"))).toEqual([
			"eighth",
			"sixteenth",
			"eighth",
		]);
		expect(pushed.map((p) => p.querySelector(".bm-push")?.textContent)).toEqual(["‹", "«", "‹"]);
	});
	test("and is spoken", () => {
		expect(spoken("| N.C. |\n| <D | <<^G |")).toEqual([
			"bar 1: no chord",
			"bar 2: D pushed",
			"bar 3: G short hit pushed a sixteenth",
		]);
	});
});

describe("voicings", () => {
	test("draw the chord's name, not its notes", () => {
		const html = renderChartUnwrapped("| Cmaj7{E3 G3 B3 C4} |");
		const bar = doc(html).querySelector(".bm-bar-body");
		expect(bar?.querySelectorAll("[part=chord]").length).toBe(1);
		expect(bar?.textContent).not.toContain("E3");
	});
	test("say their notes to a screen reader after the name", () => {
		expect(spoken("| Cmaj7{E3 G3 B3 C4} |")).toEqual(["bar 1: C major seven voiced E3 G3 B3 C4"]);
	});
});
