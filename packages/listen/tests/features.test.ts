import { describe, expect, test } from "bun:test";
import {
	chromaFeatures,
	FEATURES_VERSION,
	type Features,
	joinFeatures,
	onsetFeatures,
	readFeatures,
	recordingFeatures,
} from "../src/features/index.js";
import type { Ok, Refused } from "../src/result.js";
import { concat, silence, sine } from "./helpers/audio.js";
import { featuresOf } from "./helpers/features.js";
import { seeded } from "./helpers/seeded.js";

const RATE = 22050;

function value<T>(r: Ok<T> | Refused): T {
	if (!r.ok) throw new Error(`refused: ${r.refusals.map((p) => p.message).join(" ")}`);
	return r.value;
}

/** The reasons a result refused for; [] when it did not. */
const reasons = (r: { ok: boolean; refusals?: { reason: string }[] }) =>
	r.ok ? [] : (r.refusals ?? []).map((p) => p.reason);

/** The per-element `Object.is` of two float arrays. */
function sameFloats(a: Float32Array, b: Float32Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
	return true;
}

/** Three seconds of noise, a chord and silence: enough frames of both kinds. */
function song(rate: number): Float32Array {
	const rand = seeded(7);
	const noise = Float32Array.from({ length: rate }, () => 0.2 * (rand() * 2 - 1));
	return concat(silence(0.3, rate), sine(220, 1.2, rate, 0.5), noise, silence(0.5, rate));
}

describe("recordingFeatures", () => {
	test("equals joinFeatures of chromaFeatures and onsetFeatures, field by field", () => {
		const x = song(RATE);
		const whole = value(recordingFeatures(x, RATE));
		const joined = value(
			joinFeatures(
				RATE,
				x.length / RATE,
				value(chromaFeatures(x, RATE)),
				value(onsetFeatures(x, RATE)),
			),
		);
		expect(whole.format).toBe("barmark-listen-features");
		expect(whole.version).toBe(FEATURES_VERSION);
		expect(FEATURES_VERSION).toBe(1);
		for (const key of Object.keys(joined) as (keyof Features)[]) {
			const [a, b] = [whole[key], joined[key]];
			if (a instanceof Float32Array && b instanceof Float32Array)
				expect(sameFloats(a, b)).toBe(true);
			else expect(a).toEqual(b);
		}
		expect(Object.keys(whole).sort()).toEqual(Object.keys(joined).sort());
		expect(whole.duration).toBe(x.length / RATE);
		expect(whole.chroma.length).toBe(whole.frames * 12);
		expect(whole.frames).toBeGreaterThan(0);
		expect(whole.onset.length).toBeGreaterThan(0);
	});

	test("sound records the options used; a 0.5 floor moves firstSound on a fade-in", () => {
		const fade = sine(330, 2, RATE).map((v, i) => (v * i) / (2 * RATE));
		const x = concat(fade, sine(330, 1, RATE));
		const plain = value(recordingFeatures(x, RATE));
		expect(plain.sound).toEqual({ floor: 0.02, windowSec: 0.05 });
		const high = value(recordingFeatures(x, RATE, { ALIGNMENT_SOUND_FLOOR: 0.5 }));
		expect(high.sound).toEqual({ floor: 0.5, windowSec: 0.05 });
		expect(high.firstSound).toBeGreaterThan(plain.firstSound + 0.5);
		const part = value(chromaFeatures(x, RATE, { ALIGNMENT_SOUND_WINDOW_SEC: 0.1 }));
		expect(part.sound).toEqual({ floor: 0.02, windowSec: 0.1 });
	});

	test("hop and fps follow from the rate at 8 to 96 kHz", () => {
		for (const rate of [8000, 16000, 22050, 44100, 48000, 96000]) {
			const f = value(recordingFeatures(sine(440, 0.5, rate), rate));
			expect(readFeatures(f).ok).toBe(true);
		}
	});

	test("the result survives structuredClone and passes readFeatures after it", () => {
		const f = value(recordingFeatures(song(44100), 44100));
		const clone = structuredClone(f);
		const read = readFeatures(clone);
		expect(read.ok).toBe(true);
		expect(value(read)).toBe(clone);
		expect(sameFloats(clone.chroma, f.chroma)).toBe(true);
		expect(sameFloats(clone.onset, f.onset)).toBe(true);
	});
});

describe("readFeatures", () => {
	test("readFeatures refuses a record whose hop or fps does not follow from its rate", () => {
		const real = value(recordingFeatures(song(RATE), RATE));
		const json = JSON.parse(JSON.stringify(real));
		const nanOnset = Float32Array.from(real.onset);
		nanOnset[3] = Number.NaN;
		const cases: [string, unknown, string][] = [
			["relabelled 48 kHz", { ...real, sampleRate: 48000 }, "features-invalid"],
			["hopSec nudged", { ...real, hopSec: real.hopSec + 1e-12 }, "features-invalid"],
			["fps nudged", { ...real, fps: real.fps * (1 + 1e-12) }, "features-invalid"],
			["plain arrays after JSON", json, "features-invalid"],
			["chroma as a plain array", { ...real, chroma: [...real.chroma] }, "features-invalid"],
			["version 0", { ...real, version: 0 }, "features-version"],
			["frames off by one", { ...real, frames: real.frames + 1 }, "features-invalid"],
			["frames off by one, down", { ...real, frames: real.frames - 1 }, "features-invalid"],
			["NaN in onset", { ...real, onset: nanOnset }, "features-invalid"],
			["firstSound past duration", { ...real, firstSound: real.duration + 1 }, "features-invalid"],
			["lastSound past duration", { ...real, lastSound: real.duration + 1 }, "features-invalid"],
			["negative firstSound", { ...real, firstSound: -0.1 }, "features-invalid"],
			["floor out of range", { ...real, sound: { floor: 0, windowSec: 0.05 } }, "features-invalid"],
			[
				"window out of range",
				{ ...real, sound: { floor: 0.02, windowSec: 2 } },
				"features-invalid",
			],
			["no sound", { ...real, sound: undefined }, "features-invalid"],
			["another format", { ...real, format: "x" }, "features-invalid"],
			["another format and version", { ...real, format: "x", version: 9 }, "features-invalid"],
			["rate out of range", { ...real, sampleRate: 4000 }, "features-invalid"],
			["NaN duration", { ...real, duration: Number.NaN }, "features-invalid"],
			["Float64Array onset", { ...real, onset: Float64Array.from(real.onset) }, "features-invalid"],
			[
				"fractional frames",
				{ ...real, frames: 0.5, chroma: new Float32Array(6) },
				"features-invalid",
			],
			["a class instance", Object.assign(Object.create({ x: 1 }), real), "features-invalid"],
			["null", null, "features-invalid"],
			["a string", "x", "features-invalid"],
			["an array", [], "features-invalid"],
			["an empty object", {}, "features-invalid"],
			["undefined", undefined, "features-invalid"],
		];
		for (const [name, input, reason] of cases) {
			let r: ReturnType<typeof readFeatures> | undefined;
			expect(() => {
				r = readFeatures(input);
			}, name).not.toThrow();
			expect([name, r ? reasons(r) : "threw"]).toEqual([name, [reason]]);
		}
	});

	test("returns the same record, no copy", () => {
		const f = featuresOf({ duration: 2 });
		expect(value(readFeatures(f))).toBe(f);
	});

	test("a synthetic record from featuresOf passes, at 22,050 Hz and 48 kHz", () => {
		expect(readFeatures(featuresOf({ duration: 3 })).ok).toBe(true);
		expect(readFeatures(featuresOf({ duration: 3, sampleRate: 48000 })).ok).toBe(true);
		expect(readFeatures(featuresOf({ duration: 0 })).ok).toBe(true);
	});
});

describe("joinFeatures", () => {
	const x = song(RATE);
	const chroma = value(chromaFeatures(x, RATE));
	const onset = value(onsetFeatures(x, RATE));
	const d = x.length / RATE;

	test("refuses parts that do not follow from the rate or each other", () => {
		const cases: [string, ReturnType<typeof joinFeatures>][] = [
			["another rate", joinFeatures(48000, d, chroma, onset)],
			["frames off", joinFeatures(RATE, d, { ...chroma, frames: chroma.frames + 1 }, onset)],
			["fps off", joinFeatures(RATE, d, chroma, { ...onset, fps: onset.fps + 1e-9 })],
			["hop off", joinFeatures(RATE, d, { ...chroma, hopSec: chroma.hopSec * 2 }, onset)],
			["NaN duration", joinFeatures(RATE, Number.NaN, chroma, onset)],
			["negative duration", joinFeatures(RATE, -1, chroma, onset)],
			["junk parts", joinFeatures(RATE, d, null as never, undefined as never)],
		];
		for (const [name, r] of cases) expect([name, reasons(r)]).toEqual([name, ["features-invalid"]]);
	});
});

describe("feature inputs", () => {
	const fns = {
		recordingFeatures: (s: unknown, r: unknown, o?: unknown) =>
			recordingFeatures(s as Float32Array, r as number, o as never),
		chromaFeatures: (s: unknown, r: unknown, o?: unknown) =>
			chromaFeatures(s as Float32Array, r as number, o as never),
		onsetFeatures: (s: unknown, r: unknown) => onsetFeatures(s as Float32Array, r as number),
	};
	const tone = sine(440, 0.5, RATE);
	const withNaN = Float32Array.from(tone);
	withNaN[100] = Number.NaN;
	const withInf = Float32Array.from(tone);
	withInf[5] = Number.POSITIVE_INFINITY;

	test("invalid-input for bad samples and rates, naming the field, never a throw", () => {
		const cases: [string, unknown, unknown, string][] = [
			["empty samples", new Float32Array(0), RATE, "samples"],
			["a NaN sample", withNaN, RATE, "samples"],
			["an Infinity sample", withInf, RATE, "samples"],
			["a Float64Array", Float64Array.from(tone), RATE, "samples"],
			["a plain array", [...tone], RATE, "samples"],
			["no samples", undefined, RATE, "samples"],
			["rate 7999", tone, 7999, "sampleRate"],
			["rate 384001", tone, 384001, "sampleRate"],
			["rate NaN", tone, Number.NaN, "sampleRate"],
			["rate Infinity", tone, Number.POSITIVE_INFINITY, "sampleRate"],
			["rate 0", tone, 0, "sampleRate"],
			["rate as a string", tone, "22050", "sampleRate"],
		];
		for (const [fname, fn] of Object.entries(fns))
			for (const [name, samples, rate, field] of cases) {
				let r: Ok<unknown> | Refused | undefined;
				expect(() => {
					r = fn(samples, rate);
				}, `${fname}: ${name}`).not.toThrow();
				const refusals = r && !r.ok ? r.refusals : [];
				expect([fname, name, refusals.map((p) => [p.reason, p.detail?.field])]).toEqual([
					fname,
					name,
					[["invalid-input", field]],
				]);
			}
	});

	test("the edges of the rate range are accepted", () => {
		expect(recordingFeatures(sine(440, 0.5, 8000), 8000).ok).toBe(true);
		expect(onsetFeatures(new Float32Array(100), 384000).ok).toBe(true);
	});

	test("an unknown option or a comb option is invalid-option", () => {
		for (const options of [
			{ NOPE: 1 },
			{ COMB_RANGE_FRACTION: 0.1 },
			{ ALIGNMENT_SOUND_FLOOR: 0 },
		]) {
			expect(reasons(recordingFeatures(tone, RATE, options as never))).toEqual(["invalid-option"]);
			expect(reasons(chromaFeatures(tone, RATE, options as never))).toEqual(["invalid-option"]);
		}
	});
});
