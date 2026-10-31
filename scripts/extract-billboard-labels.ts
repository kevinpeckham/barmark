/**
 * Builds tests/fixtures/billboard-labels.json from a local copy of the
 * McGill Billboard 2.0 salami_chords annotations (CC0):
 *   bun scripts/extract-billboard-labels.ts <dir containing NNNN/salami_chords.txt>
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: extract-billboard-labels.ts <McGill-Billboard dir>");

const LABEL = /^([A-G][#b]*(:[^\s/]*)?(\/[#b]*\d+)?|N|X)$/;
const labels: Record<string, number> = {};
for (const song of readdirSync(dir)) {
	let text: string;
	try {
		text = readFileSync(join(dir, song, "salami_chords.txt"), "utf8");
	} catch {
		continue;
	}
	for (const line of text.split("\n")) {
		if (line.startsWith("#")) continue;
		for (const cell of line.matchAll(/\|([^|]*)(?=\|)/g)) {
			for (const token of (cell[1] ?? "").split(/\s+/)) {
				if (LABEL.test(token)) labels[token] = (labels[token] ?? 0) + 1;
			}
		}
	}
}
const sorted = Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(
	"tests/fixtures/billboard-labels.json",
	`${JSON.stringify({ source: "McGill Billboard 2.0 salami_chords (CC0)", labels: sorted }, null, "\t")}\n`,
);
const total = Object.values(labels).reduce((a, b) => a + b, 0);
console.log(`${Object.keys(labels).length} distinct labels, ${total} total`);
