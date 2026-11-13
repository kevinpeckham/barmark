/**
 * `@barmark/listen`: a recording to a chart, and a chart to a recording.
 * The calls (`findGrid`, `alignChart`, `chartFromRecording`,
 * `gridFromBeats`, `chartFromBeats`, and the features API re-exported
 * from `./features`), the options and the types.
 * Nothing from `@barmark/sync` is re-exported: its types and its
 * `rehashTiming` are imported from sync.
 */

export type { AlignedChart, AlignInput } from "./align/align.js";
export { alignChart } from "./align/align.js";
export type { Fit } from "./align/fit.js";
export type { Alignment } from "./align/path.js";
export type { Placements } from "./align/placements.js";
export type { BeatsInput, BeatsReading, TrackedGrid } from "./beats/grid.js";
export { gridFromBeats } from "./beats/grid.js";
export type { BeatsMeter } from "./beats/label.js";
export type { BeatsChart, BeatsChartInput } from "./beats/pipeline.js";
export { chartFromBeats } from "./beats/pipeline.js";
export * from "./features/index.js";
export type { ListenChordRuns } from "./grid/beats.js";
export type { Declared, GridInput, GridReading, PlacedGrid } from "./grid/grid.js";
export { findGrid } from "./grid/grid.js";
export type { Witness } from "./grid/witnesses.js";
export type { DownbeatWeights, ListenOptions, OptionScope, Settings } from "./options.js";
export { DEFAULTS, resolveOptions } from "./options.js";
export type { RecordingChart, RecordingInput, Unplaced } from "./pipeline.js";
export { chartFromRecording } from "./pipeline.js";
export type {
	ListenWarning,
	Ok,
	Refusal,
	RefusalReason,
	Refused,
	WarningCode,
} from "./result.js";
