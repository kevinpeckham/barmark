import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { frac } from "../../src/rhythm.js";
import { xmlOf } from "../helpers.js";
import { attributes, measure, measuresOf, note, partOf, read, rest, xml } from "./helpers.js";

const base = (divisions: number, extra = "") =>
	attributes(
		`<divisions>${divisions}</divisions><time><beats>4</beats><beat-type>4</beat-type></time>${extra}`,
	);

test("onsets from durations, backup and forward", () => {
	const [m] = measuresOf(
		xml`${measure(
			1,
			base(2) +
				note("C", 4, 4, "<voice>1</voice>") +
				note("D", 4, 4, "<voice>1</voice>") +
				"<backup><duration>8</duration></backup>" +
				note("E", 4, 8, "<voice>2</voice>"),
		)}`,
	);
	expect(m?.length).toEqual(frac(4));
	expect(m?.lines[1]?.[0]?.at).toEqual(frac(0));
	expect(m?.lines[0]?.[1]?.at).toEqual(frac(2));
	expect(m?.lines[0]?.[1]?.length).toEqual(frac(2));
	expect(m?.lines[0]?.[0]).toEqual({
		at: frac(0),
		length: frac(2),
		kind: "notes",
		pitches: [{ name: "C", octave: 4, root: false }],
		tieIn: false,
		tieOut: false,
		fermata: false,
		lyrics: [],
	});
});

test("forward moves the onset", () => {
	const [m] = measuresOf(
		xml`${measure(1, `${base(1)}<forward><duration>2</duration></forward>${note("C", 4, 1)}`)}`,
	);
	expect(m?.lines[0]?.[0]?.at).toEqual(frac(2));
});

test("divisions change between measures", () => {
	const ms = measuresOf(
		xml`${measure(1, base(1) + note("C", 5, 4))}${measure(
			2,
			attributes("<divisions>6</divisions>") +
				note(
					"C",
					4,
					2,
					"<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>",
				) +
				note("D", 4, 2) +
				note("E", 4, 2) +
				note("F", 4, 18),
		)}`,
	);
	expect(ms[1]?.lines[0]?.map((a) => a.at)).toEqual([frac(0), frac(1, 3), frac(2, 3), frac(1)]);
	expect(ms[1]?.length).toEqual(frac(4));
});

test("sounding pitch through transpose", () => {
	const [m] = measuresOf(
		xml`${measure(
			1,
			base(1, "<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>") +
				note("D", 5, 1) +
				note("F", 4, 1, "", 1),
		)}`,
	);
	expect(m?.lines[0]?.map((a) => a.pitches)).toEqual([
		[{ name: "C", octave: 5, root: false }],
		[{ name: "E", octave: 4, root: false }],
	]);
	expect(
		partOf(
			xml`${measure(1, base(1, "<transpose><chromatic>-2</chromatic></transpose>") + note("D", 5, 4))}`,
		).transpose,
	).toEqual({ chromatic: -2, octave: 0, diatonic: null });
});

test("a transposing part's key reads at concert pitch", () => {
	const [m] = measuresOf(
		xml`${measure(
			1,
			attributes(
				"<divisions>1</divisions><key><fifths>2</fifths><mode>major</mode></key><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>",
			) + note("D", 5, 4),
		)}`,
	);
	expect(m?.key).toEqual({ tonic: "C", mode: "major" });
});

test("barmark root PI marks the pitch", () => {
	const [m] = measuresOf(
		xml`${measure(
			1,
			base(1) +
				note("C", 4, 4) +
				"<note><?barmark root?><chord/><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration></note>",
		)}`,
	);
	expect(m?.lines[0]?.[0]?.pitches).toEqual([
		{ name: "C", octave: 4, root: false },
		{ name: "E", octave: 3, root: true },
	]);
});

test("empty measure is a rest", () => {
	const ms = measuresOf(
		xml`${measure(1, base(1) + rest(2) + note("C", 4, 2))}${measure(2, attributes("<divisions>1</divisions>"))}${measure(
			3,
			`<note><rest measure="yes"/><duration>4</duration></note>`,
		)}`,
	);
	expect(ms[0]?.lines[0]?.[0]).toMatchObject({
		kind: "rest",
		pitches: [],
		at: frac(0),
		length: frac(2),
	});
	expect(ms[1]?.lines).toEqual([[]]);
	expect(ms[2]?.lines).toEqual([[]]);
	expect(ms[2]?.length).toEqual(frac(4));
});

test("a multi-measure rest gives one resting measure per <measure>", () => {
	const rm = `<note><rest measure="yes"/><duration>4</duration></note>`;
	const ms = measuresOf(
		xml`${measure(1, `${base(1)}<attributes><measure-style><multiple-rest>3</multiple-rest></measure-style></attributes>${rm}`)}${measure(2, rm)}${measure(3, rm)}`,
	);
	expect(ms.map((m) => m.lines)).toEqual([[[]], [[]], [[]]]);
});

test("lyric number need not be numeric", () => {
	const lyric = (n: string, text: string, syl = "single") =>
		`<lyric number="${n}"><syllabic>${syl}</syllabic><text>${text}</text></lyric>`;
	const [m] = measuresOf(
		xml`${measure(
			1,
			base(1) +
				note("C", 4, 2, lyric("verse2", "la", "begin") + lyric("verse1", "do")) +
				note("D", 4, 2, lyric("verse2", "la", "end")),
		)}`,
	);
	expect(m?.lines[0]?.[0]?.lyrics).toEqual([
		{ verse: 1, syllabic: "begin", parts: ["la"], extend: false },
		{ verse: 2, syllabic: "single", parts: ["do"], extend: false },
	]);
	expect(m?.lines[0]?.[1]?.lyrics).toEqual([
		{ verse: 1, syllabic: "end", parts: ["la"], extend: false },
	]);
});

test("a whole-number lyric number is its verse, and an extend alone is a held syllable", () => {
	const [m] = measuresOf(
		xml`${measure(
			1,
			base(1) +
				note(
					"C",
					4,
					2,
					'<lyric number="3"><syllabic>single</syllabic><text>la</text><extend/></lyric>',
				) +
				note("D", 4, 2, '<lyric number="3"><extend/></lyric>'),
		)}`,
	);
	expect(m?.lines[0]?.[0]?.lyrics).toEqual([
		{ verse: 3, syllabic: "single", parts: ["la"], extend: true },
	]);
	expect(m?.lines[0]?.[1]?.lyrics).toEqual([
		{ verse: 3, syllabic: "single", parts: [], extend: true },
	]);
});

test("MuseScore's elision glyph splits a syllable as <elision> does", () => {
	const [m] = measuresOf(
		xml`${measure(1, `${base(1)}${note("C", 4, 4, "<lyric><text>a\uE551b</text></lyric>")}`)}`,
	);
	expect(m?.lines[0]?.[0]?.lyrics?.[0]?.parts).toEqual(["a", "b"]);
});

test("a lyric with an elision keeps its syllables apart", () => {
	const [m] = measuresOf(
		xml`${measure(
			1,
			base(1) + note("C", 4, 4, "<lyric><text>a</text><elision>_</elision><text>b</text></lyric>"),
		)}`,
	);
	expect(m?.lines[0]?.[0]?.lyrics).toEqual([
		{ verse: 1, syllabic: "single", parts: ["a", "b"], extend: false },
	]);
});

test("harmony offset", () => {
	const h = (step: string, offset = "") =>
		`<harmony><root><root-step>${step}</root-step></root><kind>major</kind>${offset}</harmony>`;
	const [m] = measuresOf(
		xml`${measure(1, base(2) + h("C") + note("C", 4, 2) + h("G", "<offset>2</offset>") + note("D", 4, 6))}`,
	);
	// after one beat (2 divisions) an offset of 2 divisions lands on beat 3
	expect(m?.harmonies.map((x) => x.at)).toEqual([frac(0), frac(2)]);
	expect(m?.harmonies[1]?.node.name).toBe("harmony");
});

test("staff 2 and second voices map to lines 2–4", () => {
	const two = (step: string, voice: number, staff: number, octave = 4) =>
		note(step, octave, 8, `<voice>${voice}</voice><staff>${staff}</staff>`);
	const back = "<backup><duration>8</duration></backup>";
	const part = partOf(
		xml`${measure(
			1,
			attributes(
				"<divisions>2</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time>",
			) +
				two("C", 1, 1) +
				back +
				two("D", 5, 2, 3) +
				back +
				two("E", 2, 1) +
				back +
				two("F", 6, 2, 3),
		)}`,
	);
	expect(part.staves).toBe(2);
	expect(part.voices).toBe(4);
	expect(part.measures[0]?.lines.map((l) => l[0]?.pitches[0]?.name)).toEqual(["C", "D", "E", "F"]);
});

test("voices come in first-seen order on one staff", () => {
	const part = partOf(
		xml`${measure(
			1,
			base(1) +
				note("C", 4, 4, "<voice>3</voice>") +
				"<backup><duration>4</duration></backup>" +
				note("D", 4, 4, "<voice>1</voice>"),
		)}`,
	);
	expect(part.measures[0]?.lines.map((l) => l[0]?.pitches[0]?.name)).toEqual(["C", "D"]);
});

test("a part with 5 voices says so", () => {
	const voices = [1, 2, 3, 4, 5]
		.map((v) => note("C", 4, 4, `<voice>${v}</voice>`))
		.join("<backup><duration>4</duration></backup>");
	const part = partOf(xml`${measure(1, base(1) + voices)}`);
	expect(part.voices).toBe(5);
	expect(part.measures[0]?.lines).toHaveLength(5);
});

test("credits and title", () => {
	const doc = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Morning Song</work-title></work>
<identification><creator type="composer">Kevin</creator><creator type="composer">Ann</creator><creator type="lyricist">Lou</creator><creator type="arranger">Zed</creator><creator type="poet">Skip</creator><rights>(c) 2026</rights><encoding><software>@barmark/musicxml 0.1.0</software></encoding></identification>
<part-list><score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno.</part-abbreviation><score-instrument id="P1-I1"><instrument-name>Acoustic Grand</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-program>1</midi-program></midi-instrument></score-part></part-list>
<part id="P1"><measure number="1"/></part></score-partwise>`;
	const { score } = read(doc);
	expect(score?.title).toBe("Morning Song");
	expect(score?.credits).toEqual({
		composer: ["Kevin", "Ann"],
		lyricist: ["Lou"],
		arranger: ["Zed"],
		copyright: ["(c) 2026"],
	});
	expect(score?.software).toBe("@barmark/musicxml 0.1.0");
	expect(score?.parts[0]).toMatchObject({
		id: "P1",
		name: "Piano",
		abbreviation: "Pno.",
		instrumentName: "Acoustic Grand",
		midiProgram: 1,
	});
});

test("a score without a title or credits", () => {
	const { score } = read(xml`${measure(1, "")}`);
	expect(score?.title).toBeNull();
	expect(score?.software).toBeNull();
	expect(score?.credits).toEqual({ composer: [], lyricist: [], arranger: [], copyright: [] });
	expect(score?.parts[0]).toMatchObject({
		abbreviation: null,
		instrumentName: null,
		midiProgram: null,
	});
});

test("score-timewise is an error", () => {
	const { score, diagnostics } = read('<score-timewise version="4.0"/>');
	expect(score).toBeNull();
	expect(diagnostics).toEqual([
		{ severity: "error", message: "score-timewise isn't supported; save as partwise" },
	]);
});

test("another root is an error", () => {
	const { score, diagnostics } = read("<html/>");
	expect(score).toBeNull();
	expect(diagnostics[0]?.severity).toBe("error");
});

test("a one-bar 2/4 in 4/4 that reverts", () => {
	const t = (n: number) =>
		`<attributes><time><beats>${n}</beats><beat-type>4</beat-type></time></attributes>`;
	const ms = measuresOf(
		xml`${measure(1, base(1) + note("C", 4, 4))}${measure(2, t(2) + note("C", 4, 2))}${measure(3, t(4) + note("C", 4, 4))}${measure(4, note("C", 4, 4))}`,
	);
	expect(ms.map((m) => m.oneBar)).toEqual([null, { n: 2, d: 4 }, null, null]);
	expect(ms.map((m) => m.time)).toEqual([{ n: 4, d: 4 }, null, null, null]);
	expect(ms[1]?.length).toEqual(frac(2));
});

test("a time change that stays is a time", () => {
	const t = (n: number) =>
		`<attributes><time><beats>${n}</beats><beat-type>4</beat-type></time></attributes>`;
	const ms = measuresOf(
		xml`${measure(1, base(1) + note("C", 4, 4))}${measure(2, t(3) + note("C", 4, 3))}${measure(3, note("C", 4, 3))}`,
	);
	expect(ms.map((m) => m.time)).toEqual([{ n: 4, d: 4 }, { n: 3, d: 4 }, null]);
	expect(ms.map((m) => m.oneBar)).toEqual([null, null, null]);
});

test("a pickup of 1 beat in 4/4", () => {
	const ms = measuresOf(
		xml`${measure(0, base(1) + note("G", 4, 1), ' implicit="yes"')}${measure(1, note("C", 4, 4))}`,
	);
	expect(ms[0]).toMatchObject({ implicit: true, oneBar: { n: 1, d: 4 }, length: frac(1) });
	expect(ms[0]?.time).toEqual({ n: 4, d: 4 });
	expect(ms[1]).toMatchObject({ implicit: false, oneBar: null, length: frac(4) });
});

test.each([
	[2, { n: 1, d: 8 }],
	[6, { n: 3, d: 8 }],
	[3, { n: 3, d: 16 }],
])(
	"a pickup shorter than a beat in 4/4 (%i sixteenths) counts a finer unit",
	(sixteenths, meter) => {
		const { score, diagnostics } = read(
			xml`${measure(0, base(4) + note("G", 4, sixteenths), ' implicit="yes"')}${measure(1, note("C", 4, 16))}`,
		);
		expect(score?.parts[0]?.measures[0]?.oneBar).toEqual(meter);
		expect(diagnostics).toEqual([]);
	},
);

test("a short first bar in its own meter, then the full meter, is a pickup (barmark's export)", () => {
	const t = (n: number) =>
		`<attributes><time><beats>${n}</beats><beat-type>4</beat-type></time></attributes>`;
	const ms = measuresOf(
		xml`${measure(1, attributes("<divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time>") + note("D", 4, 1))}${measure(2, t(3) + note("G", 4, 3))}${measure(3, note("C", 4, 3))}`,
	);
	expect(ms.map((m) => m.oneBar)).toEqual([{ n: 1, d: 4 }, null, null]);
	expect(ms.map((m) => m.time)).toEqual([{ n: 3, d: 4 }, null, null]);
	expect(ms[0]?.length).toEqual(frac(1));
});

test("a long first bar before a shorter meter is a time change, not a pickup", () => {
	const t = (n: number) =>
		`<attributes><time><beats>${n}</beats><beat-type>4</beat-type></time></attributes>`;
	const ms = measuresOf(
		xml`${measure(1, base(1) + note("C", 4, 4))}${measure(2, t(3) + note("G", 4, 3))}`,
	);
	expect(ms.map((m) => m.time)).toEqual([
		{ n: 4, d: 4 },
		{ n: 3, d: 4 },
	]);
	expect(ms.map((m) => m.oneBar)).toEqual([null, null]);
});

test("a pickup that no meter expresses is a warning", () => {
	const { score, diagnostics } = read(
		xml`${measure(0, base(3) + note("G", 4, 1), ' implicit="yes"')}${measure(1, note("C", 4, 12))}`,
	);
	expect(score?.parts[0]?.measures[0]?.oneBar).toBeNull();
	expect(diagnostics).toHaveLength(1);
	expect(diagnostics[0]).toMatchObject({ severity: "warning", measure: "0" });
});

test("a pickup in 6/8 counts eighths", () => {
	const [m] = measuresOf(
		xml`${measure(
			0,
			attributes("<divisions>2</divisions><time><beats>6</beats><beat-type>8</beat-type></time>") +
				note("G", 4, 1),
			' implicit="yes"',
		)}`,
	);
	expect(m?.oneBar).toEqual({ n: 1, d: 8 });
});

test("ties, fermatas and slash noteheads", () => {
	const [m] = measuresOf(
		xml`${measure(
			1,
			base(1) +
				note(
					"C",
					4,
					1,
					'<tie type="start"/><notations><tied type="start"/><fermata/></notations>',
				) +
				note("C", 4, 1, '<tie type="stop"/><tie type="start"/>') +
				note("B", 4, 2, "<notehead>slash</notehead>"),
		)}`,
	);
	expect(m?.lines[0]?.map((a) => [a.kind, a.tieIn, a.tieOut, a.fermata])).toEqual([
		["notes", false, true, true],
		["notes", true, true, false],
		["slash", false, false, false],
	]);
	expect(m?.lines[0]?.[2]?.pitches).toEqual([]);
});

test("grace notes are skipped", () => {
	const [m] = measuresOf(
		xml`${measure(1, `${base(1)}<note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>${note("C", 4, 4)}`)}`,
	);
	expect(m?.lines[0]).toHaveLength(1);
});

test("barlines: repeats, endings and a fermata", () => {
	const ms = measuresOf(
		xml`${measure(
			1,
			base(1) +
				'<barline location="left"><bar-style>heavy-light</bar-style><ending number="1, 2" type="start"/><repeat direction="forward"/></barline>' +
				note("C", 4, 4) +
				'<barline location="right"><bar-style>light-heavy</bar-style><fermata/><ending number="1, 2" type="stop"/><repeat direction="backward" times="3"/></barline>',
		)}${measure(2, `${note("C", 4, 4)}<barline><ending number="3" type="discontinue"/></barline>`)}`,
	);
	expect(ms[0]).toMatchObject({
		repeatStart: true,
		repeatEnd: { times: 3 },
		ending: { numbers: [1, 2], start: true, stop: true, discontinue: false },
		fermataEnd: true,
	});
	expect(ms[1]).toMatchObject({
		repeatStart: false,
		repeatEnd: null,
		ending: { numbers: [3], start: false, stop: false, discontinue: true },
		fermataEnd: false,
	});
});

test("key, written bar number and marks", () => {
	const dir = (types: string, extra = "", attrs = ' placement="above"') =>
		`<direction${attrs}><direction-type>${types}</direction-type>${extra}</direction>`;
	const [m] = measuresOf(
		xml`${measure(
			1,
			base(1, "<key><fifths>-2</fifths><mode>minor</mode></key>") +
				dir('<words font-weight="bold">Intro</words>') +
				dir("<rehearsal>A</rehearsal>") +
				dir("<segno/>", '<sound segno="s1"/>') +
				dir("<coda/>") +
				dir(
					"<metronome><beat-unit>quarter</beat-unit><per-minute>96</per-minute></metronome>",
					'<sound tempo="96"/>',
				) +
				dir(
					"<words>swing</words>",
					"<sound><swing><first>2</first><second>1</second><swing-type>eighth</swing-type></swing></sound>",
					' placement="below"',
				) +
				note("C", 4, 4),
			' text="5"',
		)}`,
	);
	expect(m?.written).toBe("5");
	expect(m?.key).toEqual({ tonic: "G", mode: "minor" });
	expect(m?.marks.map((k) => [k.kind, k.placement, k.bold, k.text, k.at])).toEqual([
		["words", "above", true, "Intro", frac(0)],
		["rehearsal", "above", false, "A", frac(0)],
		["segno", "above", false, "", frac(0)],
		["sound", "above", false, "", frac(0)],
		["coda", "above", false, "", frac(0)],
		["metronome", "above", false, "96", frac(0)],
		["sound", "above", false, "", frac(0)],
		["words", "below", false, "swing", frac(0)],
		["swing", "below", false, "", frac(0)],
	]);
	expect(m?.marks[3]?.node.attrs).toEqual({ segno: "s1" });
});

test("a stop-only ending measure", () => {
	const ms = measuresOf(
		xml`${measure(1, `${base(1)}${note("C", 4, 4)}<barline location="right"><ending number="1" type="stop"/></barline>`)}`,
	);
	expect(ms[0]?.ending).toEqual({ numbers: [1], start: false, stop: true, discontinue: false });
});

test("a start-only ending measure", () => {
	const ms = measuresOf(
		xml`${measure(1, `${base(1)}<barline location="left"><ending number="2" type="start"/></barline>${note("C", 4, 4)}`)}`,
	);
	expect(ms[0]?.ending).toEqual({ numbers: [2], start: true, stop: false, discontinue: false });
});

test("an implicit bar longer than its meter warns that it is too long", () => {
	const { diagnostics } = read(xml`${measure(1, base(1) + note("C", 4, 6), ' implicit="yes"')}`);
	expect(diagnostics[0]?.message).toContain("longer than its meter");
});

test("a time signature barmark can't write keeps the running meter", () => {
	const t =
		"<attributes><time><beats>1000000000</beats><beat-type>4</beat-type></time></attributes>";
	const { score, diagnostics } = read(
		xml`${measure(1, base(1) + note("C", 4, 4))}${measure(2, t + note("C", 4, 4))}`,
	);
	const ms = score?.parts[0]?.measures ?? [];
	expect(ms.map((m) => m.time)).toEqual([{ n: 4, d: 4 }, null]);
	expect(ms[1]?.length).toEqual(frac(4));
	expect(diagnostics.map((d) => d.message)).toEqual([
		"a time signature barmark can't write (1000000000/4); kept 4/4 in measure 2",
	]);
});

test("accents, hits and pedal marks are recorded, never silent", () => {
	const unread = (chart: string) => partOf(xmlOf(chart)).unread;
	expect(unread("| >C | ^D | E |").accents).toEqual(["1", "2"]);
	expect(unread("| +G{B3 D4 G4} | C | *C{C4 E4 G4} |").pedal).toEqual(["1", "3"]);
});

test("piano lines' pedal is recorded", () => {
	const chart = readFileSync(new URL("../fixtures/piano-lines.chart.md", import.meta.url), "utf8");
	expect(partOf(xmlOf(chart)).unread.pedal.length).toBeGreaterThan(0);
});

describe("marks barmark can't write are recorded by measure", () => {
	const direction = (type: string) =>
		`<direction placement="below"><direction-type>${type}</direction-type></direction>`;
	const notations = (inner: string) => note("C", 4, 4, `<notations>${inner}</notations>`);
	const cases: [string, string, string][] = [
		["dynamics", "a dynamic", direction("<dynamics><f/></dynamics>") + note("C", 4, 4)],
		["dynamics", "a hairpin", direction('<wedge type="crescendo"/>') + note("C", 4, 4)],
		["dynamics", "a dynamic on a note", notations("<dynamics><sf/></dynamics>")],
		["slurs", "a slur", notations('<slur type="start" number="1"/>')],
		["slurs", "an ornament", notations("<ornaments><trill-mark/></ornaments>")],
		["slurs", "a tremolo", notations('<ornaments><tremolo type="single">3</tremolo></ornaments>')],
		["slurs", "fingering", notations("<technical><fingering>1</fingering></technical>")],
		["slurs", "an arpeggio", notations("<arpeggiate/>")],
		["slurs", "a glissando", notations('<glissando type="start"/>')],
		["slurs", "a slide", notations('<slide type="start"/>')],
		[
			"grace",
			"a grace note",
			"<note><grace/><pitch><step>D</step><octave>4</octave></pitch><type>eighth</type></note>" +
				note("C", 4, 4),
		],
		[
			"frames",
			"a chord diagram",
			"<harmony><root><root-step>C</root-step></root><kind>major</kind><frame><frame-strings>6</frame-strings><frame-frets>4</frame-frets></frame></harmony>" +
				note("C", 4, 4),
		],
		[
			"capo",
			"a capo",
			attributes("<staff-details><capo>2</capo></staff-details>") + note("C", 4, 4),
		],
		[
			"fermatas",
			"a fermata before the bar's end",
			note("C", 4, 2, "<notations><fermata/></notations>") + note("D", 4, 2),
		],
	];
	test.each(cases)("%s: %s", (kind, _what, body) => {
		const unread = partOf(xml`${measure(1, base(1) + body)}`).unread;
		expect(unread[kind as keyof typeof unread]).toEqual(["1"]);
	});

	test("a fermata on the bar's last note is kept, not a loss", () => {
		const body = note("C", 4, 2) + note("D", 4, 2, "<notations><fermata/></notations>");
		expect(partOf(xml`${measure(1, base(1) + body)}`).unread.fermatas).toEqual([]);
	});

	test("an octave shift changes only how notes are shown: pitches stand, nothing is lost", () => {
		const body =
			'<direction><direction-type><octave-shift type="down" size="8"/></direction-type></direction>' +
			note("C", 6, 4);
		const part = partOf(xml`${measure(1, base(1) + body)}`);
		expect(part.measures[0]?.lines[0]?.[0]?.pitches).toEqual([
			{ name: "C", octave: 6, root: false },
		]);
		expect(Object.values(part.unread).flat()).toEqual([]);
	});

	test("<other-direction> text is read as words", () => {
		const body =
			'<direction placement="above"><direction-type><other-direction>let ring</other-direction></direction-type></direction>' +
			note("C", 4, 4);
		const [m] = measuresOf(xml`${measure(1, base(1) + body)}`);
		expect(m?.marks.map((k) => [k.kind, k.text])).toEqual([["words", "let ring"]]);
	});
});

describe("typed page credits", () => {
	const page = (credits: string, identification = "") =>
		`<?xml version="1.0"?><score-partwise version="4.0">${identification}${credits}<part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1"><measure number="1"/></part></score-partwise>`;
	const credit = (type: string, ...words: string[]) =>
		`<credit page="1"><credit-type>${type}</credit-type>${words.map((w) => `<credit-words>${w}</credit-words>`).join("")}</credit>`;

	test("read when there are no creators", () => {
		const { score } = read(
			page(
				credit("title", "Song") +
					credit("composer", "Ann Lee") +
					credit("lyricist", "Words by", "Lou") +
					credit("arranger", "Zed") +
					credit("rights", "© 2026") +
					'<credit page="1"><credit-words>untyped</credit-words></credit>',
			),
		);
		expect(score?.credits).toEqual({
			composer: ["Ann Lee"],
			lyricist: ["Words by Lou"],
			arranger: ["Zed"],
			copyright: ["© 2026"],
		});
	});

	test("ignored when the file names creators; rights keep <rights>", () => {
		const { score } = read(
			page(
				credit("composer", "Page Name") + credit("rights", "page rights"),
				'<identification><creator type="composer">Ann</creator><rights>(c) Ann</rights></identification>',
			),
		);
		expect(score?.credits).toEqual({
			composer: ["Ann"],
			lyricist: [],
			arranger: [],
			copyright: ["(c) Ann"],
		});
	});
});
