import { describe, expect, test } from "bun:test";
import { shapeFor } from "@barmark/fretboard";
import { type ChordRecord, parseChart } from "barmark";
import { corpus } from "../../musicxml/tests/charts.js";
import { spelled } from "../src/export/spell.js";
import { exportLyricsheet, type LyricsheetOptions } from "../src/index.js";
import { type ChoLine, readCho } from "./read-cho.js";
import { readBack } from "./yardstick.js";

/** Every directive this package writes. */
const DIRECTIVES = new Set([
	...["title", "composer", "lyricist", "copyright", "meta", "key", "time", "tempo", "comment"],
	...["start_of_verse", "end_of_verse", "start_of_chorus", "end_of_chorus", "chorus"],
	...["start_of_bridge", "end_of_bridge", "start_of_grid", "end_of_grid", "define"],
]);

const clean = (text: string) => !parseChart(text).diagnostics.some((d) => d.severity === "error");

/** The chord names one line writes: lyric-line chords that are not annotations, and grid cells that are chords. */
function lineNames(line: ChoLine): string[] {
	const found =
		line.kind === "grid"
			? line.cells.flatMap((c) => c.split("~"))
			: line.kind === "lyrics"
				? line.tokens.flatMap((t) => ("chord" in t ? [t.chord] : []))
				: [];
	return found.filter((c) => /^[A-G]/.test(c));
}

/** The chord names the body writes. */
const bodyNames = (lines: ChoLine[]) => new Set(lines.flatMap(lineNames));

/** The chord records of a chart, by the name the sheet writes. */
function playable(text: string): Map<string, ChordRecord> {
	const out = new Map<string, ChordRecord>();
	for (const bar of parseChart(text).bars)
		for (const s of [...bar.slots, ...(bar.parts ?? []).flatMap((p) => p?.slots ?? [])])
			for (const m of s.kind === "group" ? s.members : [s])
				if (m.kind === "chord" && m.chord.kind === "chord") out.set(spelled(m.chord), m.chord);
	return out;
}

for (const options of [{}, { diagrams: "guitar" }] as LyricsheetOptions[]) {
	describe(`the corpus ${options.diagrams ? "with diagrams" : "plain"}`, () => {
		test("every chart with no errors exports", () => {
			for (const [name, text] of corpus())
				if (clean(text)) expect([name, exportLyricsheet(text, options).ok]).toEqual([name, true]);
		});

		test("every sheet is well formed: known directives, balanced, no tab, no trailing space, one final newline", () => {
			for (const [name, text] of corpus()) {
				const r = exportLyricsheet(text, options);
				if (!r.ok) continue;
				const lines = readCho(r.text);
				expect([name, / $/m.test(r.text), r.text.endsWith("\n\n")]).toEqual([name, false, false]);
				const named = lines.flatMap((l) => (l.kind === "directive" ? [l.name] : []));
				expect([name, named.filter((d) => !DIRECTIVES.has(d))]).toEqual([name, []]);
				const open = (d: string) => named.filter((n) => n === `start_of_${d}`).length;
				const shut = (d: string) => named.filter((n) => n === `end_of_${d}`).length;
				for (const d of ["verse", "chorus", "bridge", "grid"])
					expect([name, d, open(d)]).toEqual([name, d, shut(d)]);
				expect(() => readBack(r.text)).not.toThrow();
			}
		});
	});
}

describe("the corpus with diagrams: the defined names", () => {
	test("are the body's chord names that have a playable shape, each once", () => {
		let defined = 0;
		for (const [name, text] of corpus()) {
			const r = exportLyricsheet(text, { diagrams: "guitar" });
			if (!r.ok) continue;
			const lines = readCho(r.text);
			const made = lines.flatMap((l) =>
				l.kind === "directive" && l.name === "define" ? [l.value.split(" ")[0] ?? ""] : [],
			);
			expect([name, made.length]).toEqual([name, new Set(made).size]);
			const records = playable(text);
			const wanted = [...bodyNames(lines)].filter((n) => {
				const c = records.get(n);
				return c !== undefined && shapeFor(c).ok;
			});
			expect([name, [...made].sort()]).toEqual([name, wanted.sort()]);
			defined += made.length;
		}
		expect(defined).toBeGreaterThan(20);
	});
});
