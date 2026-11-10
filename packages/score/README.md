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
  plus a Grid / Score switch to a full score. Verovio (about 7 MB, 2.4 MB
  gzipped) loads on the first switch to the score, never on page load
  unless you ask (`preload`), and one copy serves every score on the page.

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
| `src`, `theme`, `bar-numbers`, `rehearsal-letters`, `numerals`, `wrap`, `show-part`, `columns` | the grid's own, as in [`@barmark/render`](../render/README.md#options-and-attributes) |
| `view` (`view`) | `"grid"` (default) or `"score"`; the view being shown. Set before the chart arrives, `"score"` waits for it |
| `verovio-url` | where to load Verovio from (below) |
| `verovio-integrity` | the SRI digest (`sha384-…`) the `verovio-url` copy must have; on a mismatch the package's own copy loads (below) |
| `preload` | `"none"` (default), `"intent"` or `"idle"`: when to start loading Verovio (below) |

The `text` property is the chart's text (`null` goes back to `src` or the
script child). The element fires a `viewchange` event, with
`detail.view`, whenever the view changes, from the switch or from script,
and a `scoreerror` event, with `detail.reason`, when the score can't be
drawn (below).

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

Vite 8 (and Vite+) draws a score with no config, in `vite dev` or a
build. But Vite builds workers as `iife` by default, which cannot split, so
the worker's fallback copy of Verovio is inlined into it: with
`verovio-url`, a reader then downloads Verovio twice, inside the worker and
from your URL. Set `worker: { format: "es" }` and Verovio becomes a chunk
of its own, fetched only if your URL fails. Vite 7 needs that line in any
case (an `iife` worker cannot load Verovio on demand) and one more: its dev
pre-bundler moves the element away from the worker and the font it finds
by URL.

```js
// vite.config.js
export default {
	worker: { format: "es" }, // Vite 8 with verovio-url; Vite 7 always
	optimizeDeps: { exclude: ["@barmark/score"] }, // Vite 7 only (harmless on Vite 8)
};
```

Without a bundler, a page's import map does not reach a worker, so the
worker's bare imports (`verovio/esm`, `barmark`, `@barmark/musicxml`)
fail. Serve a bundled `worker.js` at the package's URL. `verovio-url` can
then point at a Verovio module you host (for example
`verovio/dist/verovio-module.mjs` from the `verovio` package) instead of
bundling the 7 MB inside the worker; it only changes where that module
comes from. The URL is resolved against the page and must be http(s);
anything else is refused and the score is not drawn. The first
`verovio-url` that loads wins for the whole page: every element shares one
worker, so a later or different URL is not loaded. The worker downloads a
`verovio-url` with `fetch` (with or without `verovio-integrity`) and
imports it from a `blob:` URL, so a worker served with its own
Content-Security-Policy needs the module's origin (a CDN's, say) in
`connect-src` and `blob:` in `script-src`.

### While the score loads

The first score waits for Verovio to download and compile. Until it is
drawn, the score pane shows a status region (`role="status"`) with a
progress bar, in three phases:

1. **Loading the score engine…**, with how far the download has come
   when that can be measured: a percentage, and "3.1 of 7.4 MB" only when
   the total is the size actually transferred.
2. **Preparing…** while the worker compiles Verovio's WebAssembly.
3. **Engraving…** while the chart is engraved.

The live region speaks each phase once; the percentage is the progress
bar's value. With `prefers-reduced-motion`, the bar does not animate.

The download can be measured when the worker fetches Verovio itself,
which it does for a `verovio-url`: it reads the response as it arrives,
then imports the module from a `blob:` URL. A compressed response (gzip,
brotli) has a `Content-Length` that is the compressed size, while the
bytes read are decoded, so they are measured against Verovio's known
decoded size (`VEROVIO_MODULE_BYTES`) instead; an uncompressed one is
measured against its `Content-Length` (a cross-origin server that does
not expose `Content-Encoding` is taken as compressed when its length is
short of that size); anything else shows the bar without a percentage.
The package's own copy, without `verovio-url`, is loaded by your
bundler, so its download is shown without a percentage; so is a worker
bundled with Verovio inside it, whose download is the worker's own
script.

### A copy from a CDN

`verovio-url` can point at a public copy of the exact Verovio this
package uses, checked with `verovio-integrity`. For Verovio 6.4.1 on
jsDelivr (served with CORS `*` and cached as immutable):

```html
<barmark-score
	verovio-url="https://cdn.jsdelivr.net/npm/verovio@6.4.1/dist/verovio-module.mjs"
	verovio-integrity="sha384-iGNyhtxpKLNw90cjbI9ES538TJtbNZjLxsFVUuI8PwE2TTNQ+i2j9CjQnRMhZXHk"
	src="/charts/peaceful-dreams.chart.md"
></barmark-score>
```

The package exports both as `VEROVIO_CDN_URL` and `VEROVIO_CDN_INTEGRITY`
(with `VEROVIO_VERSION`). With `verovio-integrity` set, the worker
downloads the URL, checks its digest (`sha256-`, `sha384-` or `sha512-`)
with `crypto.subtle` before importing it, and on a mismatch or any
failure to load it warns in the console, naming the reason, and loads the
package's own copy instead, once. Without `verovio-integrity` there is no
fallback: a `verovio-url` that fails is a score that can't be drawn. A
malformed digest is refused like a bad URL.

A CDN does not save your readers a download they made on another site:
browsers partition their caches by site, so each site's readers fetch
Verovio once for that site whichever URL it comes from. What a CDN gives
is delivery from an edge near the reader and the 2.4 MB kept off your own
server.

### Preloading

`preload` starts loading Verovio before the first press, so the score
comes sooner. It only loads the engine (nothing is engraved), shares the
one load every element on the page uses, and asking twice does nothing.

- `"none"` (the default): Verovio loads on the first switch to the score.
- `"intent"`: on the first pointer over, focus on or touch of the Score
  switch.
- `"idle"`: once the page is idle after the element connects
  (`requestIdleCallback`, or half a second later where there is none).
  When the reader has asked to save data, or is on a 2G connection
  (`navigator.connection`), it waits for intent instead.

### When the score can't be drawn

If Verovio fails to load, or rejects the MusicXML, or the chart will not
export or is too large to draw (see "Engraving directly"), or Verovio
takes over 60 seconds to load or 20 seconds to engrave, the grid stays and
a note by the switch says "The score couldn't be drawn". The same happens
when `verovio-url` or `verovio-integrity` is refused, when the chart's
`src` could not be loaded, or when the engraving is not clean SVG. The
Score radio is disabled until the chart (`text`, `src` or the script
child), `verovio-url` or `verovio-integrity` changes.

The reason goes to the console as a warning, and the element fires a
`scoreerror` event (`bubbles`, `composed`) whose `detail.reason` is the
same string, so a page can show or log it:

```js
score.addEventListener("scoreerror", (e) => report(e.detail.reason));
```

It fires once per failure, as the note appears, after the grid is shown
again (and after the `viewchange` back to the grid, when the score was
being shown). Pressing the disabled Score radio fires nothing; once a
change enables it, a score that fails again fires again. A score an
element no longer wants (its chart or width changed) is dropped, not
failed, and fires nothing: it is cut off after three seconds if the worker
is already engraving it.

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

A score is refused with the reason "The score is too large to draw" when
its MusicXML would pass 50,000,000 characters (`MAX_XML_LENGTH`): the
export stops writing there. A short chart with repeats can play thousands
of bars, and writing them all out could take gigabytes. Before exporting,
`scoreCost` estimates the MusicXML's bytes in one pass over the play order
(every played bar's measure in every declared part, a tacet part's rests
too, each slot, pitch, chord degree, syllable and words with the length of
its text, and each bar's heading), and a chart over 50,000,000
(`MAX_SCORE_COST`) is refused without exporting. A long lead sheet costs
about half a million. Pass `maxXmlLength` or `maxCost` to set either.

The SVG is cleaned with an allow-list (`cleanSvg`) before it is returned;
`scorePane` and `scoreStyles` wrap it so it follows the grid's light and
dark palette. `engraveChart` and `engraveXml` drop a chord `<degree>`
marked `print-object="no"` before Verovio reads the MusicXML, as Verovio
6.4 prints every degree after the chord's text (`D7sus4(7)`); `result.xml`
is the export unchanged.

## Licence

This package is MIT. It uses [Verovio](https://github.com/rism-digital/verovio),
which is LGPL-3.0-only, as an ordinary npm dependency, loaded unchanged at
run time; its code is never copied into this package. barmark's own code
stays MIT. Verovio © Laurent Pugin and others; its licence text is
[COPYING.LESSER](https://github.com/rism-digital/verovio/blob/develop/COPYING.LESSER).

A site that bundles the worker ships Verovio inside its bundle. Keeping
Verovio a separate file (through `verovio-url`, or the bundler's own
chunk) and keeping its notice is the easy way to meet the LGPL. If it is
bundled into one file with the worker instead (Vite's default `iife`
worker format does this), credit it with its copyright and licence, host
or link the LGPL and GPL texts, and link your site's source so a visitor
can rebuild it with another Verovio; barmark.dev does all three in its
footer. This is not legal advice.
