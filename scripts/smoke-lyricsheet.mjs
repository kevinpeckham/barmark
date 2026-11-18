/**
 * Import @barmark/lyricsheet as Node sees it and export a real chart as a
 * ChordPro lyric sheet. Plain Node, so it runs against the local build
 * (scripts/verify-package.ts) and against the copy installed from npm
 * (.github/workflows/release.yml, confirm).
 *
 *   node scripts/smoke-lyricsheet.mjs <module> <chart>
 *
 * Prints the result as JSON; exit 1 if anything differs.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [spec, chartPath] = process.argv.slice(2);
const local = /^[./]/.test(spec);
const { exportLyricsheet } = await import(local ? pathToFileURL(resolve(spec)).href : spec);
const r = exportLyricsheet(readFileSync(chartPath, "utf8"));
const text = r.ok ? r.text : "";
const result = { ok: r.ok, titled: text.startsWith("{title:"), lines: text.split("\n").length - 1 };
console.log(JSON.stringify(result));
process.exit(result.ok && result.titled && result.lines > 0 ? 0 : 1);
