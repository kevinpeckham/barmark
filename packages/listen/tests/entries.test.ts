/**
 * The package's three entries (design §3): the root's calls and the
 * features API, `./features`' six names, every stage of §11's layout in
 * `./stages`, and the `exports` map that names them.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "../src");
const FEATURES = [
	"FEATURES_VERSION",
	"chromaFeatures",
	"joinFeatures",
	"onsetFeatures",
	"readFeatures",
	"recordingFeatures",
];
const STAGES = [
	"fft",
	"onsetRate",
	"onsetEnvelope",
	"detrend",
	"chromagram",
	"chromaWindow",
	"chromaFrameCount",
	"audibleSpan",
	"jointOnsetComb",
	"flatEnvelope",
	"trustedSpan",
	"phaseLine",
	"combSlide",
	"rephaseGrid",
	"repairEnds",
	"gridLattice",
	"latticeBeats",
	"beatChords",
	"timeZeroWitness",
	"harmonicRhythmWitness",
	"histogramVote",
	"beatChroma",
	"checkerboardNovelty",
	"noveltyPeaks",
	"sectionWitness",
	"downbeatVote",
	"placeBarOne",
	"placeAtStart",
	"chartPadBars",
	"barSeconds",
	"renderChartPads",
	"renderWhole",
	"dtwAlign",
	"dtwTable",
	"mapSeconds",
	"alignPath",
	"rephaseAlignment",
	"alignmentFit",
	"alignedPlacements",
	"alignedTimingMap",
];

describe("the root entry", () => {
	test("the calls, the options and every feature name; nothing internal, nothing from sync", async () => {
		const root = await import(join(SRC, "index.ts"));
		const names = Object.keys(root);
		for (const name of ["findGrid", "alignChart", "chartFromRecording", "resolveOptions"])
			expect(typeof root[name]).toBe("function");
		for (const name of FEATURES) expect(names).toContain(name);
		expect(Object.isFrozen(root.DEFAULTS)).toBe(true);
		for (const name of ["gridWith", "declaredGrid", "chartFromDetections", "checkTimingMap"])
			expect(names).not.toContain(name);
		expect(names.sort()).toEqual(
			[
				...FEATURES,
				"DEFAULTS",
				"alignChart",
				"chartFromRecording",
				"findGrid",
				"resolveOptions",
			].sort(),
		);
	});
});

describe("the ./features entry", () => {
	test("is exactly the six names", async () => {
		expect(Object.keys(await import(join(SRC, "features/index.ts"))).sort()).toEqual(FEATURES);
	});
});

describe("the ./stages entry", () => {
	test("every stage of §11's layout is a function, with resolveOptions and DEFAULTS", async () => {
		const stages = await import(join(SRC, "stages.ts"));
		for (const name of [...STAGES, "resolveOptions"]) {
			expect({ name, type: typeof stages[name] }).toEqual({ name, type: "function" });
		}
		expect(stages.DEFAULTS).toBeDefined();
		expect(Object.keys(stages)).not.toContain("gridWith");
	});
});

describe("package.json", () => {
	test("the exports map names ./features and ./stages with types and import", () => {
		const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"));
		expect(pkg.exports).toEqual({
			".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
			"./features": {
				types: "./dist/features/index.d.ts",
				import: "./dist/features/index.js",
			},
			"./stages": { types: "./dist/stages.d.ts", import: "./dist/stages.js" },
		});
	});
});
