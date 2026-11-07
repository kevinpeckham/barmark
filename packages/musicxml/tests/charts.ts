/** The corpus: every example chart, and every block of the grammar that parses without errors. */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { parseChart } from "barmark";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

/** A block's name from its text, so adding a block to the grammar renames no other. */
const hashOf = (text: string) => createHash("sha1").update(text).digest("hex").slice(0, 8);

function grammarCharts(): [string, string][] {
	const grammar = read("docs/grammar-v0.1-draft.md");
	return [...grammar.matchAll(/```[a-z]*\n([\s\S]*?)\n```/g)]
		.map((m): [string, string] => [`grammar block ${hashOf(m[1] ?? "")}`, m[1] ?? ""])
		.filter(([, text]) => {
			const p = parseChart(text);
			return p.bars.length > 0 && !p.diagnostics.some((d) => d.severity === "error");
		});
}

export const examples = readdirSync(new URL("examples/", root))
	.filter((f) => f.endsWith(".chart.md"))
	.map((f): [string, string] => [f, read(`examples/${f}`)]);

/** A three-part arrangement with real notes: a bass line, piano voicings and arpeggios, a guitar lick. */
const threeParts: [string, string] = [
	"three-parts.chart.md",
	readFileSync(new URL("fixtures/three-parts.chart.md", import.meta.url), "utf8"),
];

/** A piano writing its hands as lines, with pedal and a dotted figure, over a bass (barmark's grammar 7.6). */
const pianoLines: [string, string] = [
	"piano-lines.chart.md",
	readFileSync(new URL("fixtures/piano-lines.chart.md", import.meta.url), "utf8"),
];

/** The voice-and-lyrics design's lead sheet (section 1): a pickup, a melisma and a second verse. */
export const AMAZING_GRACE = `# Amazing Grace
part: Vox = Voice, instrument: voice
key: G, time: 3/4

## Verse
Vox       | [1/4] N.C.    | G                           | G          / G7       | C            / /      | G              |
Vox.Mel   | [1/4] {D4}:A- | {G4}:maz- / {B4}:ing_{G4}:/ | {B4}:grace / {A4}:how | {G4}:sweet / {E4}:the | {D4}:sound / / |
lyrics 2: | 'Twas         | grace / that                | taught / my           | heart / to            | fear / /       |
`;

/** Each chart's name and text. */
export const corpus = (): [string, string][] => [
	...examples,
	threeParts,
	pianoLines,
	...grammarCharts(),
];

/** Charts with a repeat inside a repeat, which MusicXML's repeats can't nest (FINDINGS, 2026-11-05). */
export const NESTED = [
	"# T\n\n## A\n|: D | x2\n| A :|\n",
	"|: C |\n| D | x2\n| A :| x3\n| E |",
	"|: C |\n| D | x2\n|1 E :|\n|2 F |\n| G |",
	"## A x2\n|: D | x2\n| A :|\n## B\n| G |",
	"## A\n|: D | x2\n| A :|\n## B\n| E |\n## A\n## C\n| G |",
	"## A\n| C | Fine |\n|: D | x2\n| A :|\n| E | D.C. al Fine |",
	"|: D | x ...\n| A :|\n| G |",
	"|: A | x2\n| ... :|\n| G |",
	"|: A | x2\n| B | x3\n| ... :|\n| G |",
];
