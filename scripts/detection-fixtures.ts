/**
 * Regenerates the real-data fixtures @barmark/sync's tests read
 * (packages/sync/tests/fixtures/): for two of Kevin's songs, a ChordMini run
 * as frame-level chord runs (`<song>.detections.json`), the same song as one
 * symbol run a bar (`<song>.symbols.detections.json`, the app's per-bar
 * vote), and each one's build as `.chart.md`, to read over before committing.
 *
 * It runs on the VM only. It imports Stem Shovel's ChordMini port from
 * stem-bench's pinned worktree (stem-shovel 2256d489), as stem-bench's
 * scripts/run-study19.ts does, and reads the decoded mix and the bar grid
 * (results/study19.json) from stem-bench. stem-bench is read-only here. Key
 * and meter come from the song's corpus chart. Numbers and labels only: no
 * audio, nothing derived from audio but the labels. CI reads the checked-in
 * outputs and never runs this.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { chartFromDetections, type Detections } from "../packages/sync/src/index.js";

const BENCH = `${homedir()}/projects/stem-bench/`;
const WT = `${BENCH}.worktrees/stem-shovel-2256d489`;
const OUT = fileURLToPath(new URL("../packages/sync/tests/fixtures/", import.meta.url));
const FRAME_SEC = 2048 / 22050;

/** The songs, with the key and meter their corpus charts declare (corpus/fixture-mmkk.json). */
const SONGS = [
	{ slug: "letter-lands", title: "Letter Lands", key: "F♯ major", meter: "4/4" },
	{ slug: "eat-all-the-clocks", title: "Eat All the Clocks", key: "E minor", meter: "4/4" },
];

if (!existsSync(WT)) throw new Error(`${WT} not found (this script runs on the VM)`);
const cqtMod = await import(`${WT}/src/lib/utils/chordminiCqt.ts`);
const smoothMod = await import(`${WT}/src/lib/utils/chordminiSmooth.ts`);
const runsMod = await import(`${WT}/src/lib/utils/chordminiRunsOf.ts`);
const barsMod = await import(`${WT}/src/lib/utils/chordminiBarChords.ts`);
const inferMod = await import(`${WT}/src/lib/server/chordmini/infer.ts`);
const plan = JSON.parse(readFileSync(`${WT}/src/lib/server/chordmini/cqt-plan.json`, "utf8"));
const config = JSON.parse(readFileSync(`${WT}/src/lib/server/chordmini/config.json`, "utf8")) as {
	chordVocab: string[];
};
const symbols = JSON.parse(
	readFileSync(`${WT}/src/lib/server/chordmini/chart-symbols.json`, "utf8"),
) as Record<string, string>;
const study = JSON.parse(readFileSync(`${BENCH}results/study19.json`, "utf8")) as {
	songs: Record<string, { barStarts: number[] }>;
};

type Run = { start: number; end: number; label: string };

function loadRaw(file: string): Float32Array {
	const buf = readFileSync(file);
	return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** The app's pipeline: CQT, the ONNX model, smoothing; the raw runs in frames. */
async function detect(slug: string): Promise<{ runs: Run[]; frames: number }> {
	const samples = loadRaw(`${BENCH}corpus-mmkk/${slug}/mix.mp3.22050.f32le.raw`);
	const { frames, features } = cqtMod.chordminiFeatures(samples, plan);
	const logits = await inferMod.chordminiLogits(features, frames, "/tmp");
	const indices = smoothMod.chordminiIndices(logits, frames) as Int32Array;
	return { runs: runsMod.chordminiRunsOf(indices, config.chordVocab) as Run[], frames };
}

/** The app's per-bar vote, one chord symbol a bar, as stem-bench's appPerBar. */
function perBar(runs: Run[], frames: number, barStarts: number[]): string[] {
	const bars = barStarts.length - 1;
	const stored = {
		frameSec: FRAME_SEC,
		frames,
		runs: runs.map((r) => ({ start: r.start, end: r.end, chord: symbols[r.label] || "N.C." })),
	};
	const out = new Array<string>(bars).fill("N.C.");
	const segs = barsMod.chordminiBarChords(stored, barStarts.slice(0, bars)) as {
		bar: number;
		bars: number;
		chord: string;
	}[];
	for (const s of segs)
		for (let k = 0; k < s.bars && s.bar - 1 + k < bars; k++) out[s.bar - 1 + k] = s.chord;
	return out;
}

function write(name: string, text: string): void {
	writeFileSync(`${OUT}${name}`, text);
	console.log(name);
}

for (const song of SONGS) {
	const barStarts = (study.songs[song.slug] ?? { barStarts: [] }).barStarts;
	const { runs, frames } = await detect(song.slug);
	const base = { title: song.title, key: song.key, meter: song.meter, grid: { bars: barStarts } };

	const framed: Detections = {
		...base,
		chords: {
			frameSec: FRAME_SEC,
			runs: runs.map((r) => ({ start: r.start, end: r.end, label: r.label })),
		},
	};
	const bySymbol = perBar(runs, frames, barStarts);
	const symbolic: Detections = {
		...base,
		chords: {
			runs: bySymbol.map((symbol, i) => ({
				start: barStarts[i] ?? 0,
				end: barStarts[i + 1] ?? 0,
				symbol,
			})),
		},
	};
	for (const [suffix, detections] of [
		["", framed],
		[".symbols", symbolic],
	] as const) {
		write(`${song.slug}${suffix}.detections.json`, `${JSON.stringify(detections)}\n`);
		const built = chartFromDetections(detections);
		write(`${song.slug}${suffix}.chart.md`, built.chart);
		for (const d of built.diagnostics) console.log(`  ${d.severity} ${d.code} ${d.message}`);
	}
}
