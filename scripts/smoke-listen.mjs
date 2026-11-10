/**
 * Import @barmark/listen as Node sees it and use it: the root, `./features`
 * and `./stages`; a 12-bar synthetic song (pads of sines, a click on every
 * beat) made here, read to a chart with `chartFromRecording`, and that
 * chart aligned back to the song with `alignChart`. Plain Node, so it runs
 * against the local build (scripts/verify-package.ts) and against the copy
 * installed from npm (.github/workflows/release.yml, confirm).
 *
 *   node scripts/smoke-listen.mjs <module> [chart]
 *
 * Locally <module> is the built entry (dist/index.js) and the subpaths are
 * read from the `exports` map in the package.json beside dist/, so a wrong
 * map fails; from npm <module> is the package name and the subpaths are
 * resolved by Node itself. The maps are checked with `@barmark/sync`'s
 * `checkTimingMap` (the sibling build locally, the installed dependency
 * from npm). The chart argument the release workflow passes is not read.
 * Prints the result as JSON; exit 1 if anything differs.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [spec] = process.argv.slice(2);
const local = /^[./]/.test(spec);

let featuresSpec = `${spec}/features`;
let stagesSpec = `${spec}/stages`;
let syncSpec = "@barmark/sync";
if (local) {
	const entry = resolve(spec);
	const pkg = JSON.parse(readFileSync(join(dirname(entry), "..", "package.json"), "utf8"));
	const sub = (name) => pathToFileURL(resolve(dirname(entry), "..", pkg.exports[name].import)).href;
	featuresSpec = sub("./features");
	stagesSpec = sub("./stages");
	syncSpec = pathToFileURL(resolve(dirname(entry), "../../sync/dist/index.js")).href;
}
const main = await import(local ? pathToFileURL(resolve(spec)).href : spec);
const features = await import(featuresSpec);
const stages = await import(stagesSpec);
const { checkTimingMap } = await import(syncSpec);

// The song: 4/4 at 120 bpm, bar one at 1.0 s, 12 bars, a chord a bar.
const RATE = 22050;
const BARS = 12;
const BAR = 2;
const DOWNBEAT = 1;
const duration = DOWNBEAT + BARS * BAR - 0.2;
const samples = new Float32Array(Math.round(duration * RATE));
const CHORDS = [
	{ label: "C", notes: [60, 64, 67] },
	{ label: "F", notes: [65, 69, 72] },
	{ label: "G", notes: [67, 71, 74] },
	{ label: "A:min", notes: [69, 72, 76] },
];
const ORDER = [0, 1, 2, 0, 3, 1, 2, 0, 1, 3, 2, 0];
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
let seed = 7;
const rand = () => {
	seed = (seed * 1103515245 + 12345) % 2147483648;
	return seed / 2147483648;
};
for (let b = 0; b < BARS; b++) {
	const start = DOWNBEAT + b * BAR;
	const from = Math.round(start * RATE);
	const to = Math.min(samples.length, Math.round((start + BAR) * RATE));
	const { notes } = CHORDS[ORDER[b]];
	for (let i = from; i < to; i++) {
		const t = i / RATE;
		const env = Math.max(0, Math.min(1, (t - start) / 0.01, (start + BAR - t) / 0.01));
		let v = 0;
		for (const n of notes) v += Math.sin(2 * Math.PI * hz(n) * t);
		samples[i] += 0.08 * env * v;
	}
	for (let k = 0; k < 4; k++) {
		const at = Math.round((start + (k * BAR) / 4) * RATE);
		const length = Math.round(0.004 * RATE);
		const gain = k === 0 ? 0.6 : 0.3;
		for (let i = 0; i < length && at + i < samples.length; i++)
			samples[at + i] += gain * (2 * rand() - 1) * (1 - i / length);
	}
}
// The chord model's runs, in seconds.
const runs = ORDER.map((c, b) => ({
	start: DOWNBEAT + b * BAR,
	end: Math.min(duration, DOWNBEAT + (b + 1) * BAR),
	label: CHORDS[c].label,
}));

const built = main.chartFromRecording({
	samples,
	sampleRate: RATE,
	chords: { runs },
	declared: { meter: "4/4", tempo: 120 },
});
const builtChecks = built.ok
	? checkTimingMap(built.value.timing, { text: built.value.chart }).diagnostics
	: [{ message: "refused" }];
const aligned = built.ok
	? main.alignChart({ chart: built.value.chart, features: built.value.features })
	: { ok: false, refusals: [{ reason: "not run" }] };
const alignedChecks = aligned.ok
	? checkTimingMap(aligned.value.timing, { text: built.value.chart }).diagnostics
	: [{ message: "refused" }];

const featureNames = Object.keys(features).sort();
const wanted = [
	"FEATURES_VERSION",
	"chromaFeatures",
	"joinFeatures",
	"onsetFeatures",
	"readFeatures",
	"recordingFeatures",
];
const result = {
	built: built.ok ? built.value.timing.bars.length : built.refusals.map((r) => r.reason),
	builtChecks,
	aligned: aligned.ok ? aligned.value.timing.bars.length : aligned.refusals.map((r) => r.reason),
	alignedChecks,
	featureNames,
	mainHasFeatures: wanted.every((n) => n in main),
	stages: typeof stages.jointOnsetComb === "function" && typeof stages.dtwAlign === "function",
};
const good =
	built.ok &&
	aligned.ok &&
	result.built === BARS &&
	result.aligned === BARS &&
	builtChecks.length === 0 &&
	alignedChecks.length === 0 &&
	featureNames.join() === wanted.join() &&
	result.mainHasFeatures &&
	result.stages;
console.log(JSON.stringify(result));
process.exit(good ? 0 : 1);
