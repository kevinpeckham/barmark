import { describe, expect, test } from "bun:test";
import { parseChart, printChart } from "barmark";
import { settleEndings } from "../../src/import/endings.js";
import { Losses } from "../../src/import/losses.js";
import { importPart } from "../../src/import/parts.js";
import { readScore } from "../../src/import/read.js";
import type { BarInfo } from "../../src/import/structure.js";
import { readStructure } from "../../src/import/structure.js";
import { headingLine, partLine } from "../../src/import/text.js";
import { parseXml } from "../../src/import/tree.js";
import { numbered, writeChart } from "../../src/import/write.js";
import { exportMusicXml } from "../../src/index.js";
import { attributes, measure, note } from "./helpers.js";

type Imported = { text: string; messages: string[] };

/** The whole import, from a MusicXML document to chart text. */
function importXml(xmlText: string): Imported {
	const losses = new Losses();
	const root = parseXml(xmlText);
	const score = root ? readScore(root, losses) : null;
	if (!score) throw new Error("no score read");
	const barmark = score.software?.startsWith("@barmark/musicxml") ?? false;
	const parts = score.parts.flatMap((p) => importPart(p, { barmark, forced: false }, losses) ?? []);
	const text = writeChart(score, parts, readStructure(score, losses), losses);
	return { text, messages: losses.list().map((d) => d.message) };
}

/** The export's MusicXML for a chart, edited by `edit` before it is read back. */
function exported(chart: string, edit: (xml: string) => string = (x) => x): string {
	const r = exportMusicXml(chart);
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join("; "));
	return edit(r.xml);
}

/** A chart's round trip, checked canonical and clean: what every test asks of the output. */
function roundTrip(chart: string, edit?: (xml: string) => string): string {
	return sound(importXml(exported(chart, edit)));
}

function sound({ text, messages }: Imported): string {
	expect(printChart(text)).toBe(text);
	expect(parseChart(text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	expect(messages.filter((m) => m.startsWith("importer bug"))).toEqual([]);
	return text;
}

/** The chart as barmark prints it: what a round trip that keeps the writing gives back. */
const canonical = (chart: string) => printChart(chart);

// Another program's lead sheet: a melody part with chords, headings and lyrics.
const time44 = attributes(
	"<divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>",
);
const harmony = (step: string) =>
	`<harmony><root><root-step>${step}</root-step></root><kind>major</kind></harmony>`;
const heading = (text: string) =>
	`<direction placement="above"><direction-type><words font-weight="bold">${text}</words></direction-type></direction>`;
const below = (text: string) =>
	`<direction placement="below"><direction-type><words>${text}</words></direction-type></direction>`;
const above = (text: string) =>
	`<direction placement="above"><direction-type><words>${text}</words></direction-type></direction>`;
const sung = (text: string) =>
	note("C", 5, 4, `<lyric number="1"><syllabic>single</syllabic><text>${text}</text></lyric>`);

type LeadBar = { chord: string; heading?: string; lyric?: string; extra?: string };

function leadSheet(bars: LeadBar[], software = "MuseScore 4.4.0"): string {
	const body = bars
		.map((b, i) =>
			measure(
				i + 1,
				(i === 0 ? time44 : "") +
					(b.heading ? heading(b.heading) : "") +
					(b.extra ?? "") +
					harmony(b.chord) +
					(b.lyric ? sung(b.lyric) : note("C", 5, 4)),
			),
		)
		.join("");
	return `<?xml version="1.0"?><score-partwise version="4.0"><identification><encoding><software>${software}</software></encoding></identification><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
}

const MORNING_SONG = `# Morning Song
part: Gtr = Electric Guitar 1
part: Pno = Piano
key: G

## Intro
| G | C | G | D |

## Verse
Gtr | G   | C | G  | D |
Pno | G/B | C | Em | D |
Gtr | G | C | D | G |

## Chorus
|: C | G | D | G :|
`;

test("Morning Song: tutti intro, labelled verse", () => {
	expect(roundTrip(MORNING_SONG)).toBe(`# Morning Song
part: Gtr = Electric Guitar 1, instrument: electric guitar
part: Pno = Piano, instrument: piano
key: G

## Intro
| G | C | G | D |

## Verse
Gtr | G   | C | G  | D |
Pno | G/B | C | Em | D |
Gtr | G | C | D | G |

## Chorus
| C | G | D | G | x2
`);
});

describe("replays", () => {
	test("a replayed section comes back as a replay", () => {
		expect(roundTrip("## Chorus\n| C | G |\n## Verse\n| D |\n## Chorus")).toBe(
			"## Chorus\n| C | G |\n\n## Verse\n| D |\n\n## Chorus\n",
		);
	});

	test("a section that differs is written out", () => {
		expect(roundTrip("## Chorus\n| C | G |\n## Verse\n| D |\n## Chorus\n| C | A |")).toBe(
			"## Chorus\n| C | G |\n\n## Verse\n| D |\n\n## Chorus\n| C | A |\n",
		);
	});

	test("a replay with new lyrics keeps its words", () => {
		const chorus = (words: [string, string]): LeadBar[] => [
			{ chord: "C", heading: "Chorus", lyric: words[0] },
			{ chord: "G", lyric: words[1] },
		];
		const verse: LeadBar[] = [{ chord: "D", heading: "Verse", lyric: "oh" }];
		const same = sound(
			importXml(leadSheet([...chorus(["la", "la"]), ...verse, ...chorus(["la", "la"])])),
		);
		expect(same).toBe("## Chorus\n| C | G |\nla la\n\n## Verse\n| D |\noh\n\n## Chorus\nla la\n");
		const sungAnew = sound(
			importXml(leadSheet([...chorus(["la", "la"]), ...verse, ...chorus(["na", "na"])])),
		);
		expect(sungAnew).toBe(
			"## Chorus\n| C | G |\nla la\n\n## Verse\n| D |\noh\n\n## Chorus\nna na\n",
		);
		expect(parseChart(sungAnew).bars.map((b) => b.section)).toEqual([
			"Chorus",
			"Chorus",
			"Verse",
			"Chorus",
			"Chorus",
		]);
	});
});

test("a repeated bar is %", () => {
	expect(roundTrip("| C | C | G | G |")).toBe("| C | % | G | % |\n");
});

describe("a repeat of a whole line or section is x N on it", () => {
	test("a line", () => {
		const chart = "| D7sus4 | % | % | % | x2\n| C5 | % | G5(7) | % |\n| D7sus4 | % | % | % | x3";
		expect(roundTrip(chart)).toBe(canonical(chart));
	});

	test("an open repeat", () => {
		expect(roundTrip("| C | D | x ...")).toBe("| C | D | x ...\n");
	});

	test("every labelled line of the system", () => {
		const chart = "part: A = Alpha\npart: B = Beta\nA | C | D | x3\nB | E | F | x3";
		expect(roundTrip(chart)).toBe(canonical(chart));
	});

	test("a whole section of several lines is x N on its heading, and on its replay", () => {
		const chart =
			"## Chorus\n|: C | D | E | F |\n| G :|\n## Verse\n| A |\n## Chorus\n|: C | D | E | F |\n| G :|";
		expect(roundTrip(chart)).toBe(
			"## Chorus x2\n| C | D | E | F |\n| G |\n\n## Verse\n| A |\n\n## Chorus x2\n",
		);
	});

	test("a repeat with endings keeps its marks", () => {
		const chart = "|: C | D |\n|1 E :|\n|2 F |";
		expect(roundTrip(chart)).toBe(canonical(chart));
	});
});

test("a held bar stays a hold, never %", () => {
	expect(roundTrip("| C | / | / |")).toBe("| C | / | / |\n");
});

test("one part throughout has no part: lines", () => {
	expect(roundTrip("part: Gtr = Guitar\n| C | G |")).toBe("| C | G |\n");
});

describe("resting parts", () => {
	test("a resting part is left out of the system", () => {
		const chart =
			"part: Gtr = Guitar\npart: Pno = Piano\npart: Bs = Bass\n| C | G |\nGtr | D | A |\nBs  | D | A |";
		expect(roundTrip(chart)).toBe(
			"part: Gtr = Guitar, instrument: electric guitar\npart: Pno = Piano, instrument: piano\npart: Bs = Bass, instrument: electric bass\n| C | G |\nGtr | D | A |\nBs  | D | A |\n",
		);
	});

	test("a single part's resting bar is silence, never dropped", () => {
		expect(roundTrip("| C | -- | D |")).toBe("| C | -- | D |\n");
	});

	test("a bar where every part rests is silence on a tutti line", () => {
		expect(roundTrip("part: Gtr = Guitar\npart: Pno = Piano\n| C | -- | D |")).toBe(
			"| C | -- | D |\n",
		);
	});
});

test("an LH-only intro writes Pno.LH alone", () => {
	const chart =
		"part: Pno = Piano, instrument: piano\n## Intro\nPno.LH | {G2} | {C3} |\n## Verse\nPno.RH | G{B3 D4 G4} | C{C4 E4 G4} |\nPno.LH | {G2} | {C3} |";
	expect(roundTrip(chart)).toBe(
		"part: Pno = Piano, instrument: piano\n\n## Intro\nPno.LH | {G2} | {C3} |\n\n## Verse\nPno.RH | G{B3 D4 G4} | C{C4 E4 G4} |\nPno.LH | {G2}        | {C3}        |\n",
	);
});

describe("systems break at a heading, a repeat, an ending, a direction, ..., a text line, a directive and a change of agreement", () => {
	const cases: [string, string][] = [
		["four bars a system", "| C | D | E | F | G | A |"],
		["a heading", "## A\n| C | D |\n## B\n| E |"],
		["a repeat", "| C | D |\n| E | F | x2\n| G |"],
		["an ending", "|: C |\n|1 D :|\n|2 E |\n| F |"],
		["a direction", "| Segno | C | Fine |\n| D | D.S. al Fine |"],
		["...", "| C | ... | D |"],
		["a text line", "| C |\nla la\n| D |"],
		["a directive", "| C |\ntempo: 100\n| D |"],
		[
			"a change of agreement",
			"part: A = Alpha\npart: B = Beta\n| C | D | E | F |\nA | G | A |\nB | G | B |",
		],
	];
	const expected: Record<string, string> = {
		"four bars a system": "| C | D | E | F |\n| G | A |\n",
		"...": "| C | ... |\n| D |\n",
	};
	test.each(cases)("%s", (name, chart) => {
		expect(roundTrip(chart)).toBe(expected[name] ?? canonical(chart));
	});
});

test("an unreadable chord: ? with its original as words", () => {
	const body = measure(
		1,
		time44 +
			harmony("C") +
			note("B", 4, 2, "<notehead>slash</notehead>") +
			`<harmony><root><root-step>D</root-step></root><kind text="Tristan">other</kind></harmony>` +
			note("B", 4, 2, "<notehead>slash</notehead>"),
	);
	const text = sound(
		importXml(
			`<?xml version="1.0"?><score-partwise version="4.0"><identification><encoding><software>@barmark/musicxml 0.4.1</software></encoding></identification><part-list><score-part id="P1"><part-name>Chart</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`,
		),
	);
	expect(text).toBe('| C "DTristan" ? |\n');
});

test("the export's ? comes back as ?", () => {
	expect(roundTrip("| C | ? | % |")).toBe("| C | ? | % |\n");
});

test("duplicate labels are numbered", () => {
	const chart = "part: G1 = Guitar\npart: G2 = Guitar\nG1 | C |\nG2 | D |";
	const same = (xml: string) =>
		xml.replace(
			/<part-abbreviation>G\d<\/part-abbreviation>/g,
			"<part-abbreviation>Gtr</part-abbreviation>",
		);
	expect(roundTrip(chart, same)).toBe(
		"part: Gtr1 = Guitar, instrument: electric guitar\npart: Gtr2 = Guitar, instrument: electric guitar\nGtr1 | C |\nGtr2 | D |\n",
	);
});

test("an ending is never split across systems", () => {
	const chart = "|: C |\n|1 D | E | F | G | A :|\n|2 B |";
	expect(roundTrip(chart)).toBe(canonical(chart));
});

test("every labelled line of a system repeats the structure", () => {
	const chart = `part: Gtr = Guitar, instrument: electric guitar
part: Pno = Piano, instrument: piano
Gtr | Segno | @A | C | [2/4] D | Fine |
Pno | Segno | @A | Em | [2/4] D | Fine |
Gtr |: E | F |
Pno |: G | A |
Gtr |1 E :|
Pno |1 G :|
Gtr |2 F | ... |
Pno |2 A | ... |
Gtr | G | D.S. al Fine |
Pno | B | D.S. al Fine |`;
	expect(roundTrip(chart)).toBe(canonical(chart));
});

describe("% needs the same meter and a bar the line played", () => {
	test("after a tacet bar, the bar is written out", () => {
		const chart =
			"part: Gtr = Guitar, instrument: electric guitar\npart: Pno = Piano, instrument: piano\nGtr | C | D |\nPno | E | F |\nGtr | G |\nGtr | A |\nPno | F |";
		expect(roundTrip(chart)).toBe(canonical(chart));
	});

	test("after a one-bar meter, the bar is written out", () => {
		expect(roundTrip("| C | [2/4] C | C |")).toBe("| C | [2/4] C | C |\n");
	});
});

describe("words", () => {
	test("words keep their slot", () => {
		const chart = '| "solo" D "x" G | Am7 "out" |';
		expect(roundTrip(chart)).toBe(canonical(chart));
	});

	test("words inside a slot get a slot of their own", () => {
		expect(roundTrip('| C "b" / / / |')).toBe('| C "b" / / / |\n');
	});

	test("a word holding a quote or a pipe stays words", () => {
		const text = sound(importXml(leadSheet([{ chord: "C", extra: above('say "hi" | now') }])));
		expect(text).toBe(`| "say 'hi' / now" C |\n`);
	});
});

describe("text lines that would read as something else", () => {
	const risky = [
		"| la la |",
		"# not a title",
		"## not a heading",
		"key: G",
		"composer: Someone",
		"part: Voice",
		"```",
		"Chorus:",
	];
	test.each(risky)("%s stays a text line", (line) => {
		const text = sound(importXml(leadSheet([{ chord: "C" }, { chord: "D", extra: below(line) }])));
		const parsed = parseChart(text);
		const texts = parsed.lines.filter((l) => l.kind === "text");
		expect(texts).toHaveLength(1);
		expect(parsed.diagnostics).toEqual([]);
		expect(texts[0]?.kind === "text" && texts[0].text).toContain(line);
	});
});

test("credits and the title come first", () => {
	const chart =
		"# Peaceful Dreams\ncomposer: Kevin Peckham\nlyricist: Kevin Peckham\ncopyright: © Kevin Peckham\nkey: D, tempo: 145\n| D |";
	expect(roundTrip(chart)).toBe(canonical(chart));
});

test("a time change inside an ending becomes one-bar meters", () => {
	const chart = "|: C |\n|1 D | [2/4] E | [2/4] F :|\n|2 G |";
	expect(roundTrip(chart)).toBe(canonical(chart));
});

describe("the output is canonical and parses without errors", () => {
	test.each([
		MORNING_SONG,
		"## Intro\n| D7sus4 | % | % | % | x2\n## Outro\n| D5 | % | % | % | x5\n| D5 | ... |",
		"| C | D | x ...",
		"time: 3/4\n| C | D |\ntime: 6/8\n| E | F |",
	])("%#", (chart) => {
		expect(roundTrip(chart)).not.toBe("");
	});
});

test("lyrics go under each system's rows", () => {
	const bars = ["C", "D", "E", "F", "G"].map(
		(chord, i): LeadBar => ({ chord, lyric: "abcde".charAt(i) }),
	);
	expect(sound(importXml(leadSheet(bars)))).toBe("| C | D | E | F |\na b c d\n| G |\ne\n");
});

describe("directives inside a run of endings", () => {
	const bar = (over: Partial<BarInfo>, i: number): BarInfo => ({
		index: i,
		measure: `${i + 1}`,
		meter: null,
		heading: null,
		rehearsal: null,
		directives: null,
		textLines: [],
		words: [],
		question: false,
		before: [],
		after: [],
		opens: false,
		closes: null,
		ending: null,
		...over,
	});
	const run = (after: Partial<BarInfo>[]) =>
		[
			{ opens: true },
			{ ending: [1], closes: 2 },
			{ ending: [2], directives: "tempo: rit." },
			...after,
		].map(bar);

	test("move to the bar after the endings, as a loss", () => {
		const losses = new Losses();
		const bars = settleEndings(run([{ directives: "key: D" }]), losses);
		expect(bars.map((b) => b.directives)).toEqual([null, null, null, "key: D, tempo: rit."]);
		expect(losses.list().map((d) => d.message)).toEqual([
			"a directive inside an ending moved after it in measure 3",
		]);
	});

	test("at the end of the chart are left out", () => {
		const losses = new Losses();
		expect(settleEndings(run([]), losses).map((b) => b.directives)).toEqual([null, null, null]);
		expect(losses.list().map((d) => d.message)).toContain(
			"a directive inside the last ending left out",
		);
	});

	test("a meter change is one-bar meters there, and a time: after them", () => {
		const bars = settleEndings(
			[
				{ opens: true },
				{ ending: [1], closes: 2 },
				{ ending: [2], directives: "time: 3/4" },
				{ ending: [2] },
				{},
			].map(bar),
			new Losses(),
		);
		expect(bars.map((b) => b.meter)).toEqual([null, null, { n: 3, d: 4 }, { n: 3, d: 4 }, null]);
		expect(bars.map((b) => b.directives)).toEqual([null, null, null, null, "time: 3/4"]);
	});
});

describe("guarded text", () => {
	test("a heading never reads as a repeat or an elision", () => {
		for (const name of ["Chorus x2", "Intro ->", "A -> B", "Coda x ..."]) {
			const line = headingLine(name, []) as string;
			const read = parseChart(`${line}\n| C |`);
			expect(read.diagnostics).toEqual([]);
			expect(read.lines[0]).toMatchObject({ kind: "section", repeat: null, elided: false });
		}
	});

	test("a part's name never reads as more attributes", () => {
		const line = partLine("Gtr", "Guitar, clef: bass", null);
		expect(parseChart(`${line}\n| C |`).parts).toEqual([
			{ label: "Gtr", name: "Guitar clef: bass" },
		]);
	});

	test("duplicate labels are numbered past labels already taken", () => {
		expect(numbered(["Gtr", "gtr", "Pno"])).toEqual(["Gtr1", "gtr2", "Pno"]);
		expect(numbered(["Gtr", "Gtr", "Gtr1"])).toEqual(["Gtr2", "Gtr3", "Gtr1"]);
	});
});
