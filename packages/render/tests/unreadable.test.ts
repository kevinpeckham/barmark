import { describe, expect, test } from "bun:test";
import type { Slot } from "barmark";
import { parseHTML } from "linkedom";
import { layoutChart, renderChartUnwrapped } from "../src/index.js";
import { speakSlot } from "../src/speech.js";

// An unreadable slot keeps its bar as unknown harmony with the author's text
// (grammar principle 4, Kevin 2026-11-10); the renderer draws that text
// where it would draw ?, and never reads it as music.

const doc = (html: string) =>
	parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;

describe("an unreadable slot is drawn as written", () => {
	const message = 'CM7: "M" is one shifted letter from "m"; write maj';
	test("a line whose only errors are unreadable slots draws as a row", () => {
		const d = doc(renderChartUnwrapped("| C | CM7 |\n| D |\n"));
		expect(d.querySelector(".bm-error")).toBeNull();
		expect(d.querySelectorAll(".bm-row")).toHaveLength(2);
		const unread = d.querySelector(".bm-unread");
		expect(unread?.textContent).toBe("CM7");
		expect(unread?.classList.contains("bm-unknown")).toBe(true);
		expect(unread?.getAttribute("part")).toBe("unread");
		expect(unread?.getAttribute("title")).toBe(message);
	});
	test("the bar's spoken name reads the slot and its error", () => {
		const d = doc(renderChartUnwrapped("| C | CM7 |\n"));
		const said = [...d.querySelectorAll(".bm-bar .bm-sr")].map((e) => e.textContent);
		expect(said[1]).toBe(`bar 2: unreadable: CM7, error: ${message}`);
	});
	test("a % copying it draws its text, not ?, and not as an error", () => {
		const d = doc(renderChartUnwrapped("| C | CM7 |\n| % |\n"));
		const unknown = [...d.querySelectorAll(".bm-unknown")].map((e) => e.textContent);
		expect(unknown).toEqual(["CM7", "CM7"]);
		expect(d.querySelectorAll(".bm-unread")).toHaveLength(1);
	});
	test("each unreadable slot carries its own message, in a group too", () => {
		const d = doc(renderChartUnwrapped("| H7 C_CM7 |\n"));
		const unread = [...d.querySelectorAll(".bm-unread")];
		expect(unread.map((e) => e.textContent)).toEqual(["H7", "CM7"]);
		expect(unread.map((e) => e.getAttribute("title"))).toEqual([
			'H7: German "H" is ambiguous; write B',
			message,
		]);
	});
	test("its text is escaped", () => {
		const html = renderChartUnwrapped("| C | <<<C&D |\n| % |\n");
		expect(html).toContain(">&lt;&lt;&lt;C&amp;D</span>");
		expect(html).not.toContain("<<<C&D</span>");
	});
	test("a line with any other error still draws as the error box", () => {
		const d = doc(renderChartUnwrapped("| / CM7 |\n| D :| A |\n"));
		expect([...d.querySelectorAll(".bm-error code")].map((e) => e.textContent)).toEqual([
			"| / CM7 |",
			"| D :| A |",
		]);
		expect(d.querySelector(".bm-unread")).toBeNull();
	});
	test("in a system, the line draws with the others", () => {
		const chart = "part: Gtr = Guitar\npart: Pno = Piano\nGtr | G | C |\nPno | G | CM7 |\n";
		const d = doc(renderChartUnwrapped(chart));
		expect(d.querySelector(".bm-error")).toBeNull();
		expect(d.querySelectorAll(".bm-system .bm-row")).toHaveLength(2);
		expect(d.querySelector(".bm-unread")?.textContent).toBe("CM7");
	});
	test("the model carries each bar's messages", () => {
		const block = layoutChart("| C | CM7 |\n").blocks[0];
		const row = block?.items[0];
		const cells = row?.kind === "row" ? row.cells : [];
		expect(cells.map((c) => (c.kind === "slots" ? c.unread : undefined))).toEqual([
			undefined,
			[message],
		]);
	});
	test("the diagnostics list still names the error", () => {
		const d = doc(renderChartUnwrapped("| CM7 |\n", { diagnostics: true }));
		expect(d.querySelector(".bm-diagnostics")?.textContent).toContain(message);
	});
	test("a written ? is still drawn as ?, not as an error", () => {
		const d = doc(renderChartUnwrapped("| C | ? |\n"));
		expect(d.querySelector(".bm-unknown")?.textContent).toBe("?");
		expect(d.querySelector(".bm-unread")).toBeNull();
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
