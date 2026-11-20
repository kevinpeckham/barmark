import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { perform } from "@barmark/midi/perform";
import { engraveChart } from "@barmark/score";
import { parseChart, printChart } from "barmark";
import { VerovioToolkit } from "verovio/esm";
import createVerovioModule from "verovio/wasm";
import { chartHtml, scoreHtml } from "../src/lib/chart.ts";
import { EXAMPLES, exampleFile, flipped, viewOf } from "../src/lib/examples.ts";

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
	test("each opens in its own view: Amazing Grace in the score, where its melody is, the rest in the grid", () => {
		expect(EXAMPLES.map((e) => [e.id, viewOf(e)])).toEqual([
			["greensleeves", "grid"],
			["amazing-grace", "score"],
			["blues-in-f", "grid"],
			["when-the-saints", "grid"],
			["peaceful-dreams", "grid"],
		]);
	});
	test("are five, Greensleeves first: the default", () => {
		expect(EXAMPLES.map((e) => e.title)).toEqual([
			"Greensleeves",
			"Amazing Grace",
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

	test("Amazing Grace: a lead sheet, its words sung on the tune New Britain", () => {
		const text = source("amazing-grace");
		expect(text).toContain("part: Vox = Voice, instrument: voice");
		const sung = perform(byId("amazing-grace")).tracks.find((t) => t.line === "Mel");
		if (!sung) throw new Error("no melody line");
		// New Britain in G, 3/4, bar by bar as pitch:quarters: a quarter-note pickup, then
		// sixteen bars. "me" and "see" are tied over the bar after them.
		const tune = [
			"D4:1", // A-
			"G4:2 B4:0.5 G4:0.5", // maz- ing
			"B4:2 A4:1", // grace how
			"G4:2 E4:1", // sweet the
			"D4:2 D4:1", // sound that
			"G4:2 B4:0.5 G4:0.5", // saved a
			"B4:2 A4:1", // wretch like
			"D5:5", // me, held into the next bar
			"B4:1", // I
			"D5:2 D5:0.5 B4:0.5", // once was
			"G4:2 D4:1", // lost but
			"E4:2 G4:0.5 E4:0.5", // now am
			"D4:2 D4:1", // found was
			"G4:2 B4:0.5 G4:0.5", // blind but
			"B4:2 A4:1", // now I
			"G4:6", // see, held through the last bar
		].flatMap((bar) => bar.split(" "));
		const MIDI: Record<string, number> = { D4: 62, E4: 64, G4: 67, A4: 69, B4: 71, D5: 74 };
		const played = sung.notes.map((n) => {
			const name = Object.keys(MIDI).find((k) => MIDI[k] === n.pitch) ?? String(n.pitch);
			return `${name}:${n.length.n / n.length.d}`;
		});
		expect(played).toEqual(tune);
		// Every pitch in G major pentatonic.
		for (const n of sung.notes) expect([0, 2, 4, 7, 9]).toContain((n.pitch - 67 + 120) % 12);
		// Both verses: every syllable starts on a note of the tune.
		const onsets = new Set(sung.notes.map((n) => n.at.n / n.at.d));
		for (const verse of [1, 2]) {
			const words = sung.lyrics.filter((l) => l.verse === verse);
			expect(words).toHaveLength(28);
			for (const w of words) expect([w.text, onsets.has(w.at.n / w.at.d)]).toEqual([w.text, true]);
		}
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
