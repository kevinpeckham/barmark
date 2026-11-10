/**
 * The features record (design 6.1 and 9): what the grid and the alignment
 * read of a recording alone, made once and cached by the host. The app's
 * `recordingFeatures` (the chromagram flattened, and `audibleSpan`) and
 * `alignmentEnvelope` (the onset envelope), split as the app splits them
 * across two workers and joined by `joinFeatures`. Every entry point checks
 * its input before a kernel sees it, and refuses rather than throws.
 */
import { type FeatureOptions, isPlainObject, resolveOptions, type Settings } from "../options.js";
import { type Ok, ok, type Refusal, type Refused, refusal, refused } from "../result.js";
import { chromaFrameCount, chromagram, chromaWindow } from "./chroma.js";
import { onsetEnvelope, onsetFrameCount, onsetRate } from "./onset.js";
import { audibleSpan } from "./sound.js";

/**
 * The features record's version: bumped whenever what the chromagram, the
 * audible span, the onset decimation, the onset envelope or the detrend
 * compute changes (design 9), so a cached record of another version is a
 * miss.
 */
export const FEATURES_VERSION = 1;

const FORMAT = "barmark-listen-features";
const [MIN_RATE, MAX_RATE] = [8000, 384000];
/** The rate the onset envelope is decimated toward, and its hop (`onset.ts`). */
const [ONSET_RATE, ONSET_HOP] = [22050, 256];

/** What the grid and the alignment read of a recording alone (design 6.1). */
export type Features = {
	format: "barmark-listen-features";
	version: typeof FEATURES_VERSION;
	/** The PCM's rate; the chart's render uses it too. */
	sampleRate: number;
	/** `samples.length / sampleRate`. */
	duration: number;
	/** `frames` × 12, each frame L2-normalized (a silent one zero). */
	chroma: Float32Array;
	frames: number;
	hopSec: number;
	/** Spectral flux at about 22,050 Hz, window 2,048, hop 256. */
	onset: Float32Array;
	fps: number;
	/** The first audible window's start; 0 when nothing is audible. */
	firstSound: number;
	/** The last audible window's end; the duration when nothing is. */
	lastSound: number;
	/** The two sound options the span was read with. */
	sound: { floor: number; windowSec: number };
};

/** What `chromaFeatures` makes: the chromagram and the audible span. */
export type ChromaPart = Pick<
	Features,
	"chroma" | "frames" | "hopSec" | "firstSound" | "lastSound" | "sound"
>;

/** What `onsetFeatures` makes: the onset envelope. */
export type OnsetPart = Pick<Features, "onset" | "fps">;

const isRate = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v) && v >= MIN_RATE && v <= MAX_RATE;

const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** The chroma hop at a rate in seconds, as `chromagram` computes it. */
const hopAt = (rate: number) => chromaWindow(rate) / 2 / rate;

/** The onset frames per second at a rate, as `onsetFeatures` computes it: from the rate alone. */
const fpsAt = (rate: number) => rate / Math.max(1, Math.floor(rate / ONSET_RATE)) / ONSET_HOP;

function allFinite(values: Float32Array): boolean {
	for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) return false;
	return true;
}

/** Why `samples` cannot be read, or null when it can. */
function samplesProblem(samples: unknown): string | null {
	if (!(samples instanceof Float32Array)) return "The samples must be a Float32Array.";
	if (samples.length === 0) return "There are no samples to listen to.";
	if (!allFinite(samples)) return "The samples hold a value that is not a finite number.";
	return null;
}

/** The input and option problems of a feature call, or its settings. */
function begin(samples: unknown, sampleRate: unknown, options: unknown): Ok<Settings> | Refused {
	const problems: Refusal[] = [];
	const why = samplesProblem(samples);
	if (why) problems.push(refusal("invalid-input", why, { field: "samples" }));
	if (!isRate(sampleRate)) {
		const rate = typeof sampleRate === "number" ? `${sampleRate} Hz` : typeof sampleRate;
		problems.push(
			refusal("invalid-input", `The sample rate must be from 8,000 to 384,000 Hz, not ${rate}.`, {
				field: "sampleRate",
			}),
		);
	}
	const resolved = resolveOptions(options, "features");
	if (!resolved.ok) problems.push(...resolved.refusals);
	if (problems.length > 0 || !resolved.ok) return refused(problems);
	return ok(resolved.value.settings);
}

/** The chromagram and audible span of checked samples. */
function chromaPart(samples: Float32Array, sampleRate: number, settings: Settings): ChromaPart {
	const { chroma, frames, hopSec } = chromagram(samples, sampleRate);
	const floor = settings.ALIGNMENT_SOUND_FLOOR;
	const windowSec = settings.ALIGNMENT_SOUND_WINDOW_SEC;
	const span = audibleSpan(samples, sampleRate, floor, windowSec);
	return {
		chroma,
		frames,
		hopSec,
		firstSound: span.first,
		lastSound: span.last,
		sound: { floor, windowSec },
	};
}

/** The onset envelope of checked samples: the app's `alignmentEnvelope`. */
function onsetPart(samples: Float32Array, sampleRate: number): OnsetPart {
	const { samples: decimated, rate } = onsetRate(samples, sampleRate);
	return onsetEnvelope(decimated, rate);
}

const invalid = (field: string, message: string): Refusal =>
	refusal("features-invalid", message, { field });

/** Every key a record holds, each of which must be its own, not inherited. */
const KEYS = [
	"format",
	"version",
	"sampleRate",
	"duration",
	"chroma",
	"frames",
	"hopSec",
	"onset",
	"fps",
	"firstSound",
	"lastSound",
	"sound",
] as const;

/** Each required key the record's own, so a polluted `Object.prototype` cannot stand in for one. */
function checkKeys(v: Record<string, unknown>): Refusal | null {
	const missing = KEYS.find((key) => !Object.hasOwn(v, key));
	return missing === undefined ? null : invalid(missing, `The features record has no ${missing}.`);
}

/** The format, the version, the rate and the duration. */
function checkHead(v: Record<string, unknown>): Refusal | null {
	if (v.format !== FORMAT) return invalid("format", `This is not a ${FORMAT} record.`);
	if (v.version !== FEATURES_VERSION) {
		return refusal(
			"features-version",
			`The features are version ${String(v.version)}; this package reads version ${FEATURES_VERSION}, so they must be made again.`,
			{ field: "version" },
		);
	}
	if (!isRate(v.sampleRate))
		return invalid("sampleRate", "The features' sample rate is not from 8,000 to 384,000 Hz.");
	if (!isTime(v.duration))
		return invalid("duration", "The features' duration is not a finite number from 0.");
	return null;
}

/** The two arrays: their type, the chroma's length, and every value finite. */
function checkArrays(v: Record<string, unknown>): Refusal | null {
	const { chroma, onset, frames } = v;
	if (!(chroma instanceof Float32Array))
		return invalid("chroma", "The chroma is not a Float32Array.");
	if (!(onset instanceof Float32Array)) return invalid("onset", "The onset is not a Float32Array.");
	if (typeof frames !== "number" || !Number.isInteger(frames) || frames < 0)
		return invalid("frames", "The chroma's frame count is not a whole number from 0.");
	if (chroma.length !== frames * 12)
		return invalid(
			"frames",
			`The chroma holds ${chroma.length} values, not ${frames} frames of 12.`,
		);
	if (!allFinite(chroma)) return invalid("chroma", "The chroma holds a value that is not finite.");
	if (!allFinite(onset)) return invalid("onset", "The onset holds a value that is not finite.");
	return null;
}

/** The chroma hop and the onset frame rate, each exactly what the record's rate gives. */
function checkTiming(v: Record<string, unknown>): Refusal | null {
	const rate = v.sampleRate as number;
	if (v.hopSec !== hopAt(rate))
		return invalid(
			"hopSec",
			`The chroma's hop is not the ${hopAt(rate)} s that ${rate} Hz gives: the features were made at another rate or changed.`,
		);
	if (v.fps !== fpsAt(rate))
		return invalid(
			"fps",
			`The onset's frame rate is not the ${fpsAt(rate)} that ${rate} Hz gives: the features were made at another rate or changed.`,
		);
	return null;
}

/**
 * The two arrays' lengths, each exactly what the duration at the rate
 * gives, so a truncated record is a miss. The sample count is
 * `round(duration × rate)`: the producer wrote `duration` as
 * `length / rate`, and multiplying back is off from the whole `length` by
 * a rounding error far under half a sample, which the round removes; the
 * frame counts then come by the producers' own arithmetic, compared
 * exactly.
 */
function checkLengths(v: Record<string, unknown>): Refusal | null {
	const rate = v.sampleRate as number;
	const length = Math.round((v.duration as number) * rate);
	const frames = chromaFrameCount(length, rate);
	if (v.frames !== frames)
		return invalid(
			"frames",
			`The chroma has ${String(v.frames)} frames where ${String(v.duration)} s at ${rate} Hz gives ${frames}.`,
		);
	const onsetFrames = onsetFrameCount(length, rate);
	if ((v.onset as Float32Array).length !== onsetFrames)
		return invalid(
			"onset",
			`The onset has ${(v.onset as Float32Array).length} frames where ${String(v.duration)} s at ${rate} Hz gives ${onsetFrames}.`,
		);
	return null;
}

/** The audible span inside the recording. */
function checkSpan(v: Record<string, unknown>): Refusal | null {
	const duration = v.duration as number;
	const { firstSound: first, lastSound: last } = v;
	if (!isTime(first) || first > duration)
		return invalid("firstSound", "The first sound is not inside the recording.");
	if (!isTime(last) || last > duration || last < first)
		return invalid("lastSound", "The last sound is not inside the recording, after the first.");
	return null;
}

/** The two sound options, each the record's own, in their ranges. */
function checkSound(v: Record<string, unknown>): Refusal | null {
	const { sound } = v;
	const own =
		isPlainObject(sound) && Object.hasOwn(sound, "floor") && Object.hasOwn(sound, "windowSec");
	if (!own) return invalid("sound", "The features do not record their sound options.");
	const options = resolveOptions(
		{ ALIGNMENT_SOUND_FLOOR: sound.floor, ALIGNMENT_SOUND_WINDOW_SEC: sound.windowSec },
		"features",
	);
	if (!options.ok) return invalid("sound", "The recorded sound options are out of their ranges.");
	return null;
}

/** The first thing wrong with a record, or null when it is a valid `Features`. */
function checkRecord(v: Record<string, unknown>): Refusal | null {
	for (const check of [
		checkKeys,
		checkHead,
		checkArrays,
		checkTiming,
		checkLengths,
		checkSpan,
		checkSound,
	]) {
		const problem = check(v);
		if (problem) return problem;
	}
	return null;
}

/**
 * The chromagram (flattened) and the audible span of `samples` (mono, at
 * `sampleRate`): the app's `recordingFeatures`, the sound options passed
 * in and recorded. Refuses bad samples, a rate outside 8,000 to 384,000 Hz
 * and any option but the two sound ones.
 */
export function chromaFeatures(
	samples: Float32Array,
	sampleRate: number,
	options?: FeatureOptions,
): Ok<ChromaPart> | Refused {
	const start = begin(samples, sampleRate, options);
	return start.ok ? ok(chromaPart(samples, sampleRate, start.value)) : start;
}

/**
 * The onset envelope of `samples` (mono, at `sampleRate`), decimated to
 * about 22,050 Hz first: the app's `alignmentEnvelope`. Refuses bad samples
 * and a rate outside 8,000 to 384,000 Hz.
 */
export function onsetFeatures(samples: Float32Array, sampleRate: number): Ok<OnsetPart> | Refused {
	const start = begin(samples, sampleRate, undefined);
	return start.ok ? ok(onsetPart(samples, sampleRate)) : start;
}

/**
 * One features record from the two parts, made apart (in two workers, say)
 * from the same samples at `sampleRate`. Refuses (`features-invalid`) parts
 * whose hop or frame rate does not follow from `sampleRate`, a chroma whose
 * length is not its frames × 12, and a duration that is not a finite number
 * from 0.
 */
export function joinFeatures(
	sampleRate: number,
	duration: number,
	chroma: ChromaPart,
	onset: OnsetPart,
): Ok<Features> | Refused {
	if (!isPlainObject(chroma))
		return refused([invalid("chroma", "The chroma part is not an object.")]);
	if (!isPlainObject(onset)) return refused([invalid("onset", "The onset part is not an object.")]);
	const record = {
		format: FORMAT,
		version: FEATURES_VERSION,
		sampleRate,
		duration,
		chroma: chroma.chroma,
		frames: chroma.frames,
		hopSec: chroma.hopSec,
		onset: onset.onset,
		fps: onset.fps,
		firstSound: chroma.firstSound,
		lastSound: chroma.lastSound,
		sound: chroma.sound,
	} as const;
	const problem = checkRecord(record);
	return problem ? refused([problem]) : ok(record);
}

/**
 * Every feature of `samples` (mono, at `sampleRate`): `chromaFeatures` and
 * `onsetFeatures` joined. The samples are read, never written or kept.
 */
export function recordingFeatures(
	samples: Float32Array,
	sampleRate: number,
	options?: FeatureOptions,
): Ok<Features> | Refused {
	const start = begin(samples, sampleRate, options);
	if (!start.ok) return start;
	const duration = samples.length / sampleRate;
	const chroma = chromaPart(samples, sampleRate, start.value);
	return joinFeatures(sampleRate, duration, chroma, onsetPart(samples, sampleRate));
}

/**
 * A features record read back from a cache, checked before anything reads
 * it: `features-version` for another version of this format; otherwise
 * `features-invalid` unless it is a plain object of this format whose rate,
 * duration, two `Float32Array`s, frame count, hop, frame rate, audible span
 * and sound options are each what a record made at its rate holds, every
 * value finite. A record that does not match what it claims is a cache
 * miss. Every key is read as the record's own, never inherited, and a
 * record that throws when read (a getter, a Proxy) is `features-invalid`
 * too. On success it is the same object, not a copy.
 *
 * A record made at 22,050 Hz or more and relabelled to a 2^k multiple of
 * its rate (22,050 Hz called 44,100) passes: the onset decimation and the
 * chroma window both scale by that power of two, so its hops in seconds
 * are unchanged and it stays aligned to the recording. Catching a relabel
 * is the cache key's job, not this check's.
 */
export function readFeatures(value: unknown): Ok<Features> | Refused {
	try {
		if (!isPlainObject(value))
			return refused([invalid("record", "The features record is not a plain object.")]);
		const problem = checkRecord(value);
		return problem ? refused([problem]) : ok(value as Features);
	} catch {
		return refused([invalid("record", "The record could not be read.")]);
	}
}
