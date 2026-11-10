# NOTICE

This is a modified build of Verovio 6.4.1 (© Laurent Pugin and others,
LGPL-3.0-only), made by barmark. It is not made or endorsed by the Verovio
project; report problems to https://github.com/kevinpeckham/barmark/issues.
Modified 2026-11-10.

Changes from Verovio's npm build: built from `version-6.4.1` (commit
`fbe8f4695ab0a123cb096e0cf92354b44f7a2fb8`) with emcc 7.0.0; importers
disabled (Humdrum, PAE, ABC, GABC, DARMS, MXL); bundled data reduced to
`Bravura.xml`, `Leipzig.xml`, `Leipzig`, `Leipzig.css` and `text`;
compiled and linked with `-Oz` and build paths mapped; glue minified with
Closure; WebAssembly in a separate file; `instantiateWasm` accepted from the
caller. No source file is changed. Only Leipzig is available; see the
README for unsupported options. Corresponding Source:
`verovio-6.4.1-source.tar.gz`, built by `build/source.sh` and attached,
with `build/` as `engraver-build-0.1.1.tar.gz`, to each `engraver-v*`
GitHub release; for this version,
https://github.com/kevinpeckham/barmark/releases/tag/engraver-v0.1.1.

## What differs from stock, in full

- **The one behavioural change** is the glue banner and the link flag
  `INCOMING_MODULE_JS_API=onRuntimeInitialized,instantiateWasm`, which lets
  a caller pass Emscripten's `instantiateWasm` hook (stock's glue ignores
  it). The `.wasm` is byte-identical with or without the flag. The banner
  is a comment at the top of `verovio-module.mjs` naming this build, its
  licence and this notice.
- **`-DCMAKE_INSTALL_PREFIX=/usr/local`.** Verovio compiles
  `${CMAKE_INSTALL_PREFIX}/share/verovio` in as the default of its
  `resourcePath` option, and `emcmake` would set the prefix to emsdk's
  absolute path on the building machine. This build's default is therefore
  `/usr/local/share/verovio` instead. Nothing reads it: Verovio's JavaScript
  sets the resource path to `/data` before any toolkit is made.
- **Importers disabled** with `-DNO_HUMDRUM_SUPPORT=ON`,
  `-DNO_PAE_SUPPORT=ON`, `-DNO_ABC_SUPPORT=ON`, `-DNO_GABC_SUPPORT=ON`,
  `-DNO_DARMS_SUPPORT=ON` and `-DNO_MXL_SUPPORT=ON`. Stock's
  `verovio/wasm` module already leaves out Humdrum and DARMS; the npm
  package also ships `verovio-module-hum.mjs` (`verovio/wasm-hum`), a
  build with Humdrum. The MusicXML (uncompressed) and MEI
  readers are not disabled.
- **Bundled data:** only `Bravura.xml`, `Leipzig.xml`, `Leipzig`,
  `Leipzig.css` and `text` of Verovio's `data/` are embedded (the list is
  `build/data.txt`). The other fonts, `Bravura/` and `Bravura.css`,
  `Liberation.css`, `footer.svg` and `tuning-glyphnames.json` are left out.
- **Compiler and link flags:** `-Oz` in both `CMAKE_CXX_FLAGS` and
  `CMAKE_CXX_FLAGS_RELEASE` and on the link; `-ffile-prefix-map` for the
  source, emsdk and build roots, and clang's `-resource-dir` passed
  explicitly, so no absolute build path is left in either file;
  `--closure 1` on the glue; the WebAssembly in a separate file,
  `verovio-module.wasm`, beside the glue.

`build/` in this package holds every pinned input and the script that
makes this build (`build/build.sh`); `bun run compile` runs it.

## Fonts

Leipzig and Bravura are licensed under the SIL Open Font License,
Version 1.1. `Leipzig`, `Leipzig.xml` and `Leipzig.css` derive from Leipzig
(© Etienne Darbellay, Jean-Francois Marti and Laurent Pugin), and
`Bravura.xml` from Bravura (© Steinberg Media Technologies GmbH). See
`OFL.txt` for the licence and both copyright notices. No Reserved Font Name
is used in this package's name.

## Other notices

`COPYING` and `COPYING.LESSER` are Verovio's licence texts, verbatim from
`version-6.4.1`. `THIRD-PARTY.md` holds the notices of Emscripten and of the
libraries Verovio vendors that are compiled into this build, and says
what Verovio's tree records about `data/text/`.
