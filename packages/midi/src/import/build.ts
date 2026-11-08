/**
 * What sync's builder gets, and what comes back (spec 5.3, 5.7). Sync
 * works in seconds and divides each bar evenly, so it is handed the
 * nominal clock, a quarter as half a second (`tick / ppq / 2`), and the
 * real tempo explicitly; its `tempo-grid-disagree` is then an artefact
 * and is dropped, and so are `path` and `at`, which are nominal. Sync
 * numbers bars as the import does (the pickup is bar 1), since the grid's
 * bars are its bars one for one.
 */
import type { BuildDiagnostic, Detections } from "@barmark/sync";
import { beatsOf, type Meter, parseMeter } from "barmark";
import type { Directives } from "./directives.js";
import { barAt, type Grid } from "./grid.js";
import type { SectionAt } from "./markers.js";
import type { ChordRun } from "./segments.js";
import type { MidiImportDiagnostic } from "./types.js";

const nominal = (grid: Grid, tick: number) => tick / grid.ppq / 2;

/** The bar holding a nominal time (a quarter is half a second). */
const barOfNominal = (grid: Grid, at: number) => barAt(grid, Math.round(at * grid.ppq * 2));

const ticksOf = (m: Meter, ppq: number) => (m.n * 4 * ppq) / m.d;

/**
 * Whether sync writes the grid's pickup as it is: whole beats of the meter
 * after it, at least one and fewer than a bar, in a meter `time:` can
 * write. Sync rounds a pickup to beats, so any other first bar would come
 * back another length, or be dropped (`pickup-ignored`) and its chords
 * with it; it is a bar of its own meter instead.
 */
function syncWritesPickup(grid: Grid): boolean {
	const [pickup, next] = grid.bars;
	if (!grid.pickup || pickup === undefined || next === undefined) return false;
	if (parseMeter(`${next.meter.n}/${next.meter.d}`) === null) return false;
	const beats = (next.start - pickup.start) / (ticksOf(next.meter, grid.ppq) / beatsOf(next.meter));
	return Number.isInteger(beats) && beats >= 1 && beats < beatsOf(next.meter);
}

/** The grid with a pickup only where sync writes it (`syncWritesPickup`); a new grid, the one read unchanged. */
export function withWritablePickup(grid: Grid): Grid {
	return { ...grid, pickup: syncWritesPickup(grid) };
}

const meterOf = (text: string): Meter => {
	const [n = 4, d = 4] = text.split("/").map(Number);
	return { n, d };
};
/** A beat's length in quarters. */
const beatQuarters = (m: Meter) => (4 * m.n) / (m.d * beatsOf(m));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The directives with each tempo counting the beat of the meter sync
 * writes: where the file's meter is one `time:` can't write, sync drops it
 * and keeps the meter before (4/4 at the start), so a tempo in the
 * dropped meter's beat (255/16 at 120 qpm is 480) is restated in that one.
 */
function tempoForSync(directives: Directives): Pick<Directives, "tempo" | "changes"> {
	let file = meterOf(directives.meter ?? "4/4");
	let sync = parseMeter(directives.meter ?? "4/4") ?? { n: 4, d: 4 };
	const restate = (bpm: number) =>
		parseMeter(`${file.n}/${file.d}`) !== null
			? bpm
			: round2((bpm * beatQuarters(file)) / beatQuarters(sync));
	const tempo = directives.tempo === null ? null : restate(directives.tempo);
	const changes = directives.changes.map((c) => {
		if (c.kind === "meter") {
			file = meterOf(String(c.value));
			sync = parseMeter(String(c.value)) ?? sync;
		}
		return c.kind === "tempo" ? { ...c, value: restate(Number(c.value)) } : c;
	});
	return { tempo, changes };
}

/** The builder's input: bars after the pickup, the pickup's start, runs, directives, sections and title. */
export function detectionsOf(
	grid: Grid,
	runs: ChordRun[],
	directives: Directives,
	sections: SectionAt[],
	title: string | null,
): Detections {
	const at = (tick: number) => nominal(grid, tick);
	const first = grid.pickup ? 1 : 0;
	const d: Detections = {
		grid: { bars: [...grid.bars.slice(first).map((b) => at(b.start)), at(grid.end)] },
		chords: { runs: runs.map((r) => ({ start: at(r.start), end: at(r.end), symbol: r.symbol })) },
		key: directives.key,
		...tempoForSync(directives),
		sections: sections.map((s) => ({ name: s.name, start: at(s.tick) })),
	};
	if (directives.meter !== null) d.meter = directives.meter;
	if (grid.pickup) d.pickup = { start: at(grid.bars[0]?.start ?? 0) };
	if (title !== null) d.title = title;
	return d;
}

/**
 * Sync's messages that name what they were given (a section's name, a
 * symbol, a key, a run's index or seconds): each is said without it, so a message
 * carries no value read from the file and the report counts them as one.
 */
const PLAIN: Partial<Record<BuildDiagnostic["code"], string>> = {
	"section-marks-stripped": "a marker's name was changed so it reads as a plain heading",
	"section-unnamed": "a marker with no name once its marks are removed is left out",
	"label-unknown": "a chord symbol sync doesn't understand is written as ?",
	"run-invalid": "a chord run sync couldn't use was dropped",
	"outside-bars": "chords outside the bars were dropped",
	"key-respelled": "a key signature is written as its enharmonic key",
};

/** The nominal start of what a path names in the input: `sections[i]`, `changes[i]`, `chords.runs[i]`. */
function startOf(path: string | undefined, input: Detections): number | undefined {
	const m = /^(sections|changes|chords\.runs)\[(\d+)\]$/.exec(path ?? "");
	if (!m) return undefined;
	const list =
		m[1] === "sections" ? input.sections : m[1] === "changes" ? input.changes : input.chords.runs;
	return list?.[Number(m[2])]?.start;
}

/**
 * Sync's diagnostic as the import's: its code, severity and bar, or, when
 * it gives none, the bar of what its `path` names; `path` and `at` (both
 * nominal) dropped, and `tempo-grid-disagree` too.
 */
export function mapBuild(
	d: BuildDiagnostic,
	grid: Grid,
	input: Detections,
): MidiImportDiagnostic | null {
	if (d.code === "tempo-grid-disagree") return null;
	const out: MidiImportDiagnostic = {
		severity: d.severity,
		code: d.code,
		message: PLAIN[d.code] ?? d.message,
	};
	const at = startOf(d.path, input);
	const bar = d.bar ?? (at === undefined ? undefined : barOfNominal(grid, at));
	if (bar !== undefined) out.bar = bar;
	return out;
}
