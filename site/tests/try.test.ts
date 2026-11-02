import { describe, expect, test } from "bun:test";
import {
	classify,
	EXAMPLES,
	guideQuery,
	MAX_LENGTH,
	type Reading,
	read,
	summarize,
} from "../src/lib/try/read.ts";

const as = <K extends Reading["kind"]>(r: Reading, kind: K): Reading & { kind: K } => {
	expect(r.kind).toBe(kind);
	return r as Reading & { kind: K };
};

describe("reading what's typed", () => {
	test("classify", () => {
		const cases: [string, string][] = [
			["", "empty"],
			["  ", "empty"],
			["key: D", "chart"],
			["Key:D", "chart"],
			["| D |", "chart"],
			["## Verse", "chart"],
			["C\nG", "chart"],
			["{C E G}", "notes"],
			["C:maj7", "harte"],
			["C", "chord"],
			["Cø", "chord"],
			["C:foo", "chord"],
		];
		expect(cases.map(([input]) => [input, classify(input)])).toEqual(cases);
	});
	test("trims the input", () => {
		expect(as(read(" Cø\n"), "chord").chord.canonical).toBe("Cm7(b5)");
	});
	test("a chord", () => {
		expect(as(read("Cø"), "chord").chord).toEqual({
			typed: "Cø",
			canonical: "Cm7(b5)",
			spoken: "C minor seven flat five",
			harte: "C:hdim7",
			notes: ["C", "Eb", "Gb", "Bb"],
			degrees: ["1", "♭3", "♭5", "♭7"],
			bass: null,
			warnings: [],
		});
	});
	test("a slash chord", () => {
		const { chord } = as(read("C7b9/E"), "chord");
		expect(chord.spoken).toBe("C seven flat nine over E");
		expect(chord.bass).toBe("E");
		expect(chord.degrees).toEqual(["1", "3", "5", "♭7", "♭9"]);
	});
	test("a note set", () => {
		expect(as(read("{C E G}"), "notes").chord.spoken).toBe("notes C, E, G");
	});
	test("a Harte label", () => {
		const r = as(read("C:maj7"), "harte");
		expect(r.label).toBe("C:maj7");
		expect(r.chord.canonical).toBe("Cmaj7");
	});
	test("an error with a suggestion", () => {
		expect(read("H7")).toEqual({
			kind: "error",
			message: 'H7: German "H" is ambiguous; write B',
			suggestion: "B7",
		});
	});
	test("an error without a suggestion has none", () => {
		expect(as(read("C:foo"), "error").suggestion).toBeNull();
	});
	test("plain words show rows, not an error", () => {
		for (const word of ["repeat", "bass", "N"]) expect(read(word)).toEqual({ kind: "text" });
		expect(read("Bass").kind).toBe("error");
	});
	test("a chart", () => {
		const r = as(read("| D | % |x2"), "chart");
		expect(r.canonical).toBe("| D | % | x2\n");
		expect(r.diagnostics).toEqual([]);
		expect(as(read("## Verse"), "chart").diagnostics[0]?.message).toBe(
			'no earlier section named "Verse" to replay',
		);
	});
	test("every example chip reads without an error", () => {
		expect(EXAMPLES).toEqual(["Cø", "C7b9/E", "{C E G}", "C:maj7", "| D | % | x2"]);
		for (const x of EXAMPLES) {
			const r = read(x);
			expect(r.kind).not.toBe("error");
			if (r.kind === "chart") expect(r.diagnostics).toEqual([]);
		}
	});
	test("text past the preview limit isn't read", () => {
		const long = "| C |\n".repeat(10_000);
		const start = performance.now();
		expect(read(long)).toEqual({ kind: "long", length: 60_000, limit: MAX_LENGTH });
		expect(performance.now() - start).toBeLessThan(50);
		expect(MAX_LENGTH).toBe(50_000);
		expect(guideQuery(read(long), long)).toBeNull();
	});
	test("a word the guide knows shows its rows, even when capitalized", () => {
		for (const word of ["Coda", "Chorus"])
			expect(guideQuery(read(word), word)).toEqual({ q: word, cat: null, sort: "category" });
		expect(guideQuery(read("H7"), "H7")?.cat).toBe("chords");
	});
	test("summarize says the reading in one short line", () => {
		expect(summarize(read("Cø"))).toBe("Cm7(b5): C minor seven flat five");
		expect(summarize(read("C:maj7"))).toBe("C:maj7 is Cmaj7: C major seven");
		expect(summarize(read("H7"))).toBe('H7: German "H" is ambiguous; write B');
		expect(summarize(read("| D | A |"))).toBe("a chart, no problems");
		expect(summarize(read("## Verse"))).toBe("a chart, 1 problem");
		expect(summarize(read("repeat"))).toBe("not a chord or a chart");
		expect(summarize(read(""))).toBe("");
	});
	test("guideQuery", () => {
		expect(guideQuery(read("Cø"), "Cø")?.cat).toBe("chords");
		expect(guideQuery(read("repeat"), "repeat")).toEqual({
			q: "repeat",
			cat: null,
			sort: "category",
		});
		expect(guideQuery(read("| D |"), "| D |")).toBeNull();
	});
});
