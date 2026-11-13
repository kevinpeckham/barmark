/** Get Started's chart and code samples. tests/pages.test.ts runs the claims they make. */
import { ENGRAVER_CDN_INTEGRITY, ENGRAVER_CDN_URL, ENGRAVER_WASM_INTEGRITY } from "@barmark/score";
import pkg from "../../package.json" with { type: "json" };
import { LINKS } from "./site.js";

/** The CLI the site installs (a dev dependency, so the tests run it), for the CI example's pin. */
const CLI_VERSION = pkg.devDependencies["@barmark/cli"];

/** Get Started's table of the packages: what each does, when to reach for it, its step and its README. */
export const PACKAGES: {
	name: string;
	does: string;
	when: string;
	step: string;
	readme: string;
}[] = [
	{
		name: "barmark",
		does: "Reads a chart (bars in play order, with problems by line), prints it in standard form, transposes it, converts Harte labels.",
		when: "Anything that reads or writes charts. The others build on it.",
		step: "#parser",
		readme: LINKS.parserReadme,
	},
	{
		name: "@barmark/render",
		does: "Draws the bar grid, as HTML from renderChart or as the <barmark-chart> element.",
		when: "Showing a chart on a page. Light, with no engraver.",
		step: "#render",
		readme: LINKS.renderReadme,
	},
	{
		name: "@barmark/score",
		does: "<barmark-score>: the grid with a Grid / Score switch, the score engraved by Verovio; renderScoreHtml for servers.",
		when: "Readers want sheet music too, and Verovio's download on demand is acceptable.",
		step: "#score",
		readme: LINKS.scoreReadme,
	},
	{
		name: "@barmark/engraver",
		does: "A smaller build of the same Verovio, which the score element can load from a CDN.",
		when: "You use the score and want it to download in under half the bytes.",
		step: "#engraver",
		readme: LINKS.engraverReadme,
	},
	{
		name: "@barmark/musicxml",
		does: "Exports a chart as MusicXML 4.0 and imports a score (.musicxml or .mxl) as a chart.",
		when: "Moving charts to and from MuseScore, Dorico, Sibelius or Finale.",
		step: "#musicxml",
		readme: LINKS.musicxmlReadme,
	},
	{
		name: "@barmark/midi",
		does: "Exports a chart's play order as a MIDI file, imports a MIDI file as a chart, and gives the timed notes.",
		when: "Hearing a chart in a DAW or a practice player, or building a player of your own.",
		step: "#midi",
		readme: LINKS.midiReadme,
	},
	{
		name: "@barmark/cli",
		does: "A command that checks, formats, renders, transposes, exports and imports charts, and pulls out a part.",
		when: "Working in a terminal or CI, with no code. Also a standalone binary.",
		step: "#terminal",
		readme: LINKS.cliReadme,
	},
	{
		name: "@barmark/sync",
		does: "Writes a chart and its timing map from a chord detector's bars and chords; reads timing maps.",
		when: "An audio tool that already knows where the bars and chords are.",
		step: "#sync",
		readme: LINKS.syncReadme,
	},
	{
		name: "@barmark/listen",
		does: "Finds the bars in a recording, or reads them from a beat tracker's beats, and writes the chart; or lines a chart up with a recording. Early (0.2).",
		when: "An audio tool starting from the audio, which can declare the tempo and meter or has a beat tracker's reading.",
		step: "#listen",
		readme: LINKS.listenReadme,
	},
	{
		name: "@barmark/fretboard",
		does: "Finds guitar chord shapes for Barmark chords, from a table and a shape finder, and the exact frets for notes you wrote. It draws nothing itself.",
		when: "Drawing chord boxes your own way, or fret numbers as text. The renderer already uses it for chord-diagrams.",
		step: "#fretboard",
		readme: LINKS.fretboardReadme,
	},
];

export const SAMPLE_CHART = `# Example Song
key: D, time: 4/4, tempo: 145

## Verse
|: D | A | Bm | G :|
| Em | / | A | A7 |

## Chorus
| G / D / | A | Bm / / A | G |
`;

export const INSTALL_PARSER = "npm install barmark";

export const USE_PARSER = `import { parseChart, printChart, transposeChart } from "barmark";

const chart = parseChart(text);
chart.title; // "Example Song"
chart.bars.length; // 16: the verse's repeat plays it twice
chart.sections.map((s) => s.name); // ["Verse", "Chorus"]
chart.diagnostics; // [] (each problem comes with its line number)

printChart("| D / A / |"); // "| D A |\\n": the same music, written the standard way
transposeChart(text, { to: "E" }).text; // "… |: E | B | C#m | A :| …"`;

export const INSTALL_RENDER = "npm install @barmark/render";

export const USE_RENDER = `import { renderChart } from "@barmark/render";

// A <barmark-chart> element with its own styles: it shows with no script.
const html = renderChart(text, {
	theme: "auto", // or "light" / "dark"
	rehearsalLetters: true, // A, B, C on each section
	chordDiagrams: "guitar", // a guitar chord diagram for each chord (chord-diagrams="guitar" on the element)
	fontUrl: "/fonts/Edwin-Roman.otf", // copy it from @barmark/render/fonts/
});`;

export const USE_ELEMENT = `<script type="module">
	import "@barmark/render/element";
</script>

<barmark-chart src="/charts/example-song.chart.md"></barmark-chart>

<barmark-chart theme="dark" numerals="nashville">
	<script type="text/barmark">
		key: D
		| D | A | Bm | G |
	</script>
</barmark-chart>`;

export const LIVE_EDITOR = `const chart = document.querySelector("barmark-chart");
editor.addEventListener("input", () => {
	chart.text = editor.value;
});`;

export const INSTALL_SCORE = "npm install @barmark/score";

export const USE_SCORE_ELEMENT = `<script type="module">
	import "@barmark/score/element"; // registers <barmark-chart> too
</script>

<!-- The grid, with a Grid / Score switch above it -->
<barmark-score src="/charts/example-song.chart.md"></barmark-score>

<!-- Or open on the score -->
<barmark-score view="score" theme="dark">
	<script type="text/barmark">
		key: D
		| D | A | Bm | G |
	</script>
</barmark-score>`;

/** The lighter Verovio from jsDelivr: the score package's values, as this site loads it. */
export const USE_SCORE_ENGRAVER = `<barmark-score
	verovio-url="${ENGRAVER_CDN_URL}"
	verovio-integrity="${ENGRAVER_CDN_INTEGRITY}"
	verovio-wasm-integrity="${ENGRAVER_WASM_INTEGRITY}"
	src="/charts/example-song.chart.md"
></barmark-score>`;

export const USE_SCORE_SERVER = `import { renderScoreHtml } from "@barmark/score/server";

// The grid and the switch, drawn with no script; Verovio is never loaded here.
const html = renderScoreHtml(text, {
	theme: "auto",
	fontUrl: "/fonts/Edwin-Roman.otf", // as for renderChart
});`;

/** Vite 7 only; Vite 8 needs nothing (the score package's README). */
/** Each setting Get Started's Vite config shows, as the score README writes it. */
export const VITE_SETTINGS = [
	'worker: { format: "es" }',
	'optimizeDeps: { exclude: ["@barmark/score"] }',
];

export const VITE_CONFIG = `// vite.config.js
export default {
	${VITE_SETTINGS[0]}, // Vite 8 with verovio-url; Vite 7 always
	${VITE_SETTINGS[1]}, // Vite 7 only (harmless on Vite 8)
};`;

export const INSTALL_MUSICXML = "npm install @barmark/musicxml";

export const USE_MUSICXML = `import { exportMusicXml, importMusicXml } from "@barmark/musicxml";

// A chart to MusicXML 4.0, for MuseScore, Dorico, Sibelius or Finale
const exported = exportMusicXml(text); // or exportMusicXml(text, { part: "Gtr" })
if (exported.ok) save("example-song.musicxml", exported.xml);

// A MusicXML score back to a chart: chord symbols, sections, repeats, parts and lyrics
const imported = importMusicXml(xml);
imported.text; // "# Example Song\\nkey: D, tempo: 145\\n\\n## Verse\\n…"
imported.diagnostics; // what didn't come over, one warning per kind`;

export const INSTALL_MIDI = "npm install @barmark/midi";

export const USE_MIDI = `import { exportMidi, importMidi } from "@barmark/midi";

// The chart's play order as a Standard MIDI File: a block chord a slot,
// with the tempo map, time and key signatures, section markers and lyrics
const exported = exportMidi(text); // or exportMidi(text, { part: "Gtr", tempo: 96 })
if (exported.ok) {
	save("example-song.mid", exported.bytes);
	exported.losses; // [] (what MIDI couldn't hold, such as an open repeat)
}

// A MIDI file back to a chart, each chord named from the notes that sound
const imported = importMidi(bytes);
imported.text; // "# Example Song\\nkey: D, time: 4/4, tempo: 145\\n\\n## Verse\\n| D | A | Bm | G |\\n…"`;

export const USE_PERFORM = `import { perform, secondsAt } from "@barmark/midi/perform";
import { parseChart } from "barmark";

// The same performance with no file: timed notes, for a player to schedule
const p = perform(parseChart(text));
for (const track of p.tracks)
	for (const note of track.notes) play(note.pitch, secondsAt(p, note.at), note.velocity);
secondsAt(p, p.end); // 26.48…: 16 bars of 4/4 at 145`;

export const INSTALL_SYNC = "npm install @barmark/sync";

/** The detections the sync sample builds from; a test checks USE_SYNC shows these and its results. */
export const SYNC_DETECTIONS = {
	title: "Example Song",
	grid: { bars: [0, 2, 4, 6, 8] },
	meter: "4/4",
	sections: [{ name: "Verse", start: 0 }],
	chords: {
		runs: [
			{ start: 0, end: 4, label: "D:maj" },
			{ start: 4, end: 6, label: "A:maj" },
			{ start: 6, end: 8, label: "B:min" },
		],
	},
};

export const USE_SYNC = `import { barAt, chartFromDetections, secondsAtBar } from "@barmark/sync";

// A chord detector's output: bar starts and chord runs, in seconds
const { chart, timing, diagnostics } = chartFromDetections({
	title: "Example Song",
	grid: { bars: [0, 2, 4, 6, 8] },
	meter: "4/4",
	sections: [{ name: "Verse", start: 0 }],
	chords: {
		runs: [
			{ start: 0, end: 4, label: "D:maj" },
			{ start: 4, end: 6, label: "A:maj" },
			{ start: 6, end: 8, label: "B:min" },
		],
	},
});
chart; // "# Example Song\\ntime: 4/4, tempo: 120\\n\\n## Verse\\n| D | / | A | Bm |\\n"

// The timing map places each played bar in the recording (null if the grid is unusable)
if (timing) {
	secondsAtBar(timing, 3); // 4
	barAt(timing, 5); // { entry: 2, bar: 3, fraction: 0.5 }
}
diagnostics; // what the builder changed or couldn't use, each with a code`;

export const USE_CLI = `npx @barmark/cli check songs          # every .chart.md in songs/, problems by line
npx @barmark/cli format --write songs # rewrite them in standard form
npx @barmark/cli transpose example-song.chart.md --to E
npx @barmark/cli render example-song.chart.md --out example-song.html
npx @barmark/cli render --score example-song.chart.md --out example-song-score.html  # the full score
npx @barmark/cli export --musicxml example-song.chart.md --out example-song.musicxml
npx @barmark/cli import example-song.musicxml --out imported.chart.md  # a MusicXML score as a chart
npx @barmark/cli export --midi example-song.chart.md --out example-song.mid  # for a DAW or a practice player
npx @barmark/cli import example-song.mid --out from-midi.chart.md  # chords named from the notes`;

/** A standalone binary, for a machine without Node: the CLI README's names and steps. */
export const BINARIES = [
	"barmark-linux-x64",
	"barmark-linux-arm64",
	"barmark-darwin-x64",
	"barmark-darwin-arm64",
	"barmark-windows-x64.exe",
];

export const USE_BINARY = `# ${BINARIES.join(", ")}
chmod +x barmark-darwin-arm64
xattr -d com.apple.quarantine barmark-darwin-arm64  # macOS: the binaries aren't signed yet
./barmark-darwin-arm64 check songs`;

export const CLI_CI = `- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx -y @barmark/cli@${CLI_VERSION} check --strict --format github songs
- run: npx -y @barmark/cli@${CLI_VERSION} format --check songs`;

export const INSTALL_LISTEN = "npm install @barmark/listen";

export const USE_LISTEN = `import { alignChart, chartFromRecording } from "@barmark/listen";

// Mono samples, and your chord model's runs in seconds (sync's ChordRuns)
const built = chartFromRecording({
	samples,
	sampleRate: 44100,
	chords: { runs },
	declared: { meter: "4/4", tempo: 120 }, // required: it detects neither
	title: "Example Song",
});
if (built.ok) {
	const { chart, timing, features } = built.value;
	chart; // "# Example Song\\ntime: 4/4, tempo: 120\\n| D | A | Bm | G |\\n…"
	timing; // when each played bar starts, as @barmark/sync's maps say

	// Or line up a chart you already have with the same recording
	const aligned = alignChart({ chart: text, features });
	if (aligned.ok) aligned.value.timing;
} else {
	built.refusals; // why not: every rule that failed, not the first only
}`;

export const USE_LISTEN_BEATS = `import { chartFromBeats } from "@barmark/listen";

// A beat tracker's reading in seconds, and your chord model's runs
const drafted = chartFromBeats({
	beats, // [0, 0.5, 1, 1.5, 2, …]
	downbeats, // [0, 2, 4, …]: the first beat of each bar
	duration: 24, // seconds of audio the tracker read
	chords: { runs },
	title: "Example Song",
});
if (drafted.ok) {
	const { chart, timing, grid } = drafted.value;
	chart; // "# Example Song\\ntime: 4/4, tempo: 120\\n| D | A | Bm | G |\\n…"
	timing; // when each played bar starts, on the tracker's bars
	grid.meter; // "4/4", from the usual count of beats in a bar
	grid.reading.beatsPerBar; // 4
} else {
	drafted.refusals; // "too-few-bars" or "bars-unsteady": no fallback inside,
	// so call chartFromRecording yourself if you can declare a tempo
}`;

export const INSTALL_FRETBOARD = "npm install @barmark/fretboard";

export const USE_FRETBOARD = `import { shapeFor, shapeText } from "@barmark/fretboard";
import { parseChord } from "barmark";

const chord = parseChord("Cmaj7");
if (chord.ok) {
	const result = shapeFor(chord.value);
	if (result.ok) {
		result.shape.frets; // [-1, 3, 2, 0, 0, 0]: low E to high E, -1 muted
		shapeText(result.shape); // "x32000"
	} else {
		result.reason; // "single-note" or "not-playable": no shape to show
	}
}`;
