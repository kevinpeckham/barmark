import { describe, expect, test } from "bun:test";
import { harteToBarmark, parseHarte } from "../../src/chords/harte.js";
import { transpose } from "../../src/chords/intervals.js";
import { parseNoteSet } from "../../src/chords/noteSet.js";
import { parseChord } from "../../src/chords/parse.js";
import fixture from "../fixtures/billboard-labels.json";

describe("harteToBarmark", () => {
	const cases: [string, string][] = [
		["A:sus4(b7,9)", "A9sus4"],
		["E:1", "{E}"],
		["E:1(b3,b7)/b7", "{D E! G}"],
		["D:maj(*1)/#1", "{D# F# A}"],
		["C:maj/3", "C/E"],
		["N", "N.C."],
		["X", "?"],
	];
	for (const [label, out] of cases) {
		test(`${label} → ${out}`, () => expect(harteToBarmark(label)).toBe(out));
	}
	test("an enharmonic respelling falls back to exact notes", () => {
		const out = harteToBarmark("Eb:maj7(#5)") ?? "";
		expect(out.startsWith("{")).toBe(true);
		expect(out).toContain("Bb");
		expect(out).toContain("B ");
	});
	test("an unreadable label is null", () => expect(harteToBarmark("Q:maj")).toBeNull());
});

/** The spelled notes a Harte label names, bass included. */
function harteNotes(label: string): string[] {
	const h = parseHarte(label);
	if (!h || h === "N" || h === "X") throw new Error(`unreadable ${label}`);
	return [...new Set([...h.intervals.map((i) => transpose(h.root, i)), h.bass])].sort();
}

/** The spelled notes a barmark slot parses to, octaves dropped. */
function barmarkNotes(text: string): string[] {
	const r = text.startsWith("{") ? parseNoteSet(text) : parseChord(text);
	if (!r.ok) throw new Error(`${text}: ${r.error.message}`);
	return [...new Set([...r.value.pitches.map((p) => p.replace(/\d/g, "")), r.value.bass])].sort();
}

describe("McGill Billboard round trip (CC0 fixture)", () => {
	const labels = Object.entries(fixture.labels as Record<string, number>).filter(
		([l]) => l !== "N" && l !== "X",
	);

	test("every label converts to barmark that names exactly the same spelled notes", () => {
		const mismatches: string[] = [];
		for (const [label] of labels) {
			const out = harteToBarmark(label);
			if (out === null) {
				mismatches.push(`${label} → null`);
				continue;
			}
			const want = harteNotes(label).join(" ");
			const got = barmarkNotes(out).join(" ");
			if (want !== got) mismatches.push(`${label} → ${out}: ${want} ≠ ${got}`);
		}
		expect(mismatches).toEqual([]);
	});

	test("at least 96% of chord labels (by count) become named chords", () => {
		let named = 0;
		let total = 0;
		for (const [label, count] of labels) {
			total += count;
			if (!(harteToBarmark(label) ?? "{").startsWith("{")) named += count;
		}
		const share = named / total;
		console.log(`named-chord share: ${(share * 100).toFixed(2)}% of ${total} labels`);
		expect(share).toBeGreaterThanOrEqual(0.96);
	});
});
