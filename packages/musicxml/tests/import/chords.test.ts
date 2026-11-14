import { describe, expect, test } from "bun:test";
import { parseChord, parseHarte } from "barmark";
import { readHarmony, type Transpose } from "../../src/import/chords.js";
import { child, children, parseXml, textOf, type XNode } from "../../src/import/tree.js";
import { exportMusicXml } from "../../src/index.js";
import { KINDS } from "../../src/kinds.js";
import { corpus } from "../charts.js";
import { harmonyText } from "../play.js";

const CONCERT = { chromatic: 0, octave: 0, diatonic: null };
const harmony = (inner: string) => {
	const node = parseXml(`<harmony>${inner}</harmony>`);
	if (!node) throw new Error("bad xml");
	return node;
};
const root = (step: string, alter = 0) =>
	`<root><root-step>${step}</root-step>${alter ? `<root-alter>${alter}</root-alter>` : ""}</root>`;
const degree = (value: number, alter: number, type: string) =>
	`<degree><degree-value>${value}</degree-value><degree-alter>${alter}</degree-alter><degree-type>${type}</degree-type></degree>`;

/** Every <harmony> an export writes, with its part's transpose and the chord as barmark spells it (written pitch). */
function exported(chart: string) {
	const r = exportMusicXml(chart);
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
	const harmonies: { node: XNode; by: Transpose; expected: string }[] = [];
	const doc = parseXml(r.xml);
	for (const part of doc ? children(doc, "part") : []) {
		let by: Transpose = CONCERT;
		for (const m of children(part, "measure")) {
			const t = child(child(m, "attributes") ?? m, "transpose");
			if (t)
				by = {
					chromatic: Number(textOf(t, "chromatic")),
					octave: Number(textOf(t, "octave-change")) || 0,
					diatonic: Number(textOf(t, "diatonic")),
				};
			for (const h of children(m, "harmony")) harmonies.push({ node: h, by, expected: "" });
		}
	}
	// the export's own text for each harmony, in document order
	const texts = [...r.xml.matchAll(/<harmony>([\s\S]*?)<\/harmony>/g)].map((m) =>
		harmonyText(m[1] ?? ""),
	);
	harmonies.forEach((h, i) => {
		h.expected = texts[i] ?? "";
	});
	return { harmonies };
}
const canonical = (symbol: string) => {
	if (symbol === "N.C.") return symbol;
	const r = parseChord(symbol);
	if (!r.ok) throw new Error(`${symbol} does not parse`);
	return r.value.canonical;
};

describe("readHarmony", () => {
	test.each([
		["major", "", "C", "C"],
		["minor-seventh", "", "D", "Dm7"],
		["dominant", degree(9, -1, "add"), "G", "G7(b9)"],
		["diminished-seventh", "", "C", "Cdim7"],
		["half-diminished", "", "C", "Cm7(b5)"],
		["major-minor", "", "C", "Cmmaj7"],
		["augmented-seventh", "", "C", "Caug7"],
	])("meaning: %s", (kind, degrees, step, slot) => {
		const r = readHarmony(harmony(`${root(step)}<kind>${kind}</kind>${degrees}`), CONCERT);
		expect(r).toEqual({ slot: canonical(slot), original: null });
	});
	test("an added flat sixth is (b6); an added flat thirteenth is (b13)", () => {
		const read = (kind: string, d: string) =>
			readHarmony(harmony(`${root("F", 1)}<kind>${kind}</kind>${d}`), CONCERT).slot;
		expect(read("minor", degree(6, -1, "add"))).toBe("F#m(b6)");
		expect(read("minor", degree(13, -1, "add"))).toBe("F#m(b13)");
		expect(read("major", degree(6, -1, "add"))).toBe("F#(b6)");
	});
	test("a flat sixth with a second degree: C(b6,9) and Cm(b6,9)", () => {
		const read = (kind: string) =>
			readHarmony(
				harmony(`${root("C")}<kind>${kind}</kind>${degree(6, -1, "add")}${degree(9, 0, "add")}`),
				CONCERT,
			).slot;
		expect(read("major")).toBe("C(b6,9)");
		expect(read("minor")).toBe("Cm(b6,9)");
	});
	test("a major-sixth kind with no text: a sixth altered flat is (b6), one added is (b6,6)", () => {
		const read = (type: string) =>
			readHarmony(harmony(`${root("C")}<kind>major-sixth</kind>${degree(6, -1, type)}`), CONCERT)
				.slot;
		expect(read("alter")).toBe("C(b6)");
		// the kind's own sixth stays and a flat one joins it: both sound
		expect(read("add")).toBe("C(b6,6)");
	});
	test("a thirteenth with a flattened ninth reads as it did at the base, with no text", () => {
		const r = readHarmony(
			harmony(`${root("C")}<kind>dominant-13th</kind>${degree(9, -1, "alter")}`),
			CONCERT,
		);
		// MusicXML's dominant-13th holds the 11 too, so the base (a23242b) already read C13(b9,11), not C13(b9)
		expect(r.slot).toBe("C13(b9,11)");
	});
	test("meaning wins over display text", () => {
		const r = readHarmony(
			harmony(`${root("C")}<kind text="whatever">major-seventh</kind>`),
			CONCERT,
		);
		expect(r.slot).toBe("Cmaj7");
	});
	test("Dorico's half-diminished, shown as m7 with its b5 left to the kind, is m7(b5)", () => {
		const r = readHarmony(
			harmony(`${root("F", 1)}<kind text="m7" parentheses-degrees="yes">half-diminished</kind>`),
			CONCERT,
		);
		expect(r).toEqual({ slot: "F#m7(b5)", original: null });
	});
	test("a kind's Harte shorthand spells exactly its intervals, and the ones barmark names have one", () => {
		const key = (ivs: { degree: number; alter: number }[]) =>
			ivs
				.map((i) => `${i.alter}:${i.degree}`)
				.sort()
				.join();
		for (const k of KINDS) {
			if (!k.harte) continue;
			const h = parseHarte(`C:${k.harte}`);
			if (!h || h === "N" || h === "X") throw new Error(`${k.harte} unreadable`);
			expect(key(h.intervals)).toBe(key(k.intervals ?? []));
		}
		const named = KINDS.filter((k) => k.harte).map((k) => k.kind);
		expect(named).toContain("half-diminished");
		expect(named).toContain("major-minor");
		expect(named).toContain("diminished-seventh");
	});
	test("display text when the kind is other", () => {
		const r = readHarmony(harmony(`${root("C")}<kind text="7alt">other</kind>`), CONCERT);
		expect(r).toEqual({ slot: canonical("C7alt"), original: null });
	});
	test("Tristan is ? with its text kept", () => {
		const r = readHarmony(harmony(`${root("C")}<kind text="Tristan">Tristan</kind>`), CONCERT);
		expect(r).toEqual({ slot: "?", original: "CTristan" });
	});
	test("none is N.C.", () => {
		const r = readHarmony(
			harmony('<root><root-step text="">C</root-step></root><kind text="N.C.">none</kind>'),
			CONCERT,
		);
		expect(r).toEqual({ slot: "N.C.", original: null });
	});
	test("bass", () => {
		const r = readHarmony(
			harmony(`${root("C")}<kind>major</kind><bass><bass-step>E</bass-step></bass>`),
			CONCERT,
		);
		expect(r.slot).toBe("C/E");
	});
	test("concert pitch through transpose", () => {
		const r = readHarmony(harmony(`${root("D")}<kind>major</kind>`), {
			chromatic: -2,
			octave: 0,
			diatonic: null,
		});
		expect(r.slot).toBe("C");
		const bb = readHarmony(
			harmony(`${root("C")}<kind>major</kind><bass><bass-step>G</bass-step></bass>`),
			{ chromatic: -2, octave: 0, diatonic: -1 },
		);
		expect(bb.slot).toBe("Bb/F");
	});
	test("a function with no root is ? with its text", () => {
		const r = readHarmony(harmony("<function>V7</function><kind>dominant</kind>"), CONCERT);
		expect(r).toEqual({ slot: "?", original: "V7" });
	});
	test("a note set is not a meaning", () => {
		const r = readHarmony(harmony(`${root("C")}<kind>pedal</kind>`), CONCERT);
		expect(r.slot === "?" || !r.slot.startsWith("{")).toBe(true);
	});
	test("an unreadable root is ?", () => {
		expect(readHarmony(harmony("<kind>major</kind>"), CONCERT).slot).toBe("?");
	});

	describe("round trips every harmony the export writes", () => {
		for (const [name, text] of corpus())
			test(name, () => {
				const { harmonies } = exported(text);
				for (const h of harmonies) {
					const got = readHarmony(h.node, h.by);
					expect(got).toEqual({ slot: canonical(h.expected), original: null });
				}
			});
	});

	test("the flat sixth and the new add and Δ spellings round-trip to the same chord", () => {
		const symbols = ["F#m(b6)", "C6(b6)", "Cadd13", "CΔ9", "Cm7b6", "C(b6,9)", "Cm(b13)"];
		const { harmonies } = exported(`key: C\n| ${symbols.join(" ")} |\n`);
		expect(harmonies).toHaveLength(symbols.length);
		symbols.forEach((symbol, i) => {
			const h = harmonies[i];
			if (!h) throw new Error("missing harmony");
			const got = readHarmony(h.node, h.by).slot;
			const before = parseChord(symbol);
			const after = parseChord(got);
			if (!before.ok || !after.ok) throw new Error(`${symbol} or ${got} does not parse`);
			const pitches = (r: typeof before.value) =>
				r.intervals
					.map((iv) => `${iv.degree}:${iv.alter}`)
					.sort()
					.join(" ");
			expect(`${symbol} → ${got} ${pitches(after.value)}`).toBe(
				`${symbol} → ${got} ${pitches(before.value)}`,
			);
			expect(got).toBe(before.value.canonical);
		});
	});

	test("with the kind's text stripped, the meaning alone brings the symbol back", () => {
		// The export's text wins over the notes when they agree, so only a stripped file tests the meaning.
		// C6(b6) comes back as C(b6): the 6 is replaced by its flat, the same notes, and the plainer spelling.
		// Cadd13 is C(13), and without text stays C(13): a 13 is not a 6 for barmark.
		const cases: [string, string][] = [
			["F#m(b6)", "F#m(b6)"],
			["Cm7(b6)", "Cm7(b6)"],
			["C(b6,9)", "C(b6,9)"],
			["C6(b6)", "C(b6)"],
			["Cadd13", "C(13)"],
			["CΔ9", "Cmaj9"],
		];
		const r = exportMusicXml(`key: C\n| ${cases.map(([s]) => s).join(" ")} |\n`);
		if (!r.ok) throw new Error("export failed");
		const stripped = r.xml.replace(/(<kind) text="[^"]*"/g, "$1");
		expect(stripped).not.toContain("<kind text=");
		const doc = parseXml(stripped);
		const slots = (doc ? children(doc, "part") : []).flatMap((p) =>
			children(p, "measure").flatMap((m) =>
				children(m, "harmony").map((h) => readHarmony(h, CONCERT).slot),
			),
		);
		expect(slots).toEqual(cases.map(([, back]) => back));
		for (const [symbol, back] of cases) {
			const a = parseChord(symbol);
			const b = parseChord(back);
			if (!a.ok || !b.ok) throw new Error(`${symbol} or ${back} does not parse`);
			const notes = (v: typeof a.value) =>
				v.intervals
					.map((i) => `${i.alter}:${i.degree}`)
					.sort()
					.join(" ");
			expect(`${symbol} ${notes(b.value)}`).toBe(`${symbol} ${notes(a.value)}`);
		}
	});

	test("a transposing part reads back at concert pitch", () => {
		const bars = "| C F#m7b5/C Bb7#9 Ebmaj7/G | G13 Dbm Abdim7 N.C. |\n";
		for (const [instrument, key] of [
			["trumpet in Bb", "C"],
			["alto sax", "C"],
			["tenor sax", "F"],
			["alto sax", "B"],
		]) {
			const { harmonies } = exported(
				`part: P = Part, instrument: ${instrument}\nkey: ${key}\n${bars}`,
			);
			const concert = exported(`key: ${key}\n${bars}`).harmonies;
			expect(harmonies.length).toBe(concert.length);
			harmonies.forEach((h, i) => {
				const slot = readHarmony(h.node, h.by).slot;
				expect(slot).toBe(canonical(concert[i]?.expected ?? ""));
			});
		}
	});
});
