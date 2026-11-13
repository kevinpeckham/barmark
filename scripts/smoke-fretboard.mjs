/**
 * Import @barmark/fretboard as Node sees it and use it: check that standard
 * tuning has six strings. Plain Node, so it runs against the local build
 * (scripts/verify-package.ts) and against the copy installed from npm
 * (.github/workflows/release.yml, confirm).
 *
 *   node scripts/smoke-fretboard.mjs <module> [chart]
 *
 * Locally <module> is the built entry (dist/index.js); from npm it is the
 * package name. Prints the result as JSON; exit 1 if anything differs.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [spec] = process.argv.slice(2);
const local = /^[./]/.test(spec);
const main = await import(local ? pathToFileURL(resolve(spec)).href : spec);

const strings = main.GUITAR?.strings;
const good = Array.isArray(strings) && strings.length === 6 && strings.every(Number.isFinite);
console.log(JSON.stringify({ strings }));
process.exit(good ? 0 : 1);
