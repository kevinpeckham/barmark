import { describe, expect, test } from "bun:test";
import { type ChordRecord, parseChart, parseChord } from "barmark";
import { enumerateSuffixes } from "../../barmark/src/chords/suffixes.js";
import { isGap, spelled } from "../src/export/spell.js";
import { readCho } from "./read-cho.js";

const chord = (symbol: string): ChordRecord => {
	const r = parseChord(symbol);
	if (!r.ok) throw new Error(`${symbol}: ${r.error.message}`);
	return r.value;
};

/**
 * Spec 4.7, measured against the reference's chord parser on 2026-11-18:
 * a gap is a name the parser rejects. A name it parses but has no built-in
 * diagram for is not a gap.
 */
describe("spelled: the aliases the reference's parser accepts", () => {
	const aliases: [string, string][] = [
		// An alteration after an extension loses its parentheses.
		["C7(b9)", "C7b9"],
		["C7(#9)", "C7#9"],
		["C7(#11)", "C7#11"],
		["C7(b13)", "C7b13"],
		["C7(b5)", "C7b5"],
		["C7(#5)", "C7#5"],
		["C13(b9)", "C13b9"],
		["C7(b9,#11)", "C7b9#11"],
		["C7(b9,b13)", "C7b9b13"],
		["C9(#11)", "C9#11"],
		["Cmaj7(#11)", "Cmaj7#11"],
		["Am7(b5)", "Am7b5"],
		// ... with a ninth's alteration first.
		["C7(b5,b9)", "C7b9b5"],
		["C7(#5,#9)", "C7#9#5"],
		["C7(#5,b9)", "C7b9#5"],
		// One added tone on a triad, a seventh or a ninth is written `add`.
		["C(9)", "Cadd9"],
		["C(2)", "Cadd2"],
		["C(4)", "Cadd4"],
		["C(11)", "Cadd11"],
		["Cm(9)", "Cmadd9"],
		["C7(11)", "C7add11"],
		["C9(6)", "C9add6"],
		// On other roots, and over a bass.
		["F#7(b9)", "F#7b9"],
		["Bb(9)", "Bbadd9"],
		["C7(b9)/E", "C7b9/E"],
		["C(9)/E", "Cadd9/E"],
		["Am7(b5)/Eb", "Am7b5/Eb"],
	];
	for (const [canonical, written] of aliases)
		test(`${canonical} → ${written}`, () => {
			expect(spelled(chord(canonical))).toBe(written);
			expect(isGap(chord(canonical))).toBe(false);
		});

	const asWritten = [
		"C",
		"Cm",
		"Cmmaj7",
		"Cmmaj9",
		"C6/9",
		"C6(9)",
		"C9(11)",
		"C7alt",
		"Csus2",
		"C7sus2",
		"C7sus4",
		"C13sus2",
		"C5",
		"Cdim7",
		"Caug7",
		"Cmaj9",
		"Cmaj13",
		"Cm13",
		// Everyday slash chords: the parser takes any bass on a name with no parentheses.
		"D/F#",
		"C/E",
		"C/Bb",
		"C/F#",
		"C/Db",
		"C/A",
		"Em/B",
		"Am/E",
		"Dm/A",
		"G7/D",
		"Csus4/G",
		"Cm7/Bb",
	];
	for (const name of asWritten)
		test(`${name} is known as written`, () => {
			expect(spelled(chord(name))).toBe(name);
			expect(isGap(chord(name))).toBe(false);
		});
});

describe("isGap: names the reference's parser rejects in every spelling, written canonically", () => {
	const gaps = [
		// a tone the parser takes in no spelling
		"C(b13)",
		"C5(7)",
		"C7(no3)",
		"C(no5)",
		"Cm(b6)",
		"Cm7(b6)",
		"C(b6)",
		"C(13)",
		"C(#11)",
		"C(b9)",
		"Cm7(b13)",
		"C7(b6)",
		"Cmaj7(b9)",
		"C7(#9,b13)",
		// no renaming across families: the notes of C6, Cmaj7#5 and C9, as written
		"C(6)",
		"Caugmaj7",
		"C7(9)",
		// bare chords the parser rejects
		"C9sus4",
		"C9sus2",
		"Cm6/9",
		// a note whose accidental lands on a natural, as root or bass
		"Cb",
		"E#m",
		"Fb",
		"B#7",
		"C/Fb",
		"C/E#",
		"Cb7(b9)",
		// a bass under parentheses or a 6/9
		"C6(9)/E",
		"C9(11)/E",
		"C6/9/E",
	];
	for (const name of gaps)
		test(`${name}`, () => {
			expect(isGap(chord(name))).toBe(true);
			expect(spelled(chord(name))).toBe(chord(name).canonical);
		});
});

describe("nothing written reads back as another chord", () => {
	const suffixes = [...enumerateSuffixes().values()].flat().map((s) => s.suffix);
	for (const root of ["C", "F#", "Bb"])
		test(`every suffix on ${root} reads back in barmark as the same chord`, () => {
			expect(suffixes.length).toBeGreaterThan(1000);
			const bad: string[] = [];
			for (const suffix of [...suffixes, "7alt"]) {
				for (const bass of [null, "E"]) {
					const c = chord(`${root}${suffix}${bass ? `/${bass}` : ""}`);
					const back = parseChord(spelled(c));
					const same =
						back.ok &&
						back.warnings.length === 0 &&
						JSON.stringify(back.value.intervals) === JSON.stringify(c.intervals) &&
						back.value.bass === c.bass &&
						back.value.root === c.root;
					if (!same) bad.push(`${c.canonical} → ${spelled(c)}`);
				}
			}
			expect(bad).toEqual([]);
		});
});

describe("the spellings fixture", () => {
	const dir = `${import.meta.dir}/fixtures`;
	test("spellings.cho is the chart's grids, each chord as spelled() writes it", async () => {
		const chart = await Bun.file(`${dir}/spellings.chart.md`).text();
		const cho = await Bun.file(`${dir}/spellings.cho`).text();
		expect(cho).toBe(spellingsSheet(chart));
		expect(() => readCho(cho)).not.toThrow();
	});
});

/**
 * The fixture's text until the export writes grids (Task 4): the header,
 * then one grid per section, a bar's four slots as four cells, a margin
 * cell each side. Built from parseChart and spelled() alone.
 */
function spellingsSheet(chart: string): string {
	const parse = parseChart(chart);
	const out = ["{title: Spellings}", "{key: C}", "{time: 4/4}"];
	let section: string | null | undefined;
	let line = -1;
	for (const bar of parse.bars) {
		if (bar.section !== section) {
			if (section !== undefined) out.push("{end_of_grid}");
			out.push("", `{start_of_grid: label="${bar.section}" shape="1+4x4+1"}`);
			section = bar.section;
		}
		const cells = bar.slots.map((s) => (s.kind === "chord" ? spelled(s.chord) : "?"));
		if (bar.line === line) out[out.length - 1] += ` ${cells.join(" ")} |`;
		else out.push(`| ${cells.join(" ")} |`);
		line = bar.line;
	}
	out.push("{end_of_grid}");
	return `${out.join("\n")}\n`;
}
