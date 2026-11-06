import { expect, test } from "bun:test";
import { Losses } from "../../src/import/losses.js";
import { importLyrics, lyricLines, verseText } from "../../src/import/lyrics.js";
import { importMusicXml } from "../../src/index.js";
import { attributes, measure, measuresOf, note, partOf, xml } from "./helpers.js";

const base = attributes(
	"<divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>",
);
const lyric = (text: string, syllabic = "single", verse = 1) =>
	`<lyric number="${verse}"><syllabic>${syllabic}</syllabic><text>${text}</text></lyric>`;
const sung = (extra: string) => note("C", 4, 1, extra);
const bar = (n: number, ...notes: string[]) => measure(n, (n === 1 ? base : "") + notes.join(""));

test("syllables join into words", () => {
	const ms = measuresOf(
		xml`${bar(1, sung(lyric("hap", "begin")), sung(lyric("py", "end")), sung(lyric("birth", "begin")), sung(lyric("day", "end")))}`,
	);
	expect(verseText(lyricLines(ms, 0))).toEqual(["happy birthday"]);
});

test("two verses get numbers", () => {
	const ms = measuresOf(
		xml`${bar(1, sung(lyric("happy", "single", 1) + lyric("merry", "single", 2)), sung(lyric("birthday", "single", 1) + lyric("christmas", "single", 2)))}`,
	);
	expect(verseText(lyricLines(ms, 0), true)).toEqual(["1. happy birthday", "2. merry christmas"]);
});

test("one verse has no number", () => {
	const ms = measuresOf(xml`${bar(1, sung(lyric("la")))}`);
	const part = partOf(xml`${bar(1, sung(lyric("la")))}`);
	expect(importLyrics([part], new Losses())?.numbered).toBe(false);
	expect(verseText(lyricLines(ms, 0), false)).toEqual(["la"]);
});

test("a system holding only verse 2 of a two-verse piece prints its number", () => {
	const xmlText = xml`${bar(1, sung(lyric("a", "single", 1)))}${bar(2, sung(lyric("b", "single", 2)))}`;
	const part = partOf(xmlText);
	const info = importLyrics([part], new Losses());
	expect(info?.numbered).toBe(true);
	const second = part.measures.slice(1);
	expect(verseText(lyricLines(second, 0), info?.numbered)).toEqual(["2. b"]);
});

test("whitespace in a syllable never breaks a line or doubles a space", () => {
	const ms = measuresOf(
		xml`${bar(1, sung(lyric("hap\npy", "single")), sung(lyric("  \n ", "single")), sung(lyric("day  now", "single")))}`,
	);
	expect(verseText(lyricLines(ms, 0))).toEqual(["hap py day now"]);
});

test("a lyric repeated on every note of a chord is sung once", () => {
	const chord =
		sung(lyric("la")) +
		`<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration>${lyric("la")}</note>`;
	const ms = measuresOf(xml`${bar(1, chord)}`);
	expect(verseText(lyricLines(ms, 0))).toEqual(["la"]);
});

test("a word still open at the end of the piece is kept", () => {
	const ms = measuresOf(xml`${bar(1, sung(lyric("hap", "begin")))}`);
	expect(verseText(lyricLines(ms, 0))).toEqual(["hap"]);
});

test("an orphan end syllable in the first system is dropped", () => {
	const ms = measuresOf(xml`${bar(1, sung(lyric("py", "end")), sung(lyric("day", "single")))}`);
	expect(verseText(lyricLines(ms, 0))).toEqual(["day"]);
});

test("an elision joins with a space", () => {
	const ms = measuresOf(
		xml`${bar(1, sung("<lyric><text>a</text><elision>_</elision><text>b</text></lyric>"))}`,
	);
	expect(verseText(lyricLines(ms, 0))).toEqual(["a b"]);
});

test("a word split across the system's end stays whole in the system where it starts", () => {
	const ms = measuresOf(
		xml`${bar(1, sung(lyric("one", "single")), sung(lyric("hap", "begin")))}${bar(2, sung(lyric("py", "end")), sung(lyric("day", "single")))}`,
	);
	const [first, second] = [ms[0], ms[1]];
	if (!first || !second) throw new Error("measures");
	expect(verseText(lyricLines([first], 0, [second]))).toEqual(["one happy"]);
	expect(verseText(lyricLines([second], 0))).toEqual(["day"]);
});

test("a word in the middle of three syllables runs across systems", () => {
	const ms = measuresOf(
		xml`${bar(1, sung(lyric("won", "begin")))}${bar(2, sung(lyric("der", "middle")))}${bar(3, sung(lyric("ful", "end")), sung(lyric("day", "single")))}`,
	);
	const [a, b, c] = ms;
	if (!a || !b || !c) throw new Error("measures");
	expect(verseText(lyricLines([a], 0, [b, c]))).toEqual(["wonderful"]);
	expect(verseText(lyricLines([b], 0, [c]))).toEqual([]);
	expect(verseText(lyricLines([c], 0))).toEqual(["day"]);
});

test("lyrics from the first part that has them; the others named once", () => {
	const quiet = partOf(xml`${bar(1, note("C", 4, 4))}`);
	const sop = { ...partOf(xml`${bar(1, sung(lyric("la")))}`), name: "Soprano" };
	const alto = { ...sop, name: "Alto" };
	const losses = new Losses();
	expect(importLyrics([quiet, sop, alto], losses)).toEqual({ part: 1, line: 0, numbered: false });
	expect(losses.list().map((d) => [d.part, d.message])).toEqual([
		["Soprano", "lyrics written as text lines; their placement by beat isn't kept"],
		["Alto", "lyrics in Alto left out; only Soprano's are kept"],
	]);
});

test("the placement diagnostic is given once", () => {
	const part = partOf(xml`${bar(1, sung(lyric("la")))}${bar(2, sung(lyric("la")))}`);
	const losses = new Losses();
	importLyrics([part], losses);
	expect(losses.list()).toHaveLength(1);
	expect(losses.list()[0]?.message).toBe(
		"lyrics written as text lines; their placement by beat isn't kept",
	);
	const none = new Losses();
	expect(importLyrics([quietPart()], none)).toBeNull();
	expect(none.list()).toEqual([]);
});

const quietPart = () => partOf(xml`${bar(1, note("C", 4, 4))}`);

test("three verses over 400 bars import in linear time", () => {
	const syllabic = ["begin", "middle", "end", "single"];
	const lyric = (b: number) =>
		[1, 2, 3]
			.map(
				(v) =>
					`<lyric number="${v}"><syllabic>${syllabic[b % 4]}</syllabic><text>ka${b}</text></lyric>`,
			)
			.join("");
	let measures = "";
	for (let i = 0; i < 400; i++) {
		const attributes =
			i === 0
				? "<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>"
				: "";
		let notes = "";
		for (let b = 0; b < 8; b++)
			notes += `<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice>${lyric(b)}</note>`;
		measures += `<measure number="${i + 1}">${attributes}<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>${notes}</measure>`;
	}
	const score = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
	const start = performance.now();
	const r = importMusicXml(score);
	expect(performance.now() - start).toBeLessThan(5000);
	expect(r.text).toContain("3. ka0ka1ka2 ka3");
});

test("a word's last syllable many bars after the system still finishes it", () => {
	const lyric = (syllabic: string, text: string) =>
		`<lyric number="1"><syllabic>${syllabic}</syllabic><text>${text}</text></lyric>`;
	let measures = "";
	for (let i = 0; i < 20; i++) {
		const sung =
			i === 2
				? lyric("single", "Sing")
				: i === 3
					? lyric("begin", "A")
					: i === 19
						? lyric("end", "men")
						: "";
		const attributes =
			i === 0
				? "<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>"
				: "";
		measures += `<measure number="${i + 1}">${attributes}<harmony><root><root-step>${"CDEFGAB"[i % 7]}</root-step></root><kind>major</kind></harmony><note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice>${sung}</note></measure>`;
	}
	const score = `<?xml version="1.0"?><score-partwise version="4.0"><identification><encoding><software>MuseScore 4.4</software></encoding></identification><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
	const { text } = importMusicXml(score);
	expect(text).toContain("Sing Amen");
	expect(text).not.toContain("\nmen");
});
