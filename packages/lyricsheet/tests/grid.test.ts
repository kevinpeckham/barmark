import { describe, expect, test } from "bun:test";
import { exportLyricsheet, type LyricsheetLossCode, type LyricsheetOptions } from "../src/index.js";
import { fixtures } from "./fixtures.js";
import { readCho } from "./read-cho.js";
import { readBack, yardstick } from "./yardstick.js";

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

	test("the shape is the widest row's, so a later, longer line stays in the one grid", () => {
		expect(body("## A\n| C | G |\n| C | G | C | G |\n")).toEqual(
			grid("A", "1+4x4+1", "| C . . . | G . . . |", "| C . . . | G . . . | C . . . | G . . . |"),
		);
	});

	test("the widest row by cells, wherever it is: a row of three 5/4 bars after three 4/4", () => {
		expect(body("## A\n| C | G | C |\n| [5/4] C | [5/4] D | [5/4] E |\n| C |\n")).toEqual(
			grid(
				"A",
				"1+3x5+1",
				"| C . . . | G . . . | C . . . |",
				"| C . . . . | D . . . . | E . . . . |",
				"| C . . . |",
			),
		);
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

	test("an open repeat is written once, then {comment: repeat ad lib.} as its grid's next line", () => {
		expect(body("## A\n| C | G | x ...\n")).toEqual(
			grid("A", "1+2x4+1", "| C . . . | G . . . |", "{comment: repeat ad lib.}"),
		);
	});

	test("an open repeat inside a section keeps the one grid: the comment between its lines", () => {
		expect(body("## A\n| C | G | x ...\n| F |\n")).toEqual(
			grid("A", "1+2x4+1", "| C . . . | G . . . |", "{comment: repeat ad lib.}", "| F . . . |"),
		);
	});

	test("a |: :| is never split across grids, an open repeat inside it included", () => {
		expect(body("## A\n|: C | G | x ...\n| D :|\n")).toEqual(
			grid("A", "1+2x4+1", "|: C . . . | G . . . |", "{comment: repeat ad lib.}", "| D . . . :|"),
		);
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
			{ label: "Intro", bars: [{ beats: 4, attacks: [{ beat: 0, chord: "C" }] }] },
			{
				label: "Verse",
				bars: [
					{ beats: 4, attacks: [{ beat: 0, chord: "G" }] },
					{ beats: 4, attacks: [{ beat: 0, chord: "D" }] },
					{ beats: 4, attacks: [{ beat: 0, chord: "G" }] },
					{ beats: 4, attacks: [{ beat: 0, chord: "D" }] },
				],
			},
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

describe("no written line ends in a backslash; no tab is written (ChordPro joins and the output rules)", () => {
	// Measured 2026-11-19 with chordpro 6.101.0: a line ending `\` is joined to
	// the next, `\\` at the end too (one backslash dropped), and `\ ` keeps the
	// line but leaves a trailing space. So a final `\` is written `/`.
	test("a lyric line whose last syllable ends in `\\` ends in `/`, with its loss", () => {
		const chart = "## A\n| C | G |\nlyrics: | la | lo\\ |\n";
		expect(body(chart)).toEqual(['{start_of_verse: label="A"}', "[C]la [G]lo/", "{end_of_verse}"]);
		expect(codes(chart)).toEqual(["text-changed"]);
	});

	test("a grid line whose margin words end in `\\` ends in `/`, with its loss", () => {
		const chart = '## A\n| C "a\\\\" |\n';
		expect(body(chart)).toEqual(grid("A", "1+1x4+1", "| C . . . | a\\/"));
		expect(codes(chart)).toEqual(["text-changed"]);
	});

	test("a backslash not at a line's end stays", () => {
		expect(body('## A\n| C "a\\b" |\n')).toEqual(grid("A", "1+1x4+1", "| C . . . | a\\b"));
	});

	test("a tab in words is written as a space, with its loss", () => {
		const chart = '## A\n| C "a\tb" | G |\nlyrics: | la | lo |\n';
		expect(body(chart)).toEqual([
			'{start_of_verse: label="A"}',
			"[C]la [*a b] [G]lo",
			"{end_of_verse}",
		]);
		expect(codes(chart)).toEqual(["text-changed"]);
	});

	// Measured: a quoted label value reads `\n` as a newline, `\\` as `\` and
	// `\"` as `"`, then the label is split into lines at a newline and at a
	// literal backslash-n left in it. A word joiner (U+2060, drawn as nothing)
	// between the backslash and the n keeps the heading's characters on one line.
	test("a heading holding backslash-n is one label line, drawn as written", () => {
		const chart = "## A\\nB\n| C |\n";
		expect(body(chart)[0]).toBe('{start_of_grid: label="A\\\\⁠nB" shape="1+1x4+1"}');
		expect(codes(chart)).toEqual(["text-changed"]);
		expect(sheet("## A\\nB\n| C |\nlyrics: | la |\n").text).toContain(
			'{start_of_verse: label="A\\\\⁠nB"}',
		);
	});
});

describe("a rehearsal mark starts its own row", () => {
	test("as written: the line is split at the mark, its repeat signs kept at each end", () => {
		const chart = "## A\n|: C | @B | G | D :|\n";
		expect(body(chart)).toEqual(grid("A", "1+2x4+1", "|: C . . . |", "@B | G . . . | D . . . :|"));
		expect(readBack(sheet(chart).text)).toEqual(yardstick(chart).map(({ records: _, ...r }) => r));
		expect(codes(chart)).toEqual([]);
	});

	test("as written with x N: the line is kept whole, the mark at its start, with its loss", () => {
		const chart = "## A\n| C | @B | G | x2\n";
		expect(body(chart)).toEqual(grid("A", "1+2x4+1", "@B | C . . . | G . . . | x2"));
		expect(readBack(sheet(chart).text)).toEqual(yardstick(chart).map(({ records: _, ...r }) => r));
		expect(codes(chart)).toEqual(["mark-moved"]);
	});

	test("as played: the row is split at the mark", () => {
		const chart = "## A x2\n| C | @B | G | D |\n";
		expect(body(chart)).toEqual(
			grid(
				"A",
				"1+2x4+1",
				"| C . . . |",
				"@B | G . . . | D . . . |",
				"| C . . . |",
				"@B | G . . . | D . . . |",
			),
		);
		expect(readBack(sheet(chart).text)).toEqual(yardstick(chart).map(({ records: _, ...r }) => r));
	});
});

describe("margin words that read as a count", () => {
	test("are written in double quotes; the line's own count stays bare", () => {
		for (const words of ["x3", "x 3", "X3", "play x3"]) {
			const chart = `## A\n| C "${words}" | G | x2\n`;
			expect(body(chart)).toEqual(grid("A", "1+2x4+1", `| C . . . | G . . . | "${words}" x2`));
			expect(readBack(sheet(chart).text)).toEqual(
				yardstick(chart).map(({ records: _, ...r }) => r),
			);
		}
	});

	test("alone on a line with no count, still quoted, and read back as words", () => {
		const chart = '## A\n| C "x3" | G |\n';
		expect(body(chart)).toEqual(grid("A", "1+2x4+1", '| C . . . | G . . . | "x3"'));
		expect(readBack(sheet(chart).text)).toEqual(yardstick(chart).map(({ records: _, ...r }) => r));
	});
});

describe("`%` only where it plays the bar before it in the grid", () => {
	test("not after a time: change between the two bars", () => {
		expect(body("## A\n| C / G / |\ntime: 2/4\n| % |\n")).toEqual(
			grid("A", "1+1x4+1", "| C . G . |", "{comment: Time: 2/4}", "{time: 2/4}", "| C G |"),
		);
	});

	test("not after a fermata measure", () => {
		expect(body("## A\n| C / G / | ... | % |\n")).toEqual(
			grid("A", "1+3x4+1", "| C . G . | *… | C . G . |"),
		);
	});

	test("not at the start of a new line", () => {
		expect(body("## A\n| C / G / |\n| % |\n")).toEqual(
			grid("A", "1+1x4+1", "| C . G . |", "| C . G . |"),
		);
	});

	test("not at the start of a row split at a rehearsal mark", () => {
		expect(body("## A\n| C / G / | @B | % |\n")).toEqual(
			grid("A", "1+1x4+1", "| C . G . |", "@B | C . G . |"),
		);
	});
});

describe("stacked verses", () => {
	test("a stacked verse with no sung syllable writes nothing", () => {
		const chart = "## A\n| C | G |\nlyrics 1: | a | b |\nlyrics 2: | -- | -- |\n";
		expect(body(chart)).toEqual(['{start_of_verse: label="A"}', "[C]a [G]b", "{end_of_verse}"]);
		expect(readBack(sheet(chart).text)).toEqual(yardstick(chart).map(({ records: _, ...r }) => r));
	});
});

describe("golden grids", () => {
	test("each grid golden is in the fixtures the byte-for-byte loop compares", () => {
		const names = fixtures().map((f) => f.cho);
		for (const cho of [
			"grid-cells.cho",
			"grid-repeats.cho",
			"grid-meters.cho",
			"peaceful-dreams.cho",
			"at-a-glance.cho",
		])
			expect(names).toContain(cho);
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
