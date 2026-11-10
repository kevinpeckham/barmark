/** Get Started's chart and code samples. tests/pages.test.ts runs the claims they make. */
import pkg from "../../package.json" with { type: "json" };

/** The CLI the site installs (a dev dependency, so the tests run it), for the CI example's pin. */
const CLI_VERSION = pkg.devDependencies["@barmark/cli"];

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
npx @barmark/cli import example-song.musicxml --out imported.chart.md  # a MusicXML score as a chart`;

export const CLI_CI = `- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx -y @barmark/cli@${CLI_VERSION} check --strict --format github songs
- run: npx -y @barmark/cli@${CLI_VERSION} format --check songs`;
