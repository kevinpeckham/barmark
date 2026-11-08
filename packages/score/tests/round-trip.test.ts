import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exportMusicXml, importMusicXml } from "@barmark/musicxml";
import { type Music, musicOf } from "./helpers/music.js";
import { loadToolkit } from "./helpers/toolkit.js";

const vrv = await loadToolkit();
const dir = join(import.meta.dir, "../../musicxml/tests/fixtures/import");
const fixtures = readdirSync(dir)
	.filter((f) => f.endsWith(".musicxml"))
	.sort();

type Field = keyof Music;
// fixture -> field -> [original, redrawn]; see FINDINGS.md "What the import fixtures lose".
const KNOWN: Record<string, Partial<Record<Field, [number, number]>>> = {
	"band.musicxml": { notes: [72, 64] },
	"dorico-band.musicxml": { notes: [72, 32], rests: [8, 0], harms: [16, 8] },
	"dorico-hymn.musicxml": { harms: [6, 7] },
	"dorico-piano.musicxml": { notes: [24, 12] },
	"harmony-edges.musicxml": { notes: [5, 28], rests: [2, 0] },
	"hymn.musicxml": { harms: [6, 7] },
	"lead-sheet.musicxml": { harms: [7, 6] },
	"melody-measure-rest.musicxml": { notes: [4, 20], rests: [3, 0] },
	"melody-rest.musicxml": { notes: [4, 20], rests: [3, 0] },
	"part-enters.musicxml": { notes: [12, 48], rests: [4, 12] },
	"piano.musicxml": { notes: [24, 12] },
	"replay-holds.musicxml": { notes: [137, 160], rests: [35, 71], harms: [33, 42] },
	"six-guitars.musicxml": { notes: [18, 9], harms: [18, 3] },
	"trading-fours.musicxml": { notes: [8, 32], rests: [8, 16] },
};
// Fixtures whose import or export refuses: recorded, never skipped.
const REFUSED: Record<string, string> = {};
// Fixtures whose measures or staves differ; the cause is in FINDINGS.md.
const MEASURE_KNOWN: Record<string, [number, number]> = { "replay-holds.musicxml": [16, 20] };
const STAFF_KNOWN: Record<string, [number, number]> = {
	"band.musicxml": [4, 3],
	"dorico-band.musicxml": [4, 1],
	"dorico-piano.musicxml": [2, 1],
	"part-enters.musicxml": [2, 3],
	"piano.musicxml": [2, 1],
	"six-guitars.musicxml": [6, 1],
	"trading-fours.musicxml": [2, 3],
};

const fields: Field[] = ["notes", "rests", "harms", "verses"];
const read = (f: string) => readFileSync(join(dir, f), "utf8");
const pair = (known: Record<string, [number, number]>, f: string, was: number): [number, number] =>
	known[f] ?? [was, was];

/** Draws the fixture, then its import exported; null when either refuses. */
function redraw(f: string): { original: Music; again: Music } | null {
	const imported = importMusicXml(read(f));
	const out = imported.text ? exportMusicXml(imported.text) : null;
	if (!out?.ok) return null;
	return { original: musicOf(vrv, read(f)), again: musicOf(vrv, out.xml) };
}

function expectCounts(f: string, original: Music, again: Music) {
	const m = pair(MEASURE_KNOWN, f, original.measures);
	const s = pair(STAFF_KNOWN, f, original.staves);
	expect([f, original.measures, again.measures]).toEqual([f, ...m]);
	expect([f, original.staves, again.staves]).toEqual([f, ...s]);
	for (const k of fields) {
		const [was, now] = KNOWN[f]?.[k] ?? [original[k], original[k]];
		expect([f, k, original[k], again[k]]).toEqual([f, k, was, now]);
	}
}

test("finds the import fixtures", () => expect(fixtures.length).toBeGreaterThan(10));

test("every pinned fixture exists", () => {
	for (const table of [KNOWN, MEASURE_KNOWN, STAFF_KNOWN, REFUSED])
		for (const f of Object.keys(table)) expect(fixtures).toContain(f);
});

test.each(fixtures)("%s re-draws with the same music", (f) => {
	const drawn = redraw(f);
	expect(drawn === null, `${f} refusal recorded in REFUSED`).toBe(f in REFUSED);
	if (drawn) expectCounts(f, drawn.original, drawn.again);
});
