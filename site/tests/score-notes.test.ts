import { beforeAll, describe, expect, test } from "bun:test";
import { exportMusicXml } from "@barmark/musicxml";
import { engraveChart } from "@barmark/score";
import { parseChart } from "barmark";
import { VerovioToolkit } from "verovio/esm";
import createVerovioModule from "verovio/wasm";
import { SCORE_EXAMPLE, SCORE_NOTES } from "../src/lib/guide/score.ts";

const count = (xml: string, re: RegExp) => (xml.match(re) ?? []).length;

/** What each row says the score draws, checked on the MusicXML the score engraves. */
const CHECKS: Record<string, (xml: string) => boolean> = {
	chords: (x) => count(x, /<harmony/g) === 4 && count(x, /<notehead>slash<\/notehead>/g) === 12,
	"hold-simile": (x) => count(x, /<harmony/g) === 4 && count(x, /<measure /g) === 2,
	silence: (x) => x.includes('text="N.C."') && x.includes("<rest"),
	notes: (x) =>
		x.includes("<step>E</step><octave>2</octave>") &&
		x.includes("<step>C</step><octave>4</octave>") &&
		count(x, /<harmony/g) === 1,
	marks: (x) =>
		x.includes("<accent/>") && x.includes("<staccato/>") && x.includes('<tied type="start"/>'),
	structure: (x) =>
		[
			"<segno",
			'<repeat direction="forward"',
			"<ending ",
			">Fine<",
			">D.S. al Fine<",
			"<fermata",
		].every((s) => x.includes(s)),
	"sections-directives": (x) =>
		count(x, />Verse</g) === 2 &&
		count(x, /<measure /g) === 4 &&
		x.includes("<fifths>2</fifths>") &&
		x.includes("<beats>3</beats>") &&
		x.includes("<per-minute>96</per-minute>"),
	parts: (x) =>
		x.includes("<part-name>Guitar</part-name>") &&
		x.includes("<part-name>Bass</part-name>") &&
		x.includes("<rest"),
	instruments: (x) =>
		x.includes("<staves>2</staves>") &&
		x.includes("<transpose>") &&
		// The trumpet's C is written as D.
		x.includes("<root-step>D</root-step>"),
	melody: (x) =>
		count(x, /<lyric /g) === 3 && count(x, /<harmony/g) === 2 && !x.includes("slash</notehead"),
	"lyric-rows": (x) => x.includes("<part-name>Lyrics</part-name>") && count(x, /<lyric /g) === 5,
};

let vrv: VerovioToolkit;
beforeAll(async () => {
	vrv = new VerovioToolkit(await createVerovioModule());
}, 60_000);

describe("the Syntax Guide's score rows", () => {
	test("each has a check, and ids are unique", () => {
		const ids = SCORE_NOTES.map((n) => n.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.toSorted()).toEqual(Object.keys(CHECKS).toSorted());
	});
	for (const note of SCORE_NOTES)
		test(`${note.id}: reads cleanly, engraves, and the score holds what the row says`, () => {
			const errors = parseChart(note.example).diagnostics.filter((d) => d.severity === "error");
			expect(errors).toEqual([]);
			const exported = exportMusicXml(note.example);
			if (!exported.ok) throw new Error(exported.diagnostics.map((d) => d.message).join("; "));
			expect(CHECKS[note.id]?.(exported.xml)).toBe(true);
			const engraved = engraveChart(vrv, note.example, { width: 800 });
			expect(engraved.ok).toBe(true);
			if (engraved.ok) expect(engraved.svg).toContain("<svg");
		});
	test("the example shown rendered engraves, with its melody and lyrics", () => {
		expect(parseChart(SCORE_EXAMPLE).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		const engraved = engraveChart(vrv, SCORE_EXAMPLE, { width: 800 });
		expect(engraved.ok).toBe(true);
		if (engraved.ok) expect(count(engraved.xml, /<lyric /g)).toBe(7);
	});
});
