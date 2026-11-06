import { describe, expect, test } from "bun:test";
import { parseChart, printChart } from "barmark";
import { exportMusicXml, type ImportResult, importMusicXml } from "../../src/index.js";
import { attributes, measure, note, rest } from "./helpers.js";

/** What every import must give: canonical text that parses without errors, and no importer bug. */
function sound(r: ImportResult): ImportResult {
	expect(printChart(r.text)).toBe(r.text);
	expect(parseChart(r.text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	expect(r.diagnostics.filter((d) => d.message.startsWith("importer bug"))).toEqual([]);
	return r;
}

const time44 = attributes(
	"<divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>",
);
const harmony = (step: string) =>
	`<harmony><root><root-step>${step}</root-step></root><kind>major</kind></harmony>`;
const triad = (step: string) =>
	note(step, 4, 4) + note("E", 4, 4).replace("<note>", "<note><chord/>");

type PartXml = { id: string; name: string; measures: string };

/** A score of several parts, written by another program unless `software` says otherwise. */
function score(parts: PartXml[], head = "", software = ""): string {
	const encoding = software
		? `<identification><encoding><software>${software}</software></encoding></identification>`
		: "";
	const list = parts
		.map((p) => `<score-part id="${p.id}"><part-name>${p.name}</part-name></score-part>`)
		.join("");
	const body = parts.map((p) => `<part id="${p.id}">${p.measures}</part>`).join("");
	return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0">${head}${encoding}<part-list>${list}</part-list>${body}</score-partwise>`;
}

const pianoAndBassNoHarmony = score([
	{ id: "P1", name: "Piano", measures: measure(1, time44 + triad("C")) + measure(2, triad("F")) },
	{
		id: "P2",
		name: "Bass",
		measures: measure(1, time44 + note("C", 2, 4)) + measure(2, note("F", 2, 4)),
	},
]);

const errorOf = (r: ImportResult) => {
	expect(r.text).toBe("");
	return r.diagnostics.find((d) => d.severity === "error")?.message;
};

describe("errors, never throws", () => {
	test("endings that no pass plays give an error, not an empty chart", () => {
		const second = '<barline location="left"><ending number="2" type="start"/></barline>';
		const xml = score([
			{
				id: "P1",
				name: "Guitar",
				measures:
					measure(1, second + time44 + harmony("C") + note("C", 4, 4)) +
					measure(2, harmony("G") + note("G", 4, 4)),
			},
		]);
		expect(errorOf(importMusicXml(xml))).toBe("nothing to import: no bar plays");
	});

	test("bad XML is an error, not a throw", () => {
		const r = importMusicXml("<a>");
		expect(errorOf(r)).toBe("not well-formed XML");
	});

	test("XML nested too deeply says so", () => {
		const deep = `<score-partwise>${"<a>".repeat(150)}${"</a>".repeat(150)}</score-partwise>`;
		expect(errorOf(importMusicXml(deep))).toBe("XML nested too deeply (more than 100 elements)");
	});

	test("a document that isn't a score is an error", () => {
		expect(errorOf(importMusicXml("<html/>"))).toBe(
			"not a MusicXML score: the root element is <html>",
		);
	});

	test("no harmony from another program names the parts and --part", () => {
		expect(importMusicXml(pianoAndBassNoHarmony).diagnostics[0]?.message).toBe(
			"no chord symbols; these parts have notes: Piano, Bass. Import one as note sets with --part",
		);
		expect(importMusicXml(pianoAndBassNoHarmony).text).toBe("");
	});

	test("no harmony, but words that look like chord symbols: the hint is in the error", () => {
		const words = (t: string) =>
			`<direction placement="above"><direction-type><words>${t}</words></direction-type></direction>`;
		const measures = [1, 2, 3]
			.map((n) => measure(n, (n === 1 ? time44 : "") + words("Cmaj7") + note("E", 4, 4)))
			.join("");
		const r = importMusicXml(score([{ id: "P1", name: "Lead", measures }]));
		expect(r.text).toBe("");
		expect(r.diagnostics).toEqual([
			{
				severity: "error",
				message:
					"no chord symbols; text that looks like chord symbols in 3 measures: 1, 2, 3 (the program exported them as text); these parts have notes: Lead. Import one as note sets with --part",
				measure: "1",
				measures: ["1", "2", "3"],
			},
		]);
	});

	test("--part naming a part with neither chords nor notes says so", () => {
		const xml = score([
			{ id: "P1", name: "Lead", measures: measure(1, time44 + harmony("C") + note("E", 4, 4)) },
			{ id: "P2", name: "Empty", measures: measure(1, time44) },
		]);
		expect(importMusicXml(xml, { part: "Empty" })).toEqual({
			text: "",
			diagnostics: [{ severity: "error", message: "Empty has no chord symbols or notes" }],
		});
	});

	test("a score with neither chords nor notes has nothing to import", () => {
		const empty = score([{ id: "P1", name: "Piano", measures: measure(1, time44) }]);
		expect(errorOf(importMusicXml(empty))).toBe("nothing to import: no chord symbols and no notes");
	});

	test("--part naming no part is an error that lists the parts", () => {
		expect(errorOf(importMusicXml(pianoAndBassNoHarmony, { part: "Drums" }))).toBe(
			"no part named Drums; the parts are: Piano, Bass",
		);
	});

	test("an unexpected exception is reported as the importer's bug", () => {
		const options = {
			get part(): string {
				throw new Error("boom");
			},
		};
		expect(importMusicXml(pianoAndBassNoHarmony, options)).toEqual({
			text: "",
			diagnostics: [{ severity: "error", message: "importer bug: boom" }],
		});
	});
});

describe("parts", () => {
	test("--part imports one part alone", () => {
		const r = sound(importMusicXml(pianoAndBassNoHarmony, { part: "Bass" }));
		expect(r.text).toBe("| {C2} | {F2} |\n");
		expect(r.diagnostics).toEqual([]);
	});

	test("--part reads words and lyrics from the chosen part alone; headings are the score's", () => {
		const above = (t: string, bold = false) =>
			`<direction placement="above"><direction-type><words${bold ? ' font-weight="bold"' : ""}>${t}</words></direction-type></direction>`;
		const sung = '<lyric number="1"><syllabic>single</syllabic><text>la</text></lyric>';
		const xml = score([
			{ id: "P1", name: "Gtr", measures: measure(1, time44 + harmony("C") + note("E", 4, 4)) },
			{
				id: "P2",
				name: "Voice",
				measures: measure(
					1,
					time44 + above("Verse", true) + above("softly") + harmony("D") + note("F", 4, 4, sung),
				),
			},
		]);
		expect(sound(importMusicXml(xml, { part: "Gtr" })).text).toBe("## Verse\n| C |\n");
	});

	test("--part matches the part's name in any case", () => {
		expect(sound(importMusicXml(pianoAndBassNoHarmony, { part: "piano" })).text).toBe(
			"| {C4 E4} | {E4 F4} |\n",
		);
	});

	test("barmark's own file with no chord symbols imports its note sets", () => {
		const r = exportMusicXml("| {C4 E4 G4} | {F4 A4 C5} |");
		if (!r.ok) throw new Error("export failed");
		expect(sound(importMusicXml(r.xml)).text).toBe("| {C4 E4 G4} | {F4 A4 C5} |\n");
	});

	test("a part with chords and a part of notes alone: the notes are left out", () => {
		const xml = score([
			{ id: "P1", name: "Lead", measures: measure(1, time44 + harmony("C") + note("E", 4, 4)) },
			{ id: "P2", name: "Bass", measures: measure(1, time44 + note("C", 2, 4)) },
		]);
		const r = sound(importMusicXml(xml));
		expect(r.text).toBe("| C |\n");
		expect(r.diagnostics).toContainEqual({
			severity: "warning",
			message:
				"no chord symbols in these parts, left out: Bass. Import one as note sets with --part",
		});
	});
});

describe("marks barmark can't write", () => {
	const dynamic = `<direction placement="below"><direction-type><dynamics><p/></dynamics></direction-type></direction>`;
	const slurred = (step: string) =>
		note(
			step,
			4,
			4,
			`<notations><slur type="start" number="1"/><articulations><accent/></articulations></notations>`,
		);
	const messages = (measures: string) =>
		importMusicXml(score([{ id: "P1", name: "Lead", measures }])).diagnostics.map((d) => d.message);

	test("are reported in a part whose notes are read", () => {
		const slash = note("B", 4, 4, "<notehead>slash</notehead>");
		const hit = slurred("C") + note("E", 4, 4).replace("<note>", "<note><chord/>");
		const measures =
			measure(1, time44 + dynamic + harmony("C") + slash) + measure(2, harmony("C") + hit);
		expect(messages(measures)).toEqual([
			"dynamics left out in measure 1",
			"accents and articulations left out in measure 2",
			"slurs and ornaments left out in measure 2",
		]);
	});

	test("on a melody's notes are not reported, as the notes are left out; its other marks are", () => {
		const measures =
			measure(1, time44 + dynamic + harmony("C") + slurred("E")) +
			measure(2, harmony("F") + slurred("F"));
		expect(messages(measures)).toEqual([
			"notes read as a melody and left out in 2 measures: 1, 2",
			"dynamics left out in measure 1",
		]);
	});
});

describe("credits", () => {
	test("typed page credits when there are no creators", () => {
		const head =
			'<work><work-title>Song</work-title></work><credit page="1"><credit-type>composer</credit-type><credit-words>Ann Lee</credit-words></credit><credit page="1"><credit-type>rights</credit-type><credit-words>© 2026 Ann Lee</credit-words></credit>';
		const xml = score(
			[{ id: "P1", name: "Lead", measures: measure(1, time44 + harmony("C") + note("E", 4, 4)) }],
			head,
		);
		expect(sound(importMusicXml(xml)).text).toBe(
			"# Song\ncomposer: Ann Lee\ncopyright: © 2026 Ann Lee\n| C |\n",
		);
	});
});

describe("words that look like chord symbols", () => {
	test("stay words, with one warning", () => {
		const words = (t: string) =>
			`<direction placement="above"><direction-type><words>${t}</words></direction-type></direction>`;
		const measures = Array.from({ length: 12 }, (_, i) =>
			measure(i + 1, (i === 0 ? time44 : "") + words("Cmaj7") + note("E", 4, 4)),
		).join("");
		const xml = score([{ id: "P1", name: "Lead", measures }]);
		const r = sound(importMusicXml(xml, { part: "Lead" }));
		expect(r.diagnostics.map((d) => d.message)).toEqual([
			"text that looks like chord symbols in 12 measures: 1, 2, 3, …; the program exported them as text",
		]);
		expect(r.text.match(/"Cmaj7"/g)).toHaveLength(12);
	});
});

describe("systems that would join", () => {
	test("systems that would join are separated by ---, with no cue words", () => {
		const slash = note("B", 4, 4, "<notehead>slash</notehead>");
		const resting = rest(4).replace("<rest/>", '<rest measure="yes"/>');
		const bars = (from: number, steps: string[] | null) =>
			Array.from({ length: 4 }, (_, i) => {
				const step = steps?.[i];
				const body = step ? harmony(step) + slash : resting;
				return measure(from + i, (from === 1 && i === 0 ? time44 : "") + body);
			}).join("");
		const xml = score(
			[
				{ id: "P1", name: "Guitar", measures: bars(1, ["A", "B", "C", "D"]) + bars(5, null) },
				{ id: "P2", name: "Piano", measures: bars(1, null) + bars(5, ["E", "F", "G", "A"]) },
			],
			"",
			"MuseScore 4.4",
		);
		const r = sound(importMusicXml(xml));
		expect(r.text).toBe(
			"part: G = Guitar\npart: P = Piano\nG | A | B | C | D |\n---\nP | E | F | G | A |\n",
		);
		expect(r.text).not.toMatch(/tacet|enters/);
		const parsed = parseChart(r.text);
		expect(parsed.bars.map((b) => b.parts?.map((p) => p?.slots[0]?.kind === "chord"))).toEqual([
			...Array.from({ length: 4 }, () => [true, false]),
			...Array.from({ length: 4 }, () => [false, true]),
		]);
	});
});

describe("a melody in thirds", () => {
	const time44in8ths = attributes(
		"<divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time>",
	);
	const dyad = (low: string, high: string, duration: number, highOctave = 4) =>
		note(low, 4, duration) + note(high, highOctave, duration).replace("<note>", "<note><chord/>");
	const slashIntro = harmony("C") + note("B", 4, 2, "<notehead>slash</notehead>").repeat(4);
	const guitar = (measures: string) =>
		importMusicXml(score([{ id: "P1", name: "Guitar", measures }], "", "MuseScore 4.4"));

	test("a melody doubled in thirds in a part that writes slashes is a melody, not voicings", () => {
		const thirds = ["C", "D", "E", "F", "G", "F", "E", "D"].map((s, i) =>
			dyad(s, ["E", "F", "G", "A", "B", "A", "G", "F"][i] as string, 1),
		);
		const r = sound(
			guitar(
				measure(1, time44in8ths + slashIntro) +
					measure(2, harmony("F") + thirds.join("")) +
					measure(3, harmony("G") + thirds.join("")),
			),
		);
		expect(r.text).toBe("| C | F | G |\n");
		expect(r.diagnostics.map((d) => d.message)).toEqual([
			"notes read as a melody and left out in 2 measures: 2, 3",
		]);
	});

	test("two-note attacks that land on each chord change stay voicings", () => {
		const r = sound(
			guitar(
				measure(1, time44in8ths + slashIntro) +
					measure(2, harmony("F") + dyad("A", "C", 4, 5) + harmony("G") + dyad("B", "D", 4, 5)),
			),
		);
		expect(r.text).toBe("| C | F{A4 C5} G{B4 D5} |\n");
		expect(r.diagnostics).toEqual([]);
	});
});

describe("comping off the beat stays voicings; a moving bar alone is melody", () => {
	const time = (beats: number, beatType: number) =>
		attributes(
			`<divisions>2</divisions><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>`,
		);
	const pitches = {
		F: [
			["F", 4],
			["A", 4],
			["C", 5],
		],
		G: [
			["D", 4],
			["G", 4],
			["B", 4],
		],
	} as const;
	/** A voicing of F or G held for `eighths`, with `extra` (a tie) on each note. */
	const hit = (chord: "F" | "G", eighths: number, extra = "") =>
		pitches[chord]
			.map(([s, o], i) =>
				note(s, o, eighths, extra).replace("<note>", i ? "<note><chord/>" : "<note>"),
			)
			.join("");
	const tieStart = '<tie type="start"/>';
	const tieStop = '<tie type="stop"/>';
	const slashes = (n: number, eighths = 2) =>
		note("B", 4, eighths, "<notehead>slash</notehead>").repeat(n);
	const intro = time(4, 4) + harmony("C") + slashes(4);
	const guitar = (measures: string) =>
		sound(importMusicXml(score([{ id: "P1", name: "Guitar", measures }], "", "MuseScore 4.4")));
	const F = "{F4 A4 C5}";
	const G = "{D4 G4 B4}";

	test("a Charleston (1 and the and of 2) re-strikes its voicing: voicings", () => {
		const r = guitar(
			measure(1, intro) +
				measure(2, harmony("F") + hit("F", 3) + hit("F", 5)) +
				measure(3, harmony("G") + hit("G", 3) + hit("G", 5)),
		);
		expect(r.text).toBe(`| C | F${F} /_${F} / / | G${G} /_${G} / / |\n`);
		expect(r.diagnostics).toEqual([]);
	});

	test("a push tied over the bar line into the next chord: voicings", () => {
		const r = guitar(
			measure(1, intro) +
				measure(2, harmony("F") + hit("F", 7) + hit("G", 1, tieStart)) +
				measure(3, harmony("G") + hit("G", 8, tieStop)),
		);
		expect(r.text).toBe(`| C | F${F} / / /_${G} | G |\n`);
		expect(r.diagnostics).toEqual([]);
	});

	test("a push an eighth before a change within the bar, holding into it: voicings", () => {
		const r = guitar(
			measure(1, intro) +
				measure(
					2,
					harmony("F") + hit("F", 3) + hit("G", 1, tieStart) + harmony("G") + hit("G", 4, tieStop),
				),
		);
		expect(r.text).toBe(`| C | F${F} /_${G} G / |\n`);
		expect(r.diagnostics).toEqual([]);
	});

	test("stabs on 2, 4 and the and of 4: voicings", () => {
		const r = guitar(
			measure(1, intro) +
				measure(2, harmony("F") + rest(2) + hit("F", 2) + rest(2) + hit("F", 1) + hit("F", 1)) +
				measure(3, harmony("G") + hit("G", 8)),
		);
		expect(r.text).toBe(`| C | F ${F} -- ${F}_${F} | G${G} |\n`);
		expect(r.diagnostics).toEqual([]);
	});

	test("eighth-note rock comping: voicings", () => {
		const r = guitar(measure(1, intro) + measure(2, harmony("F") + hit("F", 1).repeat(8)));
		expect(r.text).toBe(`| C | F${F}_${F} ${F}_${F} ${F}_${F} ${F}_${F} |\n`);
		expect(r.diagnostics).toEqual([]);
	});

	test("6/8 comping in eighths: voicings", () => {
		const r = guitar(
			measure(1, time(6, 8) + harmony("C") + slashes(2, 3)) +
				measure(2, harmony("F") + hit("F", 1).repeat(6)) +
				measure(3, harmony("G") + hit("G", 1).repeat(6)),
		);
		expect(r.text).toBe(
			`time: 6/8\n| C | F${F}_${F}_${F} ${F}_${F}_${F} | G${G}_${G}_${G} ${G}_${G}_${G} |\n`,
		);
		expect(r.diagnostics).toEqual([]);
	});

	test("fifteen bars of voicings and one pushed bar keep every voicing", () => {
		const bars = Array.from({ length: 15 }, (_, k) => {
			const i = k + 2;
			const chord = i % 2 ? "G" : "F";
			if (i === 15) return measure(i, harmony("G") + hit("G", 7) + hit("F", 1, tieStart));
			if (i === 16) return measure(i, harmony("F") + hit("F", 8, tieStop));
			return measure(i, harmony(chord) + hit(chord, 8));
		});
		const r = guitar(measure(1, intro) + bars.join(""));
		const v = (c: "F" | "G") => `${c}${c === "F" ? F : G}`;
		expect(r.text).toBe(
			`| C | ${v("F")} | ${v("G")} | ${v("F")} |\n| ${v("G")} | ${v("F")} | ${v("G")} | ${v("F")} |\n| ${v("G")} | ${v("F")} | ${v("G")} | ${v("F")} |\n| ${v("G")} | ${v("F")} | ${v("G")} / / /_${F} | F |\n`,
		);
		expect(r.diagnostics).toEqual([]);
	});

	test("a part that comps, then plays one bar of moving thirds, loses that bar's notes alone", () => {
		const thirds = ["B", "C", "D", "C", "B", "A", "B", "C"]
			.map((s, i) => {
				const up = ["D", "E", "F", "E", "D", "C", "D", "E"][i] as string;
				const octave = (n: string) => (n === "C" || n === "D" || n === "E" || n === "F" ? 5 : 4);
				return note(s, octave(s), 1) + note(up, octave(up), 1).replace("<note>", "<note><chord/>");
			})
			.join("");
		const r = guitar(
			measure(1, intro) +
				measure(2, harmony("F") + hit("F", 8)) +
				measure(3, harmony("G") + thirds) +
				measure(4, harmony("F") + hit("F", 8)),
		);
		expect(r.text).toBe(`| C | F${F} | G | F${F} |\n`);
		expect(r.diagnostics.map((d) => d.message)).toEqual([
			"notes read as a melody and left out in measure 3",
		]);
	});
});
