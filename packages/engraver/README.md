A modified build of Verovio 6.4.1 (LGPL-3.0-only), made by barmark, not by the Verovio project.

# @barmark/engraver

[Verovio](https://www.verovio.org) turns MusicXML into SVG. This package is
Verovio 6.4.1 compiled again, smaller, for what
[`@barmark/score`](../score/) asks of it. Report problems with it to
[barmark](https://github.com/kevinpeckham/barmark/issues), not to the
Verovio project. What was changed, and why, is in [NOTICE.md](NOTICE.md).

```
npm install @barmark/engraver
```

**The promise:** for what `@barmark/score` asks of it, it draws exactly what
stock Verovio 6.4.1 draws, byte for byte. A gate checks this on every
change (How it is checked, below). Outside that, see Limits.

| | Stock `verovio` 6.4.1 | `@barmark/engraver` |
|---|---|---|
| Files | one, 7,400,749 bytes (the WebAssembly inside) | `verovio-module.mjs`, 29,534 bytes, and `verovio-module.wasm`, 2,956,941 bytes |
| gzip (level 9) | 2,367,206 bytes | 1,006,333 bytes (11,870 + 994,463) |
| brotli (quality 11) | 1,820,504 bytes | 774,722 bytes (10,621 + 764,101) |

The sizes are `src/info.ts`'s; the compressed sizes were measured with
Node's zlib on 2026-11-10. On one CI run of the gate (Node 22), the build
instantiated in 57 ms against stock's 236 ms, and engraved 1.20 to 1.28
times slower than stock: it is compiled with `-Oz`, smallest first, a
choice recorded in the design (Q1).

## Use

### With `<barmark-score>`

`@barmark/score` 0.4.0 and later load this build when you point it there,
with a digest for each file:

```html
<barmark-score
	src="/charts/peaceful-dreams.chart.md"
	verovio-url="https://cdn.jsdelivr.net/npm/@barmark/engraver@0.1.1/dist/verovio-module.mjs"
	verovio-integrity="sha384-klTppHZB0IPzdIOfSXNr8CbdhJU+1yp5eltjmgp8W3E8uhht5dlRy1mwrBSnmKJO"
	verovio-wasm-integrity="sha384-cBBw1xx6xHEb/I7QDrSFDgImfzzvZVvwru055NG6QbY1zHI/FFLQHjlKdtH7pr5i"
></barmark-score>
```

The worker fetches `verovio-module.wasm` from beside `verovio-url` and
checks it against `verovio-wasm-integrity` before it runs. If either file
fails its check, the score falls back to the package's own stock Verovio
with a warning. `@barmark/score` exports these three values as
`ENGRAVER_CDN_URL`, `ENGRAVER_CDN_INTEGRITY` and `ENGRAVER_WASM_INTEGRITY`,
and this package as `CDN_URL`, `MODULE_INTEGRITY` and `WASM_INTEGRITY` from
`@barmark/engraver/info`.

### On its own

The default export is `createVerovioModule`, as `verovio/wasm`'s is, and
`verovio/esm`'s `VerovioToolkit` wraps it. Use the toolkit of the **same
Verovio version** (`verovio@6.4.1`):

```js
import createVerovioModule from "@barmark/engraver";
import { VerovioToolkit } from "verovio/esm";

const toolkit = new VerovioToolkit(await createVerovioModule());
toolkit.setOptions({ pageWidth: 1000, footer: "none" });
toolkit.loadData(musicXml);
const svg = toolkit.renderToSVG(1);
```

A bundler emits `verovio-module.wasm` beside the chunk, and the module finds
it with `new URL("verovio-module.wasm", import.meta.url)`. To fetch the
WebAssembly yourself, pass Emscripten's `instantiateWasm` hook:
`createVerovioModule({ instantiateWasm(imports, receive) { … } })`.

`@barmark/engraver/info` holds the build's facts as constants:
`VEROVIO_VERSION`, `VEROVIO_COMMIT`, `MODULE_BYTES`, `WASM_BYTES`,
`MODULE_INTEGRITY`, `WASM_INTEGRITY`, `WASM_FILE` and `CDN_URL`.

## Limits

The build keeps only what `@barmark/score` uses. With your own options or
input, this is what it does (measured 2026-11-10 in Node 22 against stock
`verovio` 6.4.1, through `@barmark/score`'s `engraveXml` and the toolkit):

- **Fonts.** Only Leipzig, Verovio's default, is complete.
  - `font: "Bravura"` is accepted, but the SVG defines no glyphs and
    embeds no font: notes, clefs and every other music symbol are missing.
    Nothing is logged.
  - Another music font Verovio knows (`"Leland"` and `"Gootville"` were
    tried) is accepted and draws Leipzig, the same SVG as the default, with nothing
    logged.
  - `fontTextLiberation: true` names Liberation for text but embeds no
    Liberation font, so a viewer draws its own fallback; stock embeds it.
- **Footers.** `footer: "always"` draws no footer, with nothing logged;
  stock draws Verovio's footer graphic. `"auto"` and `"encoded"` drew the
  same SVG as stock on the MusicXML tried, and `"none"` is what
  `@barmark/score` asks for.
- **Tablature and tunings.** A MusicXML `<staff-tuning>` (a tablature
  staff) draws the same SVG as stock. A custom tuning (the `tuningFile`
  option for MIDI) logs `Custom tuning: Invalid or missing file
  tuning-glyphnames.json` and then `SMuFL glyph … not found in glyph
  table`, and its MIDI differs from stock's.
- **Input formats.** MusicXML (uncompressed) is read as stock reads it,
  and MEI's reader is not disabled. `loadData` returns `false` and logs `… import is not
  supported in this build.` for ABC, Plaine & Easie and GABC.
  `loadZipDataBuffer` and `loadZipDataBase64` (compressed MusicXML, `.mxl`)
  return `false` and log `MXL import is not supported in this build.`
  Humdrum and DARMS are not read, as in stock's `verovio/wasm` (npm's
  `verovio/wasm-hum`, `verovio-module-hum.mjs`, reads Humdrum).

## How it is built

No compiled file is in git. `build/` pins every input: Verovio's tag and
commit, emsdk's version and commit, CMake's version and the optimisation
level (`build/versions.env`), the data kept (`build/data.txt`), and the
script (`build/build.sh`). `bun run compile` builds `dist/` from those
(cached in `~/.cache/barmark-engraver`), and fails unless the result matches
`src/info.ts` byte for byte; `bun run compile --update` rewrites
`src/info.ts`. Builds on different machines give the same bytes.

The differences from Verovio's npm build, all listed in
[NOTICE.md](NOTICE.md):

- the link flag `INCOMING_MODULE_JS_API=onRuntimeInitialized,instantiateWasm`,
  so the module accepts `instantiateWasm` (stock's ignores it), and a
  banner comment on the glue: the only change in behaviour;
- `-DCMAKE_INSTALL_PREFIX=/usr/local`, which changes the compiled default
  of the `resourcePath` option. Nothing reads it: Verovio's JavaScript sets
  `/data` before any toolkit is made;
- the Humdrum, PAE, ABC, GABC, DARMS and MXL importers disabled;
- the embedded data trimmed to Leipzig, `Bravura.xml` and `text/`;
- `-Oz`, build paths mapped, the glue minified with Closure, and the
  WebAssembly in a separate file.

## How it is checked

- `src/info.ts` holds each file's size and sha384 digest. `bun run build`
  and `prepack` refuse a `dist/` that does not match it.
- The equivalence gate (`scripts/engraver-equivalence.ts`, in CI on every
  change) engraves barmark's examples, the MusicXML fixtures' charts, the
  grammar's examples and a long chart with stock Verovio and with this
  build, at widths 375 and 1000, and fails on any byte of difference in the
  SVG or the page count.

## Licence

LGPL-3.0-only, as Verovio: [COPYING.LESSER](COPYING.LESSER) and
[COPYING](COPYING), Verovio's own texts. The fonts' data is under the SIL
Open Font License ([OFL.txt](OFL.txt)); Emscripten's and the vendored
libraries' notices are in [THIRD-PARTY.md](THIRD-PARTY.md).

The Corresponding Source, Verovio's source at the pinned commit with
`build/` and the licence files, is attached to each release:
https://github.com/kevinpeckham/barmark/releases/tag/engraver-v0.1.1.
