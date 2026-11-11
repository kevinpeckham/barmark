/**
 * The timing map of a chart from its alignment (design §6.3): the app's
 * `alignedTimingMap` (`utils/alignedTimingMap.ts`), the bar count read
 * from the parse instead of passed, each entry's `bar` its
 * `PlayedBar.index`.
 */
import { chartHash, checkTimingMap, type TimingMap } from "@barmark/sync";
import type { ChartParse } from "barmark";

/**
 * The chart's timing map from its bar starts (a start per played bar and
 * where the last ends), `source: "aligned"`, `recording.duration` and the
 * `id` when given; null unless it checks clean against `text` (the bar
 * count and the hash fit, the starts in order). The app's
 * `alignedTimingMap`. `parse` is `text`'s; `barStarts` is only read.
 */
export function alignedTimingMap(
	text: string,
	parse: ChartParse,
	barStarts: number[],
	duration: number,
	id: string | undefined,
): TimingMap | null {
	const bars = parse.bars.length;
	const end = barStarts[bars];
	if (bars < 1 || end === undefined) return null;
	const map: TimingMap = {
		format: "barmark-timing",
		version: 1,
		chart: { bars, hash: chartHash(text, parse) },
		recording: id === undefined ? { duration } : { duration, id },
		source: "aligned",
		bars: parse.bars.map((bar, i) => ({ bar: bar.index, start: barStarts[i] as number })),
		end,
	};
	return checkTimingMap(map, { text, parse }).map;
}
