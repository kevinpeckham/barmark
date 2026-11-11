/**
 * The equivalence of `@barmark/listen` with Stem Shovel (design §11.2 item
 * 4, §11.3; plan Task 16 and Ruling 8): runs the app's own pure modules
 * beside the package.
 *
 *   bun scripts/listen-equivalence.ts <stem-shovel commit>
 *
 * It runs on the VM only, never in CI. The commit must be at or after
 * `1e120b2e` (the app's compound-meter tempo fix). stem-shovel is only
 * read: read-only git commands, and a `git clone --shared --no-checkout`
 * into `~/.cache/barmark/stem-shovel-<sha8>`, checked out detached at the
 * commit, its dependencies installed there with `--frozen-lockfile` by
 * the app's own Bun (`bunx bun@<packageManager>`: ours cannot read its
 * lockfile; scripts not run). The app's modules are imported by path
 * from that clone; its `#lib/*` imports are resolved by a Bun plugin.
 *
 * - **The seeded synthetic songs** (`tests/helpers/equivalence.ts`): the
 *   app's outputs, numbers and labels only, are written to
 *   `packages/listen/tests/fixtures/equivalence/case-<name>.json`, with
 *   the commit; `tests/equivalence.test.ts` checks the package against them
 *   in CI. Task 10's three unreadable charts go to `unreadable-charts.json`.
 * - **The real mixes**: the app's three chart fixtures against stem-bench's
 *   decoded mixes (read only), compared here with the same adapters; any
 *   difference outside §11.3 exits non-zero. No audio is written anywhere.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseChart } from "barmark";
import { alignChart } from "../packages/listen/src/align/align.js";
import { chartPadBars } from "../packages/listen/src/align/bars.js";
import { type Features, recordingFeatures } from "../packages/listen/src/features/index.js";
import type { ListenChordRuns } from "../packages/listen/src/grid/beats.js";
import { findGrid, type PlacedGrid } from "../packages/listen/src/grid/grid.js";
import { DEFAULTS } from "../packages/listen/src/options.js";
import { chartFromRecording, type RecordingChart } from "../packages/listen/src/pipeline.js";
import {
	alignedParts,
	alignmentSummary,
	diagnosticsAsApp,
	EQUIVALENCE_CASES,
	type EquivalenceCase,
	featuresSummary,
	fitReasonName,
	type Golden,
	GRID_REASONS,
	grammarTempo,
	mapOf,
	pickupAsListen,
	songChart,
	songTitle,
	tempoChangeAsListen,
	timingAsListen,
	toGoldenJson,
	UNREADABLE_CHARTS,
	type UnreadableGolden,
} from "../packages/listen/tests/helpers/equivalence.js";
import { synthSong } from "../packages/listen/tests/helpers/synthetic.js";

const SHOVEL = join(homedir(), "projects", "stem-shovel");
const CORPUS = join(homedir(), "projects", "stem-bench", "corpus-mmkk");
const FIXED = "1e120b2e";
const OUT = fileURLToPath(
	new URL("../packages/listen/tests/fixtures/equivalence/", import.meta.url),
);
const SYNC_FIXTURES = fileURLToPath(new URL("../packages/sync/tests/fixtures/", import.meta.url));
const RATE = 22050;
const MIXES = ["letter-lands", "eat-all-the-clocks", "peaceful-dreams"];

// ── The app's checkout: read-only git on stem-shovel, a shared clone in the cache.

const fail = (message: string): never => {
	throw new Error(message);
};

function run(cmd: string[], cwd = process.cwd()) {
	const p = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
	return { ok: p.exitCode === 0, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() };
}

/** A command's output, or the failure named. */
function must(result: ReturnType<typeof run>, message: string): string {
	if (!result.ok) fail(`${message} ${result.err}`.trim());
	return result.out;
}

const git = (...args: string[]) => run(["git", "-C", SHOVEL, ...args]);

/** The commit, checked to be at or after the app's compound-meter tempo fix (read-only git). */
function resolveCommit(given: string) {
	if (!existsSync(SHOVEL)) fail(`${SHOVEL} not found (this script runs on the VM)`);
	const commit = must(
		git("rev-parse", "--verify", `${given}^{commit}`),
		`stem-shovel has no commit ${given}.`,
	);
	const why = `${given} is not at or after ${FIXED} (the app's compound-meter tempo fix).`;
	must(git("merge-base", "--is-ancestor", FIXED, commit), why);
	return { commit, date: must(git("log", "-1", "--format=%cI", commit), "git log failed:") };
}

/** The shared clone at the commit, detached, its dependencies installed. */
function cloneAt(commit: string) {
	const clone = join(homedir(), ".cache", "barmark", `stem-shovel-${commit.slice(0, 8)}`);
	if (!existsSync(clone))
		must(run(["git", "clone", "--shared", "--no-checkout", SHOVEL, clone]), "clone failed:");
	must(run(["git", "-C", clone, "checkout", "--detach", commit]), "checkout failed:");
	install(clone);
	return clone;
}

/** The Bun the app names in `packageManager`. */
function appBun(clone: string): string {
	const manager = JSON.parse(readFileSync(join(clone, "package.json"), "utf8")).packageManager;
	return (
		/^bun@(\d+\.\d+\.\d+)$/.exec(String(manager))?.[1] ??
		fail(`no Bun in ${clone}'s packageManager`)
	);
}

/** `bun install --frozen-lockfile` in the clone with the app's own Bun (its `packageManager`), which reads its lockfile. */
function install(clone: string) {
	const flags = ["install", "--frozen-lockfile", "--ignore-scripts"];
	must(run(["bunx", `bun@${appBun(clone)}`, ...flags], clone), `install failed in ${clone}:`);
}

const given = process.argv[2];
if (!given) {
	console.error("usage: bun scripts/listen-equivalence.ts <stem-shovel commit>");
	process.exit(2);
}
const app = resolveCommit(given);
const CLONE = cloneAt(app.commit);
const LIB = join(CLONE, "src", "lib");

// The app's `#lib/*` (package.json `imports`, `.js` specifiers for `.ts` files), resolved into the clone.
Bun.plugin({
	name: "stem-shovel-lib",
	setup(build) {
		build.onResolve({ filter: /^#lib\// }, (args) => {
			const path = join(LIB, args.path.slice("#lib/".length));
			return { path: existsSync(path) ? path : path.replace(/\.js$/, ".ts") };
		});
	},
});

const grid_ = await import(join(LIB, "audio/chartlessGrid.ts"));
const align_ = await import(join(LIB, "audio/chartAlignment.ts"));
const fit_ = await import(join(LIB, "utils/alignmentFit.ts"));
const placements_ = await import(join(LIB, "utils/alignedPlacements.ts"));
const timing_ = await import(join(LIB, "utils/alignedTimingMap.ts"));
const bars_ = await import(join(LIB, "utils/barmarkChartBars.ts"));
const build_ = await import(join(LIB, "server/chartBuild.ts"));
const measures_ = await import(join(LIB, "audio/measures.ts"));
// The repair module the alignment and the grid call; imported so a missing one fails here.
await import(join(LIB, "audio/alignmentRepair.ts"));

// ── The app's pipeline on one recording.

type Runs = {
	frameSec: number;
	frames: number;
	runs: { start: number; end: number; label: string }[];
};
type AppSong = {
	name: string;
	samples: Float32Array;
	chart: string;
	meter: string;
	appTempo: number;
	runs: Runs | null;
};

/** The app's song changes at 0:00: its meter and its tempo in the bottom note's unit. */
const changesOf = (s: AppSong) => [
	{ kind: "meter", start: 0, value: s.meter },
	{ kind: "tempo", start: 0, value: String(s.appTempo) },
];

/** The stored ChordMini runs carry a version and barmark's spelling, which the readers ignore. */
const storedOf = (runs: Runs | null) =>
	runs && {
		version: "equivalence",
		...runs,
		runs: runs.runs.map((r) => ({ ...r, chord: r.label })),
	};

/** What the app reads of the recording, and its declared bar from the song's grid (`barSecondsAt`). */
function appReading(s: AppSong) {
	const songGrid = measures_.barGrid(changesOf(s), 0);
	return {
		duration: s.samples.length / RATE,
		features: align_.recordingFeatures(s.samples, RATE),
		envelope: align_.alignmentEnvelope(s.samples, RATE),
		declaredBarSeconds: measures_.barSecondsAt(songGrid, 0) as number,
		beatsPerBar: measures_.beatsPerBarAt(songGrid, 0) as number,
		runs: storedOf(s.runs),
	};
}
type AppReading = ReturnType<typeof appReading>;

/** `chartlessGrid` as `chartlessGridInBrowser` calls it. */
function appPlace(r: AppReading) {
	return grid_.chartlessGrid({
		onset: r.envelope.onset,
		fps: r.envelope.fps,
		chroma: r.features.chroma,
		hopSec: r.features.hopSec,
		firstSound: r.features.firstSound,
		duration: r.duration,
		declaredBarSeconds: r.declaredBarSeconds,
		beatsPerBar: r.beatsPerBar,
		startAt: null,
		runs: r.runs,
	});
}

/** The grid in the golden's shape; a refusal's class and decision from the app's vote on its witnesses. */
function gridGolden(placed: ReturnType<typeof appPlace>, beatsPerBar: number): Golden["grid"] {
	if (placed.ok) {
		const { barStarts, period, cls, decided, witnesses } = placed.grid;
		return { ok: true, barStarts, period, cls, decided, witnesses };
	}
	const { cls, decided } = grid_.downbeatVote(placed.witnesses, beatsPerBar);
	return { ok: false, reason: placed.reason, cls, decided, witnesses: placed.witnesses };
}

/** The song's own chart aligned as `songCheck` does: the bars, the alignment, the fit, placements and map. */
function appAlign(s: AppSong, r: AppReading) {
	const chartBars = bars_.barmarkChartBars(s.chart, { tempo: s.appTempo, meter: s.meter });
	if (!chartBars) fail(`${s.name}: the app reads no bars`);
	const alignment = align_.alignChart(chartBars.bars, s.samples, RATE);
	const fit = fit_.alignmentFit(alignment, { startAt: 0, barSeconds: r.declaredBarSeconds });
	return {
		alignment: alignmentSummary(alignment),
		fit: {
			bar1: fit.bar1,
			medianBar: fit.medianBar,
			declaredBar: fit.declaredBar,
			ratio: fit.ratio,
			reasons: fit.reasons,
		},
		placements: placements_.alignedPlacements(chartBars.bars, alignment),
		timing: timing_.alignedTimingMap(
			s.chart,
			chartBars.bars.length,
			alignment.barStarts,
			r.duration,
		),
		chartBars: chartBars.bars.length as number,
	};
}

/** `buildChartFromDetections` on the placed grid, or on `barStartsFrom(0, bar, duration)` when it refused. */
function appBuild(s: AppSong, r: AppReading, placed: ReturnType<typeof appPlace>): Golden["build"] {
	// barStartsFrom(0, bar, duration): placeChartlessGrid on a one-beat lattice at 0, first sound 0.
	const bar = r.declaredBarSeconds;
	const lattice = { anchor: 0, beat: bar, period: bar, beatsPerBar: 1 };
	const grid: number[] = placed.ok
		? placed.grid.barStarts
		: grid_.placeChartlessGrid(lattice, 0, 0, r.duration);
	const song = {
		title: songTitle(s.name),
		changes: changesOf(s),
		sections: [],
		mixKey: null,
		chordsJson: r.runs,
	};
	const built = build_.buildChartFromDetections(song, { grid, chords: [], source: "model" });
	return { on: placed.ok ? "placed" : "declared", grid, ...built };
}

function appRun(s: AppSong) {
	const r = appReading(s);
	const placed = appPlace(r);
	return {
		features: featuresSummary({ ...r.features, onset: r.envelope.onset, fps: r.envelope.fps }),
		grid: gridGolden(placed, r.beatsPerBar),
		...appAlign(s, r),
		build: appBuild(s, r, placed),
	};
}
type AppRun = ReturnType<typeof appRun>;

// ── The synthetic goldens.

function writeGolden(c: EquivalenceCase) {
	const song = synthSong(c.spec);
	const chart = songChart(c.spec, song);
	const s = {
		name: c.name,
		samples: song.samples,
		chart,
		meter: c.spec.meter,
		appTempo: c.appTempo,
		runs: song.chords as Runs,
	};
	const { chartBars: _, ...outputs } = appRun(s);
	const golden: Golden = { app, case: { ...c, chart }, ...outputs };
	writeFileSync(join(OUT, `case-${c.name}.json`), toGoldenJson(golden));
	const grid = golden.grid.ok
		? `placed, bar one ${golden.grid.barStarts?.[0]?.toFixed(3)} s`
		: golden.grid.reason;
	const fit =
		golden.fit.reasons.length === 0 ? "ok" : golden.fit.reasons.map(fitReasonName).join(", ");
	console.log(`  ${c.name}: grid ${grid}; fit ${fit}`);
}

/** Task 10's unreadable charts (§11.3): the bars the app's barmark 0.22 plays. */
function writeUnreadable() {
	const appBars = (chart: string): number =>
		bars_.barmarkChartBars(chart, { tempo: 120, meter: "4/4" })?.bars.length ?? 0;
	const golden: UnreadableGolden = {
		app,
		charts: UNREADABLE_CHARTS.map((chart) => ({ chart, appBars: appBars(chart) })),
	};
	writeFileSync(join(OUT, "unreadable-charts.json"), toGoldenJson(golden));
	console.log(
		`  unreadable charts: the app plays ${golden.charts.map((c) => c.appBars).join(", ")} bars`,
	);
}

// ── The real mixes, compared here with the test's adapters.

let compared = 0;
const differences: string[] = [];
const excluded: Record<string, number> = {};
const exclude = (why: string) => {
	excluded[why] = (excluded[why] ?? 0) + 1;
};
const differ = (what: string) => differences.push(what);

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object";

/** Deep, element by element, `Object.is` at the leaves. */
function same(a: unknown, b: unknown, where: string) {
	if (isObject(a) && isObject(b)) return sameObject(a, b, where);
	compared++;
	if (!Object.is(a, b)) differ(`${where}: app ${String(a)}, listen ${String(b)}`);
}

function sameObject(a: Record<string, unknown>, b: Record<string, unknown>, where: string) {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	same(Object.keys(a).length, Object.keys(b).length, `${where} keys`);
	for (const k of keys) same(a[k], b[k], `${where}.${k}`);
}

type Mix = {
	slug: string;
	samples: Float32Array;
	chart: string;
	runs: ListenChordRuns | null;
	declared: { meter: string; tempo: number };
	appTempo: number;
};

/** sync's real ChordMini fixture for a song (Harte labels in frames), the frame count from the mix's length. */
function storedRuns(slug: string, duration: number): ListenChordRuns | null {
	const file = join(SYNC_FIXTURES, `${slug}.detections.json`);
	if (!existsSync(file)) return null;
	const { chords } = JSON.parse(readFileSync(file, "utf8")) as { chords: Omit<Runs, "frames"> };
	return { ...chords, frames: Math.ceil(duration / chords.frameSec) };
}

/** A mix (read only), the app's chart fixture and the song's tempo from its first line. */
function readMix(slug: string): Mix {
	const raw = readFileSync(join(CORPUS, slug, "mix.mp3.22050.f32le.raw"));
	const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
	const chart = readFileSync(join(CLONE, "tests", "fixtures", "charts", `${slug}.md`), "utf8");
	const appTempo = Number(/(\d+) bpm/.exec(chart)?.[1]);
	const meter = "4/4";
	const runs = storedRuns(slug, samples.length / RATE);
	return {
		slug,
		samples,
		chart,
		runs,
		appTempo,
		declared: { meter, tempo: grammarTempo(meter, appTempo) },
	};
}

/** §7: the pickup's grid from the app's, `a` checked against the app's own starts. */
function comparePickup(label: string, a: AppRun, placed: PlacedGrid) {
	exclude("§7 pickup: the app's bar 1 is the pickup, bar starts one bar later");
	const app = a.grid.barStarts as number[];
	const { reading, pickup } = placed;
	const slack = DEFAULTS.PLACEMENT_FIRST_SOUND_SLACK_BEATS;
	const beats = pickup?.beats ?? 0;
	const { a: at, ...expected } = pickupAsListen(
		app,
		reading.lattice,
		reading.cls,
		a.features.firstSound,
		slack,
		beats,
	);
	same(app[0], Math.max(0, at), `${label} the app's bar 1 is a, clamped`);
	same(app[1], at + reading.lattice.period, `${label} the app's bar 2 is a + period`);
	same(expected, { bars: placed.grid.bars, pickup }, `${label} grid`);
}

function comparePlaced(label: string, a: AppRun, placed: PlacedGrid) {
	same(a.grid.cls, placed.reading.cls, `${label} cls`);
	same(a.grid.period, placed.reading.lattice.period, `${label} period`);
	if (placed.pickup) comparePickup(label, a, placed);
	else same(a.grid.barStarts, placed.grid.bars, `${label} grid`);
}

type GridResult = ReturnType<typeof findGrid>;
const readingOf = (g: GridResult) => (g.ok ? g.value.reading : g.reading);

function compareRefused(label: string, a: AppRun, g: Extract<GridResult, { ok: false }>) {
	const names = g.refusals.map((x) => x.reason);
	same([GRID_REASONS[a.grid.reason as string]], names, `${label} grid refusal (§12.8)`);
	same([a.grid.cls, a.grid.decided], [g.reading?.cls, g.reading?.decided], `${label} vote`);
}

function compareGrid(label: string, a: AppRun, mix: Mix, f: Features) {
	const g = findGrid({ features: f, chords: mix.runs, declared: mix.declared });
	same(a.grid.witnesses, readingOf(g)?.witnesses, `${label} witnesses`);
	if (a.grid.ok !== g.ok) return differ(`${label} grid: placed on one side only`);
	if (g.ok) return comparePlaced(label, a, g.value);
	compareRefused(label, a, g);
}

/** The built chart opening with a pickup: compared from the written bar 1 on. */
function compareBuildPickup(label: string, a: AppRun, v: RecordingChart) {
	exclude("§7 pickup: the built chart opens with the pickup, compared from the written bar 1 on");
	same(a.build.timing.bars.slice(1), v.timing.bars.slice(1), `${label} build timing from bar 1`);
	same(
		a.build.confidence.bars.slice(1),
		v.confidence.bars.slice(1),
		`${label} build confidence from bar 1`,
	);
}

/** The package's chart, as the app's is built: declared when unplaced, the song's title, no key, sections or changes. */
function listenBuild(label: string, chords: ListenChordRuns, mix: Mix, f: Features) {
	const input = { features: f, chords, declared: mix.declared, title: songTitle(label) };
	return chartFromRecording({
		...input,
		key: null,
		sections: [],
		changes: [],
		onUnplaced: "declared",
	});
}

/** Which grid each built on, and §11.3's `recording.duration`: the app passes the grid's end. */
function compareBuildGrid(label: string, a: AppRun, v: RecordingChart) {
	same(a.build.on, v.grid === null ? "declared" : "placed", `${label} build grid`);
	exclude("§11.3 recording.duration: the recording's length, where the app passes the grid's end");
	same(a.build.grid.at(-1), a.build.timing.recording.duration, `${label} the app's map duration`);
	same(v.features.duration, v.timing.recording?.duration, `${label} map duration`);
}

function compareBuildWhole(label: string, a: AppRun, v: RecordingChart) {
	same(a.build.chart, v.chart, `${label} build chart`);
	same({ ...a.build.timing, recording: v.timing.recording }, v.timing, `${label} build timing`);
	same(a.build.confidence, v.confidence, `${label} build confidence`);
	same(a.build.diagnostics, diagnosticsAsApp(v.diagnostics), `${label} build diagnostics`);
}

function compareBuild(label: string, a: AppRun, chords: ListenChordRuns, mix: Mix, f: Features) {
	const built = listenBuild(label, chords, mix, f);
	if (!built.ok) return differ(`${label} build: refused ${built.refusals.map((x) => x.reason)}`);
	compareBuildGrid(label, a, built.value);
	if (built.value.grid?.pickup) compareBuildPickup(label, a, built.value);
	else compareBuildWhole(label, a, built.value);
}

/** §11.3: a chart with an unreadable chord, which the app's barmark 0.22 drops a line of; true when excluded. */
function unreadable(label: string, a: AppRun, mix: Mix): boolean {
	const parse = parseChart(mix.chart);
	const unknown = parse.bars
		.flatMap((b) => b.slots)
		.filter((s) => s.kind === "unknown" && s.text !== undefined);
	const ours = chartPadBars(parse, mix.declared.tempo);
	const played = ours.ok ? ours.bars.length : 0;
	if (unknown.length === 0) {
		same(a.chartBars, played, `${label} played bars`);
		return false;
	}
	exclude("§11.3 an unreadable chord: the app's barmark 0.22 drops its line");
	same(true, a.chartBars < played, `${label} the app plays fewer bars`);
	return true;
}

type Parts = ReturnType<typeof alignedParts>;
type TempoChange = Golden["placements"]["tempoChanges"][number];

/** The fit and its reasons by name; §14 Q1's not-same-piece is a refusal here, a hedge in the app. */
function compareFit(label: string, a: AppRun, parts: Parts) {
	const { reasons: sentences, ...numbers } = a.fit;
	same(numbers, parts.fit, `${label} fit`);
	if (parts.refusals.includes("not-same-piece")) {
		exclude("§14 Q1 not-same-piece refuses the new map");
		same(false, a.placements.samePiece, `${label} not-same-piece iff the app's gate fails`);
	}
	const names = parts.refusals.filter((x) => x !== "not-same-piece");
	same(sentences.map(fitReasonName), names, `${label} fit reasons by name`);
}

function comparePlacements(label: string, a: AppRun, parts: Parts, meter: string) {
	const { ratio, samePiece, sections, keyChanges, tempoChanges } = a.placements;
	same([ratio, samePiece], [parts.alignment.ratio, parts.alignment.samePiece], `${label} gate`);
	const expected = {
		sections,
		keyChanges,
		tempoChanges: tempoChanges.map((t: TempoChange) => tempoChangeAsListen(t, meter)),
	};
	same(expected, parts.placements, `${label} placements`);
}

/** §11.3: the package's aligned map is the app's clamped to [0, duration]. */
function compareTiming(label: string, a: AppRun, ours: unknown) {
	const clamped = timingAsListen(a.timing);
	if (JSON.stringify(clamped) !== JSON.stringify(a.timing))
		exclude("§11.3 the aligned map is clamped to [0, duration]; the app's is not");
	same(clamped, ours, `${label} timing, the app's clamped`);
}

function compareAligned(label: string, a: AppRun, mix: Mix, f: Features) {
	const aligned = alignChart({
		chart: mix.chart,
		features: f,
		tempo: mix.declared.tempo,
		declared: mix.declared,
	});
	const parts = alignedParts(aligned, mix.declared);
	same(a.alignment, alignmentSummary(parts.alignment), `${label} alignment`);
	compareFit(label, a, parts);
	comparePlacements(label, a, parts, mix.declared.meter);
	same(aligned.ok, a.fit.reasons.length === 0 && a.placements.samePiece, `${label} map kept`);
	compareTiming(label, a, mapOf(aligned, mix.chart, f, parts.alignment.barStarts));
	const kept = aligned.ok ? "kept the map" : `refused ${parts.refusals.join(", ")}`;
	console.log(`  ${label}: grid ${a.grid.ok ? "placed" : a.grid.reason}; listen ${kept}`);
}

function compareMix(slug: string) {
	const mix = readMix(slug);
	const a = appRun({
		name: slug,
		samples: mix.samples,
		chart: mix.chart,
		meter: mix.declared.meter,
		appTempo: mix.appTempo,
		runs: mix.runs as Runs | null,
	});
	const read = recordingFeatures(mix.samples, RATE);
	if (!read.ok) return differ(`${slug}: features refused`);
	same(a.features, featuresSummary(read.value), `${slug} features`);
	compareGrid(slug, a, mix, read.value);
	// The build needs the chord model's runs: sync's real ChordMini fixtures, two of the three songs.
	if (mix.runs) compareBuild(slug, a, mix.runs, mix, read.value);
	if (!unreadable(slug, a, mix)) compareAligned(slug, a, mix, read.value);
}

mkdirSync(OUT, { recursive: true });
console.log(`stem-shovel ${app.commit} (${app.date}), clone ${CLONE}`);
console.log("Synthetic goldens:");
for (const c of EQUIVALENCE_CASES) writeGolden(c);
writeUnreadable();
console.log("Real mixes:");
for (const slug of MIXES) compareMix(slug);
console.log({ compared, differences: differences.length, excluded });
for (const d of differences.slice(0, 40)) console.log(`  DIFFERENCE ${d}`);
if (differences.length > 0) process.exit(1);
