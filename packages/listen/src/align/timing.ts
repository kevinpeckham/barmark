/**
 * The timing map of a chart from its alignment (design §6.3): the app's
 * `alignedTimingMap` (`utils/alignedTimingMap.ts`), the bar count read
 * from the parse instead of passed, each entry's `bar` its
 * `PlayedBar.index`.
 */
import { chartHash, checkTimingMap, type TimingMap } from "@barmark/sync";
import type { ChartParse } from "barmark";

/** `t` held to the recording, [0, `duration`]. */
const clamp = (t: number, duration: number) => Math.min(duration, Math.max(0, t));

/**
 * The lines an aligned map is written from: a start per played bar of
 * `parse` and where the last ends, `barStarts` cut to the bar count. The
 * map and the `bars-cut` warning both read them, so they cannot drift.
 */
export function mapLines(parse: ChartParse, barStarts: number[]): number[] {
	return barStarts.slice(0, parse.bars.length + 1);
}

/**
 * The played bars, `from` (inclusive) to `to` (exclusive), that the clamp
 * to [0, `duration`] leaves some length, from a start per bar and the end
 * (`lines`). A bar has none when it ends at or before 0:00 or starts at
 * or after the recording's end: those lead or trail, and are cut. Only a
 * zero length is cut; a bar that keeps any (a 49 ms stub at the end of a
 * recording cut 1.95 s short) is kept, clamped. `from === to` when
 * nothing is left.
 */
export function keptBars(lines: number[], duration: number): { from: number; to: number } {
	const bars = lines.length - 1;
	let from = 0;
	while (from < bars && (lines[from + 1] as number) <= 0) from++;
	let to = from;
	while (to < bars && (lines[to] as number) < duration) to++;
	return { from, to };
}

/**
 * The chart's timing map from its bar starts (a start per played bar and
 * where the last ends), `source: "aligned"`, `recording.duration` and the
 * `id` when given; null unless it checks against `text` with no error
 * (the bar count and the hash fit, the starts in order). The app's
 * `alignedTimingMap`, with one difference (new in 0.1.1, design §11.3):
 * the map is clamped to the recording, [0, `duration`], where the app
 * keeps the re-phased lines a few milliseconds before 0:00 or past the
 * end; a bar the clamp would leave no length (`keptBars`) is dropped, so
 * the map stops short of the chart where the recording does (sync's
 * check warns of the bars it never names). Null when no bar is left.
 * `parse` is `text`'s; `barStarts` is only read.
 */
export function alignedTimingMap(
	text: string,
	parse: ChartParse,
	barStarts: number[],
	duration: number,
	id: string | undefined,
): TimingMap | null {
	const lines = mapLines(parse, barStarts);
	const bars = parse.bars.length;
	if (bars < 1 || lines.length !== bars + 1) return null;
	const { from, to } = keptBars(lines, duration);
	if (from >= to) return null;
	const map: TimingMap = {
		format: "barmark-timing",
		version: 1,
		chart: { bars, hash: chartHash(text, parse) },
		recording: id === undefined ? { duration } : { duration, id },
		source: "aligned",
		bars: parse.bars.slice(from, to).map((bar, k) => ({
			bar: bar.index,
			start: clamp(lines[from + k] as number, duration),
		})),
		end: clamp(lines[to] as number, duration),
	};
	return checkTimingMap(map, { text, parse }).map;
}
