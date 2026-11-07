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
