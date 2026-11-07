/** Untrusted files with many measures: nothing in the import may grow faster than the file. */
import { expect, test } from "bun:test";
import { Losses } from "../../src/import/losses.js";
import { readMarks } from "../../src/import/marks.js";
import { readScore } from "../../src/import/read.js";
import { readStructure } from "../../src/import/structure.js";
import { parseXml } from "../../src/import/tree.js";
import { type ImportDiagnostic, importMusicXml } from "../../src/index.js";

// The bounds below are best-of-two timings; each test's 30 s timeout only keeps a loaded machine from cutting a run short.
const TIMEOUT = 30_000;

const harmony = "<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>";
const slash =
	"<note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><notehead>slash</notehead></note>";

/** A one-part score of `count` measures, each written by `measure(i)`; `software` names the program that wrote it. */
function score(count: number, measure: (i: number) => string, software = "MuseScore 4.4"): string {
	let body = "";
	for (let i = 0; i < count; i++) body += `<measure number="${i + 1}">${measure(i)}</measure>`;
	return `<?xml version="1.0"?><score-partwise version="4.0"><identification><encoding><software>${software}</software></encoding></identification><part-list><score-part id="P1"><part-name>Gtr</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
}

/**
 * The time an import takes: warmed up (the chord tables barmark builds on
 * first use aren't the file's cost), the best of two runs, so a busy
 * machine's pause isn't counted.
 */
function timed(xml: string): { ms: number; text: string; diagnostics: ImportDiagnostic[] } {
	importMusicXml(
		score(
			4,
			(i) => (i === 0 ? "<attributes><divisions>1</divisions></attributes>" : "") + harmony + slash,
		),
	);
	let ms = Number.POSITIVE_INFINITY;
	let r = importMusicXml("");
	for (let run = 0; run < 2; run++) {
		const start = performance.now();
		r = importMusicXml(xml);
		ms = Math.min(ms, performance.now() - start);
	}
	return { ms, text: r.text, diagnostics: r.diagnostics };
}

const badTimes = (count: number) =>
	score(
		count,
		(i) =>
			`<attributes>${i === 0 ? "<divisions>1</divisions>" : ""}<time><beats>7</beats><beat-type>3</beat-type></time></attributes>${harmony}${slash}`,
	);

test(
	"5,000 measures each with a time signature barmark can't write import in linear time",
	() => {
		const r = timed(badTimes(5000));
		// Absolute bounds are loose (CI machines are slower); the ratio below catches a quadratic path.
		expect(r.ms).toBeLessThan(5000);
		expect(r.diagnostics.filter((d) => d.message.includes("time signature"))).toEqual([
			{
				severity: "warning",
				message:
					"a time signature barmark can't write (7/3); kept 4/4 in 5000 measures: 1, 2, 3, …",
				measure: "1",
				measures: Array.from({ length: 5000 }, (_, i) => String(i + 1)),
			},
		]);
		// And it grows with the file: ten times the measures, not a hundred times the time.
		expect(r.ms / timed(badTimes(500)).ms).toBeLessThan(25);
	},
	TIMEOUT,
);

/** One one-staff measure: `n` notes in voice 1 and, between them, `n` slashes and rests in voice 2 (Dorico's comping, many times over). */
function interleaved(n: number): string {
	const forward = "<forward><duration>1</duration></forward>";
	let first = "";
	let second = "";
	for (let i = 0; i < n; i++) {
		first += `<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>${forward}`;
		second += `${forward}<note>${i % 2 ? "<rest/>" : "<pitch><step>B</step><octave>4</octave></pitch>"}<duration>1</duration><voice>2</voice>${i % 2 ? "" : "<notehead>slash</notehead>"}</note>`;
	}
	const measure = `<attributes><divisions>${n / 2}</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${harmony}${first}<backup><duration>${2 * n}</duration></backup>${second}`;
	return score(1, () => measure, "Dorico 6.2.31.6349");
}

test(
	"one measure of thousands of attacks in two voices, one of slashes and rests in the other's gaps, imports in linear time",
	() => {
		const big = timed(interleaved(8000));
		expect(big.text).not.toBe("");
		expect(big.ms).toBeLessThan(5000);
		expect(big.ms / timed(interleaved(800)).ms).toBeLessThan(25);
	},
	TIMEOUT,
);

test(
	"one measure with thousands of attacks and chord symbols, on two staves, imports in linear time",
	() => {
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
		expect(ms).toBeLessThan(5000);
	},
	TIMEOUT,
);

test(
	"a score with a heading, an ending and a jump on many bars imports in linear time",
	() => {
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
		expect(ms).toBeLessThan(5000);
	},
	TIMEOUT,
);

/** A one-measure score whose measure number and part name are as long as the file makes them, with a dynamic to report. */
function longNames(number: string, name: string): string {
	const dynamic =
		'<direction placement="below"><direction-type><dynamics><p/></dynamics></direction-type></direction>';
	return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>${name}</part-name></score-part></part-list><part id="P1"><measure number="${number}"><attributes><divisions>1</divisions></attributes>${dynamic}${harmony}${slash}</measure></part></score-partwise>`;
}

test(
	"a 100,000-digit measure number and a 10,000-character part name import fast, cut short",
	() => {
		const r = timed(longNames("7".repeat(100_000), "B".repeat(10_000)));
		expect(r.ms).toBeLessThan(2000);
		const [d] = r.diagnostics;
		expect(d?.measure).toBe(`${"7".repeat(63)}…`);
		expect(d?.part).toBe(`${"B".repeat(199)}…`);
		expect(d?.measures).toEqual([`${"7".repeat(63)}…`]);
		expect(JSON.stringify(r.diagnostics).length).toBeLessThan(1000);
	},
	TIMEOUT,
);

test(
	"a grouped loss carries the measures it names",
	() => {
		const r = timed(badTimes(5));
		const [d] = r.diagnostics.filter((x) => x.message.includes("time signature"));
		expect(d?.measures).toEqual(["1", "2", "3", "4", "5"]);
	},
	TIMEOUT,
);

/** A lead sheet whose every syllable continues a word that never ends: each system leaves one open. */
const neverClosed = (count: number) =>
	score(
		count,
		(i) =>
			`${i === 0 ? "<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>" : ""}${harmony}<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><lyric number="1"><syllabic>${i === 0 ? "begin" : "middle"}</syllabic><text>la</text></lyric></note>`,
	);

test(
	"a word that never ends doesn't make each system read to the end of the piece",
	() => {
		const big = timed(neverClosed(4000));
		expect(big.text).not.toBe("");
		expect(big.ms).toBeLessThan(5000);
		expect(big.ms / timed(neverClosed(400)).ms).toBeLessThan(25);
	},
	TIMEOUT,
);

/** A lead sheet whose every measure sings a verse no other measure sings: one distinct lyric `number` a measure. */
const verseAMeasure = (count: number) =>
	score(
		count,
		(i) =>
			`${i === 0 ? "<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>" : ""}${harmony}<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><lyric number="${i + 1}"><syllabic>single</syllabic><text>la</text></lyric></note>`,
	);

test(
	"a verse in every measure doesn't make the rows verses × measures",
	() => {
		const big = timed(verseAMeasure(4000));
		expect(big.text).not.toBe("");
		expect(big.ms).toBeLessThan(5000);
		expect(big.ms / timed(verseAMeasure(400)).ms).toBeLessThan(25);
	},
	TIMEOUT,
);

/** One chord-bearing measure of the export's own file with `n` text lines under the staff at beat 0, then its heading. */
const wordsAtStart = (n: number, same: boolean) =>
	score(
		1,
		() => {
			let words = "";
			for (let i = 0; i < n; i++)
				words += `<direction placement="below"><direction-type><words>${same ? "w" : `w${i}`}</words></direction-type></direction>`;
			return `<attributes><divisions>1</divisions></attributes>${words}<direction placement="above"><direction-type><words font-weight="bold">Verse</words></direction-type></direction>${harmony}${slash}`;
		},
		"@barmark/musicxml 0.6.0",
	);

test("placing a measure's text lines reads its marks a fixed number of times each", () => {
	const n = 2000;
	const root = parseXml(wordsAtStart(n, false));
	const m = root ? readScore(root, new Losses())?.parts[0]?.measures[0] : undefined;
	if (!m) throw new Error("no measure");
	let reads = 0;
	m.marks = new Proxy(m.marks, {
		get(target, key, receiver) {
			if (typeof key === "string" && /^\d+$/.test(key)) reads++;
			return Reflect.get(target, key, receiver);
		},
	});
	const out = readMarks(m, "Gtr", new Losses(), true);
	expect(out.leadLines).toHaveLength(n);
	expect(out.headings).toEqual(["Verse"]);
	// A scan of the marks per text line would read them about n²/2 times.
	expect(reads).toBeLessThan(10 * (n + 1));
});

test("reading many words above the staff reads the measure's marks a fixed number of times each", () => {
	const n = 2000;
	let words = "";
	for (let i = 0; i < n; i++)
		words += `<direction placement="above"><direction-type><words>w${i}</words></direction-type></direction>`;
	const root = parseXml(
		score(1, () => `<attributes><divisions>1</divisions></attributes>${words}${harmony}${slash}`),
	);
	const m = root ? readScore(root, new Losses())?.parts[0]?.measures[0] : undefined;
	if (!m) throw new Error("no measure");
	let reads = 0;
	m.marks = new Proxy(m.marks, {
		get(target, key, receiver) {
			if (typeof key === "string" && /^\d+$/.test(key)) reads++;
			return Reflect.get(target, key, receiver);
		},
	});
	const out = readMarks(m, "Gtr", new Losses(), false);
	expect(out.words).toHaveLength(n);
	// A look for a <swing> per word would read the marks about n² times.
	expect(reads).toBeLessThan(10 * (n + 1));
});

/** One measure of the export's own file: `n` text lines ahead of its heading and `n` after it. */
const aroundHeading = (n: number) => {
	const line = (text: string) =>
		`<direction placement="below"><direction-type><words>${text}</words></direction-type></direction>`;
	let before = "";
	let after = "";
	for (let i = 0; i < n; i++) {
		before += line(`a${i}`);
		after += line(`b${i}`);
	}
	const heading = `<direction placement="above"><direction-type><words font-weight="bold">Verse</words></direction-type></direction>`;
	return score(
		1,
		() =>
			`<attributes><divisions>1</divisions></attributes>${before}${heading}${after}${harmony}${slash}`,
		"@barmark/musicxml 0.6.0",
	);
};

test(
	"text lines on both sides of a heading are told apart in linear time",
	() => {
		const structure = (n: number) => {
			const root = parseXml(aroundHeading(n));
			const read = root ? readScore(root, new Losses()) : null;
			if (!read) throw new Error("no score");
			let best = Number.POSITIVE_INFINITY;
			let lines = 0;
			for (let run = 0; run < 3; run++) {
				const start = performance.now();
				const bar = readStructure(read, new Losses()).bars[0];
				best = Math.min(best, performance.now() - start);
				lines = (bar?.leadLines.length ?? 0) + (bar?.textLines.length ?? 0);
			}
			expect(lines).toBe(2 * n);
			return best;
		};
		structure(2000);
		// Allocation makes ten times the lines up to about 30 times as long; comparing every pair made it over 200.
		expect(structure(40_000) / structure(4000)).toBeLessThan(100);
	},
	TIMEOUT,
);
