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
		// The melody's `{B4}_{G4}` splits the third beat, so the beat grid has six places: maz- on the first beat, ing on the third.
		const bar2 = rows[0]?.lyrics?.[0]?.cells[1];
		expect(bar2).toHaveLength(6);
		expect(bar2?.[0]?.[0]).toMatchObject({ kind: "sung", parts: ["maz"] });
		expect(bar2?.[1]).toEqual([]);
		expect(bar2?.[4]?.[0]).toMatchObject({ kind: "sung", parts: ["ing"] });
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
