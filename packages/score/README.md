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
  plus a Grid / Score switch to a full score. Verovio
  ([the lighter build](#the-lighter-build-barmarkengraver), about 3 MB,
  1.0 MB gzipped) loads on the first switch to the score, never on page
  load unless you ask (`preload`), and one copy serves every score on the
  page.

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
| `src`, `theme`, `bar-numbers`, `rehearsal-letters`, `numerals`, `wrap`, `show-part`, `columns`, `melody`, `chord-diagrams`, `diagram-hand` | the grid's own, as in [`@barmark/render`](../render/README.md#options-and-attributes). The score view ignores `chord-diagrams` and `diagram-hand`: only the grid shows the guitar chord strip. It ignores `melody` too: `melody="off"` leaves a singer's melody line out of the grid (its words stay under the chords), and the score still engraves it |
| `view` (`view`) | `"grid"` (default) or `"score"`; the view being shown. Set before the chart arrives, `"score"` waits for it |
| `switch` | `"off"` leaves the element's Grid / Score switch out, for a page with controls of its own: set `view` from them, and listen for `viewchange` (and `scoreerror`, after which the element shows the grid again). Anything else draws the switch |
| `verovio-url` | where to load Verovio from (below) |
| `verovio-integrity` | the SRI digest (`sha384-…`) the `verovio-url` copy must have; on a mismatch the package's own copy loads (below) |
| `verovio-wasm-integrity` | the SRI digest of the `.wasm` beside a `verovio-url` that loads one, such as `@barmark/engraver` (below) |
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

Loaded without a bundler, the element also needs `@barmark/fretboard` in the
page's import map (with `barmark` and `@barmark/render`): the element loads
`@barmark/render`, which imports it whether or not diagrams are on.

The engine runs in a module Worker, created as
`new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`.
A bundler that follows that pattern (Vite; webpack 5, by its
documentation) finds the worker and Verovio for you; esbuild does not
(below).

Vite 8 (and Vite+) draws a score with no config, in `vite dev` or a
build (in `vite dev`, checked with Vite 8.3.5 against this repository's
own build, the lighter build engraved, with no warning), but set
`worker: { format: "es" }`, or a reader downloads more than before. Vite
builds workers as `iife` by default, which cannot split, so the worker
holds both Verovios: measured with Vite 8.3.5, the worker file is about
8.6 MB (2.5 MB gzipped), with stock Verovio and the lighter build's glue
inside it, and the lighter build's `.wasm`, about 3.0 MB (1.0 MB gzipped),
is fetched as well. Stock alone, the module as the `verovio` package
publishes it, is about 7.4 MB (2.4 MB gzipped). With `format: "es"` the
worker is about 213 kB (73 kB gzipped), the lighter glue 29 kB (11 kB)
and the `.wasm` about 3.0 MB (1.0 MB gzipped); stock is a separate chunk,
the one Vite writes from that module, about 8.3 MB (2.5 MB gzipped),
fetched only on a fallback. (With `verovio-url` an `iife` worker also
makes a reader download Verovio twice, inside the worker and from your
URL.) Vite 7 needs that line too (an `iife` worker cannot load Verovio on
demand) and one more: its dev pre-bundler moves the element away from the
worker and the font it finds by URL.

```js
// vite.config.js
export default {
	worker: { format: "es" }, // every Vite
	optimizeDeps: { exclude: ["@barmark/score"] }, // Vite 7 only (harmless on Vite 8)
};
```

Without a bundler, a page's import map does not reach a worker, so the
worker's bare imports (`verovio/esm`, and on demand `@barmark/engraver`
and `verovio/wasm`; through its engraving code, `barmark` and
`@barmark/musicxml`) fail. Serve a bundled `worker.js` at the package's
URL. `verovio-url` can then point at a Verovio module you host (for example
`verovio/dist/verovio-module.mjs` from the `verovio` package) instead of
bundling Verovio inside the worker; it only changes where that module
comes from. The URL is resolved against the page and must be http(s);
anything else is refused and the score is not drawn. Its Verovio must be
the version this package's toolkit is (`VEROVIO_VERSION`, 6.4.1): any
other fails to load, or, with `verovio-integrity` set, falls back to the
package's own copy with a warning. The first `verovio-url` that loads wins
for the whole page: every element shares one worker, so a later or
different URL is not loaded, and a second element's different
`verovio-integrity` or `verovio-wasm-integrity` is ignored too: the
engine keeps the source it loaded first, digests and all. The worker downloads a
`verovio-url` with `fetch` (with or without `verovio-integrity`) and
imports it from a `blob:` URL, so a worker served with its own
Content-Security-Policy needs the module's origin (a CDN's, say) in
`connect-src` and `blob:` in `script-src`.

### Bundlers and the lighter build

The lighter build's `.wasm` has to reach the browser beside the worker.
Bundlers differ in whether they do that, measured on 2026-11-26 with Vite
8.3.5 and esbuild 0.28.2:

- **Vite 8** emits the `.wasm` beside the worker chunk, and the lighter
  build engraves. Set `worker: { format: "es" }` to get the smaller
  download (see above). Of the Vite versions, only Vite 8 was measured.
- **webpack 5** follows `new URL("...", import.meta.url)` natively, by its
  documentation; it was not measured here. Plain Rollup needs a plugin for
  such assets.
- **esbuild** does not follow `new URL(...)`, so it does not find the worker
  by itself: bundle `node_modules/@barmark/score/dist/worker.js` as a
  second entry point and name it so it is written beside the page's bundle
  as `worker.js`, where the element looks. Give the entries as `{ in, out }`
  pairs; with plain paths esbuild nests each output under the entries'
  common ancestor, and the page cannot find the worker.

  ```js
  import { build } from "esbuild";
  await build({
  	entryPoints: [
  		{ in: "src/main.js", out: "main" },
  		{ in: "node_modules/@barmark/score/dist/worker.js", out: "worker" },
  	],
  	outdir: "dist",
  	bundle: true,
  	format: "esm",
  	external: ["node:*"],
  });
  ```

  (On the command line: `esbuild main=src/main.js
  worker=node_modules/@barmark/score/dist/worker.js --bundle --format=esm
  '--external:node:*' --outdir=dist`.) `--external:node:*` is needed for
  either Verovio, because the glue code of both has a Node import. Without
  `--splitting` (esbuild's option for separate chunks, not measured here) it
  inlines both Verovios into the worker bundle, and it emits no `.wasm`.
  The lighter build's glue then asks for `verovio-module.wasm` three times
  (a streaming compile, an ArrayBuffer fetch, then a synchronous request),
  each answered 404, and logs four error lines of its own; then comes our
  one warning, and stock Verovio draws the score. (Observed with the
  `@barmark/engraver` in this repository and esbuild 0.28.2: the count is
  the glue's, not a promise.) To run the lighter build, copy
  `node_modules/@barmark/engraver/dist/verovio-module.wasm` beside the
  worker bundle (pnpm does not put a dependency's own dependency there:
  add `@barmark/engraver` to your own dependencies at the exact version
  this package depends on). That changes which Verovio
  runs, not what is downloaded: the bundle still holds stock Verovio, the
  7.4 MB module.

  The bundle does not bring the element's font either: the element looks
  for `@barmark/render`'s `fonts/Edwin-Roman.otf` beside where its own
  module was, and without it the chart is set in a fallback face (Georgia
  or another serif), and the only sign is the font's 404 in the console.
  Serve that file yourself and register it before the element loads, as
  [`@barmark/render`'s README](../render/README.md#as-a-web-component)
  says: a `<style data-barmark-font>` holding `fontFaceCss(yourUrl)`
  (`fontFaceCss` is exported by `@barmark/render`).

`verovio-url` works with any of them (see above): it names the module to
load first, and the package's own copy is still the fallback.

### While the score loads

The first score waits for Verovio to download and compile. Until it is
drawn, the score pane shows a status region (`role="status"`) with a
progress bar, in three phases:

1. **Loading the score engine…**, with how far the download has come
   when that can be measured (a `verovio-url` copy, below): a percentage,
   and "3.1 of 7.4 MB" only when the total is the size actually
   transferred.
2. **Preparing…** while the worker compiles Verovio's WebAssembly (and,
   for the package's own copy, while it downloads it).
3. **Engraving…** while the chart is engraved.

The live region speaks each phase once; the percentage is the progress
bar's value. With `prefers-reduced-motion`, the bar does not animate.

The download can be measured when the worker fetches Verovio itself,
which it does for a `verovio-url`: it reads the response as it arrives,
then imports the module from a `blob:` URL. A compressed response (gzip,
brotli) has a `Content-Length` that is the compressed size, while the
bytes read are decoded, so they are measured against the known decoded
size of the file its declared digest names instead: Verovio's module
(`VEROVIO_MODULE_BYTES`) for `VEROVIO_CDN_INTEGRITY`, or
`@barmark/engraver`'s module or `.wasm` for its digests. An uncompressed
one is measured against its `Content-Length` (a cross-origin server that
does not expose `Content-Encoding` is taken as compressed when its length
is short of that size). A compressed one with no digest, or a digest of
no build this package knows, shows the bar without a percentage. With
`verovio-wasm-integrity`, the module's small download is shown without a
percentage and the `.wasm`'s is the one measured, so the bar runs to
100% once.

The package's own copy, without `verovio-url`, is never measured. The
lighter build's module comes through your bundler, shown without a
percentage, and its glue then fetches the `.wasm` (about 1 MB gzipped)
itself while it compiles, so that download shows as **Preparing…**; after
a fallback, so does stock Verovio's. A worker bundled with Verovio inside
it is downloaded as the worker's own script, also without a percentage.

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

### The lighter build (`@barmark/engraver`)

[`@barmark/engraver`](../engraver/) is a modified, smaller build of the
same Verovio 6.4.1, made by barmark for this package, and it is what the
worker loads by default: about 3 MB where stock is about 7.4 MB, checked
before each release to draw SVG byte for byte the same as stock over a
corpus of charts. It is a dependency of this package, so you have it
already. Its WebAssembly is a separate file, `verovio-module.wasm` beside
the module.

If the lighter build cannot be loaded (its `.wasm` is missing, or the load
fails or takes longer than 20 seconds), the worker loads stock Verovio
instead, once, and writes one warning to the console:

```
<barmark-score>: the lighter Verovio was not used (<reason>); loading stock Verovio instead
```

The score is drawn either way. Stock Verovio is still a dependency of this
package, loaded unchanged: it is what runs on a fallback, and its toolkit
class is the one this package uses with either build.

You can also load the lighter build from a CDN, with a digest for the
module and one of its own for the `.wasm`, `verovio-wasm-integrity`. On
jsDelivr:

```html
<barmark-score
	verovio-url="https://cdn.jsdelivr.net/npm/@barmark/engraver@0.1.1/dist/verovio-module.mjs"
	verovio-integrity="sha384-klTppHZB0IPzdIOfSXNr8CbdhJU+1yp5eltjmgp8W3E8uhht5dlRy1mwrBSnmKJO"
	verovio-wasm-integrity="sha384-cBBw1xx6xHEb/I7QDrSFDgImfzzvZVvwru055NG6QbY1zHI/FFLQHjlKdtH7pr5i"
	src="/charts/peaceful-dreams.chart.md"
></barmark-score>
```

The package exports the three as `ENGRAVER_CDN_URL`,
`ENGRAVER_CDN_INTEGRITY` and `ENGRAVER_WASM_INTEGRITY`: the `verovio-url`
and the two integrity values a page passes to the element for that copy.
They are plain strings, so importing them does not load Verovio.

The worker downloads the module and checks it against
`verovio-integrity`, then downloads the `.wasm` from beside the
`verovio-url` (never from the `blob:` URL the module is imported from),
checks it against `verovio-wasm-integrity` and only then compiles it. A
module that does not fit its digest, a `.wasm` that does not fit its own,
a `.wasm` that is missing or fails to download, or a Verovio other than
6.4.1 falls back to the package's own copy, once, with a warning naming
the reason, as for any `verovio-url` with `verovio-integrity`. A failed
`.wasm` falls back as soon as it fails, not at the 60-second load
deadline.

**`verovio-wasm-integrity` is required whenever `verovio-integrity` is
set for a build that loads a separate `.wasm`**: a module digest alone
would leave the `.wasm` unchecked, so without it the load fails with
"verovio-wasm-integrity is needed for a Verovio that loads a separate
.wasm" and the package's own copy loads instead. A wasm digest without a
module digest is supported: the `.wasm` is checked and the module is not,
and, as for any `verovio-url` without `verovio-integrity`, there is no
fallback, so a mismatch is a score that can't be drawn. A malformed
`verovio-wasm-integrity` is refused like a malformed `verovio-integrity`.
Stock Verovio, which embeds its WebAssembly, ignores
`verovio-wasm-integrity` and loads as usual, but the progress shows less:
the digest marks the `.wasm` as the download to measure, and stock never
fetches one, so its module's download is shown without a percentage and
"Preparing…" is never announced. Set `verovio-wasm-integrity` only with a
build that loads a separate `.wasm`.

A page with a Content-Security-Policy needs the CDN's origin in
`connect-src` (the worker fetches both files), `blob:` in `script-src`
(the module is imported from a `blob:` URL) and `'wasm-unsafe-eval'` in
`script-src`, which stock Verovio needs as well.

Without `verovio-url` the same rules apply to the package's own copy: its
glue fetches `verovio-module.wasm` from beside the worker, on your own
origin, so `connect-src` must allow that origin, and `script-src` needs
`'wasm-unsafe-eval'` to compile it. If that fetch is blocked, stock
Verovio loads instead, with the warning above.

The build leaves out what this package never asks Verovio for: only the
Leipzig font, no footer, no tablature or staff tunings, and no compressed
MusicXML (`.mxl`). If you pass your own MusicXML to `engraveXml` with a
toolkit from `@barmark/engraver`, see [its limits](../engraver/README.md#limits).

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

With `switch="off"` there is no switch for `"intent"` to watch, so use
`"idle"`, or set `preload="idle"` when your own control is reached. Where
the reader has asked to save data, or is on a 2G connection, neither
loads early: Verovio then loads on the first switch to the score.

### When the score can't be drawn

If Verovio fails to load, or rejects the MusicXML, or the chart will not
export or is too large to draw (see "Engraving directly"), or Verovio
takes over 60 seconds to load or 20 seconds to engrave, the grid stays and
a note by the switch says "The score couldn't be drawn". The same happens
when `verovio-url`, `verovio-integrity` or `verovio-wasm-integrity` is
refused, when the chart's `src` could not be loaded, or when the
engraving is not clean SVG. The Score radio is disabled until the
chart (`text`, `src` or the script child), `verovio-url`,
`verovio-integrity` or `verovio-wasm-integrity` changes.

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

With `switch="off"` the note still shows, alone above the grid, and the
page's own Score control has to follow the element. After `scoreerror`,
setting `view` to `"score"` is put back to `"grid"` with no event, until
the chart or a `verovio-*` attribute changes (which enables Score again,
also with no event). So disable your Score control on `scoreerror`, or
read `view` back after setting it.

Set `view` from script only once the element is defined: a property set
on the element before its module has loaded is lost. Before that, set the
attribute (`setAttribute("view", "score")`, which the element reads as it
loads), or wait for `customElements.whenDefined("barmark-score")`.

## On the server

```js
import { renderScoreHtml } from "@barmark/score/server";

const html = renderScoreHtml(chartText, { fontUrl: "/fonts/Edwin-Roman.otf" });
```

`renderScoreHtml` takes `@barmark/render`'s options plus `view`, and
`switch: false`, which writes `switch="off"` on the element so it leaves
its own Grid / Score switch out. It never
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
which is LGPL-3.0-only. The worker loads, by default, `@barmark/engraver`,
a modified build of Verovio 6.4.1 (LGPL-3.0-only), made by barmark, not by
the Verovio project, and an ordinary npm dependency of this package. Its
[`NOTICE.md`](../engraver/NOTICE.md) says what was changed, and the
Corresponding Source for each release is attached to its GitHub release.
Stock `verovio` is also a dependency, loaded unchanged: it runs if the
lighter build does not, and supplies the toolkit class. Verovio's code is
never copied into this package. barmark's own code stays MIT. Verovio © Laurent Pugin and others; its licence text is
[COPYING.LESSER](https://github.com/rism-digital/verovio/blob/develop/COPYING.LESSER).

A site that bundles the worker ships Verovio inside its bundle: by default
`@barmark/engraver`'s modified build, and stock Verovio too unless the
bundler splits it into a chunk of its own. Keeping each as a separate file
(through `verovio-url`, or the bundler's own chunk) and keeping its notice
is the easy way to meet the LGPL. For the lighter build the notice to keep
is `@barmark/engraver`'s
[`NOTICE.md`](../engraver/NOTICE.md), and the source to point at is its
Corresponding Source, attached to each `engraver-v*` GitHub release, not
only Verovio's own repository. If either is bundled into one file with the
worker instead (Vite's default `iife` worker format does this), credit it
with its copyright and licence, host or link the LGPL and GPL texts, and
link your site's source and the Corresponding Source so a visitor can
rebuild it with another Verovio; barmark.dev does all three in its footer.
This is not legal advice.
