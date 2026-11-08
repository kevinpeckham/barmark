# @barmark/score

Shows a [barmark](https://github.com/kevinpeckham/barmark) chord chart as
the bar grid or as a full engraved score. The chart is exported to MusicXML
by `@barmark/musicxml` and engraved by Verovio in a Web Worker; the score
adds no music of its own.

```
npm install @barmark/score
```

## Two components

- **`<barmark-chart>`** from [`@barmark/render`](../render/) is the light
  one: the bar grid, no Verovio.
- **`<barmark-score>`** from this package is the heavier one: the same grid,
  plus a Grid / Score switch to a full score. Verovio (about 7 MB) loads
  only on the first switch to the score, never on page load, and one copy
  serves every score on the page.

Use `<barmark-chart>` when the grid is enough.

## As a web component

```html
<script type="module">import "@barmark/score/element";</script>

<barmark-score src="/charts/peaceful-dreams.chart.md"></barmark-score>

<barmark-score view="score" theme="dark">
	<script type="text/barmark">
		## Verse
		| D | A | Bm | G |
	</script>
</barmark-score>
```

Importing `@barmark/score/element` also registers `<barmark-chart>` (it
builds on it). Importing the package root registers nothing.

The chart comes from the `text` property, the `src` URL or a child
`<script type="text/barmark">`, exactly as for `<barmark-chart>`. The score
is engraved at the element's width and again after a resize; the score shown
stays (with `aria-busy="true"`) until the new one is ready. To assistive
technology the score is one image named for the chart's title, or "Score".

| Attribute (property) | |
|---|---|
| `src`, `theme`, `bar-numbers`, `rehearsal-letters`, `numerals`, `wrap`, `show-part` | the grid's own, as in [`@barmark/render`](../render/README.md#options-and-attributes) |
| `view` (`view`) | `"grid"` (default) or `"score"`; the view being shown. Set before the chart arrives, `"score"` waits for it |
| `verovio-url` | where to load Verovio from (below) |

The `text` property is the chart's text (`null` goes back to `src` or the
script child). The element fires a `viewchange` event, with
`detail.view`, whenever the view changes, from the switch or from script.

```js
const score = document.querySelector("barmark-score");
score.addEventListener("viewchange", (e) => console.log(e.detail.view));
score.view = "score";
```

### Bundling the worker

The engine runs in a module Worker, created as
`new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`.
That is the pattern Vite and webpack follow, so a bundler finds the worker
and Verovio for you.

Without a bundler, a page's import map does not reach a worker, so the
worker's bare imports (`verovio/esm`, `barmark`, `@barmark/musicxml`)
fail. Serve a bundled `worker.js` at the package's URL. `verovio-url` can
then point at a Verovio module you host (for example
`verovio/dist/verovio-module.mjs` from the `verovio` package) instead of
bundling the 7 MB inside the worker; it only changes where that module
comes from. The URL is resolved against the page and must be http(s);
anything else is refused and the score is not drawn. The first
`verovio-url` that loads wins for the whole page: every element shares one
worker, so a later or different URL is not loaded.

### When the score can't be drawn

If Verovio fails to load, or rejects the MusicXML, or the chart will not
export, the grid stays and a note by the switch says "The score couldn't
be drawn". The reason goes to the console.

## On the server

```js
import { renderScoreHtml } from "@barmark/score/server";

const html = renderScoreHtml(chartText, { fontUrl: "/fonts/Edwin-Roman.otf" });
```

`renderScoreHtml` takes `@barmark/render`'s options plus `view`. It never
loads Verovio: it draws the bar grid and the Grid / Score switch in a
declarative shadow root, so the chart shows before any script runs. The
score is engraved once `<barmark-score>` upgrades in the browser, taking
over the markup without redrawing the grid. Like `renderChart`, insert it
by parsing HTML (or `setHTMLUnsafe`), not `innerHTML`.

## Engraving directly

```js
import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";
import { engraveChart } from "@barmark/score";

const vrv = new VerovioToolkit(await createVerovioModule());
const result = engraveChart(vrv, chartText, { width: 800 });
if (result.ok) document.body.innerHTML = result.svg;
else console.warn(result.reason);
```

The SVG is cleaned with an allow-list (`cleanSvg`) before it is returned;
`scorePane` and `scoreStyles` wrap it so it follows the grid's light and
dark palette.

## Licence

This package is MIT. It uses [Verovio](https://github.com/rism-digital/verovio),
which is LGPL-3.0-only, as an ordinary npm dependency, loaded unchanged at
run time; its code is never copied into this package. barmark's own code
stays MIT. Verovio's licence text is
[COPYING.LESSER](https://github.com/rism-digital/verovio/blob/develop/COPYING.LESSER).

A site that bundles the worker ships Verovio inside its bundle. Keeping
Verovio a separate file (through `verovio-url`, or the bundler's own
chunk) and keeping its notice is the easy way to meet the LGPL. This is
not legal advice.
