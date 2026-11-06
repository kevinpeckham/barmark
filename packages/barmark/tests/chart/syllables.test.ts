import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChart } from "../../src/chart/parse.js";
import { printChart } from "../../src/chart/print.js";
import { readSyllable } from "../../src/chart/syllable.js";
import { transposeChart } from "../../src/chart/transpose.js";
import { ROOT } from "./fixtures.js";

const slotsOf = (cell: string) =>
	parseChart(`part: V = Voice\nV | ${cell} |\n`).bars[0]?.slots ?? [];
const errors = (chart: string) =>
	parseChart(chart).diagnostics.filter((d) => d.severity === "error");

describe("syllables on notes (grammar 4.3)", () => {
	test("a syllable follows its note after a colon", () => {
		expect(slotsOf("{G4}:maz- {B4}:ing")).toMatchObject([
			{ syllable: { kind: "sung", parts: ["maz"], continues: true } },
			{ syllable: { kind: "sung", parts: ["ing"], continues: false } },
		]);
	});
	test("the note keeps its pitch", () => {
		expect(slotsOf("{G4}:maz-")[0]).toMatchObject({
			kind: "chord",
			chord: { kind: "notes", canonical: "{G4}" },
		});
	});
	test(":/ holds the syllable before over a new note", () => {
		expect(slotsOf("{B4}:ing_{G4}:/")[0]).toMatchObject({
			kind: "group",
			members: [{ syllable: { kind: "sung" } }, { syllable: { kind: "held" } }],
		});
	});
	test("a bare note is unsung", () => {
		expect(slotsOf("{C4}")[0]).not.toHaveProperty("syllable");
	});
	test("~ joins elided syllables on one note", () => {
		expect(slotsOf("{C4}:the~end")[0]).toMatchObject({ syllable: { parts: ["the", "end"] } });
	});
	test("a dotted note takes its dot before the syllable", () => {
		expect(slotsOf("{C4}.:maz-_{D4}:ing")[0]).toMatchObject({
			kind: "group",
			members: [
				{ dotted: true, syllable: { parts: ["maz"], continues: true } },
				{ syllable: { parts: ["ing"] } },
			],
		});
	});
	test("a dot at the end of a syllable is the syllable's, not the rhythm's", () => {
		const [slot] = slotsOf("{C4}:yeah...");
		expect(slot).toMatchObject({ syllable: { parts: ["yeah..."] } });
		expect(slot).not.toHaveProperty("dotted");
	});
	test("punctuation inside a syllable is the syllable's", () => {
		for (const s of ["don't", "o'er", "yeah...", "¿qué?", "and/or", "x2", "%", "¡Ay"])
			expect(slotsOf(`{C4}:${s}`)[0]).toMatchObject({ syllable: { kind: "sung", parts: [s] } });
	});
	test("marks go before the note, the syllable after it", () => {
		expect(slotsOf(">{C4}:la")[0]).toMatchObject({
			articulation: "accent",
			syllable: { parts: ["la"] },
		});
	});
	test("a note set of several notes takes one syllable", () => {
		expect(slotsOf("{C4 E4}:la")[0]).toMatchObject({ syllable: { parts: ["la"] } });
	});
	test("a syllable on anything but a note set is an error", () => {
		for (const cell of ["G:la", "/:la", "--:la", "N.C.:la", "?:la", ":la", "Cmaj7{E3 G3}:la"])
			expect(errors(`| ${cell} |\n`).length, cell).toBeGreaterThan(0);
	});
	test("a syllable on a voicing says to write the notes alone", () => {
		expect(errors("| Cmaj7{E3 G3}:la |\n")[0]?.message).toContain("voicing");
		expect(errors("| G:la |\n")[0]?.message).toContain("note set");
	});
	test("an empty syllable is an error, with a line number", () => {
		for (const cell of ["{C4}:", "{C4}:~end", "{C4}:the~", "{C4}.:_{D4}"]) {
			const [e] = errors(`part: V = Voice\nV | ${cell} |\n`);
			expect(e, cell).toMatchObject({ line: 2, severity: "error" });
		}
	});
	test("a hold can't begin or continue a word: :/- is an error", () => {
		const [e] = errors("part: V = Voice\nV | {C4}:la_{D4}:/- |\n");
		expect(e).toMatchObject({ line: 2, severity: "error", token: "{D4}:/-" });
		expect(e?.message).toContain("hold");
	});
	test("grammar 4.3's example reads with no diagnostics", () => {
		const spec = readFileSync(join(ROOT, "docs/grammar-v0.1-draft.md"), "utf8");
		const section = /### 4\.3 Syllables\n([\s\S]*?)\n## 5\./.exec(spec)?.[1] ?? "";
		const block = /```\n([\s\S]*?)\n```/.exec(section)?.[1];
		expect(block).toBeDefined();
		const p = parseChart(block ?? "");
		expect(p.diagnostics).toEqual([]);
		expect(p.bars.length).toBe(2);
	});
	test("a syllable ends at a brace", () => {
		expect(errors("| {C4}:la{D4} |\n").length).toBeGreaterThan(0);
	});
	test("quoted words end a syllable", () => {
		const p = parseChart('| {C4}:la"softly" |\n');
		expect(p.diagnostics).toEqual([]);
		expect(p.bars[0]?.slots[0]).toMatchObject({ syllable: { parts: ["la"] } });
	});
	test("% copies a bar's notes, not its syllables", () => {
		const p = parseChart("part: V = Voice\nV | {C4}:la {D4}:/ | % |\n");
		expect(p.diagnostics).toEqual([]);
		expect(p.bars[1]?.slots).toMatchObject([
			{ kind: "chord", chord: { canonical: "{C4}" } },
			{ kind: "chord", chord: { canonical: "{D4}" } },
		]);
		for (const s of p.bars[1]?.slots ?? []) expect(s).not.toHaveProperty("syllable");
		expect(p.bars[0]?.slots[0]).toHaveProperty("syllable");
	});
	test("% copies a group's notes without their syllables", () => {
		const p = parseChart("| {C4}.:la_{D4}:lo | % |\n");
		const [g] = p.bars[1]?.slots ?? [];
		expect(g).toMatchObject({ kind: "group", members: [{ dotted: true }, {}] });
		for (const m of g?.kind === "group" ? g.members : []) expect(m).not.toHaveProperty("syllable");
	});
	test("syllables print back as written", () => {
		for (const cell of [
			"{G4}:maz- {B4}:ing",
			"{B4}:ing_{G4}:/",
			"{C4}:the~end",
			"{C4}.:maz-_{D4}:ing",
			"{C4}:yeah...",
			"{C4}:¿qué?",
			">{C4 E4}:la",
		]) {
			// One part prints without its label (8), so the chart is unlabelled here.
			const chart = `part: Voice\n| ${cell} |\n`;
			expect(parseChart(chart).diagnostics, cell).toEqual([]);
			expect(printChart(chart), cell).toBe(chart);
		}
	});
	test("transposing moves the notes and keeps the syllables", () => {
		expect(transposeChart("| {G4}:maz-_{B4}:/ |\n", { semitones: 2 }).text).toBe(
			"| {A4}:maz-_{C#5}:/ |\n",
		);
	});
	test("a repeat close straight after a syllable still closes", () => {
		for (const chart of ["|: {C4}:la :|\n", "|: {C4}:la:|\n"]) {
			const p = parseChart(chart);
			expect(p.diagnostics, chart).toEqual([]);
			expect(p.lines[0], chart).toMatchObject({ kind: "bars", opens: true, closes: true });
			expect(p.bars.length, chart).toBe(2);
			expect(p.bars[0]?.slots[0], chart).toMatchObject({ syllable: { parts: ["la"] } });
		}
	});
	test("a syllable at the end of a bar ends at its pipe", () => {
		expect(slotsOf("{C4}:la| {D4}:lo")).toMatchObject([{ syllable: { parts: ["la"] } }]);
	});
});

describe("readSyllable", () => {
	test("reads a syllable token", () => {
		expect(readSyllable("maz-")).toEqual({ kind: "sung", parts: ["maz"], continues: true });
		expect(readSyllable("ing")).toEqual({ kind: "sung", parts: ["ing"], continues: false });
		expect(readSyllable("the~end")).toEqual({
			kind: "sung",
			parts: ["the", "end"],
			continues: false,
		});
		expect(readSyllable("/")).toEqual({ kind: "held" });
	});
	test("an empty syllable, or an empty side of ~, is null", () => {
		for (const t of ["", "-", "~end", "the~", "a~~b"]) expect(readSyllable(t), t).toBeNull();
	});
	test("a hold with a hyphen is null: a hold can't begin or continue a word", () => {
		expect(readSyllable("/-")).toBeNull();
	});
});
