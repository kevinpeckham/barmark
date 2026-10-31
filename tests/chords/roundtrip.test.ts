import { describe, expect, test } from "bun:test";
import { harteToBarmark, parseHarte } from "../../src/chords/harte.js";
import { intervalKey, parseInterval, transpose } from "../../src/chords/intervals.js";
import { parseNoteSet } from "../../src/chords/noteSet.js";
import { parseChord } from "../../src/chords/parse.js";
import { HARTE_SHORTHANDS } from "../../src/chords/vocabulary.js";
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

	// The 100% above compares against parseHarte, which reads 11, 13 and maj13 at
	// barmark's meaning (no 3rd in an 11; no 11 in a 13). Under Harte 2005's own
	// definitions a small share of labels differ; record that figure too.
	test("under Harte's strict definitions, at least 99% of chord labels (by count) match", () => {
		let same = 0;
		let total = 0;
		for (const [label, count] of labels) {
			total += count;
			if (
				barmarkNotes(harteToBarmark(label) ?? "").join(" ") === strictHarteNotes(label).join(" ")
			) {
				same += count;
			}
		}
		const share = same / total;
		console.log(`strict Harte agreement: ${(share * 100).toFixed(2)}% of ${total} labels`);
		expect(share).toBeGreaterThanOrEqual(0.99);
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

/** A label's notes under Harte 2005's own shorthand definitions. */
function strictHarteNotes(label: string): string[] {
	const m = /^([A-G][#b]*)(?::([^(/]*)(?:\(([^)]*)\))?)?(?:\/([#b]*\d+))?$/.exec(label);
	const [, root = "", shorthand = "maj", list, bass] = m ?? [];
	let intervals =
		shorthand === "" ? [] : [...(HARTE_SHORTHANDS.find(([n]) => n === shorthand)?.[1] ?? [])];
	for (const item of list ? list.split(",") : []) {
		const i = parseInterval(item.replace("*", ""));
		if (!i) continue;
		intervals = intervals.filter((x) => intervalKey(x) !== intervalKey(i));
		if (!item.startsWith("*")) intervals.push(i);
	}
	const bassInterval = bass ? parseInterval(bass) : null;
	const notes = intervals.map((i) => transpose(root, i));
	return [...new Set([...notes, bassInterval ? transpose(root, bassInterval) : root])].sort();
}
