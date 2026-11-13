import { describe, expect, test } from "bun:test";
import { shapeOf } from "@barmark/fretboard";
import { parseChord } from "barmark";
import { parseHTML } from "linkedom";
import { growth, TIMING_TIMEOUT } from "../../../test-support/growth.js";
import { layoutChart, type RenderOptions, renderChart } from "../src/index.js";
import { speakDiagram } from "../src/speech.js";
import type { DiagramEntry } from "../src/types.js";
import { EXAMPLE } from "./fixtures.js";
import { MORNING_SONG } from "./morning-song.js";

const doc = (html: string) =>
	parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
/** The shadow root's markup, as a document of its own. */
const shadow = (d: Document) => {
	const tpl = d.querySelector("template");
	if (!tpl) throw new Error("no template");
	return doc(tpl.innerHTML);
};
const GUITAR: RenderOptions = { chordDiagrams: "guitar" };
const strip = (text: string, options: RenderOptions = {}) =>
	shadow(doc(renderChart(text, { ...GUITAR, ...options })));
const texts = (d: Document, selector: string) =>
	[...d.querySelectorAll(selector)].map((e) => e.textContent ?? "");
/** The markup without its stylesheet, which names the strip's classes in every chart. */
const markup = (html: string) => html.replace(/<style>[^<]*<\/style>/g, "");
const labels = (d: Document) =>
	[...d.querySelectorAll(".bm-diagram [role=img]")].map((e) => e.getAttribute("aria-label"));

test("no option, no strip", () => {
	const plain = markup(renderChart(EXAMPLE));
	expect(plain).toContain("bm-section");
	expect(plain).not.toContain("bm-diagram");
});

test("the strip sits after the header and before the first section", () => {
	const d = shadow(
		doc(renderChart("# Song\n## Verse\n| C | Am | F | G |", { chordDiagrams: "guitar" })),
	);
	const strip = d.querySelector("section.bm-diagrams");
	expect(strip?.getAttribute("aria-label")).toBe("Guitar chords");
	expect(strip?.getAttribute("part")).toBe("diagrams");
	expect(strip?.previousElementSibling?.className).toBe("bm-header");
	expect(strip?.nextElementSibling?.className).toBe("bm-section");
	expect(strip?.querySelectorAll('li[part="diagram"]')).toHaveLength(4);
	// list-style:none drops a list's role in Safari with VoiceOver: the role keeps it.
	expect(strip?.querySelector("ul")?.getAttribute("role")).toBe("list");
});

test("each diagram is an image with a spoken label and a visible name", () => {
	const d = shadow(doc(renderChart("| Am |", { chordDiagrams: "guitar" })));
	const svg = d.querySelector(".bm-diagram svg");
	expect(svg?.getAttribute("role")).toBe("img");
	expect(svg?.getAttribute("aria-label")).toBe("A minor: muted, open, 2, 2, 1, open");
	expect(d.querySelector(".bm-diagram-name")?.textContent).toBe("Am");
});

test("no chord that gets a diagram, no strip", () => {
	for (const text of ["| N.C. | / | ? |", "| {E1} |"])
		expect(markup(renderChart(text, { chordDiagrams: "guitar" }))).not.toContain("bm-diagrams");
});

test("no ids, and nothing unescaped", () => {
	const html = renderChart("# <script>alert(1)</script>\n| Cmaj7{E3 G3} | {C3 G3 E4} |", {
		chordDiagrams: "guitar",
	});
	expect(html).not.toContain("<script>alert");
	expect(html).not.toMatch(/\sid="/);
});

test("any other value of the option draws no strip", () => {
	for (const odd of ["ukulele", "Guitar", "", true, 1])
		expect(
			markup(renderChart("| C |", { chordDiagrams: odd as unknown as "guitar" })),
		).not.toContain("bm-diagrams");
});

test("an item whose drawing has a fret number says so in its class, set in the markup", () => {
	const d = strip("| Am | C#m7 | {E2 F2 F#2} |");
	const items = [...d.querySelectorAll("li.bm-diagram")];
	expect(items.map((li) => li.getAttribute("class"))).toEqual([
		"bm-diagram",
		"bm-diagram bm-diagram-fr",
		"bm-diagram",
	]);
	expect(items[1]?.querySelector("svg")?.getAttribute("class")).toBe("bm-diagram-svg bm-dg-fr");
});

describe("the names", () => {
	test("a name is the chord's own markup, as the grid sets it", () => {
		const d = strip("| F#m7b5 |");
		const grid = d.querySelector(".bm-section .bm-chord")?.outerHTML;
		expect(d.querySelector(".bm-diagram-name .bm-chord")?.outerHTML).toBe(grid as string);
	});

	test("a note set's name is its written text, marked as one that may wrap; a chord's is not", () => {
		const d = strip("| {C3 G3 E4} | C |");
		expect(texts(d, ".bm-diagram-name")).toEqual(["{C3 G3 E4}", "C"]);
		expect(texts(d, ".bm-diagram-name.bm-diagram-set")).toEqual(["{C3 G3 E4}"]);
	});

	test("a name with a voicing: the name, then the voicing smaller", () => {
		const d = strip("| Cmaj7{E3 G3} |");
		expect(d.querySelector(".bm-diagram-name .bm-chord")).not.toBeNull();
		expect(texts(d, ".bm-diagram-name .bm-diagram-voicing")).toEqual(["{E3 G3}"]);
	});
});

describe("numerals", () => {
	const CHART = "key: C\n| G | C |\nkey: G\n| G | D | {G3 B3} |\n| Am |";

	test("only with numerals on: a line under each name, in its first appearance's key", () => {
		expect(strip(CHART).querySelector(".bm-diagram-numeral")).toBeNull();
		const d = strip(CHART, { numerals: "nashville" });
		// G first appears in C (5), C in C (1), D in G (5); the note set has none.
		expect(texts(d, ".bm-diagram-numeral")).toEqual(["5", "1", "5", "2m"]);
		expect(texts(d, ".bm-diagram-name")).toEqual(["G", "C", "D", "{G3 B3}", "Am"]);
		expect(d.querySelector(".bm-diagram-numeral .bm-chord")?.getAttribute("data-numeral")).toBe(
			"nashville",
		);
	});

	test("Roman numerals, and none where the chart names no key", () => {
		expect(texts(strip(CHART, { numerals: "roman" }), ".bm-diagram-numeral")).toEqual([
			"V",
			"I",
			"V",
			"ii",
		]);
		expect(
			strip("| G | C |", { numerals: "nashville" }).querySelector(".bm-diagram-numeral"),
		).toBeNull();
	});
});

describe("the label says what a bar says", () => {
	const CHART = "key: A\n| F#m | E |\n| Cmaj7 | Cmaj7{E3 G3} |";

	test("with numerals on and a key in force, the degree first, as the bar speaks it", () => {
		const d = strip(CHART, { numerals: "nashville" });
		expect(labels(d)[0]).toBe("six, F sharp minor: 2, 4, 4, 2, 2, 2");
		const bar = d.querySelector(".bm-section .bm-bar .bm-sr")?.textContent ?? "";
		expect(bar).toContain("six, F sharp minor");
		// The numeral line stays hidden: the label carries it.
		expect(d.querySelector(".bm-diagram-numeral")?.getAttribute("aria-hidden")).toBe("true");
	});

	test("with numerals off, no degree", () => {
		expect(labels(strip(CHART))[0]).toBe("F sharp minor: 2, 4, 4, 2, 2, 2");
	});

	test("with numerals on and no key in force, no degree", () => {
		expect(labels(strip("| F#m |", { numerals: "roman" }))[0]).toBe(
			"F sharp minor: 2, 4, 4, 2, 2, 2",
		);
	});

	test("a name with a voicing is spoken with its notes, unlike the bare name", () => {
		const [, , bare, voiced] = labels(strip(CHART));
		expect(bare).toStartWith("C major seven: ");
		expect(voiced).toStartWith("C major seven voiced E3 G3: ");
	});
});

describe("what a diagram cannot show", () => {
	test("not playable: a frame with words in place of the drawing, and its label", () => {
		const d = strip("| {E2 F2 F#2} |");
		expect(d.querySelector(".bm-diagram svg")).toBeNull();
		const frame = d.querySelector(".bm-diagram-none");
		expect(frame?.getAttribute("role")).toBe("img");
		expect(frame?.textContent).toBe("not playable in standard tuning");
		expect(frame?.getAttribute("aria-label")).toBe(
			"notes E two, F two, F sharp two: not playable in standard tuning",
		);
	});

	test("a replaced voicing: a note under the name, and the label says so", () => {
		const d = strip("| Cmaj7{E3 G3 B3 C4} |");
		expect(texts(d, ".bm-diagram-note")).toEqual(["written voicing doesn't fit standard tuning"]);
		expect(labels(d)).toEqual([
			"C major seven voiced E3 G3 B3 C4: muted, 3, 2, open, open, open, written voicing doesn't fit standard tuning",
		]);
	});

	test("a 7alt shows a shell, says so aloud and shows no note", () => {
		const d = strip("| G7alt |");
		expect(labels(d)[0]).toEndWith(", altered tones not shown");
		expect(d.querySelector(".bm-diagram-note")).toBeNull();
	});
});

describe("speakDiagram", () => {
	const chord = (symbol: string) => {
		const r = parseChord(symbol);
		if (!r.ok) throw new Error(`${symbol} did not parse`);
		return r.value;
	};
	const entry = (over: Partial<DiagramEntry>): DiagramEntry => ({
		chord: chord("C"),
		voicing: null,
		key: null,
		shape: shapeOf("x32010"),
		caveat: null,
		...over,
	});

	test("the chord, a colon, the strings low to high", () => {
		expect(speakDiagram(entry({}))).toBe("C: muted, 3, 2, open, 1, open");
		expect(speakDiagram(entry({ chord: chord("Am"), shape: shapeOf("x02210") }))).toBe(
			"A minor: muted, open, 2, 2, 1, open",
		);
	});

	test("with a key, the degree first, as speakChord gives it", () => {
		expect(speakDiagram(entry({}), { tonic: "G", mode: "major" })).toBe(
			"four, C: muted, 3, 2, open, 1, open",
		);
	});

	test("the fret numbers as written, above the fifth fret too; no degree without a key passed", () => {
		expect(
			speakDiagram(entry({ shape: shapeOf("x35553"), key: { tonic: "G", mode: "major" } })),
		).toBe("C: muted, 3, 5, 5, 5, 3");
		expect(speakDiagram(entry({ chord: chord("A"), shape: shapeOf("577655") }))).toBe(
			"A: 5, 7, 7, 6, 5, 5",
		);
	});

	/** The first entry of a chart: how a note set or a voicing is read. */
	const first = (text: string) => {
		const e = layoutChart(text, { chordDiagrams: "guitar" }).diagrams[0];
		if (!e) throw new Error(`no entry in ${text}`);
		return e;
	};

	test("a voicing with no shape for it or its name", () => {
		expect(speakDiagram({ ...first("| Cmaj7{E3 G3 B3} |"), shape: null, caveat: null })).toBe(
			"C major seven, written voicing: not playable in standard tuning",
		);
	});

	test("a note set with no shape", () => {
		expect(speakDiagram({ ...first("| {E2 F2} |"), shape: null })).toBe(
			"notes E two, F two: not playable in standard tuning",
		);
	});
});

describe("left-handed", () => {
	test("diagramHand left changes the drawing and not the label", () => {
		const right = strip("| Am | G |");
		const left = strip("| Am | G |", { diagramHand: "left" });
		expect(labels(left)).toEqual(labels(right));
		expect(texts(left, ".bm-diagram-name")).toEqual(texts(right, ".bm-diagram-name"));
		const svgs = (d: Document) =>
			[...d.querySelectorAll(".bm-diagram svg")].map((s) => s.outerHTML);
		expect(svgs(left)).not.toEqual(svgs(right));
	});

	test("any other hand is right", () => {
		const right = renderChart("| Am |", GUITAR);
		for (const odd of ["right", "Left", "", 3])
			expect(renderChart("| Am |", { ...GUITAR, diagramHand: odd as unknown as "left" })).toBe(
				right,
			);
	});
});

test("the grid's own markup is the same with the strip on and off", () => {
	const sections = (html: string) =>
		[...shadow(doc(html)).querySelectorAll("section.bm-section")].map((s) => s.outerHTML);
	const cases: [string, RenderOptions][] = [
		[EXAMPLE, {}],
		[EXAMPLE, { numerals: "nashville" }],
		[MORNING_SONG, {}],
		[MORNING_SONG, { part: "Gtr" }],
	];
	for (const [text, options] of cases) {
		const off = sections(renderChart(text, options));
		expect(off.length).toBeGreaterThan(0);
		expect(sections(renderChart(text, { ...options, ...GUITAR }))).toEqual(off);
	}
});

test("the strip's entries are the model's, in order", () => {
	const text = "| C | Am | F | G |\n| C | Am | F | G7 |";
	const model = layoutChart(text, { chordDiagrams: "guitar" });
	expect(texts(strip(text), ".bm-diagram-name")).toEqual(
		model.diagrams.map((e) => e.chord.canonical),
	);
});

/** `count` bars of four to a line, cycling through `distinct` chords. */
function manyChords(count: number, distinct: number): string {
	const roots = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
	const kinds = [
		"",
		"m",
		"7",
		"m7",
		"maj7",
		"6",
		"m6",
		"9",
		"m9",
		"sus4",
		"sus2",
		"7sus4",
		"dim",
		"aug",
		"add9",
		"m7b5",
		"13",
	];
	const names = kinds.flatMap((k) => roots.map((r) => `${r}${k}`)).slice(0, distinct);
	const bars = Array.from({ length: count }, (_, i) => names[i % names.length]);
	const lines: string[] = [];
	for (let i = 0; i < bars.length; i += 4) lines.push(`| ${bars.slice(i, i + 4).join(" | ")} |`);
	return `${lines.join("\n")}\n`;
}

test(
	"a long chart of many chords renders its strip in linear time",
	() => {
		const small = manyChords(100, 20);
		const large = manyChords(1000, 200);
		expect(layoutChart(large, { chordDiagrams: "guitar" }).diagrams).toHaveLength(200);
		// Ten times the bars and the chords may cost at most 20 times as long.
		const ratio = growth(
			() => renderChart(small, GUITAR),
			() => renderChart(large, GUITAR),
			{ balance: 10 },
		);
		expect(ratio).toBeLessThan(20);
	},
	TIMING_TIMEOUT,
);
