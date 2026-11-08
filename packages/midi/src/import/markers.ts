/**
 * Sections and the title (spec 5.7). A marker (meta 0x06, any track) is a
 * section name at its tick, placed on the bar line nearest it as sync's
 * builder places it (a tie to the later; never the pickup); two markers
 * on one bar keep the first in file order (`marker-dropped`), since the
 * export writes a heading before a rehearsal mark and sync would keep the
 * later. The title is a format 0 file's track name, or a format 1 file's
 * track 1 name when track 1 has no notes (a conductor track; MuseScore's
 * track 1 is its first part, "Voice", not a title). Sync tidies and
 * repairs both.
 */
import { decodeText } from "../smf/text.js";
import type { Smf } from "../smf/types.js";
import type { Grid } from "./grid.js";
import type { Report } from "./report.js";

const MARKER = 0x06;

/** A section at a tick: a kept marker's bar start, or the grid's end for one past the last bar. */
export type SectionAt = { name: string; tick: number };

/**
 * The index into `grid.bars` of the bar line nearest `tick` (a tie to the
 * later; the pickup never), or `"after"` when the nearest is the grid's end:
 * sync's `snapToBar`, in ticks.
 */
function nearestBar(grid: Grid, tick: number): number | "after" {
	const first = grid.pickup ? 1 : 0;
	const n = grid.bars.length;
	const at = (i: number) => (i < n ? (grid.bars[i]?.start ?? 0) : grid.end);
	if (tick <= at(first)) return first;
	let lo = first;
	let hi = n;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (at(mid) <= tick) lo = mid;
		else hi = mid - 1;
	}
	const nearest = lo >= n || tick >= (at(lo) + at(lo + 1)) / 2 ? lo + 1 : lo;
	return nearest >= n ? "after" : nearest;
}

/**
 * The markers as sections, each at its bar's start (so sync places it on
 * that bar) or at the grid's end (so sync reports it after the last bar).
 * Markers with no text are not sections.
 */
export function sectionsOf(smf: Smf, grid: Grid, report: Report): SectionAt[] {
	const sections: SectionAt[] = [];
	const taken = new Set<number>();
	for (const e of smf.tracks.flat()) {
		if (e.kind !== "meta" || e.type !== MARKER) continue;
		const name = decodeText(e.data);
		if (name.trim() === "") continue;
		const bar = nearestBar(grid, e.tick);
		if (bar === "after") {
			sections.push({ name, tick: grid.end });
			continue;
		}
		if (taken.has(bar)) {
			report.add("marker-dropped", "info", "a second marker on one bar is left out", {
				bar: bar + 1,
			});
			continue;
		}
		taken.add(bar);
		sections.push({ name, tick: grid.bars[bar]?.start ?? 0 });
	}
	return sections;
}

/** The title: a format 0 file's track name, or track 1's in format 1 when it has no notes. */
export function titleOf(smf: Smf, names: (string | null)[]): string | null {
	const first = smf.tracks[0] ?? [];
	if (smf.format === 1 && first.some((e) => e.kind === "on")) return null;
	return names[0] ?? null;
}
