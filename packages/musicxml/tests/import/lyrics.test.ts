/**
 * Melodies and verses (voice-and-lyrics design, section 7): a singing part
 * keeps its melody with syllables on the notes, later verses come in as
 * numbered lyric rows, a section sung again with new words as a replay
 * with a lyric row, and the lyric staff as a lyric row with no melody.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseChart, printChart } from "barmark";
import { exportMusicXml, type ImportResult, importMusicXml } from "../../src/index.js";

/** What every import must give: canonical text that parses without errors, and no importer bug. */
function sound(r: ImportResult): ImportResult {
	expect(printChart(r.text)).toBe(r.text);
	expect(parseChart(r.text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	return r;
}

type PartSpec = { name: string; abbreviation?: string; sound?: string; measures: string[] };

/** Another program's score (MuseScore's software line), one `<part>` per spec. */
function score(parts: PartSpec[], software = "MuseScore Studio 4.6.3"): string {
	const list = parts
		.map(
			(p, i) =>
				`<score-part id="P${i + 1}"><part-name>${p.name}</part-name>${p.abbreviation ? `<part-abbreviation>${p.abbreviation}</part-abbreviation>` : ""}<score-instrument id="P${i + 1}-I1"><instrument-name>${p.name}</instrument-name>${p.sound ? `<instrument-sound>${p.sound}</instrument-sound>` : ""}</score-instrument></score-part>`,
		)
		.join("");
	const body = parts
		.map(
			(p, i) =>
				`<part id="P${i + 1}">${p.measures.map((m, k) => `<measure number="${k + 1}">${k === 0 ? TIME : ""}${m}</measure>`).join("")}</part>`,
		)
		.join("");
	return `<?xml version="1.0"?><score-partwise version="4.0"><identification><encoding><software>${software}</software></encoding></identification><part-list>${list}</part-list>${body}</score-partwise>`;
}

const TIME =
	"<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>";

const chord = (step: string) =>
	`<harmony><root><root-step>${step}</root-step></root><kind>major</kind></harmony>`;

/** A lyric: `<text>` and `<elision/>` from `|`-separated parts, with its syllabic and extras. */
const lyric = (text: string, syllabic = "single", verse = 1, extra = "") =>
	`<lyric number="${verse}"><syllabic>${syllabic}</syllabic>${text
		.split("|")
		.map((t) => `<text>${t}</text>`)
		.join("<elision/>")}${extra}</lyric>`;

/** A note `eighths` eighth notes long (divisions 2 to the quarter), `inner` after its duration. */
const n = (pitch: string, eighths: number, inner = "") => {
	const [step = "C", octave = "4"] = pitch.split("");
	return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${eighths}</duration><voice>1</voice>${inner}</note>`;
};
const r = (eighths: number) =>
	`<note><rest/><duration>${eighths}</duration><voice>1</voice></note>`;

const voice = (measures: string[]): PartSpec => ({
	name: "Voice",
	abbreviation: "Vox",
	sound: "voice.vocals",
	measures,
});

const VOX = "part: Vox = Voice, instrument: voice\n";

test("a lead sheet's melody comes in on Vox.Mel with its syllables", () => {
	const xml = score([
		voice([
			chord("C") + n("C4", 4, lyric("hel", "begin")) + n("D4", 4, lyric("lo", "end")),
			chord("G") + n("E4", 4, lyric("world")) + r(4),
		]),
	]);
	const result = sound(importMusicXml(xml));
	expect(result.text).toBe(
		`${VOX}Vox     | C                 | G             |\nVox.Mel | {C4}:hel- {D4}:lo | {E4}:world -- |\n`,
	);
	expect(result.diagnostics).toEqual([]);
});

test("a part that sings with no chord symbols writes its melody on its bare line", () => {
	const xml = score([
		voice([n("C4", 4, lyric("la")) + n("D4", 4, lyric("da"))]),
		{ name: "Guitar", measures: [`${chord("C")}${n("C4", 8, "<notehead>slash</notehead>")}`] },
	]);
	const result = sound(importMusicXml(xml));
	expect(result.text).toBe(
		"part: Vox = Voice, instrument: voice\npart: G = Guitar\nVox | {C4}:la {D4}:da |\nG   | C               |\n",
	);
});

test("two verses stacked on bars written once become lyrics 2:", () => {
	const fixture = new URL("../fixtures/import/lead-sheet.musicxml", import.meta.url);
	const result = sound(importMusicXml(readFileSync(fixture, "utf8")));
	expect(result.text).toBe(
		readFileSync(new URL("../fixtures/import/lead-sheet.chart.md", import.meta.url), "utf8"),
	);
	expect(result.text).toContain("Vo.Mel    | {A4}:Hap- {C5}:py");
	expect(result.text).toContain("lyrics 2: | Whis- per");
	const verses = parseChart(result.text).bars.flatMap((b) => b.lyrics ?? []);
	expect(new Set(verses.map((v) => v.verse))).toEqual(new Set([1, 2]));
});

describe("held syllables", () => {
	test("a melisma comes back as :/, a tie as /", () => {
		const xml = score([
			voice([
				chord("C") +
					n("C4", 2, lyric("ah", "single", 1, "<extend/>")) +
					n("D4", 2) +
					n("E4", 4, `<tie type="start"/>${lyric("oh")}`),
				n("E4", 4, '<tie type="stop"/>') + n("F4", 4, lyric("la")),
			]),
		]);
		const result = sound(importMusicXml(xml));
		expect(result.text).toContain(
			"Vox     | C                        | /         |\nVox.Mel | {C4}:ah {D4}:/ {E4}:oh / | / {F4}:la |",
		);
	});

	test("our own held note, a lyric with only an extend, is :/", () => {
		const xml = score([
			voice([
				chord("C") +
					n("C4", 4, lyric("ah", "single", 1, '<extend type="start"/>')) +
					n("D4", 4, '<lyric number="1"><extend/></lyric>'),
			]),
		]);
		expect(sound(importMusicXml(xml)).text).toContain("Vox.Mel | {C4}:ah {D4}:/ |");
	});

	test("a begin syllable followed by unsung notes holds over them; a single one doesn't", () => {
		const xml = score([
			voice([
				chord("C") +
					n("C4", 2, lyric("glo", "begin")) +
					n("D4", 2) +
					n("E4", 2, lyric("ri", "end")) +
					n("F4", 2),
			]),
		]);
		expect(sound(importMusicXml(xml)).text).toContain("Vox.Mel | {C4}:glo- {D4}:/ {E4}:ri {F4} |");
	});
});

test("an elision comes back as ~", () => {
	const ours = lyric("the|end");
	// MuseScore writes the elision as SMuFL's glyph in a <text> of its own.
	const museScore =
		'<lyric number="1"><syllabic>single</syllabic><text>a</text><text font-family="Leland Text"></text><text>men</text></lyric>';
	const xml = score([voice([chord("C") + n("C4", 4, ours) + n("D4", 4, museScore)])]);
	expect(sound(importMusicXml(xml)).text).toContain("Vox.Mel | {C4}:the~end {D4}:a~men |");
});

test("a section played again with new words is a replay with a lyric row", () => {
	const heading = (text: string) =>
		`<direction placement="above"><direction-type><words font-weight="bold">${text}</words></direction-type></direction>`;
	const verse = (a: string, b: string) => [
		heading("Verse") + chord("C") + n("C4", 4, lyric(a)) + n("D4", 4, lyric(b)),
		chord("G") + n("E4", 8, lyric("oh")),
	];
	const xml = score([voice([...verse("one", "two"), ...verse("three", "four")])]);
	const result = sound(importMusicXml(xml));
	expect(result.text).toBe(
		`${VOX}\n## Verse\nVox     | C                 | G       |\nVox.Mel | {C4}:one {D4}:two | {E4}:oh |\n\n## Verse\nlyrics: | three four | oh |\n`,
	);
	const sung = parseChart(result.text).bars.map((b) =>
		(b.lyrics ?? []).flatMap((l) =>
			l.syllables.map((s) => (s.syllable.kind === "sung" ? s.syllable.parts[0] : "/")),
		),
	);
	expect(sung).toEqual([["one", "two"], ["oh"], ["three", "four"], ["oh"]]);
});

/** A chart's MusicXML, which must export. */
function xmlOf(chart: string): string {
	const out = exportMusicXml(chart);
	if (!out.ok) throw new Error(out.diagnostics.map((d) => d.message).join("; "));
	return out.xml;
}

describe("the lyric staff", () => {
	const CHART = "        | C              | G      |\nlyrics: | yo / spit_it / | -- out |\n";

	test("a part marked <?barmark lyrics?> comes back as a lyric row", () => {
		const xml = xmlOf(CHART);
		expect(xml).toContain("<?barmark lyrics?>");
		const result = sound(importMusicXml(xml));
		expect(result.text).toBe(CHART);
		expect(result.diagnostics).toEqual([]);
	});

	test("after MuseScore (no marker, pitched B4 slashes) it is still a lyric row", () => {
		const xml = xmlOf(CHART)
			.replace("<?barmark lyrics?>", "")
			.replaceAll(
				"<unpitched><display-step>B</display-step><display-octave>4</display-octave></unpitched>",
				"<pitch><step>B</step><octave>4</octave></pitch>",
			)
			.replace("@barmark/musicxml", "MuseScore Studio");
		expect(xml).not.toContain("<unpitched>");
		const result = sound(importMusicXml(xml));
		expect(result.text).toBe(CHART);
	});
});

test("a rhythm the grammar can't write snaps, with a loss naming the measures", () => {
	// Five notes in a quarter: a quintuplet, which no group of 2, 3, 4 or 6 holds.
	const quintuplet = Array.from(
		{ length: 5 },
		(_, i) =>
			`<note><pitch><step>${"CDEFG"[i]}</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><time-modification><actual-notes>5</actual-notes><normal-notes>4</normal-notes></time-modification>${lyric(`l${i}`)}</note>`,
	).join("");
	const xml = score([
		{
			...voice([]),
			measures: [
				`<attributes><divisions>10</divisions></attributes>${chord("C")}${quintuplet}<note><pitch><step>C</step><octave>5</octave></pitch><duration>30</duration><voice>1</voice></note>`,
				`${chord("G")}<note><pitch><step>C</step><octave>5</octave></pitch><duration>40</duration><voice>1</voice>${lyric("end")}</note>`,
			],
		},
	]);
	const result = sound(importMusicXml(xml));
	expect(result.diagnostics).toEqual([
		{
			severity: "warning",
			message: "a rhythm barmark can't write, snapped to the nearest it can in measure 1",
			part: "Voice",
			measure: "1",
			measures: ["1"],
		},
	]);
	// Sixths of the beat move them least, the fourth onset to the fifth sixth.
	expect(result.text).toContain("{C4}:l0_{D4}:l1_{E4}:l2_/_{F4}:l3_{G4}:l4 {C5} / / | {C5}:end |");
});

test("a horn melody with no lyrics is still left out, named in the warning", () => {
	const xml = score([
		{
			name: "Trumpet",
			measures: [chord("C") + n("C5", 4) + n("D5", 4), chord("G") + n("E5", 8)],
		},
	]);
	const result = sound(importMusicXml(xml));
	expect(result.text).toBe("| C | G |\n");
	expect(result.diagnostics).toEqual([
		{
			severity: "warning",
			message: "notes read as a melody and left out in 2 measures: 1, 2",
			part: "Trumpet",
			measure: "1",
			measures: ["1", "2"],
		},
	]);
});

describe("choirs", () => {
	test("each part sings its own syllables; later verses of another part are named", () => {
		const sop = voice([n("C5", 8, lyric("la") + lyric("na", "single", 2))]);
		const alto = {
			name: "Alto",
			sound: "voice.alto",
			measures: [n("A4", 8, lyric("lo") + lyric("no", "single", 2))],
		};
		const result = sound(
			importMusicXml(score([{ ...sop, name: "Soprano", abbreviation: "S" }, alto])),
		);
		expect(result.text).toBe(
			"part: S = Soprano\npart: A = Alto\nS         | {C5}:la |\nA         | {A4}:lo |\nlyrics 2: | na      |\n",
		);
		expect(result.diagnostics).toEqual([
			{
				severity: "warning",
				message: "verses 2 and later in Alto left out; the lyric rows are Soprano's",
				part: "Alto",
			},
		]);
	});
});

describe("barmark → MusicXML → barmark", () => {
	test("a lead sheet with a melisma and a second verse comes back as written", () => {
		const chart = `part: Vox = Voice, instrument: voice
time: 3/4
Vox       | G                           | G / G7                | C                     | G          |
Vox.Mel   | {G4}:maz- / {B4}:ing_{G4}:/ | {B4}:grace / {A4}:how | {G4}:sweet / {E4}:the | {D4}:sound |
lyrics 2: | grace / that                | taught / my           | heart / to            | fear       |
`;
		// Verse 2 sings nothing new on the melisma's second note: its row says nothing there.
		const result = sound(importMusicXml(xmlOf(chart)));
		expect(result.text).toBe(chart);
		expect(result.diagnostics).toEqual([]);
	});

	test("verses on a repeat's passes come back as a numbered row", () => {
		const chart = `part: V = Voice, instrument: voice
V         | C                 | G          | x2
V.Mel     | {C4}:one {D4}:two | {E4}:three | x2
lyrics 2: | uno dos           | tres       |
`;
		expect(sound(importMusicXml(xmlOf(chart))).text).toBe(chart);
	});
});
