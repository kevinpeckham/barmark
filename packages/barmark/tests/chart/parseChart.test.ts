import { describe, expect, test } from "bun:test";
import { parseChart } from "../../src/index.js";
import { AT_A_GLANCE, barText, PEACEFUL_DREAMS } from "./fixtures.js";

describe("Peaceful Dreams", () => {
	const r = parseChart(PEACEFUL_DREAMS);
	test("reads cleanly", () => {
		expect(r.title).toBe("Peaceful Dreams");
		expect(r.diagnostics).toEqual([]);
	});
	test("152 bars ending on a ring-out", () => {
		expect(r.bars).toHaveLength(152);
		expect(r.events.at(-1)?.kind).toBe("fermata");
	});
	test("every bar carries the opening directives", () => {
		for (const b of r.bars) {
			expect([b.key, b.tempo, b.meter, b.feel]).toEqual([
				{ tonic: "D", mode: "major" },
				145,
				{ n: 4, d: 4 },
				"straight",
			]);
		}
	});
	test("sections in play order", () => {
		expect(r.sections.map((s) => s.name)).toEqual([
			"Intro",
			"Verse",
			"Chorus",
			"Verse",
			"Chorus",
			"Bridge",
			"Verse (Triads)",
			"Verse",
			"Interlude",
			"Outro",
		]);
		expect(r.sections.map((s) => (s.lastBar ?? 0) - (s.firstBar ?? 0) + 1)).toEqual([
			20, 20, 8, 20, 8, 8, 20, 20, 8, 20,
		]);
	});
	test("section starts land on the stem-bench times", () => {
		const bench = [0, 33.1, 66.21, 79.45, 112.55, 125.79, 139.03, 172.14, 205.24, 218.48];
		r.sections.forEach((s, i) => {
			expect(Math.abs((((s.firstBar ?? 0) - 1) * 240) / 145 - (bench[i] ?? -1))).toBeLessThan(0.01);
		});
	});
});

describe("the spec's At a glance example", () => {
	const r = parseChart(AT_A_GLANCE);
	const inSection = (name: string) => r.bars.filter((b) => b.section === name);
	test("one diagnostic: the ? warning", () => {
		expect(r.diagnostics.map((d) => [d.severity, d.token])).toEqual([["warning", "?"]]);
	});
	test("the bridge swings and the outro is straight again", () => {
		expect(new Set(inSection("Bridge").map((b) => b.feel))).toEqual(new Set(["swing"]));
		expect(new Set(inSection("Outro").map((b) => b.feel))).toEqual(new Set(["straight"]));
	});
	test("the [2/4] bar", () => expect(inSection("Outro").map((b) => b.meter.n)).toEqual([4, 4, 2]));
	test("the chorus pushes G and holds it", () => {
		expect(inSection("Chorus").slice(6, 8).map(barText)).toEqual(["D / / /_G", "/"]);
	});
	test("repeats and replays", () => {
		expect(inSection("Verse")).toHaveLength(24);
		expect(inSection("Chorus")).toHaveLength(24);
		expect(r.bars).toHaveLength(4 + 24 + 24 + 8 + 3);
	});
});

describe("edges", () => {
	test("an empty file", () => {
		const r = parseChart("");
		expect([r.bars, r.diagnostics, r.title]).toEqual([[], [], null]);
	});
	test("a file of only text has no bars, and says so", () => {
		const r = parseChart("just words\nmore words");
		expect(r.bars).toEqual([]);
		expect(r.diagnostics.map((d) => [d.line, d.severity, d.message])).toEqual([
			[1, "warning", "no bar lines in this chart; a bar line starts with |"],
		]);
	});
	test("an error drops only its own line", () => {
		const r = parseChart("# T\nkey: D\n| A |\n| D | Hm |\n| G |");
		expect(r.diagnostics.map((d) => [d.line, d.severity])).toEqual([[4, "error"]]);
		expect(r.bars.map((b) => b.line)).toEqual([3, 5]);
	});
	test("diagnostics are sorted by line, errors first", () => {
		const r = parseChart("| ? | Hm |\n| C D E |\n| ? |");
		expect(r.diagnostics.map((d) => [d.line, d.severity])).toEqual([
			[1, "error"],
			[1, "warning"],
			[2, "warning"],
			[3, "warning"],
		]);
	});
	test("random input never throws and every line number is real", () => {
		const alphabet = "|:x%/.-_{}[]!? \nABCDEFGm7#b259()N";
		let seed = 42;
		const rand = () => {
			seed = (seed * 1103515245 + 12345) % 2 ** 31;
			return seed / 2 ** 31;
		};
		for (let i = 0; i < 2000; i++) {
			const len = Math.floor(rand() * 200);
			let text = "";
			for (let j = 0; j < len; j++) text += alphabet[Math.floor(rand() * alphabet.length)];
			const lineCount = text.split("\n").length;
			const r = parseChart(text);
			for (const d of r.diagnostics) {
				expect(d.line).toBeGreaterThanOrEqual(1);
				expect(d.line).toBeLessThanOrEqual(lineCount);
			}
		}
	});
});
