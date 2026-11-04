/**
 * Freezes what every corpus chart's MusicXML sounds
 * (packages/musicxml/tests/fixtures/sounding.json).
 * Run once, before notation work; a later change to it changes the music.
 */
import { writeFileSync } from "node:fs";
import { exportMusicXml } from "../packages/musicxml/src/index.js";
import { corpus } from "../packages/musicxml/tests/charts.js";
import { sounding } from "../packages/musicxml/tests/sounding.js";

const fixture: Record<string, Record<string, unknown>> = {};
for (const [name, text] of corpus()) {
	const r = exportMusicXml(text);
	if (!r.ok) throw new Error(`${name}: ${r.diagnostics.map((d) => d.message).join("; ")}`);
	const parts = [...r.xml.matchAll(/<part id="(P\d+)">/g)].map((m) => m[1] ?? "");
	fixture[name] = Object.fromEntries(parts.map((p) => [p, sounding(r.xml, p)]));
}
writeFileSync(
	new URL("../packages/musicxml/tests/fixtures/sounding.json", import.meta.url),
	`${JSON.stringify(fixture, null, "\t")}\n`,
);
console.log(`${Object.keys(fixture).length} charts`);
