import type { ChartParse } from "barmark";
import { chartHash, type TimingMap } from "../timing/index.js";
import type { Input } from "./input.js";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** The recording as given, keeping only an id that is a string and a duration that is finite and not negative. */
function recordingOf(recording: unknown): TimingMap["recording"] | null {
	if (!isRecord(recording)) return null;
	const copy: NonNullable<TimingMap["recording"]> = {};
	if (typeof recording.id === "string") copy.id = recording.id;
	if (
		typeof recording.duration === "number" &&
		Number.isFinite(recording.duration) &&
		recording.duration >= 0
	)
		copy.duration = recording.duration;
	return Object.keys(copy).length > 0 ? copy : null;
}

/**
 * The builder's own map: every bar once in order (a pickup is bar 1), no
 * `beats`, no `end`, no `ref`, source `detected`.
 */
export function timingOf(
	parse: ChartParse,
	input: Input,
	chart: string,
	recording: unknown,
): TimingMap {
	const map: TimingMap = {
		format: "barmark-timing",
		version: 1,
		chart: { bars: parse.bars.length, hash: chartHash(chart, parse) },
		source: "detected",
		bars: input.bars.map((bar, i) => ({ bar: i + 1, start: bar.start })),
		end: (input.bars.at(-1) as { end: number }).end,
	};
	const copy = recordingOf(recording);
	if (copy) map.recording = copy;
	return map;
}
