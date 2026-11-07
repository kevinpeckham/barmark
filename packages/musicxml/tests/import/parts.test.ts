import { describe, expect, test } from "bun:test";
import { Losses } from "../../src/import/losses.js";
import { foldRhythm } from "../../src/import/merge.js";
import { type ImportedPart, importPart } from "../../src/import/parts.js";
import { type Attack, readScore } from "../../src/import/read.js";
import { parseXml } from "../../src/import/tree.js";
import { exportMusicXml } from "../../src/index.js";
import { attributes, measure, note, rest } from "./helpers.js";

const BARMARK = "@barmark/musicxml 0.4.1";

type Meta = {
	name?: string;
	abbreviation?: string;
	instrument?: string;
	program?: number;
	software?: string;
};

/** A one-part score: the part list from `meta`, the measures as written. */
function scoreXml(meta: Meta, body: string): string {
	const encoding = meta.software
		? `<identification><encoding><software>${meta.software}</software></encoding></identification>`
		: "";
	const abbreviation = meta.abbreviation
		? `<part-abbreviation>${meta.abbreviation}</part-abbreviation>`
		: "";
	const instrument = meta.instrument
		? `<score-instrument id="I1"><instrument-name>${meta.instrument}</instrument-name></score-instrument>`
		: "";
	const program = meta.program
		? `<midi-instrument id="I1"><midi-program>${meta.program}</midi-program></midi-instrument>`
		: "";
	return `<?xml version="1.0"?><score-partwise version="4.0">${encoding}<part-list><score-part id="P1"><part-name>${meta.name ?? "Test"}</part-name>${abbreviation}${instrument}${program}</score-part></part-list><part id="P1">${body}</part></score-partwise>`;
}

type Imported = { part: ImportedPart | null; messages: string[] };

function importXml(text: string, forced = false): Imported {
	const losses = new Losses();
	const root = parseXml(text);
	const score = root ? readScore(root, losses) : null;
	const read = score?.parts[0];
	if (!score || !read) throw new Error("no part read");
	const barmark = score.software?.startsWith("@barmark/musicxml") ?? false;
	const part = importPart(read, { barmark, forced }, losses);
	return { part, messages: losses.list().map((d) => d.message) };
}

function importChart(chart: string): Imported {
	const r = exportMusicXml(chart);
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
	return importXml(r.xml);
}

const bars = (i: Imported, line = 0) => i.part?.lines[line]?.bars;

const time44 = (divisions = 1) =>
	attributes(
		`<divisions>${divisions}</divisions><time><beats>4</beats><beat-type>4</beat-type></time>`,
	);
const harmony = (step: string, kind = "major", extra = "") =>
	`<harmony><root><root-step>${step}</root-step></root><kind>${kind}</kind>${extra}</harmony>`;
const slash = (duration: number, extra = "") =>
	note("B", 4, duration, `<notehead>slash</notehead>${extra}`);
const slashes = (count: number) => slash(1).repeat(count);
const chordOf = (duration: number, pitches: [string, number, number?][], extra = "") =>
	pitches
		.map(([step, octave, alter], i) =>
			note(step, octave, duration, extra, alter ?? 0).replace(
				"<note>",
				i === 0 ? "<note>" : "<note><chord/>",
			),
		)
		.join("");
const voice = (n: number, staff?: number) =>
	`<voice>${n}</voice>${staff ? `<staff>${staff}</staff>` : ""}`;
const backup = (duration: number) => `<backup><duration>${duration}</duration></backup>`;

test("barmark's own file: chord, voicing, note set, silence", () => {
	const r = importChart("| C | Cmaj7{E3 G3 B3} | C {E4} | -- G |");
	expect(r.part?.lines).toHaveLength(1);
	expect(r.part?.lines[0]?.name).toBeNull();
	expect(bars(r)).toEqual(["C", "Cmaj7{E3 G3 B3}", "C {E4}", "-- G"]);
	expect(r.part?.hasChords).toBe(true);
	expect(r.messages).toEqual([]);
});

test("held notes, held chords and pushes come back as holds", () => {
	const r = importChart("| {E4} | / | C / / /_G | / |");
	expect(bars(r)).toEqual(["{E4}", "/", "C / / /_G", "/"]);
});

test("a lead sheet is a melody part", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44(2) + harmony("C") + note("E", 4, 1) + note("D", 4, 1) + note("C", 4, 6)) +
				measure(2, harmony("G", "dominant") + note("B", 3, 8)),
		),
	);
	expect(r.part?.lines).toHaveLength(1);
	expect(bars(r)).toEqual(["C", "G7"]);
	expect(r.messages).toEqual(["notes read as a melody and left out in 2 measures: 1, 2"]);
});

test("lead sheet with attacks on every change", () => {
	const r = importXml(
		scoreXml(
			{ software: "Finale" },
			measure(
				1,
				time44() +
					harmony("C") +
					chordOf(2, [
						["E", 4],
						["G", 4],
					]) +
					harmony("F") +
					chordOf(2, [
						["F", 4],
						["A", 4],
					]),
			) + measure(2, harmony("G") + chordOf(4, [["G", 4]])),
		),
	);
	expect(bars(r)).toEqual(["C F", "G"]);
	expect(r.messages).toEqual(["notes read as a melody and left out in 2 measures: 1, 2"]);
});

test("lead sheet with slashes elsewhere and single notes on every change", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + harmony("C") + slashes(4)) +
				measure(2, harmony("F") + note("F", 4, 2) + harmony("G") + note("G", 4, 2)),
		),
	);
	expect(bars(r)).toEqual(["C", "F G"]);
	expect(r.messages).toEqual(["notes read as a melody and left out in measure 2"]);
});

const measureRest = (duration = 4) => rest(duration).replace("<rest/>", '<rest measure="yes"/>');

test("a melody's rests never end the chord: a bar with no harmony holds once a chord has sounded", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + harmony("C") + note("E", 4, 4)) +
				measure(2, measureRest()) +
				measure(3, note("D", 4, 4)) +
				measure(4, note("E", 4, 4)) +
				measure(5, harmony("G") + note("D", 4, 4)),
		),
	);
	// lead sheets write chords only on change: C holds through the melody's rest
	expect(bars(r)).toEqual(["C", "/", "/", "/", "G"]);
});

test("a melody bar of plain rests holds the chord", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + harmony("C") + note("E", 4, 4)) +
				measure(2, rest(4)) +
				measure(3, harmony("G") + note("D", 4, 4)),
		),
	);
	expect(bars(r)).toEqual(["C", "/", "G"]);
});

test("a melody resting before its first chord rests", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + measureRest()) +
				measure(2, harmony("C") + note("E", 4, 4)) +
				measure(3, rest(4)),
		),
	);
	expect(bars(r)).toEqual([null, "C", "/"]);
});

test("a guitar's solo: a chord part with chords in some bars only rests elsewhere", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + measureRest()) +
				measure(2, harmony("A") + slashes(4)) +
				measure(3, harmony("D") + slashes(4)) +
				measure(4, measureRest()) +
				measure(5, measureRest()),
		),
	);
	expect(bars(r)).toEqual([null, "A", "D", null, null]);
	expect(r.messages).toEqual([]);
});

test("chords alone because of a melody: a bar of plain rests holds the chord", () => {
	// the single-note fill in bar 4 makes this another program's part a melody part: chords alone
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + harmony("C") + slashes(4)) +
				measure(2, rest(2) + rest(2)) +
				measure(3, slashes(4)) +
				measure(4, harmony("G") + slashes(2) + note("B", 4, 2)),
		),
	);
	expect(bars(r)).toEqual(["C", "/", "/", "G"]);
	expect(r.messages).toEqual(["notes read as a melody and left out in measure 4"]);
});

test("slashes coming back after a rest restate the last chord", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + harmony("C") + slashes(4)) +
				measure(2, measureRest()) +
				measure(3, slashes(4)) +
				measure(4, harmony("G") + slashes(2) + rest(1) + slashes(1)),
		),
	);
	expect(bars(r)).toEqual(["C", null, "C", "G / -- G"]);
});

test("a chord placed past its bar's end moves to the last beat, with a warning", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + harmony("C", "major", "<offset>9</offset>") + note("E", 4, 4)),
		),
	);
	expect(bars(r)).toEqual(["N.C. / / C"]);
	expect(r.messages).toEqual([
		"notes read as a melody and left out in measure 1",
		"chord symbols moved to the nearest beat in measure 1",
	]);
});

test("a comping part with slashes and a voiced hit reads its notes", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + harmony("C") + slashes(4)) +
				measure(
					2,
					harmony("C", "major-seventh") +
						chordOf(4, [
							["E", 3],
							["G", 3],
							["B", 3],
						]),
				) +
				measure(
					3,
					chordOf(2, [
						["D", 3],
						["F", 3],
					]) + rest(2),
				),
		),
	);
	expect(bars(r)).toEqual(["C", "Cmaj7{E3 G3 B3}", "{D3 F3} --"]);
	expect(r.messages).toEqual([]);
});

test("a voicing note outside its chord drops the voicing", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + harmony("C") + slashes(4)) +
				measure(
					2,
					harmony("C", "major-seventh") +
						chordOf(4, [
							["C", 3, 1],
							["E", 3],
						]),
				),
		),
	);
	expect(bars(r)).toEqual(["C", "Cmaj7"]);
	expect(r.messages).toEqual([
		"voicing notes outside the chord; the chord written alone in measure 2",
	]);
});

test("marked root comes back as !", () => {
	const marked = note("E", 3, 4).replace("<note>", "<note><?barmark root?><chord/>");
	const r = importXml(
		scoreXml(
			{ software: BARMARK },
			measure(
				1,
				time44() +
					note("D", 3, 4) +
					marked +
					chordOf(4, [["G", 3]]).replace("<note>", "<note><chord/>") +
					chordOf(4, [["B", 3]]).replace("<note>", "<note><chord/>"),
			),
		),
	);
	expect(bars(r)).toEqual(["{D3 E3! G3 B3}"]);
});

test("a note set's pitches print low to high, spelled with accidentals", () => {
	const r = importXml(
		scoreXml(
			{ software: BARMARK },
			measure(
				1,
				time44() +
					chordOf(4, [
						["B", 3, -1],
						["F", 3, 1],
						["C", 4],
					]),
			),
		),
	);
	expect(bars(r)).toEqual(["{F#3 Bb3 C4}"]);
});

test("a piano part without lines merges its staves back into one line", () => {
	const r = importChart("part: Pno = Piano\n| Cmaj7{E3 G3 B3} | {C3 E4 G4} | C / {C3 E4} / |");
	expect(r.part?.lines).toHaveLength(1);
	expect(r.part?.lines[0]?.name).toBeNull();
	expect(bars(r)).toEqual(["Cmaj7{E3 G3 B3}", "{C3 E4 G4}", "C {C3 E4}"]);
	expect(r.messages).toEqual([]);
});

test("a bare piano line's low notes inside the upper staff's joined rest still merge", () => {
	const r = importChart("part: Pno = Piano\n| {C3}_{E3}_{G3}_{C4} C{C4 E4 G4} | {C3}_-- C |");
	expect(r.part?.lines).toHaveLength(1);
	// the same rhythm as written, on the grid placeBar prefers
	expect(bars(r)).toEqual(["{C3}_{E3} {G3}_{C4} C{C4 E4 G4} /", "{C3} -- C /"]);
});

test("a held piano chord across a bar line merges as a hold", () => {
	const r = importChart("part: Pno = Piano\n| {C3 E4} | / |");
	expect(bars(r)).toEqual(["{C3 E4}", "/"]);
});

test("piano lines named RH and LH", () => {
	const r = importChart(
		"part: Pno = Piano, instrument: piano\nPno.RH | G{B3 D4 G4} | C{C4 E4 G4} |\nPno.LH | {G2} {A2} | {C3} {E3} |",
	);
	expect(r.part?.lines.map((l) => l.name)).toEqual(["RH", "LH"]);
	expect(bars(r, 0)).toEqual(["G{B3 D4 G4}", "C{C4 E4 G4}"]);
	expect(bars(r, 1)).toEqual(["{G2} {A2}", "{C3} {E3}"]);
	expect(r.part?.instrument).toBe("piano");
});

test("a harmony over a rest is a plain chord", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + harmony("C") + slashes(4)) +
				measure(2, harmony("G") + rest(2) + harmony("D") + rest(2)),
		),
	);
	expect(bars(r)).toEqual(["C", "G D"]);
});

test("pushed slashes don't make a comping part a melody", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(
				1,
				time44(2) +
					harmony("C") +
					slash(2) +
					slash(2) +
					slash(2) +
					slash(1) +
					harmony("G") +
					slash(1, '<tie type="start"/>'),
			) +
				measure(2, slash(8, '<tie type="stop"/>')) +
				measure(
					3,
					harmony("C", "major-seventh") +
						chordOf(8, [
							["E", 3],
							["G", 3],
							["B", 3],
						]),
				),
		),
	);
	expect(bars(r)).toEqual(["C / / /_G", "/", "Cmaj7{E3 G3 B3}"]);
	expect(r.messages).toEqual([]);
});

test("a single-pitch attack in another program's slash part makes it a melody part", () => {
	const r = importXml(
		scoreXml(
			{ software: "MuseScore 4.4.2" },
			measure(1, time44() + harmony("C") + slashes(4)) +
				measure(2, harmony("G") + slashes(2) + note("B", 4, 2)),
		),
	);
	expect(bars(r)).toEqual(["C", "G"]);
	expect(r.messages).toEqual(["notes read as a melody and left out in measure 2"]);
});

test("a timed rest is --, a whole-measure rest is resting", () => {
	const r = importXml(
		scoreXml(
			{ software: BARMARK },
			measure(1, time44() + harmony("C") + slashes(2) + rest(2)) +
				measure(2, rest(4, "").replace("<rest/>", '<rest measure="yes"/>')) +
				measure(3, harmony("G") + slashes(4)),
		),
	);
	expect(bars(r)).toEqual(["C --", null, "G"]);
});

test("a chord over a resting line keeps its holds; after a rest it starts with N.C.", () => {
	const r = importXml(
		scoreXml(
			{ software: BARMARK },
			measure(1, time44() + rest(4, "").replace("<rest/>", '<rest measure="yes"/>')) +
				measure(
					2,
					harmony("G", "major", "<offset>2</offset>") +
						rest(4, "").replace("<rest/>", '<rest measure="yes"/>'),
				),
		),
	);
	expect(bars(r)).toEqual([null, "N.C. G"]);
});

test("a one-staff part's lines are 1 and 2", () => {
	const r = importChart(
		"part: Gtr = Electric Guitar 1, instrument: electric guitar\nGtr.1 | C{E3 G3} | G |\nGtr.2 | {C2} {G2} | -- {D3} |",
	);
	expect(r.part?.lines.map((l) => l.name)).toEqual(["1", "2"]);
	expect(bars(r, 0)).toEqual(["C{E3 G3}", "G"]);
	expect(bars(r, 1)).toEqual(["{C2} {G2}", "-- {D3}"]);
});

test("a part with five voices gives chords alone", () => {
	const voices = [1, 2, 3, 4, 5]
		.map((v, i) => (i === 0 ? "" : backup(4)) + note("C", 3 + i, 4, voice(v)))
		.join("");
	const r = importXml(
		scoreXml({ software: BARMARK }, measure(1, time44() + harmony("C") + voices)),
	);
	expect(r.part?.lines).toHaveLength(1);
	expect(bars(r)).toEqual(["C"]);
	expect(r.messages).toEqual(["more than four voices; notes left out in measure 1"]);
});

test("an off-grid note in a line gives chords alone", () => {
	const r = importXml(
		scoreXml(
			{ software: BARMARK },
			measure(
				1,
				time44(5) +
					harmony("C") +
					slash(5, voice(1)).repeat(4) +
					backup(20) +
					note("C", 3, 1, voice(2)) +
					note("D", 3, 19, voice(2)),
			),
		),
	);
	expect(r.part?.lines).toHaveLength(1);
	expect(bars(r)).toEqual(["C"]);
	expect(r.messages).toEqual(["notes off barmark's grid; notes left out in measure 1"]);
});

test("notes-only part: barmark file reads it, another file needs --part", () => {
	const body =
		measure(1, time44() + note("C", 3, 4)) +
		measure(
			2,
			chordOf(4, [
				["E", 3],
				["G", 3],
			]),
		);
	const own = importXml(scoreXml({ software: BARMARK }, body));
	expect(bars(own)).toEqual(["{C3}", "{E3 G3}"]);
	expect(own.part?.hasChords).toBe(false);
	expect(importXml(scoreXml({ software: "Sibelius" }, body)).part).toBeNull();
	expect(bars(importXml(scoreXml({ software: "Sibelius" }, body), true))).toEqual([
		"{C3}",
		"{E3 G3}",
	]);
});

test("an unreadable chord is ? and keeps its original", () => {
	const r = importXml(
		scoreXml(
			{ software: BARMARK },
			measure(
				1,
				time44() +
					harmony("C") +
					slashes(2) +
					`<harmony><root><root-step>D</root-step></root><kind text="Tristan">other</kind></harmony>` +
					slashes(2),
			),
		),
	);
	expect(bars(r)).toEqual(["C ?"]);
	expect(r.part?.unread).toEqual([{ measure: 0, at: 1, text: "DTristan" }]);
	expect(r.messages).toContain(
		"chord symbols barmark can't read, written as ? with their text as words in measure 1",
	);
});

test("a chord symbol with no root and no text is ?, still with a warning", () => {
	const r = importXml(
		scoreXml(
			{ software: BARMARK },
			measure(
				1,
				time44() + harmony("C") + slashes(2) + "<harmony><kind>major</kind></harmony>" + slashes(2),
			),
		),
	);
	expect(bars(r)).toEqual(["C ?"]);
	expect(r.messages).toEqual(["chord symbols barmark can't read, written as ? in measure 1"]);
});

test("a chord off the grid moves to the nearest beat, with a warning", () => {
	const r = importXml(
		scoreXml(
			{ software: BARMARK },
			measure(
				1,
				time44(5) +
					harmony("C") +
					slash(5).repeat(4) +
					harmony("G", "major", "<offset>-9</offset>"),
			),
		),
	);
	expect(bars(r)).toEqual(["C G"]);
	expect(r.messages).toEqual(["chord symbols moved to the nearest beat in measure 1"]);
});

test("a label never starts with a digit", () => {
	const r = importXml(
		scoreXml({ name: "1st Gtr" }, measure(1, time44() + harmony("C") + slashes(4))),
	);
	expect(r.part?.label).toBe("G1");
	const short = importXml(
		scoreXml(
			{ name: "Guitar", abbreviation: "2." },
			measure(1, time44() + harmony("C") + slashes(4)),
		),
	);
	expect(short.part?.label).toBe("P2");
});

test("label and instrument", () => {
	const body = measure(1, time44() + harmony("C") + slashes(4));
	const named = importXml(
		scoreXml(
			{ name: "Electric Guitar 1", abbreviation: "Gtr.", instrument: "Electric Guitar" },
			body,
		),
	);
	expect(named.part?.name).toBe("Electric Guitar 1");
	expect(named.part?.label).toBe("Gtr");
	expect(named.part?.instrument).toBe("electric guitar");
	const byProgram = importXml(scoreXml({ name: "Electric Guitar 1", program: 28 }, body));
	expect(byProgram.part?.label).toBe("EG1");
	expect(byProgram.part?.instrument).toBe("electric guitar");
	expect(importXml(scoreXml({ name: "Kazoo" }, body)).part?.instrument).toBeNull();
});

test("lyrics are the part's measures", () => {
	const r = importChart("| C |");
	expect(r.part?.lyrics).toHaveLength(1);
});

describe("a voice of slashes alone in another voice's gaps", () => {
	const forward = (duration: number) => `<forward><duration>${duration}</duration></forward>`;
	const gMajor: [string, number][] = [
		["G", 3],
		["B", 3],
		["D", 4],
	];
	/** Dorico's comping bar: voice 1 silent (a <forward>) for the slashes, which are voice 2. */
	const doricoBar = (second: string) =>
		harmony("A", "minor") +
		forward(2) +
		chordOf(1, gMajor, voice(1)) +
		backup(1) +
		harmony("G") +
		forward(1) +
		rest(1, voice(1)) +
		backup(4) +
		second;

	test("is the part's rhythm, on its one line (Dorico)", () => {
		const r = importXml(
			scoreXml(
				{ software: "Dorico 6.2.31.6349" },
				measure(1, time44() + harmony("C") + slash(1, voice(1)).repeat(4)) +
					measure(2, doricoBar(slash(1, voice(2)).repeat(2) + forward(2))),
			),
		);
		expect(r.part?.lines).toHaveLength(1);
		expect(bars(r)).toEqual(["C", "Am / G{G3 B3 D4} --"]);
	});

	test("is the part's rhythm when the slashes are voice 2 throughout and voice 1 plays one bar", () => {
		const bar2 =
			harmony("A", "minor") +
			slash(1, voice(2)).repeat(2) +
			harmony("G") +
			chordOf(1, gMajor, voice(1)) +
			rest(1, voice(1));
		const r = importXml(
			scoreXml(
				{ software: "Dorico 6.2.31.6349" },
				measure(1, time44() + harmony("C") + slash(1, voice(2)).repeat(4)) + measure(2, bar2),
			),
		);
		expect(r.part?.lines).toHaveLength(1);
		expect(bars(r)).toEqual(["C", "Am / G{G3 B3 D4} --"]);
	});

	test("slashes sounding with the other voice's notes or rests stay a line of their own", () => {
		const r = importXml(
			scoreXml(
				{ software: "Dorico 6.2.31.6349" },
				measure(1, time44() + harmony("C") + slash(1, voice(1)).repeat(4)) +
					measure(2, doricoBar(slash(1, voice(2)).repeat(4))),
			),
		);
		expect(r.part?.lines).toHaveLength(2);
	});
});

describe("foldRhythm", () => {
	const attack = (kind: Attack["kind"], at: number, length: number): Attack => ({
		at: { n: at, d: 1 },
		length: { n: length, d: 1 },
		kind,
		pitches: kind === "notes" ? [{ name: "E", octave: 4, root: false }] : [],
		tieIn: false,
		tieOut: false,
		fermata: false,
		lyrics: [],
	});

	test("a slash under a long note a <backup> wrote before a shorter one overlaps it", () => {
		// Voice 1: a whole note, then (backed up) a quarter on beat 2; the slash on beat 3 sounds with the whole note.
		const first = [[attack("notes", 0, 4), attack("notes", 1, 1)]];
		expect(foldRhythm(first, [[attack("slash", 2, 1)]])).toBeNull();
	});

	test("slashes in the gaps come in by onset, the other voice first on a tie", () => {
		const zero = attack("slash", 2, 0);
		const folded = foldRhythm(
			[[attack("notes", 2, 1)]],
			[[attack("slash", 3, 1), attack("slash", 0, 2), zero]],
		);
		expect(folded?.[0]?.map((a) => [a.kind, a.at.n])).toEqual([
			["slash", 0],
			["notes", 2],
			["slash", 2],
			["slash", 3],
		]);
	});
});
