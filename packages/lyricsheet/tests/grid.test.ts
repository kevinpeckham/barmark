import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { exportLyricsheet, type LyricsheetLossCode, type LyricsheetOptions } from "../src/index.js";
import { FIXTURES } from "./fixtures.js";
import { readCho } from "./read-cho.js";
import { readBack } from "./yardstick.js";

function sheet(chart: string, options: LyricsheetOptions = {}) {
	const r = exportLyricsheet(chart, options);
	if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
	readCho(r.text);
	return r;
}
/** The sheet after its header (from the first blank line on). */
const body = (chart: string) => {
	const all = sheet(chart).text.split("\n");
	return all.slice(all.indexOf("") + 1, -1);
};
const codes = (chart: string) => sheet(chart).losses.map((l) => l.code);
const grid = (label: string | null, shape: string, ...lines: string[]) => [
	`{start_of_grid: ${label === null ? "" : `label="${label}" `}shape="${shape}"}`,
	...lines,
	"{end_of_grid}",
];

describe("grid cells (spec 4.3, the grid column)", () => {
	test("a cell per beat: a hold is `.`, a repeated name `/`", () => {
		expect(body("## Intro\n| C / G G | Am / / F |\n")).toEqual(
			grid("Intro", "1+2x4+1", "| C . G / | Am . . F |"),
		);
	});

	test("a finer slot or a group shares its beat's cell with ~, in time order", () => {
		expect(body("| C G Am F C G Am F | C / / /_G | C_G / / / | C G F |\n")).toEqual(
			grid(null, "1+4x4+1", "| C~G Am~F C~G Am~F | C . . .~G | C~G . . . | C .~G .~F . |"),
		);
	});

	test("a repeated name inside a shared cell is written again, never `/`", () => {
		// The reference's PDF writer dies on a `/` inside a `~` cell (measured 2026-11-19).
		expect(body("| C_C / / / |\n")).toEqual(grid(null, "1+1x4+1", "| C~C . . . |"));
	});

	test("`%` where the chart wrote it, followed by the bar's other beats", () => {
		expect(body("## A\n| C G | % | C G |\n")).toEqual(
			grid("A", "1+3x4+1", "| C . G . | % . . . | C . G . |"),
		);
	});

	test("a `%` copying a bar written in another occurrence is written as its chords", () => {
		expect(body("## A\n| C |\n## B\n| % |\n")).toEqual([
			...grid("A", "1+1x4+1", "| C . . . |"),
			"",
			...grid("B", "1+1x4+1", "| C . . . |"),
		]);
	});

	test("N.C. as a cell, a stop as *Stop, ? as *?; a repeated N.C. or stop has no attack", () => {
		expect(body("| N.C. | -- | ? | N.C. N.C. -- -- |\n")).toEqual(
			grid(null, "1+4x4+1", "| N.C. . . . | *Stop . . . | *? . . . | N.C. . *Stop . |"),
		);
	});

	test("a note set as an annotation of its notes joined by commas; a voicing as its name", () => {
		expect(body("| {C4 E4 G4} | Cmaj7{E3 G3 B3} |\n")).toEqual(
			grid(null, "1+2x4+1", "| *C,E,G . . . | Cmaj7 . . . |"),
		);
		expect(codes("| {C4 E4 G4} | Cmaj7{E3 G3 B3} |\n")).toEqual(["note-sets", "voicing"]);
	});

	test("words are right-margin text, a rehearsal mark left-margin text", () => {
		expect(body('| @B | "solo" C | G "fill" |\n')).toEqual(
			grid(null, "1+2x4+1", "@B | C . . . | G . . . | solo fill"),
		);
	});

	test("words with markup are written plain, with their loss", () => {
		expect(body('| "a [b]" C |\n')).toEqual(grid(null, "1+1x4+1", "| C . . . | a (b)"));
		expect(codes('| "a [b]" C |\n')).toEqual(["text-changed"]);
	});

	test("a fermata is a measure of its own, `*…`, with its loss", () => {
		expect(body("## Outro\n| D | A | [2/4] D | ... |\n")).toEqual(
			grid("Outro", "1+4x4+1", "| D . . . | A . . . | D . | *… |"),
		);
		expect(codes("## Outro\n| D | A | [2/4] D | ... |\n")).toEqual(["fermata"]);
	});

	test("pushes, accents and hits are written unmarked, with their loss; a gap chord with its", () => {
		expect(body("| >C <G | ^C | F#m(b6) |\n")).toEqual(
			grid(null, "1+3x4+1", "| C . G . | C . . . | F#m(b6) . . . |"),
		);
		expect(codes("| >C <G | ^C | F#m(b6) |\n")).toEqual(["marks", "chord-names"]);
	});

	test("a one-bar meter is the bar's own cell count, and no loss in a grid", () => {
		expect(body("| C | [2/4] G | [5/4] C |\n")).toEqual(
			grid(null, "1+3x5+1", "| C . . . | G . | C . . . . |"),
		);
		expect(codes("| C | [2/4] G | [5/4] C |\n")).toEqual([]);
	});
});

describe("the grid's shape (spec 4.6, Review Focus 4)", () => {
	test("the meter's beats by the line's bar count, a margin cell each side; no label for the unnamed section", () => {
		expect(body("time: 3/4\n| C | G | C | G |\n")).toEqual(
			grid(null, "1+4x3+1", "| C . . | G . . | C . . | G . . |"),
		);
	});

	test("a pickup is a short first bar, not padded", () => {
		expect(body("## A\n| [1/4] G | C | D |\n")).toEqual(
			grid("A", "1+3x4+1", "| G | C . . . | D . . . |"),
		);
	});

	// beatsOf reads 6/8, 9/8 and 12/8 in dotted quarters: a 6/8 bar has two
	// cells and a 12/8 bar four, each a dotted quarter holding three eighths.
	test("6/8 is two cells a bar, the eighths sharing them", () => {
		expect(body("time: 6/8\n| C | C / / G / / | C C C D D D |\n")).toEqual(
			grid(null, "1+3x2+1", "| C . | C G | C~C~C D~D~D |"),
		);
	});

	test("12/8 is four cells a bar", () => {
		expect(body("time: 12/8\n| C / / / / / G / / / / / |\n")).toEqual(
			grid(null, "1+1x4+1", "| C . G . |"),
		);
	});

	test("a shorter or smaller later line stays in the grid, as its own cells", () => {
		expect(body("## A\n| C | G | C | G |\n| C | G |\ntime: 3/4\n| C | G | C | G |\n")).toEqual(
			grid(
				"A",
				"1+4x4+1",
				"| C . . . | G . . . | C . . . | G . . . |",
				"| C . . . | G . . . |",
				"{comment: Time: 3/4}",
				"{time: 3/4}",
				"| C . . | G . . | C . . | G . . |",
			),
		);
	});

	test("a later line with more cells than the shape opens a new grid, unlabelled, with its own shape", () => {
		expect(body("## A\n| C | G |\n| C | G | C | G |\n")).toEqual([
			...grid("A", "1+2x4+1", "| C . . . | G . . . |"),
			...grid(null, "1+4x4+1", "| C . . . | G . . . | C . . . | G . . . |"),
		]);
	});
});

describe("repeats in a grid (spec 4.5)", () => {
	test("a repeat played straight through keeps |: :| and x N as right-margin text", () => {
		expect(body("## A\n|: C | G :| x3\n| F | C | x2\n|: D | A :|\n")).toEqual(
			grid(
				"A",
				"1+2x4+1",
				"|: C . . . | G . . . :| x3",
				"| F . . . | C . . . | x2",
				"|: D . . . | A . . . :|",
			),
		);
	});

	test("first and second endings as |1 and |2, an ending carried onto its next line", () => {
		expect(body("## A\n|: C | F |\n|1 G | A |\n| B :|\n|2 E |\n")).toEqual(
			grid(
				"A",
				"1+2x4+1",
				"|: C . . . | F . . . |",
				"|1 G . . . | A . . . |",
				"| B . . . :|",
				"|2 E . . . |",
			),
		);
	});

	test("an ending for several passes has no ChordPro volta: the occurrence is written as played", () => {
		expect(body("## A\n|: C |\n|1-2 G :|\n|3 E |\n")).toEqual(
			grid(
				"A",
				"1+1x4+1",
				"| C . . . |",
				"| G . . . |",
				"| C . . . |",
				"| G . . . |",
				"| C . . . |",
				"| E . . . |",
			),
		);
	});

	test("a replay cut short by -> is written as played, with no repeat signs", () => {
		expect(body("## A\n|: C | G :|\n## B\n| D |\n## A ->\n")).toEqual([
			...grid("A", "1+2x4+1", "|: C . . . | G . . . :|"),
			"",
			...grid("B", "1+1x4+1", "| D . . . |"),
			"",
			...grid("A", "1+2x4+1", "| C . . . | G . . . |", "| C . . . |"),
		]);
	});

	test("a section after a jump plays its repeat once: written as played", () => {
		const out = body(
			"## A\n| Segno | C |\n## B\n|: D | To Coda | G :|\n| D.S. al Coda |\n## Coda\n| Coda | F |\n",
		);
		expect(out).toEqual([
			...grid("A", "1+1x4+1", "| C . . . |"),
			"",
			...grid("B", "1+2x4+1", "|: D . . . | G . . . :|"),
			"",
			...grid("A", "1+1x4+1", "| C . . . |"),
			"",
			...grid("B", "1+1x4+1", "| D . . . |"),
			"",
			...grid("Coda", "1+1x4+1", "| F . . . |"),
		]);
	});

	test("a section heading x2 plays its lines twice: written as played", () => {
		expect(body("## A x2\n| C | G |\n")).toEqual(
			grid("A", "1+2x4+1", "| C . . . | G . . . |", "| C . . . | G . . . |"),
		);
	});

	test("a replay of an unsung section is written out again", () => {
		expect(body("## Intro\n| C |\n## Verse\n| G |\nlyrics: | la |\n## Intro\n")).toEqual([
			...grid("Intro", "1+1x4+1", "| C . . . |"),
			"",
			'{start_of_verse: label="Verse"}',
			"[G]la",
			"{end_of_verse}",
			"",
			...grid("Intro", "1+1x4+1", "| C . . . |"),
		]);
	});

	test("an open repeat is written once, then {comment: repeat ad lib.} after the grid", () => {
		expect(body("## A\n| C | G | x ...\n")).toEqual([
			...grid("A", "1+2x4+1", "| C . . . | G . . . |"),
			"{comment: repeat ad lib.}",
		]);
	});

	test("an open repeat inside a section closes the grid there and opens another after the comment", () => {
		expect(body("## A\n| C | G | x ...\n| F |\n")).toEqual([
			...grid("A", "1+2x4+1", "| C . . . | G . . . |"),
			"{comment: repeat ad lib.}",
			...grid(null, "1+2x4+1", "| F . . . |"),
		]);
	});
});

describe("labels, changes and text in a grid (spec 4.6)", () => {
	test('a heading with a double quote or a backslash is escaped inside label="…"', () => {
		expect(body('## Intro "x" \\ y\n| C |\n')[0]).toBe(
			'{start_of_grid: label="Intro \\"x\\" \\\\ y" shape="1+1x4+1"}',
		);
	});

	test("a swing feel on a chart whose first section has no words still says swing", () => {
		expect(body("feel: swing\n## Intro\n| C |\n")).toEqual(
			grid("Intro", "1+1x4+1", "{comment: swing}", "| C . . . |"),
		);
	});

	test("a key change inside an unsung section, and text lines, as comments between grid lines", () => {
		expect(body("key: C\n## A\n| C |\nPlay softly.\nkey: D\n| D |\n")).toEqual(
			grid(
				"A",
				"1+1x4+1",
				"| C . . . |",
				"{comment: Play softly.}",
				"{comment: Key: D}",
				"{key: D}",
				"| D . . . |",
			),
		);
	});

	test("text under a replay heading is written before the grid", () => {
		expect(body("## A\n| C |\n## B\n| D |\n## A\nAgain, louder.\n")).toEqual([
			...grid("A", "1+1x4+1", "| C . . . |"),
			"",
			...grid("B", "1+1x4+1", "| D . . . |"),
			"",
			"{comment: Again, louder.}",
			...grid("A", "1+1x4+1", "| C . . . |"),
		]);
	});

	test("a part tacet in a section writes N.C.", () => {
		const chart =
			"part: Vox = Voice, instrument: voice\npart: Gtr = Guitar\n## A\nVox | C |\nGtr | G |\n## B\nVox | D |\n";
		const r = sheet(chart, { part: "Gtr" });
		expect(r.text).toContain("| N.C. . . . |");
	});
});

describe("words in some sections and not others (Review Focus 3)", () => {
	test("a chart with words in no section writes grids only, balanced", () => {
		const r = sheet("## Intro\n| C |\n## Verse\n|: G | D :|\n");
		expect(r.text.match(/\{start_of_grid/g)?.length).toBe(2);
		expect(r.text).not.toContain("{start_of_verse");
		expect(readBack(r.text)).toEqual([
			{ label: "Intro", bars: [["C"]] },
			{ label: "Verse", bars: [["G"], ["D"], ["G"], ["D"]] },
		]);
	});

	test("a section sung only on its second pass: the first pass is a grid, as played", () => {
		expect(body("## Verse\n|: C | G :|\nlyrics 2: | a | b |\n")).toEqual([
			...grid("Verse", "1+2x4+1", "| C . . . | G . . . |"),
			"",
			'{start_of_verse: label="Verse"}',
			"[C]a [G]b",
			"{end_of_verse}",
		]);
	});
});

describe("golden grids", () => {
	for (const cho of [
		"grid-cells.cho",
		"grid-repeats.cho",
		"grid-meters.cho",
		"peaceful-dreams.cho",
		"at-a-glance.cho",
	])
		test(`${cho} exists`, () => {
			expect(existsSync(join(FIXTURES, cho))).toBe(true);
		});
});

describe("losses in grids", () => {
	test("each grid loss once per code, naming its bars", () => {
		const got: LyricsheetLossCode[] = codes("| {C4} | {D4} | ... | Cmaj7{E3 G3 B3} |\n");
		expect(got).toEqual(["note-sets", "fermata", "voicing"]);
	});
});

describe("grids scale", () => {
	/** A chart of `n` sections with no words, each written with a repeat and an ending, then replayed. */
	const chart = (n: number) =>
		Array.from(
			{ length: n },
			(_, i) => `## S${i}\n|: C | % | G | D |\n|1 Am | F :|\n|2 Em | % |\n| C | G | x2\n## S${i}\n`,
		).join("");
	const best = (n: number) => {
		const text = chart(n);
		let ms = Number.POSITIVE_INFINITY;
		for (let i = 0; i < 3; i++) {
			const start = performance.now();
			exportLyricsheet(text);
			ms = Math.min(ms, performance.now() - start);
		}
		return ms;
	};
	test("a long chart with no words exports in time proportional to its length", () => {
		best(10);
		// 40 to 160 sections: 1,120 to 4,480 bars played.
		const ratio = best(160) / Math.max(best(40), 1);
		expect(ratio).toBeLessThan(8);
	}, 60_000);
});
