/**
 * Real files from other programs: scores we wrote in MuseScore 4
 * (tests/fixtures/import/*.mscx), converted by MuseScore itself
 * (scripts/musescore-fixtures.ts, run on the VM only); and those
 * MuseScore `.musicxml` files opened and exported (Full score layout) by
 * Dorico Elements 6.2.31 (`dorico-*.musicxml`), through mac-bench
 * (`kevinpeckham/mac-bench`), 2026-11-07. Each expected chart was written
 * by reading the score, not by pasting the importer's output. What Dorico
 * changes on the way (FINDINGS.md, "What Dorico 6.2 changes when it
 * round-trips MusicXML") is in its charts as Dorico wrote it.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseChart, printChart } from "barmark";
import {
	type ImportDiagnostic,
	type ImportResult,
	importMusicXml,
	readMxl,
} from "../../src/index.js";

const fixture = (name: string) => new URL(`../fixtures/import/${name}`, import.meta.url);
const text = (name: string) => readFileSync(fixture(name), "utf8");

/** What every import must give: canonical text that parses without errors, and no importer bug. */
function sound(r: ImportResult): ImportResult {
	expect(printChart(r.text)).toBe(r.text);
	expect(parseChart(r.text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	return r;
}

/** A warning; one in measures names them all, the first as `measure`. */
const warning = (message: string, part?: string, measures?: string[]): ImportDiagnostic => ({
	severity: "warning",
	message,
	...(part === undefined ? {} : { part }),
	...(measures === undefined ? {} : { measure: measures[0], measures }),
});

const MELODY = "notes read as a melody and left out";

/** Each file, and the diagnostics its import gives. */
const FILES: [string, ImportDiagnostic[]][] = [
	[
		"lead-sheet",
		[
			warning(
				"chord symbols barmark can't read, written as ? with their text as words in measure 5",
				"Voice",
				["5"],
			),
		],
	],
	[
		"comping-guitar",
		[warning("accents and articulations left out in measure 4", "Electric Guitar", ["4"])],
	],
	[
		"piano",
		[
			warning(`${MELODY} in 4 measures: 1, 2, 3, …`, "Piano", ["1", "2", "3", "4"]),
			warning("dynamics left out in measure 1", "Piano", ["1"]),
		],
	],
	[
		"band",
		[
			warning(
				"no chord symbols in these parts, left out: Electric Bass. Import one as note sets with --part",
			),
		],
	],
];

describe("MuseScore 4", () => {
	test.each(FILES)("%s imports to its chart", (name, diagnostics) => {
		const xml = text(`${name}.musicxml`);
		expect(xml).toContain("<software>MuseScore Studio 4.");
		const r = sound(importMusicXml(xml));
		expect(r.text).toBe(text(`${name}.chart.md`));
		expect(r.diagnostics).toEqual(diagnostics);
	});

	test.each([...FILES.map(([name]) => name), "hymn"])(
		"%s.mxl reads as its .musicxml does",
		async (name) => {
			const xml = await readMxl(new Uint8Array(readFileSync(fixture(`${name}.mxl`))));
			expect(importMusicXml(xml)).toEqual(importMusicXml(text(`${name}.musicxml`)));
		},
	);

	test("the band's bass comes in as note sets at sounding pitch with --part", () => {
		const r = sound(importMusicXml(text("band.musicxml"), { part: "El. B." }));
		expect(r.text).toBe(
			"# Morning Band\nkey: G, tempo: 96\n\n## Intro\n| {G1} | {C2} | {G1} | {D2} |\n\n## Verse\n| {B1} | {C2} | {E2} | {D2} |\n",
		);
		expect(r.diagnostics).toEqual([]);
	});
});

/** Each Dorico file, and the diagnostics its import gives. */
const DORICO: [string, ImportDiagnostic[]][] = [
	["hymn", []],
	// Dorico drops the Tristan chord MuseScore kept as text, so nothing is unread.
	["lead-sheet", []],
	[
		"comping-guitar",
		[warning("accents and articulations left out in measure 4", "Electric Guitar", ["4"])],
	],
	[
		"piano",
		[
			warning(`${MELODY} in 4 measures: 1, 2, 3, …`, "Piano", ["1", "2", "3", "4"]),
			warning("dynamics left out in measure 1", "Piano", ["1"]),
		],
	],
	[
		"band",
		[
			warning(
				"no chord symbols in these parts, left out: Electric Bass. Import one as note sets with --part",
			),
		],
	],
];

describe("Dorico 6", () => {
	test.each(DORICO)("%s imports to its chart", (name, diagnostics) => {
		const xml = text(`dorico-${name}.musicxml`);
		expect(xml).toContain("<software>Dorico 6.");
		const r = sound(importMusicXml(xml));
		expect(r.text).toBe(text(`dorico-${name}.chart.md`));
		expect(r.diagnostics).toEqual(diagnostics);
	});

	// Dorico's .mxl has no mimetype entry, and may list the score before META-INF/.
	test.each(DORICO.map(([name]) => name))(
		"dorico-%s.mxl reads as its .musicxml does",
		async (name) => {
			const xml = await readMxl(new Uint8Array(readFileSync(fixture(`dorico-${name}.mxl`))));
			expect(importMusicXml(xml)).toEqual(importMusicXml(text(`dorico-${name}.musicxml`)));
		},
	);
});
