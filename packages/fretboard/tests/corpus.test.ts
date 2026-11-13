import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type ChartParse, type ChordRecord, parseChart, type Slot } from "barmark";
import { shapeFor, sounding, soundsChord } from "../src/index.js";
import { withinLimits } from "../src/sounds.js";

const DIR = join(import.meta.dir, "../../../examples");

type Item = { chord: ChordRecord; voicing?: ChordRecord | undefined };

function items(slots: Slot[]): Item[] {
	const out: Item[] = [];
	for (const s of slots)
		for (const m of s.kind === "group" ? s.members : [s])
			if (m.kind === "chord") out.push({ chord: m.chord, voicing: m.voicing });
	return out;
}

/** Every harmony slot of a chart; the notes of a singing line (grammar 7.7) are melody and left out. */
function harmony(c: ChartParse): Item[] {
	const out: Item[] = [];
	for (const bar of c.bars) {
		out.push(...items(bar.slots));
		bar.parts?.forEach((p, i) => {
			if (!p) return;
			out.push(...items(p.slots));
			const sings = c.parts[i]?.sings;
			for (const l of p.lines ?? []) if (l.name !== sings) out.push(...items(l.slots));
		});
	}
	return out;
}

type Count = { named: number; placed: number; "single-note": number; "not-playable": number };

/** Check one slot's result and count its outcome. */
function check({ chord, voicing }: Item, count: Count): void {
	const named = chord.kind === "chord" && !voicing;
	const r = shapeFor(chord, voicing);
	if (!r.ok) {
		expect(named).toBe(false);
		count[r.reason]++;
	} else if (named) {
		expect(soundsChord(r.shape, chord)).toBe(true);
		expect(withinLimits(r.shape, 2)).toBe(true);
		count.named++;
	} else {
		expect(sounding(r.shape).length).toBeGreaterThan(0);
		count[r.caveat === null ? "placed" : "named"]++;
	}
}

test("every chord of every example gets a shape or a reason", () => {
	const count: Count = { named: 0, placed: 0, "single-note": 0, "not-playable": 0 };
	for (const file of readdirSync(DIR).filter((f) => f.endsWith(".chart.md")))
		for (const item of harmony(parseChart(readFileSync(join(DIR, file), "utf8"))))
			check(item, count);
	console.log(`corpus outcomes: ${JSON.stringify(count)}`);
	expect(count.named).toBeGreaterThan(20);
});
