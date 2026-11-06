/** Lyrics as MusicXML <lyric>s (barmark's grammar 4.3, 7.7). */
import { describe, expect, test } from "bun:test";
import { measures, notes, xmlOf } from "./helpers.js";

const tag = (n: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(n)?.[1];

/** Each <lyric> of a note, as XML. */
const lyrics = (note: string) => note.match(/<lyric [\s\S]*?<\/lyric>/g) ?? [];

/** Each note's pitch (or "rest") and its lyrics. */
const sung = (measure: string) =>
	notes(measure).map((n) => [
		n.includes("<rest") ? "rest" : `${tag(n, "step") ?? tag(n, "display-step")}`,
		...lyrics(n),
	]);

const lyric = (number: number, syllabic: string, text: string) =>
	`<lyric number="${number}"><syllabic>${syllabic}</syllabic><text>${text}</text></lyric>`;

/** A syllable a `:/` holds: its extension starts here (MuseScore keeps only this one). */
const held = (number: number, syllabic: string, text: string) =>
	lyric(number, syllabic, text).replace("</lyric>", '<extend type="start"/></lyric>');

const VOX = "part: Vox = Voice, instrument: voice\n";

const AMAZING_GRACE = `# Amazing Grace
part: Vox = Voice, instrument: voice
key: G, time: 3/4

## Verse
Vox       | [1/4] N.C.    | G                           | G          / G7       | C            / /      | G              |
Vox.Mel   | [1/4] {D4}:A- | {G4}:maz- / {B4}:ing_{G4}:/ | {B4}:grace / {A4}:how | {G4}:sweet / {E4}:the | {D4}:sound / / |
lyrics 2: | 'Twas         | grace / that                | taught / my           | heart / to            | fear / /       |
`;

describe("lyrics on notes", () => {
	test("a syllable becomes <lyric number=1> on its note, with syllabic", () => {
		const xml = xmlOf(
			`${VOX}Vox | {C4}:maz- {D4}:ing {E4}:grace {F4}:won- | {G4}:der- {A4}:ful |\n`,
		);
		const [first = "", second = ""] = measures(xml);
		expect(sung(first)).toEqual([
			["C", lyric(1, "begin", "maz")],
			["D", lyric(1, "end", "ing")],
			["E", lyric(1, "single", "grace")],
			["F", lyric(1, "begin", "won")],
		]);
		expect(sung(second)).toEqual([
			["G", lyric(1, "middle", "der")],
			["A", lyric(1, "end", "ful")],
		]);
		// After the notations, as the schema orders a note.
		expect(first).toMatch(/<\/type><lyric /);
	});
	test(":/ writes <extend/> and the held note carries no text", () => {
		const xml = xmlOf("time: 3/4\n| {G4}:maz- / {B4}:ing_{G4}:/ |\n");
		expect(sung(measures(xml)[0] ?? "")).toEqual([
			["G", lyric(1, "begin", "maz")],
			["B", held(1, "end", "ing")],
			["G", '<lyric number="1"><extend/></lyric>'],
		]);
	});
	test("a tie carries its syllable without <extend>", () => {
		const xml = xmlOf("| {C4}:la {D4}:da | / {E4}:lo |\n");
		const [first = "", second = ""] = measures(xml);
		expect(sung(first)).toEqual([
			["C", lyric(1, "single", "la")],
			["D", lyric(1, "single", "da")],
		]);
		expect(sung(second)).toEqual([["D"], ["E", lyric(1, "single", "lo")]]);
		expect(notes(second)[0]).toContain('<tie type="stop"/>');
		expect(xml).not.toContain("<extend");
	});
	test("~ writes <elision>", () => {
		const xml = xmlOf("| {C4}:the~end {D4}:of- {E4}:it~all- {F4}:ways |\n");
		expect(sung(measures(xml)[0] ?? "")).toEqual([
			[
				"C",
				'<lyric number="1"><syllabic>single</syllabic><text>the</text><elision/><text>end</text></lyric>',
			],
			["D", lyric(1, "begin", "of")],
			[
				"E",
				'<lyric number="1"><syllabic>middle</syllabic><text>it</text><elision/><text>all</text></lyric>',
			],
			["F", lyric(1, "end", "ways")],
		]);
	});
	test("a stacked verse is <lyric number=2> on the same notes", () => {
		const xml = xmlOf(AMAZING_GRACE);
		const bars = measures(xml);
		expect(bars).toHaveLength(5);
		expect(sung(bars[0] ?? "")).toEqual([
			["D", lyric(1, "begin", "A"), lyric(2, "single", "&apos;Twas")],
		]);
		expect(sung(bars[1] ?? "")).toEqual([
			["G", lyric(1, "middle", "maz"), lyric(2, "single", "grace")],
			["B", held(1, "end", "ing"), lyric(2, "single", "that")],
			["G", '<lyric number="1"><extend/></lyric>'],
		]);
		expect(xml).not.toContain('<part id="P2">');
	});
	test("verses by pass go on the passes' notes; a replay's lyric row on the written-out replay", () => {
		const byPass = xmlOf("|: {C4}:one {D4}:two :|\nlyrics 2: | three four |\n");
		expect(measures(byPass)).toHaveLength(1);
		expect(sung(measures(byPass)[0] ?? "")).toEqual([
			["C", lyric(1, "single", "one"), lyric(2, "single", "three")],
			["D", lyric(1, "single", "two"), lyric(2, "single", "four")],
		]);
		const replay = xmlOf(
			"## Verse\n| {C4}:one {D4}:two |\n## Chorus\n| {E4}:la |\n## Verse\nlyrics: | three four |\n",
		);
		const [verse = "", , again = ""] = measures(replay);
		expect(sung(verse)).toEqual([
			["C", lyric(1, "single", "one")],
			["D", lyric(1, "single", "two")],
		]);
		expect(sung(again)).toEqual([
			["C", lyric(1, "single", "three")],
			["D", lyric(1, "single", "four")],
		]);
		// A replay without a row sings the words it was written with.
		const plain = xmlOf("## Verse\n| {C4}:one {D4}:two |\n## Verse\n");
		expect(sung(measures(plain)[1] ?? "")).toEqual([
			["C", lyric(1, "single", "one")],
			["D", lyric(1, "single", "two")],
		]);
	});
	test("each part of a choir sings its own syllables", () => {
		const xml = xmlOf(
			"part: S = Soprano, instrument: voice\npart: A = Alto, instrument: voice\nS | {E5}:hal- {D5}:le |\nA | {C5}:ah {B4}:ah |\n",
		);
		expect(sung(measures(xml, "P1")[0] ?? "")).toEqual([
			["E", lyric(1, "begin", "hal")],
			["D", lyric(1, "end", "le")],
		]);
		expect(sung(measures(xml, "P2")[0] ?? "")).toEqual([
			["C", lyric(1, "single", "ah")],
			["B", lyric(1, "single", "ah")],
		]);
	});
	test("a lyric row's / over a new note extends its syllable, as :/ does; over a tie it doesn't", () => {
		const xml = xmlOf(
			"part: S = Soprano, instrument: voice\npart: A = Alto, instrument: voice\nS | {E5}:Ho- {E5}:ly | {G5}:Lord {G5}:/ {E5}:God / |\nA | {C5}:Ho- {C5}:ly | {E5}:Lord {D5}:/ {C5}:God / |\nlyrics 2: | Ev- er | Name / of / |\n",
		);
		const extend = (n: number) => `<lyric number="${n}"><extend/></lyric>`;
		expect(sung(measures(xml, "P1")[1] ?? "")).toEqual([
			["G", held(1, "single", "Lord"), held(2, "single", "Name")],
			["G", extend(1), extend(2)],
			["E", lyric(1, "single", "God"), lyric(2, "single", "of")],
		]);
		// The row is the first voice part's: the alto sings only its own verse.
		expect(measures(xml, "P2").join("")).not.toContain('<lyric number="2"');
	});
	test("a keyboard's syllables go on the staff that sounds their note", () => {
		const xml = xmlOf("part: P = Piano\nP | {C3}:la {E3}:da {C5}:hi {G2 C5}:lo |\n");
		const words = (staff: number) =>
			notes(measures(xml)[0] ?? "")
				.filter((n) => n.includes(`<staff>${staff}</staff>`))
				.flatMap((n) => [...n.matchAll(/<text>([^<]*)<\/text>/g)].map((m) => m[1]));
		expect(words(1)).toEqual(["hi", "lo"]);
		expect(words(2)).toEqual(["la", "da"]);
	});
	test("a pushed syllable goes on its early note", () => {
		const xml = xmlOf("| {C4}:la {D4}:da | <{E4}:lo / |\n");
		const [first = "", second = ""] = measures(xml);
		expect(sung(first)).toEqual([
			["C", lyric(1, "single", "la")],
			["D", lyric(1, "single", "da")],
			["E", lyric(1, "single", "lo")],
		]);
		expect(sung(second)).toEqual([["E"]]);
	});
});

const RAP = `time: 4/4
        | Am7                      | D9                       |
lyrics: | I_got roll-_in' on_the / | beat_and -- I_keep it_up |
`;

describe("a lyric row with no melody", () => {
	test("a lyric row with no melody is a slash staff carrying the syllables, marked <?barmark lyrics?>", () => {
		const xml = xmlOf(RAP);
		// Words alone: no pitch to play, so it plays nothing.
		expect(xml).toContain(
			'<score-part id="P2"><part-name>Lyrics</part-name><score-instrument id="P2-I1"><instrument-name>Lyrics</instrument-name></score-instrument><midi-instrument id="P2-I1"><volume>0</volume></midi-instrument></score-part>',
		);
		expect(measures(xml, "P1").join("")).not.toContain("<lyric");
		const [first = "", second = ""] = measures(xml, "P2");
		expect(first).toMatch(/^<measure [^>]*><\?barmark lyrics\?>/);
		expect(second).not.toContain("<?barmark lyrics?>");
		expect(first).toContain("<clef><sign>percussion</sign></clef>");
		expect(first).toContain("<staff-details><staff-lines>1</staff-lines></staff-details>");
		expect(first).not.toContain("<harmony");
		const texts = (m: string) =>
			notes(m).map((n) =>
				n.includes("<rest")
					? `-- ${tag(n, "type")}`
					: `${tag(n, "text") ?? "/"} ${tag(n, "type")}${n.includes("<dot/>") ? "." : ""}`,
			);
		expect(texts(first)).toEqual([
			"I eighth",
			"got eighth",
			"roll eighth",
			"in&apos; eighth",
			"on eighth",
			"the quarter.",
		]);
		expect(texts(second)).toEqual([
			"beat eighth",
			"and eighth",
			"-- quarter",
			"I eighth",
			"keep eighth",
			"it eighth",
			"up eighth",
		]);
		for (const n of notes(first + second).filter((n) => !n.includes("<rest")))
			expect(n).toContain("<notehead>slash</notehead>");
		expect(lyrics(notes(first)[2] ?? "")).toEqual([lyric(1, "begin", "roll")]);
		expect(lyrics(notes(first)[3] ?? "")).toEqual([lyric(1, "end", "in&apos;")]);
	});
	test("a lyric row's verses share the staff, holds tie over the bar line", () => {
		const xml = xmlOf("| C | G |\nlyrics 1: | la_la / | / da |\nlyrics 2: | -- do | / re_mi |\n");
		const [first = "", second = ""] = measures(xml, "P2");
		const shown = (m: string) =>
			notes(m).map((n) => [
				n.includes("<rest") ? "rest" : tag(n, "type"),
				...lyrics(n).map((l) => tag(l, "text")),
			]);
		expect(shown(first)).toEqual([
			["quarter", "la"],
			["quarter", "la"],
			["half", "do"],
		]);
		expect(shown(second)).toEqual([["half"], ["quarter", "da", "re"], ["quarter", "mi"]]);
		expect(notes(first)[2]).toContain('<tie type="start"/>');
		expect(notes(second)[0]).toContain('<tie type="stop"/>');
	});
	test("a bar the row only holds is a slash tied over, not a rest", () => {
		const xml = xmlOf("| C | F |\nlyrics: | wait- ing | / |\n");
		const [first = "", second = ""] = measures(xml, "P2");
		expect(notes(first)[1]).toContain('<tie type="start"/>');
		expect(notes(second)).toHaveLength(1);
		expect(notes(second)[0]).toContain('<tie type="stop"/>');
		expect(notes(second)[0]).toContain("<notehead>slash</notehead>");
	});
	test("a voice part with no notes gives its lyric row a slash staff", () => {
		const xml = xmlOf(`${VOX}Vox | C | G |\nlyrics: | la | da |\n`);
		expect(xml).toContain('<score-part id="P2"><part-name>Lyrics</part-name>');
		expect(measures(xml, "P2")).toHaveLength(2);
	});
	test("the slash staff keeps the score's repeats and endings", () => {
		const xml = xmlOf("|: C |\nlyrics 1: | one |\nlyrics 2: | two |\n|1 G :|\n|2 F |\n");
		const [first = "", second = ""] = measures(xml, "P2");
		expect(first).toContain('<repeat direction="forward"/>');
		expect(second).toContain('<ending number="1" type="start"/>');
		expect(lyrics(notes(first)[0] ?? "")).toEqual([
			lyric(1, "single", "one"),
			lyric(2, "single", "two"),
		]);
	});
});

describe("text lines", () => {
	test("text-line lyrics keep their current export", () => {
		const xml = xmlOf("Amazing grace, how sweet the sound\n| G | C |\n");
		expect(xml).toContain("<words>Amazing grace, how sweet the sound</words>");
		expect(xml).not.toContain("<lyric");
		expect(xml).not.toContain('<part id="P2">');
	});
});
