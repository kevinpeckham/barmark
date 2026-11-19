import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import { layoutChart, renderChart, renderChartUnwrapped } from "../src/index.js";
import type { BlockItem, ChartModel, RowItem } from "../src/types.js";

/** The owner's lead sheet: chords, melody and two verses, in two systems. */
const LEAD = `# Amazing Grace
part: Vox = Voice, instrument: voice
key: G, time: 3/4, tempo: 80

## Verse
Vox       | [1/4] D    | G                | G / G7      | C           | G            |
Vox.Mel   | [1/4] {D4} | {G4} / {B4}_{G4} | {B4} / {A4} | {G4} / {E4} | {D4} / {D4}  |
lyrics 1: | A-         | maz- / ing_/     | grace / how | sweet / the | sound / that |
lyrics 2: | 'Twas      | grace / that_/   | taught / my | heart / to  | fear / and   |

Vox       | G / /      | D          |
Vox.Mel   | {B4} / {D5} | {B4} / /  |
lyrics 1: | I / once   | was / /    |
`;

/** The same song as a plain chord-and-words chart: no part, no melody. */
const PLAIN = `# Amazing Grace
key: G, time: 3/4, tempo: 80

## Verse
| [1/4] D    | G                | G / G7      | C           | G            |
lyrics 1: | A-         | maz- / ing_/     | grace / how | sweet / the | sound / that |
lyrics 2: | 'Twas      | grace / that_/   | taught / my | heart / to  | fear / and   |

| G / /      | D          |
lyrics 1: | I / once   | was / /    |
`;

const OFF = { melody: false } as const;
const items = (m: ChartModel, block = 0): BlockItem[] => m.blocks[block]?.items ?? [];
const rowsOf = (m: ChartModel, block = 0) =>
	items(m, block).filter((i): i is RowItem => i.kind === "row");
const systemsOf = (m: ChartModel, block = 0) =>
	items(m, block).filter((i): i is Extract<BlockItem, { kind: "system" }> => i.kind === "system");
const doc = (html: string) => parseHTML(`<body>${html}</body>`).document;
/** A row as the grid draws it, but where it was written. A verse's bars carry the words in order; a place splits only where a melody's notes did. */
const drawn = (r: RowItem) => ({
	cells: r.cells,
	repeat: r.repeat,
	words: r.lyrics?.map((v) => ({
		verse: v.verse,
		bars: v.cells.map((bar) =>
			bar.flatMap((place) => place.flatMap((s) => (s.kind === "sung" ? s.parts : []))),
		),
	})),
});

describe("melody: false on a lead sheet", () => {
	const m = layoutChart(LEAD, OFF);

	test("every body item is a plain row with the words by beat", () => {
		const rows = rowsOf(m);
		expect(items(m).map((i) => i.kind)).toEqual(["row", "row"]);
		expect(systemsOf(m)).toHaveLength(0);
		for (const r of rows) {
			expect(r.sings).toBeUndefined();
			expect(r.verses).toBeUndefined();
			expect(r.lyrics?.map((v) => v.verse)).toEqual([1, 2].slice(0, r.lyrics?.length));
		}
		expect(rows[0]?.lyrics?.map((v) => v.verse)).toEqual([1, 2]);
		// The melisma's held place takes no step: three steps, maz- on the first, ing on the third.
		const bar2 = rows[0]?.lyrics?.[0]?.cells[1];
		expect(bar2).toHaveLength(3);
		expect(bar2?.[0]?.[0]).toMatchObject({ kind: "sung", parts: ["maz"] });
		expect(bar2?.[1]).toEqual([]);
		expect(bar2?.[2]?.[0]).toMatchObject({ kind: "sung", parts: ["ing"] });
	});

	test("the markup has no pitch and keeps the words and every chord", () => {
		const html = renderChartUnwrapped(LEAD, OFF);
		const d = doc(html);
		expect(d.querySelectorAll(".bm-pitch")).toHaveLength(0);
		const text = [...d.querySelectorAll(".bm-syllable")].map((e) => e.textContent).join(" ");
		for (const w of ["maz", "grace", "once", "Twas"]) expect(text).toContain(w);
		const chords = [...d.querySelectorAll(".bm-chord")].map((e) => e.textContent);
		for (const c of ["D", "G", "G7", "C"]) expect(chords).toContain(c);
	});
});

describe("melody: false draws what a plain chord-and-words chart draws", () => {
	test("the rows match: slots, meters and each bar's words in order", () => {
		const a = rowsOf(layoutChart(LEAD, OFF)).map(drawn);
		const b = rowsOf(layoutChart(PLAIN)).map(drawn);
		expect(a.length).toBe(2);
		expect(a).toEqual(b);
	});
});

describe("melody: false with two parts", () => {
	const TWO = `part: Gtr = Guitar
part: Vox = Voice, instrument: voice
time: 4/4

Gtr       | C      | G      |
Vox       | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
	test("the guitar row stays, no voice row and no tacet row, the words by beat", () => {
		const m = layoutChart(TWO, OFF);
		const sys = systemsOf(m);
		expect(sys).toHaveLength(1);
		const rows = sys[0]?.rows ?? [];
		expect(rows.map((p) => p.label)).toEqual(["Gtr"]);
		const row = rows[0]?.row as RowItem;
		expect(row.cells.some((c) => c.kind === "slots" && c.tacet)).toBe(false);
		expect(row.sings).toBeUndefined();
		expect(row.lyrics?.[0]?.cells.length).toBeGreaterThan(0);
		expect(JSON.stringify(row.lyrics)).toContain("la");
	});
});

describe("melody: false leaves the rest", () => {
	test("a melody alone is the default model", () => {
		const ALONE = `part: Vox = Voice, instrument: voice
time: 4/4

Vox       | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
		expect(layoutChart(ALONE, OFF)).toEqual(layoutChart(ALONE));
	});

	test("a voice part's second line and another part's note-set lines stay", () => {
		const MIXED = `part: Vox = Voice, instrument: voice
part: Pno = Piano, lines: RH LH
time: 4/4

Vox       | C | G |
Vox.Mel   | {E4} / {G4} / | {D4} / / / |
Vox.Harm  | {C4} / / / | {B3} / / / |
Pno.RH    | {C5} / / / | {B4} / / / |
Pno.LH    | {C3} / / / | {G2} / / / |
lyrics 1: | la / la / | la |
`;
		const labels = (m: ChartModel) => systemsOf(m)[0]?.rows.map((p) => p.label);
		const before = labels(layoutChart(MIXED));
		expect(before).toContain("Vox.Mel");
		const after = labels(layoutChart(MIXED, OFF));
		expect(after).toEqual(before?.filter((l) => l !== "Vox.Mel"));
		expect(after).toContain("Vox.Harm");
		expect(after).toContain("Pno.LH");
	});

	test("a section of chords and melody loses it; a section of melody alone keeps it", () => {
		const BOTH = `part: Vox = Voice, instrument: voice
time: 4/4

## A
Vox       | C | G |
Vox.Mel   | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |

## B
Vox.Mel   | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
		const m = layoutChart(BOTH, OFF);
		expect(rowsOf(m, 0).every((r) => r.sings === undefined)).toBe(true);
		expect(rowsOf(m, 0).length).toBe(1);
		const dflt = layoutChart(BOTH);
		expect(m.blocks[1]).toEqual(dflt.blocks[1]);
		expect(JSON.stringify(m.blocks[1])).toContain('"sings":true');
	});

	const HEAD = "part: Vox = Voice, instrument: voice\nkey: G, time: 3/4\n\n";

	test("a melody line with an error stays, so the grid shows where it is", () => {
		// The melody writes one bar under two: the line draws as written, with its message.
		const SHORT = `${HEAD}Vox     | G | C |\nVox.Mel | {G4} / {B4} |\n`;
		const m = layoutChart(SHORT, OFF);
		expect(m.blocks[0]).toEqual(layoutChart(SHORT).blocks[0]);
		expect(systemsOf(m)[0]?.rows.map((r) => `${r.label}:${r.row.kind}`)).toEqual([
			"Vox:row",
			"Vox.Mel:error",
		]);
	});

	test("a melody line with a slot the grid cannot read stays, its message in place", () => {
		const UNREAD = `${HEAD}Vox     | G | C |\nVox.Mel | {G9} / {B4} | {C5} |\n`;
		const m = layoutChart(UNREAD, OFF);
		expect(m.blocks[0]).toEqual(layoutChart(UNREAD).blocks[0]);
		expect(renderChart(UNREAD, OFF)).toContain("octaves run 0–8");
	});
});

describe("melody true is today's output", () => {
	const dir = join(import.meta.dir, "../../../examples");
	const texts = [
		LEAD,
		...readdirSync(dir)
			.filter((f) => f.endsWith(".chart.md"))
			.map((f) => readFileSync(join(dir, f), "utf8")),
	];
	test("the model and the markup do not change", () => {
		for (const t of texts) {
			expect(layoutChart(t, { melody: true })).toEqual(layoutChart(t, {}));
			expect(renderChart(t, { melody: true })).toBe(renderChart(t));
		}
	});
});

const dflt = (t: string) => layoutChart(t);
const off = (t: string) => layoutChart(t, OFF);
const chartTag = (html: string) => /<div class="bm-chart"[^>]*>/.exec(html)?.[0] ?? "";

describe("melody: false: fix round 1", () => {
	test("several singing lines with one flawed: the default model", () => {
		const SATB = `part: S = Soprano, instrument: voice
part: A = Alto, instrument: voice
time: 4/4

S | {E9}:la / {G4}:la / | {D4}:la / / / |
A | {C4}:lo / {E4}:lo / | {B3}:lo / / / |
`;
		expect(off(SATB)).toEqual(dflt(SATB));
		const SHORT = SATB.replace(
			"S | {E9}:la / {G4}:la / | {D4}:la / / / |",
			"S | {E4}:la / {G4}:la / |",
		);
		expect(off(SHORT)).toEqual(dflt(SHORT));
	});

	test("every line sings: the default model", () => {
		const CHOIR = `part: S = Soprano, instrument: voice
part: A = Alto, instrument: voice
time: 4/4

S | {E4}:la / {G4}:la / | {D4}:la / / / |
A | {C4}:lo / {E4}:lo / | {B3}:lo / / / |
`;
		expect(off(CHOIR)).toEqual(dflt(CHOIR));
	});

	test("a melody line alone in a one-row system: the default model", () => {
		const ONLY = `part: Vox = Voice, instrument: voice
time: 4/4

Vox.Mel | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
		// The part's lines are "" and Mel, and the second section writes only Mel: a one-row system.
		const SYS = `part: Vox = Voice, instrument: voice
time: 4/4

## A
Vox | C | G |
Vox.Mel | {E4} / {G4} / | {D4} / / / |

## B
Vox.Mel | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
		expect(off(ONLY)).toEqual(dflt(ONLY));
		expect(dflt(SYS).blocks[1]?.items[0]?.kind).toBe("system");
		expect(off(SYS).blocks[1]).toEqual(dflt(SYS).blocks[1]);
	});

	test("when the only other line is an error the block is the default's", () => {
		const ONE = `part: Vox = Voice, instrument: voice
time: 4/4

Vox | Cmaj7 % | G |
Vox.Mel | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
		const TWO = `part: Gtr = Guitar
part: Vox = Voice, instrument: voice
time: 4/4

Gtr | C % | G |
Vox | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
		for (const t of [ONE, TWO]) expect(off(t).blocks).toEqual(dflt(t).blocks);
	});

	const INTRO = `# Amazing Grace
part: Vox = Voice, instrument: voice
key: G, time: 3/4, tempo: 80

## Intro
Vox       | G | D |

## Verse
Vox       | [1/4] D    | G                | G / G7      |
Vox.Mel   | [1/4] {D4} | {G4} / {B4}_{G4} | {B4} / {A4} |
lyrics 1: | A-         | maz- / ing_/     | grace / how |
`;
	const PLAIN_INTRO = `# Amazing Grace
key: G, time: 3/4, tempo: 80

## Intro
| G | D |

## Verse
| [1/4] D    | G                | G / G7      |
lyrics 1: | A-         | maz- / ing_/     | grace / how |
`;

	test("a lead sheet with a chords-only intro draws plain rows throughout", () => {
		const m = off(INTRO);
		for (const b of m.blocks) for (const i of b.items) expect(i.kind).toBe("row");
	});

	test("the chart's opening tag is the plain chart's", () => {
		expect(chartTag(renderChartUnwrapped(INTRO, OFF))).toBe(
			chartTag(renderChartUnwrapped(PLAIN_INTRO)),
		);
		expect(chartTag(renderChartUnwrapped(LEAD, OFF))).not.toContain("data-parts");
	});

	test("a band chart keeps labels only for rows that draw", () => {
		const BAND = `part: Gtr = Guitar
part: Vox = Voice, instrument: voice
time: 4/4

Gtr | C | G |
Vox.Mel | {E4} / {G4} / | {D4} / / / |
`;
		const tag = chartTag(renderChartUnwrapped(BAND, OFF));
		expect(tag).toContain("--bm-label-chars:3");
	});

	test("a singing line that writes chord names stays, and so do the diagrams", () => {
		const CHORDS = `part: Pno = Piano
part: Vox = Voice, instrument: voice
time: 4/4

Pno | {C3 E3 G3} | {G2 B2 D3} |
Vox | {E4} / Am7 / | D7 / {D4} / |
lyrics 1: | la / / / | / / lo / |
`;
		expect(off(CHORDS)).toEqual(dflt(CHORDS));
		const g = { chordDiagrams: "guitar" as const };
		expect(layoutChart(CHORDS, { ...g, melody: false }).diagrams).toEqual(
			layoutChart(CHORDS, g).diagrams,
		);
		expect(layoutChart(CHORDS, g).diagrams.length).toBe(4);
	});

	test("a chord name in a group counts", () => {
		const GROUP = `part: Pno = Piano
part: Vox = Voice, instrument: voice
time: 4/4

Pno | {C3 E3 G3} | {G2 B2 D3} |
Vox | {E4} / [Am7 D7] / | {D4} / / / |
lyrics 1: | la / / / | la |
`;
		expect(off(GROUP)).toEqual(dflt(GROUP));
	});

	test("a lead sheet with repeats and endings matches its plain twin in bar numbers, marks and endings", () => {
		const L = `part: Vox = Voice, instrument: voice
time: 4/4

Vox       |: C | G |
Vox.Mel   |: {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
Vox       |1 C :|
Vox.Mel   |1 {E4} / / / :|
lyrics 1: | la |
Vox       |2 F |
Vox.Mel   |2 {F4} / / / |
lyrics 1: | la |
`;
		const P = `time: 4/4

|: C | G |
lyrics 1: | la / la / | la |
|1 C :|
lyrics 1: | la |
|2 F |
lyrics 1: | la |
`;
		const mark = (r: RowItem) => ({
			barNumber: r.barNumber,
			opens: r.opens,
			closes: r.closes,
			repeat: r.repeat,
			ending: r.ending,
		});
		const a = off(L);
		expect(a.diagnostics).toEqual(dflt(L).diagnostics);
		expect(rowsOf(a).map(mark)).toEqual(rowsOf(layoutChart(P)).map(mark));
	});

	test("the words sit on the beats they are sung on", () => {
		const T = `part: Gtr = Guitar
part: Vox = Voice, instrument: voice
time: 4/4

Gtr       | C | G |
Vox       | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
		const row = systemsOf(off(T))[0]?.rows[0]?.row as RowItem;
		const words = row.lyrics?.[0]?.cells.map((bar) =>
			bar.map((place) => place.map((s) => (s.kind === "sung" ? s.parts.join("") : s.kind))),
		);
		// Two places in the first bar (la on each beat that starts a note), one in the second.
		expect(words).toEqual([[["la"], ["la"]], [["la"]]]);
	});

	test("a part with no line written in a system keeps its tacet row", () => {
		const T = `part: Gtr = Guitar
part: Vox = Voice, instrument: voice
part: Bs = Bass
time: 4/4

Gtr       | C | G |
Vox       | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
		const rows = systemsOf(off(T))[0]?.rows ?? [];
		expect(rows.map((p) => p.label)).toEqual(["Gtr", "Bs"]);
		const bass = rows[1]?.row as RowItem | undefined;
		expect(bass?.cells.every((c) => c.kind !== "slots" || c.tacet)).toBe(true);
	});

	test("diagnostics and diagrams are the default's", () => {
		const g = { chordDiagrams: "guitar" as const };
		const dir = join(import.meta.dir, "../../../examples");
		const texts = [
			LEAD,
			...readdirSync(dir)
				.filter((f) => f.endsWith(".chart.md"))
				.map((f) => readFileSync(join(dir, f), "utf8")),
		];
		for (const t of texts) {
			const a = layoutChart(t, { ...g, melody: false });
			const b = layoutChart(t, g);
			expect(a.diagnostics).toEqual(b.diagnostics);
			expect(a.diagrams).toEqual(b.diagrams);
		}
	});

	test("part: draws one part with melody: false", () => {
		const T = `part: Gtr = Guitar
part: Vox = Voice, instrument: voice
time: 4/4

Gtr       | C | G |
Vox       | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
		const m = layoutChart(T, { part: "Vox", melody: false });
		expect(m.diagnostics).toEqual(layoutChart(T, { part: "Vox" }).diagnostics);
		expect(JSON.stringify(m.blocks)).toContain("la");
	});

	test("a replay of a lead-sheet section draws plain rows", () => {
		const R = `${LEAD}
## Verse
`;
		const m = off(R);
		expect(m.blocks.length).toBe(2);
		for (const b of m.blocks) for (const i of b.items) expect(i.kind).toBe("row");
	});
});

const same = (t: string) => expect(renderChartUnwrapped(t, OFF)).toBe(renderChartUnwrapped(t));

describe("melody: false: fix round 2", () => {
	const PNO = `part: Pno = Piano
time: 4/4

## A
Pno.RH | {C5} / / / | {B4} / / / |
Pno.LH | {C3} / / / | {G2} / / / |

## B
Pno.LH | {C3} / / / | {G2} / / / |

## C
Pno.RH | {E5} / / / | {D5} / / / |
`;
	test("a chart with no melody keeps its labelled lone lines, byte for byte", () => {
		expect(off(PNO)).toEqual(dflt(PNO));
		same(PNO);
		const GTR = `part: Gtr = Guitar
time: 4/4

## A
Gtr | C | G |
Gtr.Lead | {E4} / / / | {D4} / / / |

## B
Gtr.Lead | {E4} / / / | {D4} / / / |

## C
Gtr | F | G |
`;
		// No part sings: the lone bare line in C keeps its system and its label too.
		expect(off(GTR)).toEqual(dflt(GTR));
		same(GTR);
		const BAND = `part: Pno = Piano
part: Bs = Bass
time: 4/4

Pno.RH | {C5} / / / | {B4} / / / |
Pno.LH | {C3} / / / | {G2} / / / |
Bs | C | G |
`;
		expect(layoutChart(BAND, { part: "Pno", melody: false })).toEqual(
			layoutChart(BAND, { part: "Pno" }),
		);
	});

	test("a lead sheet's lone Vox.Harm keeps its label; the lone bare Vox collapses", () => {
		const T = `part: Vox = Voice, instrument: voice
time: 4/4

## A
Vox | C | G |
Vox.Mel | {E4} / {G4} / | {D4} / / / |

## B
Vox.Harm | {C4} / / / | {B3} / / / |

## C
Vox | G | D |
`;
		const m = off(T);
		expect(m.blocks[1]?.items[0]?.kind).toBe("system");
		expect(m.blocks[1]).toEqual(dflt(T).blocks[1]);
		expect(m.blocks[2]?.items[0]?.kind).toBe("row");
	});

	test("charts with only tutti lines keep the default's gutter", () => {
		for (const decl of [
			"part: Gtr = Guitar\npart: Bs = Bass",
			"part: Gtr = Guitar\npart: Vox = Voice, instrument: voice",
		]) {
			const t = `${decl}\ntime: 4/4\n\n| C | G |\n`;
			expect(off(t)).toEqual(dflt(t));
			expect(chartTag(renderChartUnwrapped(t, OFF))).toContain("data-parts");
			same(t);
		}
	});

	test("whenever the option changes nothing in the model, the markup is the default's", () => {
		const dir = join(import.meta.dir, "../../../examples");
		const texts = [
			LEAD,
			PNO,
			...readdirSync(dir)
				.filter((f) => f.endsWith(".chart.md"))
				.map((f) => readFileSync(join(dir, f), "utf8")),
		];
		for (const t of texts) if (JSON.stringify(off(t)) === JSON.stringify(dflt(t))) same(t);
	});

	const MIXED_NOTES = `part: Pno = Piano
part: Vox = Voice, instrument: voice
time: 4/4

Pno | {C3 E3 G3} | {G2 B2 D3} |
Vox | {E4} / / / | Am7 |
lyrics 1: | la | / |
Pno | {C3 E3 G3} | {G2 B2 D3} |
Vox | % | {D4} / / / |
lyrics 1: | / | la |
`;
	test("a % that copies a chord bar makes its line not a melody line", () => {
		expect(off(MIXED_NOTES)).toEqual(dflt(MIXED_NOTES));
	});

	test("N.C., a bar of N.C. and ? keep a singing line; rests and a hold bar do not", () => {
		const base = (vox: string) => `part: Pno = Piano
part: Vox = Voice, instrument: voice
time: 4/4

Pno | {C3 E3 G3} | {G2 B2 D3} |
Vox | ${vox} |
lyrics 1: | la | la |
`;
		for (const v of [
			"{E4} / N.C. / | {D4} / / /",
			"{E4} / / / | N.C.",
			"{E4} / ? / | {D4} / / /",
		]) {
			const t = base(v);
			expect(off(t)).toEqual(dflt(t));
		}
		for (const v of ["{E4} / / / | /", "{E4} / -- / | {D4} / / /"]) {
			const t = base(v);
			expect(systemsOf(off(t))[0]?.rows.map((p) => p.label)).toEqual(["Pno"]);
		}
	});

	test("a chord name inside a group keeps the line", () => {
		const t = `part: Pno = Piano
part: Vox = Voice, instrument: voice
time: 4/4

Pno | {C3 E3 G3} | {G2 B2 D3} |
Vox | {E4} / Am7_D7 / | {D4} / / / |
lyrics 1: | la / / / | la |
`;
		expect(dflt(t).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(off(t)).toEqual(dflt(t));
	});

	test("a chord name second in a group keeps the line", () => {
		const t = `part: Pno = Piano
part: Vox = Voice, instrument: voice
time: 4/4

Pno | {C3 E3 G3} | {G2 B2 D3} |
Vox | {E4} / {G4}_Am7 / | {D4} / / / |
lyrics 1: | la / / / | la |
`;
		expect(dflt(t).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(off(t)).toEqual(dflt(t));
	});

	test("a bare line that is the singing line stays a system when it stands alone", () => {
		// Vox's bare line sings (its first line); Harm does not. Alone in B, the melody keeps its label.
		const t = `part: Vox = Voice, instrument: voice
time: 4/4

## A
Vox | {E4} / {G4} / | {D4} / / / |
Vox.Harm | {C4} / {E4} / | {B3} / / / |
lyrics 1: | la / la / | la |

## B
Vox | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
		expect(dflt(t).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(off(t).blocks[1]).toEqual(dflt(t).blocks[1]);
	});

	test("part: Vox with melody: false is the default's lone melody; a chord line and a Mel line draw plain rows", () => {
		const T = `part: Gtr = Guitar
part: Vox = Voice, instrument: voice
time: 4/4

Gtr       | C | G |
Vox       | {E4} / {G4} / | {D4} / / / |
lyrics 1: | la / la / | la |
`;
		expect(layoutChart(T, { part: "Vox", melody: false })).toEqual(layoutChart(T, { part: "Vox" }));
		const L = layoutChart(LEAD, { part: "Vox", melody: false });
		expect(items(L).every((i) => i.kind === "row")).toBe(true);
		expect(rowsOf(L)[0]?.lyrics?.length).toBe(2);
	});
});

describe("melody: false: a melisma's held place is not drawn", () => {
	const MEL = `# Amazing Grace
part: Vox = Voice, instrument: voice
key: G, time: 3/4, tempo: 80

## Verse
Vox       | [1/4] D    | G                | G / G7      |
Vox.Mel   | [1/4] {D4} | {G4} / {B4}_{G4} | {B4} / {A4} |
lyrics 1: | A-         | maz- / ing_/     | grace / how |

Vox       | G / /       | D                |
Vox.Mel   | {B4} / {D5} | {B4}_{G4} / /    |
lyrics 1: | I / once    | was_/ /          |
`;
	const TWIN = `# Amazing Grace
key: G, time: 3/4, tempo: 80

## Verse
| [1/4] D    | G                | G / G7      |
lyrics 1: | A-         | maz- / ing   | grace / how |

| G / /       | D                |
lyrics 1: | I / once    | was / /          |
`;
	const verseCells = (m: ChartModel) => rowsOf(m).map((r) => r.lyrics?.map((v) => v.cells));

	test("the lyric rows equal the plain twin's, place for place, with no held place", () => {
		const a = verseCells(off(MEL));
		expect(a).toEqual(verseCells(layoutChart(TWIN)));
		expect(JSON.stringify(a)).not.toContain("held");
		expect(JSON.stringify(verseCells(dflt(MEL)))).toBeDefined();
	});

	test("no extender is drawn with the melody out; the default still draws them", () => {
		const ext = (h: string) => doc(h).querySelectorAll(".bm-extender").length;
		expect(ext(renderChartUnwrapped(MEL, OFF))).toBe(0);
		expect(ext(renderChartUnwrapped(MEL))).toBeGreaterThan(0);
	});

	test("words on no melody are the default's (the parser gives them no held place: it holds only under notes)", () => {
		const T = "time: 4/4\n\n| C | G |\nlyrics: | maz- / ing_/ | la |\n";
		expect(off(T)).toEqual(dflt(T));
		expect(renderChartUnwrapped(T, OFF)).toBe(renderChartUnwrapped(T));
	});

	test("a system whose melody stays keeps its held places, beside one that lost its melody", () => {
		const T = `part: Gtr = Guitar
part: Vox = Voice, instrument: voice
time: 4/4

## A
Gtr | C | G |
Vox | {C4} / {D4}_{D4} / | {D4} / / / |
lyrics 1: | la / ti_/ / | la |

## B
Vox | {C4} / {D4}_{D4} / | {D4} / / / |
lyrics 1: | la / ti_/ / | la |
`;
		const m = off(T);
		expect(m.blocks[1]).toEqual(dflt(T).blocks[1]);
		expect(JSON.stringify(m.blocks[1])).toContain("held");
		expect(JSON.stringify(m.blocks[0])).not.toContain("held");
	});

	test("a bar of only a held syllable draws as an empty bar of one step", () => {
		const T = `part: V = Voice, instrument: voice
time: 4/4

V | C | G | C |
V.Mel | {C4} / {D4}_{D4} / | {D4} / / / | {E4} / / / |
lyrics 1: | la / ti_/ / | / | la |
`;
		const row = rowsOf(off(T))[0];
		expect(row?.lyrics?.[0]?.cells[1]).toEqual([[]]);
		expect(JSON.stringify(row?.lyrics)).not.toContain("held");
	});
});
