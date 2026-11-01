/**
 * The syntax guide: one row per thing you can write, from
 * docs/grammar-v0.1-draft.md. tests/guide.test.ts parses every example
 * with the published barmark, so a row that drifts from the parser fails
 * the build.
 */
export const CATEGORIES = [
	"bars",
	"chords",
	"notes",
	"repeats",
	"sections",
	"directives",
	"text",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type GuideRow = {
	/** kebab-case, unique */
	id: string;
	/** what you type */
	syntax: string;
	category: Category;
	/** one plain sentence */
	meaning: string;
	/** other names musicians search for (simile, fermata, volta); found, not shown */
	terms?: string[];
	/** a small chart */
	example: string;
	/** the grammar section, e.g. "§5" */
	ref: string;
	/** what the parser must say about the example; checked by the tests */
	expect?: {
		/** each a substring of one diagnostic message, in order; none when absent */
		diagnostics?: string[];
		/** bars played, repeats and replays included */
		bars?: number;
		chord?: { symbol: string; canonical: string; harte: string };
	};
};

export const ROWS: GuideRow[] = [
	// Bars
	{
		id: "bar-line",
		syntax: "| D | A |",
		category: "bars",
		meaning: "A line that starts with a pipe is a bar line; each cell between pipes is one bar.",
		example: "| D | A | Bm | G |",
		ref: "§2",
		expect: { bars: 4 },
	},
	{
		id: "slots",
		syntax: "| D A |",
		category: "bars",
		meaning: "Several chords in a cell split the bar into equal slots.",
		example: "| D A | Am7 / / G7 |",
		ref: "§2.1",
		expect: { bars: 2 },
	},
	{
		id: "hold",
		syntax: "/",
		category: "bars",
		meaning: "A slash holds whatever was sounding through its slot.",
		example: "| G / / D | / |",
		ref: "§2.3",
		expect: { bars: 2 },
	},
	{
		id: "simile",
		syntax: "%",
		category: "bars",
		meaning: "A percent sign alone in a cell plays the previous bar again, exactly.",
		terms: ["simile", "repeat the bar"],
		example: "| C G | % | D | % |",
		ref: "§2.3",
		expect: { bars: 4 },
	},
	{
		id: "group",
		syntax: "D_E_F",
		category: "bars",
		meaning: "Underscores join chords into one slot, divided equally: three make a triplet.",
		terms: ["tuplet", "push", "anticipation"],
		example: "| C D_E_F |",
		ref: "§2.2",
		expect: { bars: 1 },
	},
	{
		id: "no-chord",
		syntax: "N.C.",
		category: "bars",
		meaning:
			"No harmony: the chord instruments stop, though drums, a riff or a voice may carry on.",
		example: "| N.C. | N.C. | D | A |",
		ref: "§2.3",
		expect: { bars: 4 },
	},
	{
		id: "silence",
		syntax: "--",
		category: "bars",
		meaning: "Silence: the whole band stops for the slot.",
		terms: ["rest", "stop", "break", "tacet"],
		example: "| G -- -- -- |",
		ref: "§2.3",
		expect: { bars: 1 },
	},
	{
		id: "unknown",
		syntax: "?",
		category: "bars",
		meaning: "A chord goes here but isn't written down yet; it always warns.",
		terms: ["placeholder", "TBD"],
		example: "| D | ? | G | A |",
		ref: "§2.3",
		expect: { bars: 4, diagnostics: ["unknown harmony"] },
	},
	{
		id: "fermata",
		syntax: "...",
		category: "bars",
		meaning:
			"An unmeasured hold, such as a fermata or a final ring-out; it isn't counted as a bar.",
		terms: ["pause"],
		example: "| A | ... |",
		ref: "§2.3",
		expect: { bars: 1 },
	},
	{
		id: "one-bar-meter",
		syntax: "[2/4]",
		category: "bars",
		meaning:
			"A time signature in brackets at the start of a cell sets the meter for that bar only.",
		terms: ["meter change", "odd bar", "time signature change"],
		example: "| D | A | [2/4] G | D |",
		ref: "§2.4",
		expect: { bars: 4 },
	},
	{
		id: "empty-cell",
		syntax: "| |",
		category: "bars",
		meaning: "An empty cell is an error: hold with / or repeat with %.",
		example: "| D | |",
		ref: "§2",
		expect: { diagnostics: ["empty"] },
	},
	{
		id: "missing-trailing-pipe",
		syntax: "| D | A",
		category: "bars",
		meaning: "A bar line without its closing pipe is still read, with a warning.",
		example: "| D | A",
		ref: "§2",
		expect: { bars: 2, diagnostics: ["missing trailing |"] },
	},
	{
		id: "spellings",
		syntax: "NC  X2  …  –",
		category: "bars",
		meaning:
			"Spellings phones and editors produce are accepted: NC for N.C., X or × for x, … for ..., and a dash for --.",
		example: "| NC | D | X2\n| G – – – |\n| A | … |",
		ref: "§2.3",
		expect: { bars: 6 },
	},

	// Chords
	{
		id: "chord",
		syntax: "D7sus4",
		category: "chords",
		meaning:
			"A chord symbol: root, then quality, extension, sus, added tones and bass, in that order.",
		example: "| D7sus4 | Bm7 | Gmaj7 | F#m |",
		ref: "§3",
		expect: {
			bars: 4,
			chord: { symbol: "D7sus4", canonical: "D7sus4", harte: "D:sus4(b7)" },
		},
	},
	{
		id: "power-chord",
		syntax: "G5(7)",
		category: "chords",
		meaning: "5 means no third; parentheses add exactly the tones listed.",
		terms: ["power chord"],
		example: "| G5(7) | D5 |",
		ref: "§3",
		expect: { bars: 2, chord: { symbol: "G5(7)", canonical: "G5(7)", harte: "G:5(b7)" } },
	},
	{
		id: "altered",
		syntax: "Am7(b5)",
		category: "chords",
		meaning:
			"An altered tone replaces the natural one of the same number if the chord has it; otherwise it adds.",
		example: "| Am7(b5) | C(b9) | Gm |",
		ref: "§3",
		expect: { bars: 3, chord: { symbol: "Am7b5", canonical: "Am7(b5)", harte: "A:hdim7" } },
	},
	{
		id: "bare-alteration",
		syntax: "C7b9",
		category: "chords",
		meaning:
			"An alteration may skip the parentheses, but only straight after an extension; the canonical form adds them.",
		example: "| C7b9 | Fm |",
		ref: "§3",
		expect: { bars: 2, chord: { symbol: "C7b9", canonical: "C7(b9)", harte: "C:7(b9)" } },
	},
	{
		id: "slash-chord",
		syntax: "D/F#",
		category: "chords",
		meaning: "A slash and a note after a chord puts that note in the bass.",
		terms: ["slash chord", "inversion", "bass note"],
		example: "| D | D/F# | G | A |",
		ref: "§3",
		expect: { bars: 4, chord: { symbol: "D/F#", canonical: "D/F#", harte: "D:maj/3" } },
	},
	{
		id: "ambiguous-2",
		syntax: "C2",
		category: "chords",
		meaning: "C2 is rejected because traditions disagree on it; write Csus2 or C(9).",
		example: "| C2 |",
		ref: "§3",
		expect: { diagnostics: ["C2"] },
	},

	// Notes
	{
		id: "note-set",
		syntax: "{E}",
		category: "notes",
		meaning: "Braces give exact notes instead of a chord name, low to high; the first is the bass.",
		example: "| {E} | {E} | D | A |\n| {C E F# B} | G |",
		ref: "§4",
		expect: { bars: 6 },
	},
	{
		id: "note-root",
		syntax: "{D E! G}",
		category: "notes",
		meaning: "An exclamation mark after a note marks it as the root.",
		example: "| {D E! G} |",
		ref: "§4",
		expect: { bars: 1 },
	},
	{
		id: "octaves",
		syntax: "{E1}",
		category: "notes",
		meaning: "Inside braces a number is the octave, at sounding pitch: middle C is C4.",
		example: "| {E1} | / |\n| {C3 G3 E4} | {B2 F#3 D4} |",
		ref: "§4.1",
		expect: { bars: 4 },
	},

	// Repeats
	{
		id: "repeat-line",
		syntax: "x2",
		category: "repeats",
		meaning: "x and a number N at the end of a line plays that line N times.",
		example: "| D | A | x2",
		ref: "§5",
		expect: { bars: 4 },
	},
	{
		id: "repeat-signs",
		syntax: "|: :|",
		category: "repeats",
		meaning:
			"Repeat signs repeat the bars between them, across one or more lines; twice unless counted.",
		example: "|: D | A |\n| G | D :| x3",
		ref: "§5",
		expect: { bars: 12 },
	},
	{
		id: "open-repeat",
		syntax: "x ...",
		category: "repeats",
		meaning: "An open repeat plays at least once, an unknown number of times: a vamp or a fade.",
		terms: ["repeat until cue"],
		example: "| E7 | / | x ...\n| A | ... |",
		ref: "§5",
		// the open pass counts once
		expect: { bars: 3 },
	},
	{
		id: "endings",
		syntax: "|1  |2",
		category: "repeats",
		meaning: "First and second endings are reserved for v0.2, so for now they are an error.",
		terms: ["volta", "first ending", "second ending"],
		example: "| D | A |\n|1 G | D |",
		ref: "§5",
		expect: { diagnostics: ["endings are not supported"] },
	},

	// Sections
	{
		id: "section",
		syntax: "## Verse",
		category: "sections",
		meaning: "A level-two heading begins a section, which runs to the next one.",
		terms: ["rehearsal mark", "part", "form"],
		example: "## Verse\n| D | A | Bm | G |",
		ref: "§6",
		expect: { bars: 4 },
	},
	{
		id: "replay",
		syntax: "## Chorus",
		category: "sections",
		meaning: "A heading with no bars under it replays the latest section with that name.",
		example: "## Chorus\n| G | D |\n## Verse\n| A |\n## Chorus",
		ref: "§6",
		expect: { bars: 5 },
	},
	{
		id: "section-repeat",
		syntax: "## Chorus x2",
		category: "sections",
		meaning: "x and a number on a heading repeats the whole section.",
		example: "## Chorus x2\n| G | D |",
		ref: "§5",
		expect: { bars: 4 },
	},
	{
		id: "elision",
		syntax: "->",
		category: "sections",
		meaning: "An arrow on a replay heading cuts its last bar, so the next section starts there.",
		terms: ["elision", "cut", "skip the last bar"],
		example: "## Chorus\n| G | C | G | D |\n## Chorus ->\n## Outro\n| G |",
		ref: "§6",
		expect: { bars: 8 },
	},
	{
		id: "unmatched-replay",
		syntax: "## Bridge",
		category: "sections",
		meaning: "An empty section that matches no earlier one is an error.",
		example: "## Bridge",
		ref: "§6",
		expect: { diagnostics: ["Bridge"] },
	},

	// Directives
	{
		id: "key",
		syntax: "key:",
		category: "directives",
		meaning: "The key: a root with optional m, or a root and a mode.",
		example: "key: Bm\n| Bm | G | D | A |",
		ref: "§7",
		expect: { bars: 4 },
	},
	{
		id: "time",
		syntax: "time:",
		category: "directives",
		meaning: "The meter from here on; 4/4 if never set.",
		terms: ["meter", "time signature"],
		example: "time: 6/8\n| D | A |",
		ref: "§7",
		expect: { bars: 2 },
	},
	{
		id: "tempo",
		syntax: "tempo:",
		category: "directives",
		meaning: "Beats per minute, counting the meter's beat.",
		terms: ["bpm", "metronome"],
		example: "tempo: 145\n| D | A |",
		ref: "§7",
		expect: { bars: 2 },
	},
	{
		id: "feel",
		syntax: "feel:",
		category: "directives",
		meaning: "Where off-beats land: straight, swing, shuffle or swing 16.",
		terms: ["groove"],
		example: "feel: swing\n| C7 | F7 |",
		ref: "§7.1",
		expect: { bars: 2 },
	},
	{
		id: "directives-line",
		syntax: "key: D, time: 4/4",
		category: "directives",
		meaning:
			"Several directives share a line, separated by commas; after bars they take effect at the next bar.",
		example: "key: D, time: 4/4, tempo: 120\n| D | G |\ntime: 3/4\n| A | D |",
		ref: "§7",
		expect: { bars: 4 },
	},

	// Text
	{
		id: "title",
		syntax: "# Title",
		category: "text",
		meaning: "A level-one heading is the song's title, once at most.",
		example: "# Wagon Wheel\n| G | D | Em | C |",
		ref: "§1",
		expect: { bars: 4 },
	},
	{
		id: "lyrics",
		syntax: "lyrics",
		category: "text",
		meaning: "Any line that isn't bars, a heading or a directive is text: lyrics, cues, notes.",
		example: "| D | A |\nHeaded down south to the land of the pines",
		ref: "§1",
		expect: { bars: 2 },
	},
	{
		id: "notes-heading",
		syntax: "### Note",
		category: "text",
		meaning: "Headings of three or more hashes are text, for notes to the band.",
		example: "### Watch Kevin for the cutoff\n| D | A |",
		ref: "§1",
		expect: { bars: 2 },
	},
	{
		id: "code-fence",
		syntax: "```barmark",
		category: "text",
		meaning:
			"Fence lines are ignored and the chart inside is read as usual; fence a chart so markdown previews keep its lines apart.",
		example: "```barmark\n| D | A |\n```",
		ref: "§1",
		expect: { bars: 2 },
	},
];
