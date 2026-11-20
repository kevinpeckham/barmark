/**
 * The pairing's time under Node (FINDINGS: a queue drained with
 * `Array.shift` is quadratic under V8 and linear under Bun, so a Bun
 * timing cannot see it). `notes.ts` imports nothing at run time, so it is
 * transpiled alone (no build) into a temp folder and timed by a small
 * script run with `node`: n note-ons of one pitch, then n note-offs,
 * paired first in, first out, at n and 4n.
 */
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "barmark-notes-node-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const DRIVER = `
import { notesOf } from "./notes.mjs";
const report = { add() {}, writtenBars() {}, list: [] };
/** n note-ons of pitch 60 a tick apart, then n note-offs a tick apart. */
function file(n) {
	const track = [];
	for (let i = 0; i < n; i++) track.push({ tick: i, kind: "on", channel: 0, pitch: 60, velocity: 80 });
	for (let i = 0; i < n; i++) track.push({ tick: n + i, kind: "off", channel: 0, pitch: 60, velocity: 0 });
	return { format: 0, ppq: 480, tracks: [track] };
}
/** The fastest of three runs, in ms, and the notes paired. */
function time(n) {
	const smf = file(n);
	let best = Infinity, count = 0;
	for (let k = 0; k < 3; k++) {
		const t = performance.now();
		count = notesOf(smf, report, { overlaps: "keep" }).length;
		best = Math.min(best, performance.now() - t);
	}
	return { ms: best, count };
}
time(20_000);
console.log(JSON.stringify([time(50_000), time(200_000)]));
`;

test("first-in-first-out pairing grows linearly under Node: 4x the notes, well under 16x the time", () => {
	const source = readFileSync(new URL("../src/import/notes.ts", import.meta.url), "utf8");
	writeFileSync(join(dir, "notes.mjs"), new Bun.Transpiler({ loader: "ts" }).transformSync(source));
	writeFileSync(join(dir, "driver.mjs"), DRIVER);
	const run = Bun.spawnSync(["node", join(dir, "driver.mjs")]);
	expect(run.stderr.toString()).toBe("");
	const [small, large] = JSON.parse(run.stdout.toString()) as { ms: number; count: number }[];
	expect([small?.count, large?.count]).toEqual([50_000, 200_000]);
	// Linear is about 4x; quadratic about 16x.
	expect((large?.ms ?? 0) / (small?.ms ?? 1)).toBeLessThan(8);
}, 120_000);
