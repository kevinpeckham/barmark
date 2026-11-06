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

test("six guitars: a meter barmark can't write is reported once for the score", () => {
	const r = sound(importMusicXml(text("six-guitars.musicxml")));
	expect(r.text).toBe(text("six-guitars.chart.md"));
	const meters = r.diagnostics.filter((d) => d.message.includes("time signature"));
	expect(meters).toEqual([
		{
			severity: "warning",
			message: "a time signature barmark can't write (7/3); kept 4/4 in measure 1",
			measure: "1",
		},
	]);
});

test("score-wide losses come once, with no part; a part left out reports none", () => {
	const head = (divisions: number) =>
		`<attributes><divisions>${divisions}</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>`;
	const bad = "<attributes><time><beats>7</beats><beat-type>3</beat-type></time></attributes>";
	const chords = (id: string) =>
		`<part id="${id}"><measure number="0" implicit="yes">${head(3)}<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony><note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><notehead>slash</notehead></note></measure><measure number="1">${bad}<harmony><root><root-step>D</root-step></root><kind>major</kind></harmony><note><pitch><step>B</step><octave>4</octave></pitch><duration>12</duration><notehead>slash</notehead></note></measure></part>`;
	// The bass has notes alone, and a meter of its own barmark can't write.
	const bass = `<part id="P3"><measure number="0" implicit="yes">${head(3)}<note><pitch><step>C</step><octave>2</octave></pitch><duration>1</duration></note></measure><measure number="1"><attributes><time><beats>9</beats><beat-type>5</beat-type></time></attributes><note><pitch><step>D</step><octave>2</octave></pitch><duration>12</duration></note></measure></part>`;
	const list = ["Gtr", "Keys", "Bass"]
		.map((name, i) => `<score-part id="P${i + 1}"><part-name>${name}</part-name></score-part>`)
		.join("");
	const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list>${list}</part-list>${chords("P1")}${chords("P2")}${bass}</score-partwise>`;
	const r = sound(importMusicXml(xml));
	expect(r.diagnostics.filter((d) => /meter|time signature/.test(d.message))).toEqual([
		{
			severity: "warning",
			message: "a short bar's length can't be written as a meter; read as a full bar in measure 0",
			measure: "0",
		},
		{
			severity: "warning",
			message: "a time signature barmark can't write (7/3); kept 4/4 in measure 1",
			measure: "1",
		},
	]);
});

test("a chord symbol placed outside its bar moves to the nearest beat inside it", () => {
	const r = sound(importMusicXml(text("harmony-edges.musicxml")));
	expect(r.text).toBe(text("harmony-edges.chart.md"));
	expect(r.diagnostics).toEqual([
		{
			severity: "warning",
			message: "notes read as a melody and left out in 4 measures: 1, 3, 4, …",
			part: "Lead",
			measure: "1",
		},
		{
			severity: "warning",
			message: "chord symbols moved to the nearest beat in 3 measures: 3, 4, 5",
			part: "Lead",
			measure: "3",
		},
	]);
});
