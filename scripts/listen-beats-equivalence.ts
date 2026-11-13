/**
 * The equivalence of `gridFromBeats` with Stem Shovel (design §10): runs the
 * app's own tracker modules beside the package.
 *
 *   bun scripts/listen-beats-equivalence.ts <stem-shovel commit>
 *
 * It runs on the VM only, never in CI. The commit must be at or after
 * `011cee44` (the app's tracker grid). stem-shovel is only read: read-only
 * git commands (`rev-parse`, `merge-base`, `show`). The app's three files
 * (`beatThisBeats.ts`, `beatThisGrid.ts`, `trackerBarGrid.ts`) are written
 * unchanged to `~/.cache/barmark/stem-shovel-beats-<sha8>/` and imported
 * from there (Bun resolves their `./x.js` specifiers to the `.ts` files).
 *
 * - **The cases** (`tests/helpers/beats-cases.ts`): the app's outputs are
 *   written to `packages/listen/tests/fixtures/beats/equivalence.json`, with
 *   the commit; `tests/beats-equivalence.test.ts` checks the package
 *   against them in CI.
 * - **The five real readings** (`docs/bench-reply-beats-2026-11-11.json` at
 *   the commit): compared here and printed, one line each; never written.
 *
 * Exits 1 on any difference. The pickup is not compared: the app has none.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gridFromBeats } from "../packages/listen/src/beats/grid.js";
import { snapDownbeats } from "../packages/listen/src/beats/snap.js";
import { BEATS_CASES, type BeatsCase } from "../packages/listen/tests/helpers/beats-cases.js";
import { toGoldenJson } from "../packages/listen/tests/helpers/equivalence.js";

const SHOVEL = join(homedir(), "projects", "stem-shovel");
const FIRST = "011cee44";
const OUT = fileURLToPath(
	new URL("../packages/listen/tests/fixtures/beats/equivalence.json", import.meta.url),
);
const FILES = ["beatThisBeats", "beatThisGrid", "trackerBarGrid"];

const fail = (message: string): never => {
	throw new Error(message);
};

/** A read-only git command on the app, its output or the failure named. */
function git(message: string, ...args: string[]): string {
	const p = Bun.spawnSync(["git", "-C", SHOVEL, ...args], { stdout: "pipe", stderr: "pipe" });
	if (p.exitCode !== 0) fail(`${message} ${p.stderr.toString().trim()}`.trim());
	return p.stdout.toString();
}

/** The commit, checked to be at or after the app's tracker grid. */
function resolveCommit(given: string): string {
	if (!existsSync(SHOVEL)) fail(`${SHOVEL} not found (this script runs on the VM)`);
	const commit = git(
		`stem-shovel has no commit ${given}.`,
		"rev-parse",
		"--verify",
		`${given}^{commit}`,
	);
	git(
		`${given} is not at or after ${FIRST} (the app's tracker grid).`,
		"merge-base",
		"--is-ancestor",
		FIRST,
		commit.trim(),
	);
	return commit.trim();
}

type AppGrid = { bars: number[]; meter: string; barSeconds: number };
type AppLabel = {
	tempo: number;
	beatsPerBar: number;
	meter: string;
	chartTempo: number;
	counts: Record<number, number>;
};
type Reading = BeatsCase["input"];
type Run = { grid: AppGrid | null; label: AppLabel };

const given = process.argv[2];
if (!given) {
	console.error("usage: bun scripts/listen-beats-equivalence.ts <stem-shovel commit>");
	process.exit(2);
}
const commit = resolveCommit(given);
const dir = join(homedir(), ".cache", "barmark", `stem-shovel-beats-${commit.slice(0, 8)}`);
mkdirSync(dir, { recursive: true });
for (const name of FILES)
	writeFileSync(
		join(dir, `${name}.ts`),
		git(`git show failed for ${name}.`, "show", `${commit}:src/lib/utils/${name}.ts`),
	);
const { trackerBarGrid } = await import(join(dir, "trackerBarGrid.ts"));
const { beatThisGrid } = await import(join(dir, "beatThisGrid.ts"));

/** The app's answer on a reading. */
function runApp(r: Reading): Run {
	const grid = trackerBarGrid({ version: "equivalence", ...r }) as AppGrid | null;
	const label = beatThisGrid(r.beats, r.downbeats) as AppLabel;
	return { grid, label };
}

/** What listen answers when the app's grid is null: a refusal for too few or unsteady bars is the same answer. */
const NULL_REASONS = new Set(["too-few-bars", "bars-unsteady"]);

/** The reason of listen's refusal, or `a grid`. */
const reasonOf = (listen: ReturnType<typeof gridFromBeats>) =>
	listen.ok ? "a grid" : String(listen.refusals[0]?.reason);

/** The differences between listen and the app on a reading, each a sentence. */
function differences(r: Reading, app: Run): string[] {
	const l = gridFromBeats(r);
	if (app.grid === null)
		return NULL_REASONS.has(reasonOf(l)) ? [] : [`app null, listen ${reasonOf(l)}`];
	if (!l.ok) return [`app grid, listen ${reasonOf(l)}`];
	const { grid, reading } = l.value;
	const pairs: [string, unknown, unknown][] = [
		["bars", grid.bars, app.grid.bars],
		["meter", l.value.meter, app.grid.meter],
		["barSeconds", reading.barSeconds, app.grid.barSeconds],
		["beatTempo", reading.beatTempo, app.label.tempo],
		["tempo", reading.tempo, app.label.chartTempo],
		["beatsPerBar", reading.beatsPerBar, app.label.beatsPerBar],
		["counts", reading.counts, app.label.counts],
	];
	return pairs
		.filter(([, listen, theirs]) => JSON.stringify(listen) !== JSON.stringify(theirs))
		.map(
			([what, listen, theirs]) =>
				`${what}: listen ${JSON.stringify(listen)}, app ${JSON.stringify(theirs)}`,
		);
}

/** What listen answers, in one word. */
function listenWord(r: Reading): string {
	const l = gridFromBeats(r);
	return l.ok
		? `${l.value.grid.bars.length - 1} bars ${l.value.meter}`
		: (l.refusals[0]?.reason as string);
}

let total = 0;
const report = (name: string, r: Reading, app: Run) => {
	const found = differences(r, app);
	total += found.length;
	const appWord = app.grid ? `${app.grid.bars.length - 1} bars ${app.grid.meter}` : "null";
	console.log(`${name}: app ${appWord}, listen ${listenWord(r)}, ${found.length} differences`);
	for (const f of found) console.log(`  ${f}`);
};

const cases = BEATS_CASES.map((c) => ({ name: c.name, input: c.input, app: runApp(c.input) }));
for (const c of cases) report(c.name, c.input, c.app);

const real = JSON.parse(
	git("bench reply missing.", "show", `${commit}:docs/bench-reply-beats-2026-11-11.json`),
) as Record<string, Reading>;
for (const [name, r] of Object.entries(real)) {
	const snapped = snapDownbeats(r.beats, r.downbeats);
	if (JSON.stringify(snapped) !== JSON.stringify(r.downbeats))
		fail(`${name}: snapping changed the downbeats.`);
	report(`real ${name}`, r, runApp(r));
}

mkdirSync(join(OUT, ".."), { recursive: true });
writeFileSync(OUT, toGoldenJson({ app: { commit }, cases }));
console.log(`${cases.length} cases written to ${OUT}; ${total} differences.`);
process.exit(total === 0 ? 0 : 1);
