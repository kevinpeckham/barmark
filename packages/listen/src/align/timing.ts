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
 * The first bar the clamp to [0, `duration`] would leave no length: one
 * that ends at or before 0:00 (`edge: "start"`) or starts at or after the
 * recording's end (`edge: "end"`); `bar` is its 0-based played bar. Null
 * when every bar keeps some length. Re-phased bar lines sit within
 * milliseconds of the recording's ends, so this is an edge: a bar wholly
 * outside the recording, which no clamp can place.
 */
export function barOutsideRecording(
	barStarts: number[],
	duration: number,
): { bar: number; edge: "start" | "end" } | null {
	for (let i = 0; i + 1 < barStarts.length; i++) {
		const start = clamp(barStarts[i] as number, duration);
		const end = clamp(barStarts[i + 1] as number, duration);
		if (end <= start) return { bar: i, edge: end <= 0 ? "start" : "end" };
	}
	return null;
}

/**
 * The chart's timing map from its bar starts (a start per played bar and
 * where the last ends), `source: "aligned"`, `recording.duration` and the
 * `id` when given; null unless it checks clean against `text` (the bar
 * count and the hash fit, the starts in order). The app's
 * `alignedTimingMap`, with one difference (new in 0.1.1, design §11.3):
 * every start and the end are clamped to the recording, [0, `duration`],
 * where the app keeps the re-phased lines a few milliseconds before 0:00
 * or past the end. A bar the clamp would leave no length
 * (`barOutsideRecording`) gives no map: it is refused, not clamped.
 * `parse` is `text`'s; `barStarts` is only read.
 */
export function alignedTimingMap(
	text: string,
	parse: ChartParse,
	barStarts: number[],
	duration: number,
	id: string | undefined,
): TimingMap | null {
	const bars = parse.bars.length;
	const last = barStarts[bars];
	if (bars < 1 || last === undefined) return null;
	if (barOutsideRecording(barStarts.slice(0, bars + 1), duration)) return null;
	const end = clamp(last, duration);
	const map: TimingMap = {
		format: "barmark-timing",
		version: 1,
		chart: { bars, hash: chartHash(text, parse) },
		recording: id === undefined ? { duration } : { duration, id },
		source: "aligned",
		bars: parse.bars.map((bar, i) => ({
			bar: bar.index,
			start: clamp(barStarts[i] as number, duration),
		})),
		end,
	};
	return checkTimingMap(map, { text, parse }).map;
}
