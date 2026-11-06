/**
 * The voice-and-lyrics acceptance test (design, section 7): melody and
 * lyrics round-trip in both directions. MuseScore's hymn (a pickup, two
 * verses, a melisma, an elision and a tie across a bar) comes in and goes
 * back out with the same notes, rhythm and lyrics; the design's lead sheet
 * and a lyric row with no melody go out and come back as written.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { printChart } from "barmark";
import { child, children, parseXml, textOf, type XNode } from "../../src/import/tree.js";
import { exportMusicXml, importMusicXml } from "../../src/index.js";
import { AMAZING_GRACE } from "../charts.js";

const fixture = (name: string) =>
	readFileSync(new URL(`../fixtures/import/${name}`, import.meta.url), "utf8");

/** MuseScore writes an elision as SMuFL's lyrics elision glyph in a `<text>` of its own. */
const ELISION_GLYPH = "";

/**
 * A `<lyric>` as compared: number, syllabic, its syllables joined by `~`
 * (an `<elision/>` or MuseScore's glyph between them), and `+` for an
 * extension on an end or single syllable, the only ones MuseScore keeps.
 * Null for a lyric with no text (our `<extend/>` alone on a held note).
 */
function lyricOf(l: XNode): string | null {
	if (!children(l, "text").length) return null;
	const syllabic = textOf(l, "syllabic") || "single";
	const extend = child(l, "extend") && (syllabic === "end" || syllabic === "single") ? " +" : "";
	return `${l.attrs.number} ${syllabic} ${syllablesOf(l)}${extend}`;
}

/** A lyric's syllables joined by `~`, at an `<elision/>` or MuseScore's glyph. */
function syllablesOf(l: XNode): string {
	const elides = (c: XNode) =>
		c.name === "elision" || (c.name === "text" && textOf(c) === ELISION_GLYPH);
	return l.children
		.filter((c) => c.name === "text" || elides(c))
		.map((c) => (elides(c) ? "~" : textOf(c)))
		.join("");
}

/** A note as compared: its measure, pitch (or rest), length in quarters, ties and lyrics. */
function noteOf(n: XNode, measure: number, divisions: number): string {
	const pitch = child(n, "pitch");
	const name = pitch
		? `${textOf(pitch, "step")}${textOf(pitch, "alter")}${textOf(pitch, "octave")}`
		: "rest";
	const quarters = Number(textOf(n, "duration")) / divisions;
	const ties = children(n, "tie").map((t) => t.attrs.type);
	const lyrics = children(n, "lyric").flatMap((l) => lyricOf(l) ?? []);
	return [measure, name, quarters, ...ties, ...lyrics].join(" ");
}

/** Every note of every part, in order, as `noteOf` writes it. */
function sungNotes(xml: string): string[][] {
	const root = parseXml(xml);
	if (!root) throw new Error("unreadable MusicXML");
	return children(root, "part").map((part) => {
		let divisions = 1;
		return children(part, "measure").flatMap((m, i) => {
			const d = Number(textOf(child(m, "attributes"), "divisions"));
			if (d > 0) divisions = d;
			return children(m, "note").map((n) => noteOf(n, i, divisions));
		});
	});
}

describe("MusicXML → barmark → MusicXML", () => {
	const theirs = fixture("hymn.musicxml");

	test("MuseScore's hymn imports to its chart", () => {
		const r = importMusicXml(theirs);
		expect(r.text).toBe(fixture("hymn.chart.md"));
		expect(r.diagnostics).toEqual([]);
	});

	test("MusicXML → barmark → MusicXML keeps every note, rhythm and syllable", () => {
		const exported = exportMusicXml(importMusicXml(theirs).text);
		if (!exported.ok) throw new Error(exported.diagnostics.map((d) => d.message).join("; "));
		const want = sungNotes(theirs);
		expect(sungNotes(exported.xml)).toEqual(want);
		// The hymn holds what the round trip must keep.
		const all = want.flat().join("\n");
		expect(all).toContain("1 end ing +");
		expect(all).toContain("2 single and~I");
		expect(all).toContain("4 D4 3 start 1 single sound");
		expect(all).toContain("5 D4 2 stop");
		expect(all).toMatch(/^0 D4 1 1 begin A 2 single 'Twas$/m);
	});

	test("MuseScore's lead sheet keeps every melody note, rhythm and syllable", () => {
		const lead = fixture("lead-sheet.musicxml");
		const exported = exportMusicXml(importMusicXml(lead).text);
		if (!exported.ok) throw new Error(exported.diagnostics.map((d) => d.message).join("; "));
		// The two intro measures are slash notes, which MuseScore writes as B-flat 4 and
		// we write as B4 (a chord line's slashes have no pitch); everything sung is compared.
		const sung = (xml: string) => sungNotes(xml).map((p) => p.filter((n) => !/^[01] /.test(n)));
		const want = sung(lead);
		expect(sung(exported.xml)).toEqual(want);
		expect(want.flat().join("\n")).toContain("2 end ning,");
	});
});

describe("barmark → MusicXML → barmark gives the chart back", () => {
	test.each([
		["Amazing Grace (the design's lead sheet)", AMAZING_GRACE],
		["spoken.chart.md (a lyric row with no melody)", fixture("spoken.chart.md")],
	])("%s", (_name, chart) => {
		const exported = exportMusicXml(chart);
		if (!exported.ok) throw new Error(exported.diagnostics.map((d) => d.message).join("; "));
		const back = importMusicXml(exported.xml);
		expect(back.text).toBe(printChart(chart));
		expect(back.diagnostics).toEqual([]);
	});
});
