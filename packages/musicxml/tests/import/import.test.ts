import { describe, expect, test } from "bun:test";
import { parseChart, printChart } from "barmark";
import { exportMusicXml, type ImportResult, importMusicXml } from "../../src/index.js";
import { attributes, measure, note } from "./helpers.js";

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
