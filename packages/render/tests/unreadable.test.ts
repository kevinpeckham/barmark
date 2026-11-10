import { describe, expect, test } from "bun:test";
import type { Slot } from "barmark";
import { parseHTML } from "linkedom";
import { renderChartUnwrapped } from "../src/index.js";
import { speakSlot } from "../src/speech.js";

// An unreadable slot keeps its bar as unknown harmony with the author's text
// (grammar principle 4, Kevin 2026-11-10); the renderer draws that text
// where it would draw ?, and never reads it as music.

const doc = (html: string) =>
	parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;

describe("an unreadable slot is drawn as written", () => {
	test("a % copying it draws its text, not ?", () => {
		const d = doc(renderChartUnwrapped("| C | CM7 |\n| % |\n"));
		const unknown = [...d.querySelectorAll(".bm-unknown")].map((e) => e.textContent);
		expect(unknown).toEqual(["CM7"]);
		expect(d.querySelector(".bm-error code")?.textContent).toBe("| C | CM7 |");
	});
	test("its text is escaped", () => {
		const html = renderChartUnwrapped("| C | <<<C&D |\n| % |\n");
		expect(html).toContain('<span class="bm-unknown">&lt;&lt;&lt;C&amp;D</span>');
		expect(html).not.toContain("<<<C&D</span>");
	});
	test("a written ? is still drawn as ?", () => {
		const d = doc(renderChartUnwrapped("| C | ? |\n"));
		expect(d.querySelector(".bm-unknown")?.textContent).toBe("?");
	});
});

describe("an unreadable slot is spoken as unreadable, with its text", () => {
	test("speech", () => {
		const unread: Slot = { kind: "unknown", text: "CM7" };
		expect(speakSlot(unread)).toBe("unreadable: CM7");
		expect(speakSlot({ kind: "unknown" })).toBe("unknown chord");
		expect(speakSlot({ kind: "unknown", text: "CM7", dotted: true })).toBe(
			"unreadable: CM7 dotted",
		);
	});
});
