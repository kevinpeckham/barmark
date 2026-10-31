import { describe, expect, test } from "bun:test";
import { parseChart, printChart } from "../../src/index.js";
import { AT_A_GLANCE, meaning, PEACEFUL_DREAMS } from "./fixtures.js";

/** Printing keeps the meaning: same everything, and warnings may only disappear. */
function expectSameMeaning(text: string) {
	const before = meaning(parseChart(text));
	const after = meaning(parseChart(printChart(text)));
	const { warnings: wb, ...b } = before;
	const { warnings: wa, ...a } = after;
	expect(a).toEqual(b);
	for (const w of wa) expect(wb.has(w)).toBe(true);
}
const stable = (text: string) => expect(printChart(printChart(text))).toBe(printChart(text));

describe("conformance", () => {
	test("Peaceful Dreams is already canonical", () =>
		expect(printChart(PEACEFUL_DREAMS)).toBe(PEACEFUL_DREAMS));
	test("At a glance is stable and keeps its meaning", () => {
		stable(AT_A_GLANCE);
		expectSameMeaning(AT_A_GLANCE);
	});
});

describe("variants print in standard spelling", () => {
	const chart = [
		"# T",
		"KEY: E♭, FEEL: Swing",
		"##  Verse  X2",
		"| F♯m | NC | n.c. | – |",
		"| D_— | N.C | … |",
		"|: D :| ×3",
		"## Verse →",
		"## Out x …",
		"| A | B♭ / B♭ / |",
	].join("\n");
	const out = printChart(chart);
	test("no variant is left", () => expect(out).not.toMatch(/[♯♭X×→…–—]|NC|n\.c\.|N\.C(?!\.)/));
	test("the exact text", () => {
		expect(out).toBe(
			[
				"# T",
				"key: Eb, feel: swing",
				"",
				"## Verse x2",
				"| F#m | N.C. | N.C. | -- |",
				"| D_-- | N.C. | ... |",
				"|: D :| x3",
				"",
				"## Verse ->",
				"## Out x ...",
				"| A | Bb Bb |",
				"",
			].join("\n"),
		);
	});
	test("meaning is unchanged", () => expectSameMeaning(chart));
});

describe("lines with errors print as written", () => {
	const chart = "# T\nkey: D, tempo: fast\n| D | Hm |\n## Verse 2";
	test("verbatim", () =>
		expect(printChart(chart)).toBe("# T\nkey: D, tempo: fast\n| D | Hm |\n\n## Verse 2\n"));
	test("the same errors on re-parse", () => {
		const errors = (t: string) =>
			parseChart(t)
				.diagnostics.filter((d) => d.severity === "error")
				.map((d) => d.message);
		expect(errors(printChart(chart))).toEqual(errors(chart));
		expect(errors(chart)).toHaveLength(3);
	});
});

describe("layout", () => {
	test("blank lines: the author's, collapsed, one before each ##", () => {
		expect(printChart("# T\n\n\n\n## A\n| D |\nla la\n\n  la la indented   \n## B\n| E |")).toBe(
			"# T\n\n## A\n| D |\nla la\n\n  la la indented\n\n## B\n| E |\n",
		);
	});
	test("no blank lines at the start or end", () =>
		expect(printChart("\n\n## A\n| D |\n\n\n")).toBe("## A\n| D |\n"));
	test("fences are kept", () => {
		expect(printChart("# T\n```barmark\n|D|\n```")).toBe("# T\n```barmark\n| D |\n```\n");
	});
	test("consecutive headings stay together; the author's blank between them stays", () => {
		expect(printChart("## A\n| D |\n## A\n## A")).toBe("## A\n| D |\n\n## A\n## A\n");
		expect(printChart("## A\n| D |\n## A\n\n## A")).toBe("## A\n| D |\n\n## A\n\n## A\n");
	});
	test("empty input", () => expect(printChart("")).toBe(""));
	test("CRLF and BOM print as clean LF", () => {
		expect(printChart("﻿# T\r\n| D |\r\n")).toBe(printChart("# T\n| D |\n"));
	});
});

describe("the yardstick sees timing", () => {
	test("a held triplet is not the same as a bar of triplets", () => {
		expect(meaning(parseChart("| D_E_F / |")).bars).not.toEqual(
			meaning(parseChart("| D_E_F |")).bars,
		);
	});
	test("G / D / means G D", () => {
		expect(meaning(parseChart("| G / D / |")).bars).toEqual(meaning(parseChart("| G D |")).bars);
	});
});

describe("printing never adds a warning", () => {
	for (const [chart, cell] of <[string, string][]>[
		["time: 3/4\n| G / / D / / |", "| G / / D / / |"],
		["time: 2/4\n| G / D / E / |", "| G / D / E / |"],
		["| G / / / D / / / E / / / |", "| G / / / D / / / E / / / |"],
		["| [3/4] G / / D / / |", "| [3/4] G / / D / / |"],
	]) {
		test(chart, () => {
			expect(printChart(chart).split("\n")).toContain(cell);
			expectSameMeaning(chart);
		});
	}
	test("an uneven cell does not change its warning", () => {
		expect(printChart("| G / D / E / |")).toBe("| G / D / E / |\n");
	});
});

describe("grammar-driven fuzz", () => {
	test("well-formed random charts keep their meaning", () => {
		let seed = 11;
		const rand = () => {
			seed = (seed * 1103515245 + 12345) % 2 ** 31;
			return seed / 2 ** 31;
		};
		const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)] as T;
		const slots = [
			"G",
			"D",
			"Am7",
			"/",
			"/",
			"/",
			"--",
			"N.C.",
			"?",
			"D_E",
			"D_E_F",
			"/_G",
			"G_--",
			"{E2}",
		];
		for (let i = 0; i < 2000; i++) {
			const lines: string[] = [];
			if (rand() < 0.5) lines.push(`time: ${pick(["2/4", "3/4", "4/4", "6/8", "12/8"])}`);
			for (let l = 0; l < 1 + Math.floor(rand() * 4); l++) {
				if (rand() < 0.2) lines.push(`## ${pick(["A", "B"])}${pick(["", " x2", " x ..."])}`);
				const cells: string[] = [];
				for (let c = 0; c < 1 + Math.floor(rand() * 4); c++) {
					const n = 1 + Math.floor(rand() * 8);
					const body = Array.from({ length: n }, () => pick(slots)).join(" ");
					cells.push(rand() < 0.1 ? "%" : rand() < 0.1 ? `[3/4] ${body}` : body);
				}
				lines.push(`| ${cells.join(" | ")} |${pick(["", "", " x2"])}`);
			}
			const text = lines.join("\n");
			stable(text);
			expectSameMeaning(text);
		}
	}, 30_000);
});

describe("fuzz", () => {
	test("never throws, is stable, and keeps meaning", () => {
		const parts = [
			..."|:x%/.-_{}[]!? ABCDEFGm7#b259()N",
			"\n",
			"\n## ",
			"key: ",
			"x ...",
			"#",
			"\n\n",
			"…",
			"→",
			"♯",
		];
		let seed = 7;
		const rand = () => {
			seed = (seed * 1103515245 + 12345) % 2 ** 31;
			return seed / 2 ** 31;
		};
		for (let i = 0; i < 2000; i++) {
			let text = "";
			const len = Math.floor(rand() * 80);
			for (let j = 0; j < len; j++) text += parts[Math.floor(rand() * parts.length)];
			stable(text);
			expectSameMeaning(text);
		}
	});
});
