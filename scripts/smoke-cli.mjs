/**
 * Run the barmark command as Node sees it: --version names the CLI and
 * its libraries, check reads a real chart cleanly, render embeds the font,
 * and render --score engraves the score with Verovio.
 * Plain Node, so it runs against the local build (scripts/verify-package.ts)
 * and against the copy installed from npm (.github/workflows/release.yml,
 * confirm).
 *
 *   node scripts/smoke-cli.mjs <bin> <chart>
 *
 * <bin> is a path to the built cli.js, or "@barmark/cli", whose bin is
 * resolved from this file's directory. Prints the result as JSON; exit 1 if
 * anything differs.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [spec, chart] = process.argv.slice(2);
let bin = resolve(spec);
if (!(spec.startsWith(".") || spec.startsWith("/"))) {
	const manifest = fileURLToPath(import.meta.resolve(`${spec}/package.json`));
	bin = join(dirname(manifest), JSON.parse(readFileSync(manifest, "utf8")).bin.barmark);
}
const barmark = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });

const version = barmark("--version").stdout.trim();
const check = barmark("check", chart).status;
const render = barmark("render", chart).stdout.includes("data:font/otf;base64,");
const scored = barmark("render", "--score", chart);
const score = scored.status === 0 && scored.stdout.includes('role="img"');
const result = { version, check, render, score };
console.log(JSON.stringify(result));
const ok =
	/^@barmark\/cli \d+\.\d+\.\d+ \(barmark \d+\.\d+\.\d+, @barmark\/render \d+\.\d+\.\d+, @barmark\/musicxml \d+\.\d+\.\d+, @barmark\/score \d+\.\d+\.\d+, @barmark\/midi \d+\.\d+\.\d+\)$/.test(
		version,
	) &&
	check === 0 &&
	render &&
	score;
process.exit(ok ? 0 : 1);
