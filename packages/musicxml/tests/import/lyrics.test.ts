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

	test("a verse's melisma held into a new section's row holds on there", () => {
		const heading = (text: string) =>
			`<direction placement="above"><direction-type><words font-weight="bold">${text}</words></direction-type></direction>`;
		const xml = score([
			voice([
				heading("A") +
					n("C4", 4, lyric("a") + lyric("x", "single", 2, "<extend/>")) +
					n("D4", 4, lyric("b")),
				heading("B") + n("E4", 4, lyric("c")) + n("F4", 4, lyric("d") + lyric("y", "single", 2)),
			]),
		]);
		const result = sound(importMusicXml(xml));
		expect(result.text).toContain("lyrics 2: | x /");
		expect(result.text).toContain("lyrics 2: | / y");
		expect(parseChart(result.text).diagnostics).toEqual([]);
	});

	test("a held note before its verse sings anything holds nothing: the row writes --", () => {
		const xml = score([
			voice([
				n("C4", 4, `${lyric("a")}<lyric number="2"><extend type="stop"/></lyric>`) +
					n("D4", 4, lyric("b") + lyric("y", "single", 2)),
			]),
		]);
		const result = sound(importMusicXml(xml));
		expect(result.text).toContain("lyrics 2: | -- y");
		expect(parseChart(result.text).diagnostics).toEqual([]);
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
		`${VOX}\n## Verse\nVox     | C                 | G       |\nVox.Mel | {C4}:one {D4}:two | {E4}:oh |\n\n## Verse\nlyrics: | three four | oh / |\n`,
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

	test("a system that sings only verse 1 writes lyrics:, though another numbers its verses", () => {
		const chart = `          | C         | G       | x2
lyrics 1: | one two   | three / |
lyrics 2: | four five | six /   |
        | F       | C       |
lyrics: | sev- en | eight / |
`;
		expect(sound(importMusicXml(xmlOf(chart))).text).toBe(chart);
	});

	test("the rows stay the voice part's when every part plays alike", () => {
		const chart = `part: Gtr = Guitar
${VOX}Gtr     | C       | G       |
Vox     | C       | G       |
lyrics: | hel- lo | there / |
`;
		const back = sound(importMusicXml(xmlOf(chart))).text;
		const singers = (t: string) =>
			parseChart(t).bars.flatMap((b) => (b.lyrics ?? []).map((l) => l.part ?? null));
		expect(singers(back)).toEqual(["Vox", "Vox"]);
		expect(back).toContain(VOX);
	});

	test("an ending's rows stay numbered when the chart numbers its verses", () => {
		const chart = `          |: C   |
lyrics 1: | one |
lyrics 2: | two |
          |1 G    :|
lyrics 1: | five |
          |2 G7   | C   |
lyrics 2: | done | end |
`;
		expect(sound(importMusicXml(xmlOf(chart))).text).toBe(chart);
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
				message: "verses 2 and later in Alto left out (the lyric rows are Soprano's) in measure 1",
				part: "Alto",
				measure: "1",
				measures: ["1"],
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
lyrics 2: | grace / that                | taught / my           | heart / to            | fear / /   |
`;
		// Verse 2 sings nothing new on the melisma's second note: its row says nothing there.
		// `fear` is held on the row's grid, a slot a beat, as its other bars are.
		const result = sound(importMusicXml(xmlOf(chart)));
		expect(result.text).toBe(chart);
		expect(result.diagnostics).toEqual([]);
	});

	test("a row writes its bars on one grid, so a held last syllable keeps its holds", () => {
		const chart = "        | C       | G       |\nlyrics: | one two | three / |\n";
		expect(sound(importMusicXml(xmlOf(chart))).text).toBe(chart);
	});

	test("a row's bar isn't spread where a new note it doesn't sing would be held", () => {
		const chart = `${VOX}Vox       | C                               | G                     |
Vox.Mel   | {C4}:a {D4}:b {E4}:c {F4}:d     | {G4}:e {A4} {B4} {C5} |
lyrics 2: | w x y z                         | v                     |
`;
		expect(sound(importMusicXml(xmlOf(chart))).text).toBe(printChart(chart));
	});

	test("a melody bar that repeats the notes before it, unsung, is %", () => {
		const chart = `${VOX}Vox     | C                               | % | G        |
Vox.Mel | {C4}:la {D4}:la {E4}:la {F4}:la | % | {G4}:end |
`;
		expect(sound(importMusicXml(xmlOf(chart))).text).toBe(chart);
	});

	test("verses on a repeat's passes come back as a numbered row", () => {
		const chart = `part: V = Voice, instrument: voice
V         | C                 | G          | x2
V.Mel     | {C4}:one {D4}:two | {E4}:three | x2
lyrics 2: | uno dos           | tres /     |
`;
		expect(sound(importMusicXml(xmlOf(chart))).text).toBe(chart);
	});
});

describe("a lone lyrics 2: row in a repeat (pass 2 only, decided by Kevin 2026-11-06)", () => {
	test("goes out as verse 2 and comes back as a lyrics 2: row", () => {
		for (const [chart, back] of [
			[
				"|: {C4}:a | {D4} :|\nlyrics 2: | b | c |\n",
				"          | {C4}:a | {D4} | x2\nlyrics 2: | b      | c    |\n",
			],
			[
				"|: {C4} {D4} :|\nlyrics 2: | x y |\n",
				"          | {C4} {D4} | x2\nlyrics 2: | x y       |\n",
			],
		] as const) {
			const out = exportMusicXml(chart);
			expect(out.diagnostics.map((d) => d.message)).toEqual([
				"pass 1 of this repeat sings nothing: its bars have verse 2",
			]);
			expect(out.ok && out.xml).toContain('<lyric number="2">');
			expect(out.ok && out.xml).not.toContain(
				'<lyric number="1"><syllabic>single</syllabic><text>c',
			);
			expect(sound(importMusicXml(xmlOf(chart))).text).toBe(back);
		}
	});
});

describe("a melisma ends at our held note's extend", () => {
	test("a row's melisma ends at its held note: the breath after it stays a breath", () => {
		// 4/4 is the default meter: the import doesn't write it.
		const chart = "time: 4/4\n| {C4}:la {D4}:li | {E4}:lu |\nlyrics 2: | ho / | -- |\n";
		const result = sound(importMusicXml(xmlOf(chart)));
		expect(result.text).toBe(
			"          | {C4}:la {D4}:li | {E4}:lu |\nlyrics 2: | ho /            | --      |\n",
		);
		expect(result.diagnostics).toEqual([]);
	});

	test("a verse 2 melisma held across two systems comes back as written", () => {
		const chart = `${VOX}Vox       | C                 |
Vox.Mel   | {C4}:a {D4}:b     |
lyrics 2: | x y               |

## B
Vox       | G                 |
Vox.Mel   | {E4}:c {F4}:d     |
lyrics 2: | / z               |
`;
		const result = sound(importMusicXml(xmlOf(chart)));
		expect(result.text).toBe(printChart(chart));
		expect(result.diagnostics).toEqual([]);
	});

	test("a melisma held into a second ending holds along play order, not through the first ending", () => {
		const chart =
			"|: {C4}:a {D4}:b |\nlyrics 2: | x y |\n|1 {E4}:c :|\n|2 {F4} {G4} |\nlyrics 2: | / z |\n";
		expect(parseChart(chart).diagnostics).toEqual([]);
		const result = sound(importMusicXml(xmlOf(chart)));
		expect(result.text).toBe(printChart(chart));
		expect(result.diagnostics).toEqual([]);
	});

	test("a hold the rows can't carry into a repeat is written -- and reported, naming the measure", () => {
		const chart = "| {C4}:a {D4}:b |\nlyrics 2: | x y |\n|: {E4}:c {F4}:d :|\nlyrics 2: | / z |\n";
		const result = sound(importMusicXml(xmlOf(chart)));
		expect(result.text).toContain("lyrics 2: | -- z");
		expect(result.diagnostics).toMatchObject([
			{
				message:
					"a syllable held into a lyric row across a repeat or ending, written -- (barmark can't be sure what it holds there) in measure 2",
				measure: "2",
			},
		]);
	});

	test("a held note's melisma ends there: the unsung note after it stays unsung", () => {
		const chart = "| {C4}:la {D4}:/ {E4} {F4}:lo |\n";
		const result = sound(importMusicXml(xmlOf(`time: 4/4\n${chart}`)));
		expect(result.text).toBe(chart);
		expect(result.diagnostics).toEqual([]);
	});

	test("a melisma before a repeat's endings doesn't hold into the first ending", () => {
		const chart =
			"|: {C4}:la {D4}:li |\nlyrics 2: | ho / |\n|1 {E4}:lu :|\n|2 {F4}:lo |\nlyrics 2: | hum |\n";
		const result = sound(importMusicXml(xmlOf(chart)));
		// The second ending plays on pass 2 alone, so its verse 1 `lo` is never
		// sung (barmark warns) and doesn't go out: the rest comes back as written.
		expect(exportMusicXml(chart).diagnostics).toMatchObject([
			{ line: 4, message: "verse 1 is never sung: no pass of its repeat is pass 1" },
		]);
		expect(result.text).toBe(
			"          |: {C4}:la {D4}:li |\nlyrics 2: | ho /            |\n|1 {E4}:lu :|\n          |2 {F4} |\nlyrics 2: | hum  |\n",
		);
		expect(result.diagnostics).toEqual([]);
	});

	test("an extend stop ends the hold at its note", () => {
		const xml = score([
			voice([
				chord("C") +
					n("C4", 2, lyric("ah", "single", 1, '<extend type="start"/>')) +
					n("D4", 2) +
					n("E4", 2, '<lyric number="1"><extend type="stop"/></lyric>') +
					n("F4", 2),
			]),
		]);
		expect(sound(importMusicXml(xml)).text).toContain("Vox.Mel | {C4}:ah {D4}:/ {E4}:/ {F4} |");
	});
});

describe("ordinary lyric text", () => {
	const sungAs = (texts: string[]) => {
		const notes = texts.map((t, i) =>
			n(["C4", "D4", "E4", "F4"][i] ?? "C4", 2, lyric(t) + lyric(t, "single", 2)),
		);
		return sound(importMusicXml(score([voice([chord("C") + notes.join("")])]))).text;
	};
	test("curly quotes are characters of a syllable, on the notes and in the rows", () => {
		const text = sungAs(["“Ho", "ly”", "„a“", "‘b’"]);
		expect(text).toContain("{C4}:“Ho {D4}:ly” {E4}:„a“ {F4}:‘b’");
		expect(text).toContain("“Ho ly” „a“ ‘b’");
	});
	test("a straight quote comes in as a curly one", () => {
		const text = sungAs(['"q"', "la", "da", "do"]);
		expect(text).toContain("{C4}:”q”");
		expect(text).toContain("”q” la da do");
	});
	test("brackets are characters of a syllable, not a meter", () => {
		const text = sungAs(["[x]", "[2/4]x", "da", "do"]);
		expect(text).toContain("{C4}:[x] {D4}:[2/4]x");
		expect(text).toContain("[x] [2/4]x da do");
	});
});

describe("lyrics the import can't place are named, never dropped silently", () => {
	const loss = (r: ImportResult, start: string) =>
		r.diagnostics.find((d) => d.message.startsWith(start));

	test("a second voice's lyrics in a one-staff choir part", () => {
		const back = "<backup><duration>8</duration></backup>";
		const v2 = (pitch: string, eighths: number, inner = "") =>
			n(pitch, eighths, inner).replace("<voice>1</voice>", "<voice>2</voice>");
		const xml = score([
			{
				name: "Choir",
				sound: "voice.choir",
				measures: [
					n("E5", 4, lyric("sop")) +
						n("F5", 4, lyric("rano")) +
						back +
						v2("C5", 4, lyric("al")) +
						v2("D5", 4, lyric("to")),
					n("E5", 8, lyric("la")) + back + v2("C5", 8),
				],
			},
		]);
		const result = sound(importMusicXml(xml));
		expect(loss(result, "lyrics in Choir left out")).toEqual({
			severity: "warning",
			message:
				"lyrics in Choir left out (on a line that doesn't sing: only the line that sings carries syllables) in measure 1",
			part: "Choir",
			measure: "1",
			measures: ["1"],
		});
	});

	test("lyrics on slash notes", () => {
		const slash = (eighths: number, inner = "") =>
			n("B4", eighths, inner).replace(
				"<voice>1</voice>",
				"<voice>1</voice><notehead>slash</notehead>",
			);
		const xml = score([
			voice([
				chord("C") + n("C4", 8, lyric("sing")),
				chord("G") + slash(4, lyric("yo")) + slash(4),
			]),
		]);
		const result = sound(importMusicXml(xml));
		expect(loss(result, "lyrics in Voice left out")?.measures).toEqual(["2"]);
		expect(loss(result, "lyrics in Voice left out")?.message).toBe(
			"lyrics in Voice left out (on slash notes, which carry no syllables) in measure 2",
		);
	});

	test.each([
		["a rest", r(4)],
		["a tied note", n("C4", 4, '<tie type="stop"/>')],
	])("lyrics on %s", (_, attack) => {
		const xml = score([
			voice([
				chord("C") + n("C4", 4, lyric("sing")) + n("C4", 4, '<tie type="start"/>'),
				chord("G") + attack.replace("</duration>", `</duration>${lyric("yo")}`) + n("D4", 4),
			]),
		]);
		const result = sound(importMusicXml(xml));
		expect(loss(result, "lyrics in Voice left out")?.message).toBe(
			"lyrics in Voice left out (on a rest or a tied note, where no syllable starts) in measure 2",
		);
	});

	test("lyrics lost as a rhythm snaps", () => {
		// Seven notes in a quarter: no grid holds them apart, so two land on one note.
		const septuplet = Array.from(
			{ length: 7 },
			(_, i) =>
				`<note><pitch><step>${"CDEFGAB"[i]}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><time-modification><actual-notes>7</actual-notes><normal-notes>4</normal-notes></time-modification>${lyric(`l${i}`)}</note>`,
		).join("");
		const xml = score([
			{
				...voice([]),
				measures: [
					`<attributes><divisions>7</divisions></attributes>${chord("C")}${septuplet}<note><pitch><step>C</step><octave>5</octave></pitch><duration>21</duration><voice>1</voice></note>`,
				],
			},
		]);
		const result = sound(importMusicXml(xml));
		expect(loss(result, "lyrics in Voice left out")?.message).toBe(
			"lyrics in Voice left out (a rhythm snapped, and two syllables landed on one note) in measure 1",
		);
	});

	test("verse 2 alone, with no verse 1 or voice part to sing it", () => {
		const xml = score([
			{
				name: "Piano",
				measures: [
					chord("C") +
						n("C4", 4, lyric("one", "single", 2)) +
						n("D4", 4, lyric("two", "single", 2)),
				],
			},
		]);
		const result = sound(importMusicXml(xml));
		expect(result.diagnostics).toContainEqual({
			severity: "warning",
			message:
				"verses 2 and later in Piano left out (no part sings verse 1 or is a voice to sing them) in measure 1",
			part: "Piano",
			measure: "1",
			measures: ["1"],
		});
	});
});

describe("more stacked verses than a repeat has passes", () => {
	test("every verse is kept as a row, the play count as the file says, and barmark's warning passed on", () => {
		const three = (a: string, b: string, c: string) =>
			lyric(a) + lyric(b, "single", 2) + lyric(c, "single", 3);
		const xml = score([
			voice([
				'<barline location="left"><repeat direction="forward"/></barline>' +
					chord("C") +
					n("C4", 4, three("one", "two", "three")) +
					n("D4", 4, three("a", "b", "c")),
				chord("G") +
					n("E4", 4, three("x", "y", "z")) +
					n("F4", 4) +
					'<barline location="right"><repeat direction="backward"/></barline>',
			]),
		]);
		const result = sound(importMusicXml(xml));
		expect(result.text).toBe(
			`${VOX}Vox       | C               | G           | x2
Vox.Mel   | {C4}:one {D4}:a | {E4}:x {F4} | x2
lyrics 2: | two b           | y           |
lyrics 3: | three c         | z           |
`,
		);
		expect(result.diagnostics.map((d) => d.message)).toEqual([
			"verse 3 is never sung: no pass of its repeat is pass 3",
		]);
	});
});

describe("a row's holds mean what barmark reads (grammar 7.7)", () => {
	const fwd = '<barline location="left"><repeat direction="forward"/></barline>';
	const back = '<barline location="right"><repeat direction="backward"/></barline>';
	const heading = (text: string) =>
		`<direction placement="above"><direction-type><words font-weight="bold">${text}</words></direction-type></direction>`;
	const v2 = (text: string, extra = "") => lyric(text, "single", 2, extra);

	test("a hold written out after a breath, in played order, is a breath (lyfuzz 22, 26, 65, 67, 251, 252, 273)", () => {
		// Measure 2's first note holds verse 2's syllable from measure 1; played
		// again after measure 3, where verse 2 breathes, it has nothing to hold.
		const xml = score([
			voice([
				chord("C") + n("C4", 8, lyric("a") + v2("hold", "<extend/>")),
				fwd + chord("F") + n("D4", 4, lyric("b")) + n("E4", 4, lyric("c") + v2("y")),
				heading("Chorus") + chord("G") + n("F4", 8, lyric("d")) + back,
				chord("C") + n("G4", 8, lyric("e") + v2("z")),
			]),
		]);
		const result = sound(importMusicXml(xml));
		expect(result.text).toBe(`${VOX}Vox       | C      | F             |
Vox.Mel   | {C4}:a | {D4}:b {E4}:c |
lyrics 2: | hold / | / y           |

## Chorus
Vox       | G      | F             |
Vox.Mel   | {F4}:d | {D4}:b {E4}:c |
lyrics 2: | --     | -- y          |

## Chorus
Vox       | G      | C      |
Vox.Mel   | {F4}:d | {G4}:e |
lyrics 2: | --     | z      |
`);
	});

	test("several holds in a bar played after a breath are breaths, the bar one breath (lyfuzz 67, 252)", () => {
		const xml = score([
			voice([
				chord("C") + n("C4", 8, lyric("a") + v2("hold", "<extend/>")),
				fwd + chord("F") + n("D4", 2, lyric("b")) + n("E4", 2, lyric("c")) + r(4),
				heading("Chorus") + chord("G") + n("F4", 8, lyric("e")) + back,
				chord("C") + n("G4", 8, lyric("f")),
			]),
		]);
		const result = sound(importMusicXml(xml));
		expect(result.text).toContain("lyrics 2: | hold / / / | / / / /            |");
		expect(result.text).toContain("lyrics 2: | --     | --                 |");
	});

	test("hyphens alone are no syllable, so never a breath in a row (lyfuzz 142)", () => {
		const dash =
			'<lyric number="2"><syllabic>begin</syllabic><text>-</text><elision/><text>-</text></lyric>';
		const xml = score([
			voice([chord("C") + n("C4", 4, lyric("la") + v2("na")) + n("D4", 4, lyric("da") + dash)]),
		]);
		const result = sound(importMusicXml(xml));
		expect(result.text).not.toContain("{D4}:--");
		expect(result.text).toMatch(/lyrics 2: \| na +\|/);
	});
});
