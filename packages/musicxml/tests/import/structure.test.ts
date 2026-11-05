import { describe, expect, test } from "bun:test";
import { type ImportDiagnostic, Losses } from "../../src/import/losses.js";
import { readScore } from "../../src/import/read.js";
import { type BarInfo, readStructure } from "../../src/import/structure.js";
import { parseXml } from "../../src/import/tree.js";
import { corpus } from "../charts.js";
import { xmlOf } from "../helpers.js";
import { attributes, measure, note, xml } from "./helpers.js";

type Read = { bars: BarInfo[]; writtenOut: boolean; diagnostics: ImportDiagnostic[] };

function structureOf(text: string): Read {
	const losses = new Losses();
	const root = parseXml(text);
	const score = root ? readScore(root, losses) : null;
	if (!score) throw new Error("no score read");
	return { ...readStructure(score, losses), diagnostics: losses.list() };
}

/** The structure the import reads back from a chart's export. */
const fromChart = (chart: string) => structureOf(xmlOf(chart));

const pick = <K extends keyof BarInfo>(bars: BarInfo[], key: K) => bars.map((b) => b[key]);

const start = (meter = "<beats>4</beats><beat-type>4</beat-type>") =>
	attributes(`<divisions>1</divisions><time>${meter}</time>`);
const whole = note("C", 4, 4);
const words = (text: string, attrs = "", placement = "above") =>
	`<direction placement="${placement}"><direction-type><words${attrs}>${text}</words></direction-type></direction>`;

describe("what it reads", () => {
	test("bold words above at a bar's start are a heading", () => {
		const { bars } = fromChart("## Verse\n| C | G |\n## Chorus\n| F |");
		expect(pick(bars, "heading")).toEqual(["Verse", null, "Chorus"]);
		expect(pick(bars, "words")).toEqual([[], [], []]);
		expect(pick(bars, "index")).toEqual([0, 1, 2]);
		expect(pick(bars, "measure")).toEqual(["1", "2", "3"]);
	});

	test("words below the staff are a text line; a ### note keeps its marks", () => {
		const { bars } = fromChart("| C |\nla la la\n### hits\n| G |");
		expect(pick(bars, "textLines")).toEqual([[], ["la la la", "### hits"]]);
		expect(pick(bars, "words")).toEqual([[], []]);
	});

	test("other words are words on the bar, at their beat", () => {
		const { bars } = fromChart('| "solo" C "fill" G | D "out" |');
		expect(bars[0]?.words).toEqual([
			{ text: "solo", at: 0 },
			{ text: "fill", at: 2 },
		]);
		expect(bars[1]?.words).toEqual([{ text: "out", at: 4 }]);
	});

	test("a rehearsal mark", () => {
		const { bars } = fromChart("| C | @B | G |");
		expect(pick(bars, "rehearsal")).toEqual([null, "B"]);
	});

	test("segno, coda and the jump's <sound> are direction cells", () => {
		const { bars, writtenOut } = fromChart(
			"## Verse\n| Segno | C | F | G | To Coda | C |\n| Am | F | G | C | D.S. al Coda |\n## Coda\n| Coda | F | G | C | ... |",
		);
		expect(writtenOut).toBe(false);
		expect(pick(bars, "before")).toEqual([["Segno"], [], [], [], [], [], [], [], ["Coda"], [], []]);
		expect(pick(bars, "after")).toEqual([
			[],
			[],
			["To Coda"],
			[],
			[],
			[],
			[],
			["D.S. al Coda"],
			[],
			[],
			["..."],
		]);
		expect(pick(bars, "heading")[8]).toBe("Coda");
		expect(bars.flatMap((b) => b.words)).toEqual([]);
	});

	test("a jump's <sound> alone is a direction cell", () => {
		const text = xml`${measure(1, start() + whole)}${measure(2, `${whole}<sound dacapo="yes"/>`)}`;
		expect(pick(structureOf(text).bars, "after")).toEqual([[], ["D.C."]]);
	});

	test("a fermata at the bar's end is ...", () => {
		const { bars } = fromChart("| C | G | ... |");
		expect(pick(bars, "after")).toEqual([[], ["..."]]);
	});

	test("a fermata on the bar's last note is ...", () => {
		const text = xml`${measure(1, start() + note("C", 4, 4, "<notations><fermata/></notations>"))}`;
		expect(structureOf(text).bars[0]?.after).toEqual(["..."]);
	});

	test("a key, its mode as written", () => {
		const { bars } = fromChart("key: D dorian\n| C |\nkey: G\n| D |");
		expect(pick(bars, "directives")).toEqual(["key: D dorian", "key: G"]);
	});

	test("a time signature that lasts is a directive", () => {
		const { bars } = fromChart("| C |\ntime: 3/4\n| C | C |");
		expect(pick(bars, "directives")).toEqual([null, "time: 3/4", null]);
		expect(pick(bars, "meter")).toEqual([null, null, null]);
	});

	test("a time signature for one bar is the bar's meter, never a directive", () => {
		const { bars } = fromChart("| C | [2/4] C | C |");
		expect(pick(bars, "meter")).toEqual([null, { n: 2, d: 4 }, null]);
		expect(pick(bars, "directives")).toEqual([null, null, null]);
	});

	test("a metronome is tempo in the chart's beat", () => {
		expect(fromChart("time: 6/8, tempo: 60\n| C |").bars[0]?.directives).toBe(
			"time: 6/8, tempo: 60",
		);
		expect(fromChart("tempo: 120\n| C |").bars[0]?.directives).toBe("tempo: 120");
	});

	test("without a metronome, <sound tempo> counts quarters: 90 is 6/8's 60", () => {
		const text = xml`${measure(1, `${start("<beats>6</beats><beat-type>8</beat-type>")}<sound tempo="90"/>${note("C", 4, 3)}`)}`;
		expect(structureOf(text).bars[0]?.directives).toBe("time: 6/8, tempo: 60");
	});

	test("rit. and accel. are gradual changes, to the later <sound tempo>; a tempo returns", () => {
		const { bars } = fromChart(
			"tempo: 120\n| C | C |\ntempo: rit. to 90\n| C | C |\ntempo: a tempo\n| C |\ntempo: accel.\n| C |",
		);
		expect(pick(bars, "directives")).toEqual([
			"tempo: 120",
			null,
			"tempo: rit. to 90",
			null,
			"tempo: a tempo",
			"tempo: accel.",
		]);
		expect(bars.flatMap((b) => b.words)).toEqual([]);
	});

	test("<swing> is feel", () => {
		expect(fromChart("feel: swing\n| C |").bars[0]?.directives).toBe("feel: swing");
		expect(fromChart("feel: shuffle\n| C |").bars[0]?.directives).toBe("feel: shuffle");
		expect(fromChart("feel: swing 16 55%\n| C |").bars[0]?.directives).toBe("feel: swing 16 55%");
		const { bars } = fromChart("feel: swing 58%\n| C |\nfeel: straight\n| C |");
		expect(pick(bars, "directives")).toEqual(["feel: swing 58%", "feel: straight"]);
		expect(bars.flatMap((b) => b.words)).toEqual([]);
	});

	test("<swing> without words", () => {
		const swing =
			"<sound><swing><first>2</first><second>1</second><swing-type>eighth</swing-type></swing></sound>";
		const text = xml`${measure(1, start() + swing + whole)}`;
		expect(structureOf(text).bars[0]?.directives).toBe("feel: swing");
	});
});

describe("the export's own marks", () => {
	test("? alone on a bar is consumed and marked", () => {
		const { bars } = fromChart("| C | ? |");
		expect(pick(bars, "question")).toEqual([false, true]);
		expect(pick(bars, "words")).toEqual([[], []]);
	});

	test("×N beside a backward repeat is that repeat's count", () => {
		const { bars } = fromChart("|: C | G :| x3\n| D |");
		expect(pick(bars, "opens")).toEqual([true, false, false]);
		expect(pick(bars, "closes")).toEqual([null, 3, null]);
		expect(bars.flatMap((b) => b.words)).toEqual([]);
	});

	test('times="1" with "repeat as needed" is an open repeat', () => {
		const { bars } = fromChart("| C | G | x ...\n| D |");
		expect(pick(bars, "opens")).toEqual([true, false, false]);
		expect(pick(bars, "closes")).toEqual([null, "open", null]);
		expect(bars.flatMap((b) => b.words)).toEqual([]);
	});

	test("words on a bar stay words, even when they spell a tempo change or a direction", () => {
		const { bars } = fromChart('| D "rit." G | A "To Coda" |');
		expect(pick(bars, "directives")).toEqual([null, null]);
		expect(pick(bars, "after")).toEqual([[], []]);
		expect(bars[0]?.words).toEqual([{ text: "rit.", at: 2 }]);
		expect(bars[1]?.words).toEqual([{ text: "To Coda", at: 4 }]);
	});

	test("another program's rit., Fine and D.C. words are a tempo change and directions", () => {
		const text = xml`${measure(1, start() + words("rit.") + whole + words("Fine"))}${measure(2, whole + words("D.C. al fine"))}`;
		const { bars, writtenOut } = structureOf(text);
		expect(writtenOut).toBe(false);
		expect(pick(bars, "directives")).toEqual(["tempo: rit.", null]);
		expect(pick(bars, "after")).toEqual([["Fine"], ["D.C. al Fine"]]);
		expect(pick(bars, "words")).toEqual([[], []]);
	});

	test("the no-break space after a leading A is a plain space", () => {
		const { bars } = fromChart('## A section\n| "a tempo feel" C |');
		expect(bars[0]?.heading).toBe("A section");
		expect(bars[0]?.words).toEqual([{ text: "a tempo feel", at: 0 }]);
	});
});

describe("sections and repeats", () => {
	test("endings 1 and 2", () => {
		const { bars, writtenOut } = fromChart("|: C | F |\n|1 G | G7 :|\n|2 C |");
		expect(writtenOut).toBe(false);
		expect(pick(bars, "ending")).toEqual([null, null, [1], [1], [2]]);
		expect(pick(bars, "opens")).toEqual([true, false, false, false, false]);
		expect(pick(bars, "closes")).toEqual([null, null, null, 2, null]);
	});

	test("a repeat crossing a heading is written out in played order, with a warning", () => {
		const text = xml`${measure(1, `${start()}<barline location="left"><repeat direction="forward"/></barline>${whole}`)}${measure(2, `${words("Chorus", ' font-weight="bold"') + whole}<barline location="right"><repeat direction="backward"/></barline>`)}${measure(3, whole)}`;
		const { bars, writtenOut, diagnostics } = structureOf(text);
		expect(writtenOut).toBe(true);
		expect(pick(bars, "index")).toEqual([0, 1, 0, 1, 2]);
		expect(pick(bars, "heading")).toEqual([null, "Chorus", null, "Chorus", null]);
		expect(pick(bars, "opens")).toEqual([false, false, false, false, false]);
		expect(pick(bars, "closes")).toEqual([null, null, null, null, null]);
		expect(diagnostics.map((d) => d.message)).toContain(
			"repeats, endings or jumps barmark can't hold as written; bars written out in played order",
		);
	});

	test("written out, a bar keeps the key it plays in", () => {
		const text = xml`${measure(1, `${attributes("<divisions>1</divisions><key><fifths>1</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time>")}<barline location="left"><repeat direction="forward"/></barline>${whole}`)}${measure(2, `${attributes("<key><fifths>2</fifths><mode>major</mode></key>") + words("B", ' font-weight="bold"') + whole}<barline location="right"><repeat direction="backward"/></barline>`)}`;
		const { bars } = structureOf(text);
		expect(pick(bars, "directives")).toEqual(["key: G", "key: D", "key: G", "key: D"]);
	});
});

describe("the corpus", () => {
	for (const [name, chart] of corpus())
		test(`${name}: its export's structure holds as written, with nothing lost`, () => {
			const { writtenOut, diagnostics } = fromChart(chart);
			expect(writtenOut).toBe(false);
			expect(diagnostics).toEqual([]);
		});
});

describe("several parts", () => {
	const twoParts = (one: string, two: string) =>
		`<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>A</part-name></score-part><score-part id="P2"><part-name>B</part-name></score-part></part-list><part id="P1">${one}</part><part id="P2">${two}</part></score-partwise>`;

	test("marks two parts share are read once; text that differs is kept from each", () => {
		const bold = words("Verse", ' font-weight="bold"');
		const one = measure(
			1,
			start() + bold + words("both", "", "below") + words("one", "", "below") + whole,
		);
		const two = measure(
			1,
			start() + bold + words("both", "", "below") + words("two", "", "below") + whole,
		);
		const { bars } = structureOf(twoParts(one, two));
		expect(bars).toHaveLength(1);
		expect(bars[0]?.heading).toBe("Verse");
		expect(bars[0]?.textLines).toEqual(["both", "one", "two"]);
	});
});

describe("losses", () => {
	test("a rehearsal mark barmark can't write is left out, with a diagnostic", () => {
		const mark =
			'<direction placement="above"><direction-type><rehearsal>!!</rehearsal></direction-type></direction>';
		const { bars, diagnostics } = structureOf(xml`${measure(1, start() + mark + whole)}`);
		expect(bars[0]?.rehearsal).toBeNull();
		expect(diagnostics.map((d) => d.message)).toContain(
			"a rehearsal mark that isn't letters or digits left out in measure 1",
		);
	});
});
