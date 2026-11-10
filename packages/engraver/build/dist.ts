/**
 * `bun run build` (and `prepack`, with `--require-module`): the TypeScript
 * side of the package. Emits dist/info.{js,d.ts}, copies dist/index.d.mts,
 * then checks any compiled dist/verovio-module.{mjs,wasm} against info.ts.
 * It never compiles and never deletes the compiled files: that is
 * `bun run compile`.
 */
import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { checkDist, type Info } from "./facts.js";

const PKG = join(import.meta.dir, "..");
const DIST = join(PKG, "dist");

const tsc = Bun.spawnSync([process.execPath, "x", "tsc", "-p", "tsconfig.build.json"], {
	cwd: PKG,
	stdio: ["inherit", "inherit", "inherit"],
});
if (tsc.exitCode !== 0) {
	console.error(`build: tsc exited with ${tsc.exitCode}`);
	process.exit(tsc.exitCode ?? 1);
}
copyFileSync(join(PKG, "src", "index.d.mts"), join(DIST, "index.d.mts"));

const info: Info = await import(join(PKG, "src", "info.ts"));
const { problems, notes } = checkDist(DIST, info, process.argv.includes("--require-module"));
for (const note of notes) console.log(`build: ${note}`);
for (const problem of problems) console.error(`build: ${problem}`);
if (problems.length) process.exit(1);
