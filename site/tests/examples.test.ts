import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { engraveChart } from "@barmark/score";
import { parseChart, printChart } from "barmark";
import { VerovioToolkit } from "verovio/esm";
import createVerovioModule from "verovio/wasm";
import { chartHtml, scoreHtml } from "../src/lib/chart.ts";
import { EXAMPLES, exampleFile, flipped } from "../src/lib/examples.ts";

/** Each example's text, as the home page imports it. */
const texts = await Promise.all(
	EXAMPLES.map((e) =>
		Bun.file(join(import.meta.dir, "../src/lib/examples", exampleFile(e))).text(),
	),
);
/** The repository's copy of an example in examples/. */
const official = (e: (typeof EXAMPLES)[number]) =>
	Bun.file(join(import.meta.dir, "../../examples", exampleFile(e))).text();

describe("the home page's examples", () => {
	test("are five, Amazing Grace first: the default", () => {
		expect(EXAMPLES.map((e) => e.title)).toEqual([
			"Amazing Grace",
			"Greensleeves",
			"Blues in F",
			"When the Saints Go Marching In",
			"Peaceful Dreams",
		]);
	});

	test("each one's title is its chart's", () => {
		for (const [i, e] of EXAMPLES.entries()) expect(parseChart(texts[i] ?? "").title).toBe(e.title);
	});

	test("each one parses with no diagnostics on the pinned barmark", () => {
		for (const [i, e] of EXAMPLES.entries())
			expect([e.id, parseChart(texts[i] ?? "").diagnostics]).toEqual([e.id, []]);
	});

	test("each one is already canonical: the printer leaves it unchanged", () => {
		for (const [i, e] of EXAMPLES.entries())
			expect([e.id, printChart(texts[i] ?? "")]).toEqual([e.id, texts[i]]);
	});

	test("each one is the repository's example, exactly", async () => {
		for (const [i, e] of EXAMPLES.entries())
			expect([e.id, texts[i]]).toEqual([e.id, await official(e)]);
	});

	test("each one draws as a grid, and as a <barmark-score> carrying its text", () => {
		for (const [i, e] of EXAMPLES.entries()) {
			const text = texts[i] ?? "";
			expect(chartHtml(text)).toContain(e.title);
			const score = scoreHtml(text);
			expect(score).toStartWith("<barmark-score");
			expect(score).toContain(e.title);
			expect(score).toContain('<script type="text/barmark">');
		}
	});

	test("each one is credited, and only Peaceful Dreams is anyone's to reserve", () => {
		for (const e of EXAMPLES) expect(e.credit.length).toBeGreaterThan(20);
		const reserved = EXAMPLES.filter((e) => e.credit.includes("all rights reserved"));
		expect(reserved.map((e) => e.id)).toEqual(["peaceful-dreams"]);
		for (const e of EXAMPLES.filter((e) => e.id !== "peaceful-dreams"))
			expect(e.credit).toContain("public domain");
	});
});

test("flipping goes round: past the last is the first, before the first the last", () => {
	expect(flipped(0, 1)).toBe(1);
	expect(flipped(EXAMPLES.length - 1, 1)).toBe(0);
	expect(flipped(0, -1)).toBe(EXAMPLES.length - 1);
});

describe("between them they show", () => {
	const parsed = texts.map((t) => parseChart(t));
	const byId = (id: string) => parsed[EXAMPLES.findIndex((e) => e.id === id)] ?? parseChart("");
	const source = (id: string) => texts[EXAMPLES.findIndex((e) => e.id === id)] ?? "";

	test("Amazing Grace: 3/4, a pickup, a key and tempo, a section, two verses of lyrics", () => {
		const text = source("amazing-grace");
		expect(text).toContain("time: 3/4");
		expect(text).toContain("[1/4]");
		expect(text).toMatch(/key: G, time: 3\/4, tempo: \d+/);
		expect(text).toContain("## Verse");
		expect(text).toContain("lyrics 1:");
		expect(text).toContain("lyrics 2:");
		expect(byId("amazing-grace").title).toBe("Amazing Grace");
	});

	test("Greensleeves: 6/8, minor, slash bass, a section played twice", () => {
		const text = source("greensleeves");
		expect(text).toContain("time: 6/8");
		expect(text).toContain("key: Am");
		expect(text).toMatch(/\b[A-G][#b]?\w*\/[A-G]/);
		expect(text).toContain("## Verse x2");
	});

	test("Blues in F: swing, sevenths, a repeat with first and second endings, a hit", () => {
		const text = source("blues-in-f");
		expect(text).toContain("feel: swing");
		expect(text).toContain("|:");
		expect(text).toContain("|1 ");
		expect(text).toContain("|2 ");
		expect(text).toContain("^F7");
	});

	test("When the Saints: D.S. al Coda, a coda, words on a bar and a cue in a text line", () => {
		const text = source("when-the-saints");
		for (const s of ["Segno", "To Coda", "D.S. al Coda", "| Coda |", '"solos"'])
			expect(text).toContain(s);
	});
});

describe("each example engraves as a score", () => {
	let vrv: VerovioToolkit;
	beforeAll(async () => {
		vrv = new VerovioToolkit(await createVerovioModule());
	}, 60_000);
	for (const [i, e] of EXAMPLES.entries())
		test(e.title, () => {
			const r = engraveChart(vrv, texts[i] ?? "", { width: 800 });
			if (!r.ok) throw new Error(`${e.id}: ${r.reason}`);
			expect(r.svg).toContain("<svg");
		});
});
