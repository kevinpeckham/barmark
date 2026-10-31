/**
 * Report-only round trip over a local copy of the Isophonics Beatles chord
 * annotations (no license: never commit them or this script's output):
 *   bun scripts/corpus-roundtrip.ts <dir containing chordlab/>
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { harteToBarmark, parseHarte } from "../packages/barmark/src/chords/harte.js";
import { transpose } from "../packages/barmark/src/chords/intervals.js";
import { parseNoteSet } from "../packages/barmark/src/chords/noteSet.js";
import { parseChord } from "../packages/barmark/src/chords/parse.js";

const dir = process.argv[2];
if (!dir) throw new Error("usage: corpus-roundtrip.ts <isophonics dir>");

const labels = new Map<string, number>();
for (const file of readdirSync(join(dir, "chordlab"), { recursive: true }) as string[]) {
	if (!file.endsWith(".lab")) continue;
	for (const line of readFileSync(join(dir, "chordlab", file), "utf8").split("\n")) {
		const label = line.trim().split(/\s+/)[2];
		if (label) labels.set(label, (labels.get(label) ?? 0) + 1);
	}
}

let total = 0;
let named = 0;
let exact = 0;
const misses: string[] = [];
for (const [label, count] of labels) {
	if (label === "N" || label === "X") continue;
	total += count;
	const out = harteToBarmark(label);
	const h = parseHarte(label);
	if (!out || !h || h === "N" || h === "X") {
		misses.push(`${label} → unreadable`);
		continue;
	}
	if (!out.startsWith("{")) named += count;
	const r = out.startsWith("{") ? parseNoteSet(out) : parseChord(out);
	const want = [...new Set([...h.intervals.map((i) => transpose(h.root, i)), h.bass])].sort();
	const got = r.ok
		? [...new Set([...r.value.pitches.map((p) => p.replace(/\d/g, "")), r.value.bass])].sort()
		: [];
	if (want.join() === got.join()) exact += count;
	else misses.push(`${label} → ${out}`);
}
console.log(`${labels.size} distinct labels, ${total} chord labels (N/X excluded)`);
console.log(`same spelled notes: ${((100 * exact) / total).toFixed(2)}%`);
console.log(`named chords:       ${((100 * named) / total).toFixed(2)}%`);
if (misses.length) console.log(`misses:\n  ${misses.join("\n  ")}`);
