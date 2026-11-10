/**
 * `bun run compile [--update]`: the emcc build. Runs build.sh into dist/
 * (from the package's root), streaming its output, and prints each compiled
 * file's size and SRI digest (sha384). Then it checks the build against
 * src/info.ts, or with `--update` rewrites info.ts from it.
 */
import { join } from "node:path";
import { type Info, infoProblems, readFacts, readVersions, renderInfo } from "./facts.js";

const PKG = join(import.meta.dir, "..");
const DIST = join(PKG, "dist");
const INFO = join(PKG, "src", "info.ts");

const build = Bun.spawnSync(["bash", "build/build.sh", "dist"], {
	cwd: PKG,
	stdio: ["inherit", "inherit", "inherit"],
});
if (build.exitCode !== 0) {
	console.error(`compile: build.sh exited with ${build.exitCode}`);
	process.exit(build.exitCode ?? 1);
}
const facts = readFacts(DIST);
console.log(`verovio-module.mjs  ${facts.moduleBytes} bytes  ${facts.moduleIntegrity}`);
console.log(`verovio-module.wasm  ${facts.wasmBytes} bytes  ${facts.wasmIntegrity}`);

if (process.argv.includes("--update")) {
	const versions = readVersions(await Bun.file(join(PKG, "build", "versions.env")).text());
	const { version } = await Bun.file(join(PKG, "package.json")).json();
	await Bun.write(INFO, renderInfo(facts, versions, version));
	const format = Bun.spawnSync([process.execPath, "x", "biome", "format", "--write", INFO], {
		cwd: PKG,
		stdio: ["inherit", "inherit", "inherit"],
	});
	if (format.exitCode !== 0) process.exit(format.exitCode ?? 1);
	console.log("compile: wrote src/info.ts; commit it");
} else {
	const info: Info = await import(INFO);
	const problems = infoProblems(facts, info);
	for (const problem of problems) console.error(`compile: ${problem}`);
	if (problems.length) process.exit(1);
	console.log("compile: dist/ matches info.ts");
}
