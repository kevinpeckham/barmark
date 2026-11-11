/**
 * `@barmark/listen/stages`: each stage of the pipeline on its own, for the
 * bench, which measures them one at a time (design §11). They follow
 * semver, but they are the bench's instruments and may change shape in a
 * minor before 1.0; the root's calls are the stable surface.
 */

export {
	barSeconds,
	type ChartPadBars,
	chartPadBars,
	type PadBar,
	type Pitches,
} from "./align/bars.js";
export { type Dtw, dtwAlign, dtwTable, mapSeconds } from "./align/dtw.js";
export { alignmentFit } from "./align/fit.js";
export { alignPath, type PathResult } from "./align/path.js";
export { alignedPlacements } from "./align/placements.js";
export { renderChartPads, renderWhole } from "./align/render.js";
export { rephaseAlignment } from "./align/rephase.js";
export { alignedTimingMap } from "./align/timing.js";
export { type CombFit, flatEnvelope, jointOnsetComb } from "./comb/comb.js";
export { type EndRepair, repairEnds } from "./comb/ends.js";
export { type GridRephase, rephaseGrid } from "./comb/rephase.js";
export { combSlide } from "./comb/slide.js";
export { phaseLine, trustedSpan } from "./comb/span.js";
export {
	type Chromagram,
	chromaFrameCount,
	chromagram,
	chromaWindow,
} from "./features/chroma.js";
export { fft } from "./features/fft.js";
export { detrend, onsetEnvelope, onsetRate } from "./features/onset.js";
export { audibleSpan } from "./features/sound.js";
export { type BeatSegment, beatChords } from "./grid/beats.js";
export { gridLattice, type Lattice, latticeBeats } from "./grid/lattice.js";
export { type Placement, placeAtStart, placeBarOne } from "./grid/place.js";
export {
	beatChroma,
	checkerboardNovelty,
	noveltyPeaks,
	sectionWitness,
} from "./grid/sections.js";
export { downbeatVote } from "./grid/vote.js";
export { harmonicRhythmWitness, histogramVote, timeZeroWitness } from "./grid/witnesses.js";
export {
	DEFAULTS,
	type FeatureOptions,
	type ListenOptions,
	type OptionScope,
	resolveOptions,
	type Settings,
} from "./options.js";
