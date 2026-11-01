import { describe, expect, test } from "bun:test";
import { parseChart, parseChord } from "barmark";
import { matches, readQuery, sorted, writeQuery } from "../src/lib/guide/query.ts";
import { CATEGORIES, ROWS } from "../src/lib/guide/rows.ts";

describe("guide rows", () => {
	test("ids are unique", () => {
		expect(new Set(ROWS.map((r) => r.id)).size).toBe(ROWS.length);
	});
	test("every section of the grammar has a row", () => {
		const refs = new Set(ROWS.map((r) => r.ref));
		for (const ref of [
			"§1",
			"§2",
			"§2.1",
			"§2.2",
			"§2.3",
			"§2.4",
			"§3",
			"§4",
			"§4.1",
			"§5",
			"§6",
			"§7",
			"§7.1",
			"§7.2",
		])
			expect(refs).toContain(ref);
	});
	test("every slot symbol, repeat form and directive has a row", () => {
		const syntax = new Set(ROWS.map((r) => r.syntax));
		for (const s of [
			"/",
			"%",
			"N.C.",
			"--",
			"?",
			"...",
			"{E}",
			"x2",
			"|: :|",
			"x ...",
			"->",
			"key:",
			"time:",
			"tempo:",
			"tempo: rit. to 90",
			"tempo: a tempo",
			"feel:",
			"### Note",
		])
			expect(syntax).toContain(s);
	});
	test("code fences, endings, bare alterations, other spellings and the missing | have rows", () => {
		const ids = new Set(ROWS.map((r) => r.id));
		for (const id of [
			"code-fence",
			"endings",
			"bare-alteration",
			"spellings",
			"missing-trailing-pipe",
		])
			expect(ids).toContain(id);
	});
	test("at least two rows show an error", () => {
		const errors = ROWS.filter((r) =>
			parseChart(r.example).diagnostics.some((d) => d.severity === "error"),
		);
		expect(errors.length).toBeGreaterThanOrEqual(2);
	});
	for (const row of ROWS)
		test(`${row.id}: the parser agrees`, () => {
			const chart = parseChart(row.example);
			const messages = chart.diagnostics.map((d) => d.message);
			const expected = row.expect?.diagnostics ?? [];
			expect(messages.length).toBe(expected.length);
			for (const [i, part] of expected.entries()) expect(messages[i]).toContain(part);
			if (row.expect?.bars !== undefined) expect(chart.bars.length).toBe(row.expect.bars);
			const chord = row.expect?.chord;
			if (chord) {
				const parsed = parseChord(chord.symbol);
				expect(parsed.ok).toBe(true);
				if (parsed.ok) {
					expect(parsed.value.canonical).toBe(chord.canonical);
					expect(parsed.value.harte).toBe(chord.harte);
				}
			}
		});
});

describe("guide sentences say no more than the grammar", () => {
	const meaning = (id: string) => ROWS.find((r) => r.id === id)?.meaning ?? "";
	test("an altered tone replaces only when the chord has that tone", () => {
		const added = parseChord("C(b9)");
		expect(added.ok && added.value.pitches).toEqual(["C", "E", "G", "Db"]);
		expect(meaning("altered")).toContain("otherwise it adds");
	});
	test("under N.C. others may carry on, not must", () => {
		expect(meaning("no-chord")).toContain("may");
	});
	test("x N says how many times", () => {
		expect(meaning("repeat-line")).toContain("N times");
	});
});

describe("guide query", () => {
	test("reads a shared link", () => {
		expect(readQuery(new URLSearchParams("q=repeat&cat=repeats"))).toEqual({
			q: "repeat",
			cat: "repeats",
			sort: "category",
		});
	});
	test("ignores an unknown category and sort", () => {
		const query = readQuery(new URLSearchParams("cat=nope&sort=sideways"));
		expect(query.cat).toBeNull();
		expect(query.sort).toBe("category");
	});
	test("writes only what differs from the default", () => {
		expect(writeQuery(readQuery(new URLSearchParams("")))).toBe("");
		expect(writeQuery(readQuery(new URLSearchParams("q=repeat&cat=repeats")))).toBe(
			"q=repeat&cat=repeats",
		);
		expect(writeQuery({ q: "", cat: null, sort: "name" })).toBe("sort=name");
	});
	test("search matches syntax, meaning and category, ignoring case", () => {
		const q = (text: string) => ({ q: text, cat: null, sort: "category" as const });
		expect(ROWS.filter((r) => matches(r, q("REPEAT"))).map((r) => r.syntax)).toContain("x2");
		expect(ROWS.filter((r) => matches(r, q("N.C."))).map((r) => r.id)).toContain("no-chord");
		expect(ROWS.filter((r) => matches(r, q("directives"))).length).toBeGreaterThanOrEqual(4);
	});
	test("musicians' names for things find their rows", () => {
		const found = (text: string) =>
			ROWS.filter((r) => matches(r, { q: text, cat: null, sort: "category" })).map((r) => r.id);
		for (const [term, id] of [
			["elision", "elision"],
			["Simile", "simile"],
			["fermata", "fermata"],
			["triplet", "group"],
			["vamp", "open-repeat"],
			["fade", "open-repeat"],
			["volta", "endings"],
			["power chord", "power-chord"],
			["slash chord", "slash-chord"],
			["push", "group"],
			["rest", "silence"],
			["stop", "silence"],
			["placeholder", "unknown"],
			["bpm", "tempo"],
			["meter", "time"],
			["time signature", "time"],
			["swing", "feel"],
			["rehearsal", "section"],
			// Tempo changes
			["ritardando", "tempo-change"],
			["rall", "tempo-change"],
			["accelerando", "tempo-change"],
			["slow down", "tempo-change"],
			["speed up", "tempo-change"],
			["back to tempo", "a-tempo"],
			// Chord words
			["maj7", "chord"],
			["minor", "chord"],
			["diminished", "chord"],
			["half-diminished", "altered"],
			["m7b5", "altered"],
			["add9", "ambiguous-2"],
			["sus2", "ambiguous-2"],
			["inversion", "slash-chord"],
			["no third", "power-chord"],
			// Bars and rhythm
			["measure", "bar-line"],
			["ditto", "simile"],
			["two chords in a bar", "slots"],
			["sustain", "hold"],
			["let ring", "fermata"],
			["no chord", "no-chord"],
			["cutoff", "silence"],
			["mixed meter", "one-bar-meter"],
			// Form
			["verse", "section"],
			["da capo", "replay"],
			["dal segno", "replay"],
			["coda", "replay"],
			["repeat section", "section-repeat"],
			["first ending", "endings"],
			["loop", "repeat-line"],
			["repeat sign", "repeat-signs"],
			["ad lib", "open-repeat"],
			// Directives and text
			["key change", "directives-line"],
			["modulation", "directives-line"],
			["key signature", "key"],
			["dorian", "key"],
			["waltz", "time"],
			["speed", "tempo"],
			["shuffle", "feel"],
			["song title", "title"],
			["comment", "notes-heading"],
			["words", "lyrics"],
			["markdown", "code-fence"],
			// Shorthand and other software
			["Δ", "chord-aliases"],
			["triangle", "chord-aliases"],
			["°", "chord-aliases"],
			["ø", "chord-aliases"],
			["min7", "chord-aliases"],
			["Logic Pro", "logic-parentheses"],
			["pickup", "one-bar-meter"],
			["anacrusis", "one-bar-meter"],
			["6/9", "chord"],
			["half diminished", "altered"],
			["pre-chorus", "section"],
			["tag", "section-repeat"],
			// Things barmark doesn't write: the guide says what to write instead
			["capo", "capo"],
			["transpose", "transpose"],
			["ChordPro", "inline-chords"],
			["chords over lyrics", "inline-chords"],
			["Nashville", "numerals"],
			["roman numerals", "numerals"],
			["crescendo", "dynamics"],
			["accent", "dynamics"],
			["second ending", "endings"],
		])
			expect(found(term)).toContain(id);
	});
	test("each word of a search may match anywhere in the row, in any order", () => {
		const found = (text: string) =>
			ROWS.filter((r) => matches(r, { q: text, cat: null, sort: "category" })).map((r) => r.id);
		expect(found("change key")).toContain("directives-line");
		expect(found("minor seventh")).toContain("chord");
		expect(found("  slow   down ")).toContain("tempo-change");
		expect(found("minor zebra")).toEqual([]);
	});

	test("a category narrows exactly", () => {
		const rows = ROWS.filter((r) => matches(r, { q: "", cat: "notes", sort: "category" }));
		expect(rows.every((r) => r.category === "notes")).toBe(true);
		expect(rows.length).toBeGreaterThan(0);
	});
	test("sorting by category follows the category order, then the guide's", () => {
		const rows = sorted(ROWS, "category");
		expect(rows[0]?.category).toBe(CATEGORIES[0]);
		const order = rows.map((r) => CATEGORIES.indexOf(r.category));
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});
	test("sorting by name follows the syntax", () => {
		const names = sorted(ROWS, "name").map((r) => r.syntax);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});
	test("sorting never changes the rows it was given", () => {
		const before = ROWS.map((r) => r.id);
		sorted(ROWS, "name");
		expect(ROWS.map((r) => r.id)).toEqual(before);
	});
});
