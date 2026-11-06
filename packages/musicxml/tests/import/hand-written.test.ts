/**
 * Hand-written files from the whole-branch review (tests/fixtures/import):
 * shapes no program's fixture had, each with the chart it must give.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseChart, printChart } from "barmark";
import { type ImportResult, importMusicXml } from "../../src/index.js";

const text = (name: string) =>
	readFileSync(new URL(`../fixtures/import/${name}`, import.meta.url), "utf8");

/** Canonical, parsing cleanly, with no importer bug. */
function sound(r: ImportResult): ImportResult {
	expect(printChart(r.text)).toBe(r.text);
	expect(parseChart(r.text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	return r;
}

/** Which bars each part plays, by part label: its chords in order, `-` where it is tacet. */
const byPart = (chart: string) => {
	const parsed = parseChart(chart);
	return parsed.parts.map((p, i) => [
		p.label,
		parsed.bars.map((b) => {
			const part = b.parts?.[i];
			return part
				? part.slots.map((s) => (s.kind === "chord" ? s.chord.canonical : s.kind)).join(" ")
				: "-";
		}),
	]);
};

test("trading fours: each part plays its own four bars", () => {
	const r = sound(importMusicXml(text("trading-fours.musicxml")));
	expect(r.text).toBe(text("trading-fours.chart.md"));
	expect(byPart(r.text)).toEqual([
		["G", ["A", "B", "C", "D", "-", "-", "-", "-"]],
		["P", ["-", "-", "-", "-", "E", "F", "G", "A"]],
	]);
});

test("a part entering after four bars plays only from there", () => {
	const r = sound(importMusicXml(text("part-enters.musicxml")));
	expect(r.text).toBe(text("part-enters.chart.md"));
	expect(byPart(r.text)).toEqual([
		["G", ["-", "-", "-", "-", "A", "B", "C", "D"]],
		["P", ["C", "F", "G", "C", "E", "F", "G", "A"]],
	]);
});
