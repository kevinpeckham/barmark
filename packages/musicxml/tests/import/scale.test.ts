/** Untrusted files with many measures: nothing in the import may grow faster than the file. */
import { expect, test } from "bun:test";
import { importMusicXml } from "../../src/index.js";

const harmony = "<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>";
const slash =
	"<note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><notehead>slash</notehead></note>";

/** A one-part score of `count` measures, each written by `measure(i)`; `software` names the program that wrote it. */
function score(count: number, measure: (i: number) => string, software = "MuseScore 4.4"): string {
	let body = "";
	for (let i = 0; i < count; i++) body += `<measure number="${i + 1}">${measure(i)}</measure>`;
	return `<?xml version="1.0"?><score-partwise version="4.0"><identification><encoding><software>${software}</software></encoding></identification><part-list><score-part id="P1"><part-name>Gtr</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
}

test("5,000 measures each with a time signature barmark can't write import well under a second", () => {
	const xml = score(
		5000,
		(i) =>
			`<attributes>${i === 0 ? "<divisions>1</divisions>" : ""}<time><beats>7</beats><beat-type>3</beat-type></time></attributes>${harmony}${slash}`,
	);
	// Warm up first: the chord tables barmark builds on first use aren't the file's cost.
	importMusicXml(
		score(
			4,
			(i) => (i === 0 ? "<attributes><divisions>1</divisions></attributes>" : "") + harmony + slash,
		),
	);
	const start = performance.now();
	const r = importMusicXml(xml);
	expect(performance.now() - start).toBeLessThan(1000);
	expect(r.diagnostics.filter((d) => d.message.includes("time signature"))).toEqual([
		{
			severity: "warning",
			message: "a time signature barmark can't write (7/3); kept 4/4 in 5000 measures: 1, 2, 3, …",
			measure: "1",
		},
	]);
});

/** The time an import takes, warmed up. */
function timed(xml: string): { ms: number; text: string } {
	importMusicXml(
		score(
			4,
			(i) => (i === 0 ? "<attributes><divisions>1</divisions></attributes>" : "") + harmony + slash,
		),
	);
	const start = performance.now();
	const r = importMusicXml(xml);
	return { ms: performance.now() - start, text: r.text };
}

test("one measure with thousands of attacks and chord symbols, on two staves, imports in under a second", () => {
	const n = 3000;
	const at = (i: number) =>
		`<harmony><root><root-step>${"CDEFGAB"[i % 7]}</root-step></root><kind>major</kind><offset>${i}</offset></harmony>`;
	let upper = "";
	let lower = "";
	let chords = "";
	for (let i = 0; i < n; i++) {
		upper += `<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>`;
		lower += `<note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>5</voice><staff>2</staff></note>`;
		if (i < 200) chords += at(i);
	}
	const measure = `<attributes><divisions>${n / 4}</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${chords}${upper}<backup><duration>${n}</duration></backup>${lower}`;
	const { ms, text } = timed(score(1, () => measure, "@barmark/musicxml 0.4.1"));
	expect(text).not.toBe("");
	expect(ms).toBeLessThan(1000);
});

test("a score with a heading, an ending and a jump on many bars imports in about a second", () => {
	const marks = (i: number) =>
		`<direction placement="above"><direction-type><words font-weight="bold">S${i % 3}</words></direction-type></direction>` +
		(i % 2 === 0
			? '<barline location="left"><ending number="1" type="start"/></barline>'
			: '<barline location="left"><ending number="2" type="start"/></barline>') +
		'<direction><direction-type><coda/></direction-type><sound coda="c"/></direction>';
	const after =
		'<direction><direction-type><words>To Coda</words></direction-type><sound tocoda="c"/></direction><barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>';
	const xml = score(
		2000,
		(i) =>
			`${i === 0 ? "<attributes><divisions>1</divisions></attributes>" : ""}${marks(i)}${harmony}${slash}${after}`,
	);
	const { ms } = timed(xml);
	expect(ms).toBeLessThan(1500);
});
