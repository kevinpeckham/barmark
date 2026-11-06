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

test.each(["melody-rest", "melody-measure-rest"])(
	"%s: a lead sheet's melody resting a bar holds the chord",
	(name) => {
		const r = sound(importMusicXml(text(`${name}.musicxml`)));
		expect(r.text).toBe(text(`${name}.chart.md`));
	},
);

test("an eighth-note pickup in 4/4 is [1/8]", () => {
	const pickup = `<measure number="0" implicit="yes"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><harmony><root><root-step>C</root-step></root><kind>major</kind></harmony><note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><notehead>slash</notehead></note></measure>`;
	const bar = `<measure number="1"><harmony><root><root-step>D</root-step></root><kind>major</kind></harmony><note><pitch><step>B</step><octave>4</octave></pitch><duration>8</duration><notehead>slash</notehead></note></measure>`;
	const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Gtr</part-name></score-part></part-list><part id="P1">${pickup}${bar}</part></score-partwise>`;
	const r = sound(importMusicXml(xml));
	expect(r.text).toBe("| [1/8] C | D |\n");
	expect(r.diagnostics).toEqual([]);
});
