import { describe, expect, test } from "bun:test";
import { chartSource, inlineChartText, optionsFromAttributes } from "../src/element.js";

const el = (attrs: Record<string, string>) => ({
	getAttribute: (n: string) => attrs[n] ?? null,
	hasAttribute: (n: string) => n in attrs,
});

describe("attributes → render options", () => {
	test("defaults", () => {
		expect(optionsFromAttributes(el({}))).toEqual({
			theme: "auto",
			barNumbers: true,
			rehearsalLetters: false,
			wrap: true,
		});
	});
	test("theme, bar-numbers=off, rehearsal-letters, wrap=off", () => {
		expect(
			optionsFromAttributes(
				el({ theme: "dark", "bar-numbers": "off", "rehearsal-letters": "", wrap: "off" }),
			),
		).toEqual({ theme: "dark", barNumbers: false, rehearsalLetters: true, wrap: false });
	});
	test("show-part names the part to draw", () => {
		expect(optionsFromAttributes(el({ "show-part": "Pno" })).part).toBe("Pno");
		expect(optionsFromAttributes(el({})).part).toBeUndefined();
	});
	test("the global part attribute (for ::part styling) draws the whole chart", () => {
		expect(optionsFromAttributes(el({ part: "chart" })).part).toBeUndefined();
	});
	test("chord-diagrams and diagram-hand give their options", () => {
		expect(optionsFromAttributes(el({ "chord-diagrams": "guitar" })).chordDiagrams).toBe("guitar");
		expect(optionsFromAttributes(el({ "diagram-hand": "left" })).diagramHand).toBe("left");
		expect(optionsFromAttributes(el({ "diagram-hand": "right" })).diagramHand).toBe("right");
		expect(
			optionsFromAttributes(el({ "chord-diagrams": "guitar", "diagram-hand": "left" })),
		).toMatchObject({ chordDiagrams: "guitar", diagramHand: "left" });
	});
	test("an unknown chord-diagrams or diagram-hand is not set, and none leaves no key", () => {
		const unknown = optionsFromAttributes(
			el({ "chord-diagrams": "ukulele", "diagram-hand": "up" }),
		);
		expect("chordDiagrams" in unknown).toBe(false);
		expect("diagramHand" in unknown).toBe(false);
		const none = optionsFromAttributes(el({}));
		expect("chordDiagrams" in none).toBe(false);
		expect("diagramHand" in none).toBe(false);
	});
	test("an unknown theme is auto", () => {
		expect(optionsFromAttributes(el({ theme: "sepia" })).theme).toBe("auto");
	});
});

describe("inline chart text", () => {
	test("indentation common to every line is removed, and blank edges", () => {
		const text = "\n\t\t## Verse\n\t\t| D | A |\n\t\t  lyric\n\t";
		expect(inlineChartText(text)).toBe("## Verse\n| D | A |\n  lyric");
	});
});

describe("which source a chart draws", () => {
	test("text wins over src and a script child", () => {
		expect(chartSource({ text: "## A", src: "/x.md", script: true })).toBe("text");
		expect(chartSource({ text: "", src: "/x.md", script: true })).toBe("text");
	});
	test("without text: src, then the script child, then none", () => {
		expect(chartSource({ text: null, src: "/x.md", script: true })).toBe("src");
		expect(chartSource({ text: null, src: "", script: true })).toBe("script");
		expect(chartSource({ text: null, src: "", script: false })).toBe("none");
	});
});
