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
		});
	});
	test("theme, bar-numbers=off, rehearsal-letters", () => {
		expect(
			optionsFromAttributes(el({ theme: "dark", "bar-numbers": "off", "rehearsal-letters": "" })),
		).toEqual({ theme: "dark", barNumbers: false, rehearsalLetters: true });
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
