/**
 * `@barmark/listen/features`: a recording's features, made where the audio
 * is (a browser worker, a script) and cached, apart from the grid and the
 * alignment. It imports nothing from `barmark` or `@barmark/sync`.
 */
export type { FeatureOptions } from "../options.js";
export {
	type ChromaPart,
	chromaFeatures,
	FEATURES_VERSION,
	type Features,
	joinFeatures,
	type OnsetPart,
	onsetFeatures,
	readFeatures,
	recordingFeatures,
} from "./features.js";
