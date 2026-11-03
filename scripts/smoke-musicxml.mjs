/**
 * Import @barmark/musicxml as Node sees it and export a real chart: a
 * MusicXML 4.0 score-partwise with one part and as many measures as the
 * chart has. Plain Node, so it runs against the local build
 * (scripts/verify-package.ts) and against the copy installed from npm
 * (.github/workflows/release.yml, confirm).
 *
 *   node scripts/smoke-musicxml.mjs <module> <chart>
 *
 * Prints the result as JSON; exit 1 if anything differs.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [spec, chartPath] = process.argv.slice(2);
const local = /^[./]/.test(spec);
const { exportMusicXml } = await import(local ? pathToFileURL(resolve(spec)).href : spec);
const r = exportMusicXml(readFileSync(chartPath, "utf8"));
const xml = r.ok ? r.xml : "";
const result = {
	ok: r.ok,
	partwise: xml.includes('<score-partwise version="4.0">'),
	parts: (xml.match(/<part id=/g) ?? []).length,
	measures: (xml.match(/<measure /g) ?? []).length,
};
console.log(JSON.stringify(result));
process.exit(result.ok && result.partwise && result.parts === 1 && result.measures > 0 ? 0 : 1);
