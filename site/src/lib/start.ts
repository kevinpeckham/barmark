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

export const USE_CLI = `npx @barmark/cli check songs          # every .chart.md in songs/, problems by line
npx @barmark/cli format --write songs # rewrite them in standard form
npx @barmark/cli transpose example-song.chart.md --to E
npx @barmark/cli render example-song.chart.md --out example-song.html`;

export const CLI_CI = `- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx -y @barmark/cli@${CLI_VERSION} check --strict --format github songs
- run: npx -y @barmark/cli@${CLI_VERSION} format --check songs`;
