# `@barmark/verovio`: design

Status: draft for Kevin (2026-11-10). **Kevin** decided that the lighter
Verovio becomes its own npm package in the barmark family, named
`@barmark/verovio`. Everything else below is a **design call** (Claude's,
with a reason), open to correction. The questions only Kevin can answer
are listed at the end. No grammar change.

## Intent

`<barmark-score>` makes a reader download Verovio before the first score
appears: the stock npm module is 7,400,749 bytes (2.36 MB gzip, 1.82 MB
brotli) and takes about 180 to 240 ms to instantiate. A Verovio 6.4.1
built only for what barmark uses comes to 2,986,532 bytes (1.00 MB gzip,
0.78 MB brotli) and instantiates in about 60 to 80 ms. On the spike's 72
engravings it drew SVG byte-identical to stock.

`@barmark/verovio` publishes that build so that a site can load it, first
by choosing to (`verovio-url`) and later by default. Its promise is narrow
and checked: **for what `@barmark/score` asks of it, it draws exactly what
stock Verovio of the same version draws.**

## What the spike settled (Verovio 6.4.1)

Variant "d3" (the spike's `build-lite.sh`):

- a separate `.wasm` file, not `SINGLE_FILE` (the base64 inlining costs a
  third)
- these importers left out: `NO_HUMDRUM_SUPPORT`, `NO_PAE_SUPPORT`,
  `NO_ABC_SUPPORT`, `NO_GABC_SUPPORT`, `NO_DARMS_SUPPORT`, `NO_MXL_SUPPORT`
  (MusicXML stays)
- `data/` trimmed to `Bravura.xml` (the glyph-name table), `Leipzig.xml`,
  `Leipzig/`, `Leipzig.css` and `text/`
- `-Oz` for compiling and linking. `CMAKE_CXX_FLAGS_RELEASE` must be set
  too, since Verovio's CMake defaults to Release, which is `-O3` and wins
  over `CMAKE_CXX_FLAGS`
- `--closure 1` on the glue
- result: `verovio-module.wasm` 2,957,295 B plus `verovio-module.mjs`
  29,237 B

Other findings:

- Engraving is about 20 to 30% slower than stock. An `-Os` build is a
  middle ground at 1.18 MB gzip.
- `NO_EDIT_SUPPORT` does not compile at 6.4.1.
- The trimmed data breaks: any music font but Leipzig, `fontTextLiberation`,
  footers other than `none`, and tablature tunings.
- A build takes 1 min 41 s on 16 cores. It is byte-identical from clean on
  the same machine (`repro2`, `repro3`).
- emcc 7.0.0 (emsdk commit `1693ce7359fc9694f198694f902a2cc061239b86`),
  CMake 4.4.4.

One more finding, from reading the d3 glue for this design. It is linked
with `INCOMING_MODULE_JS_API=onRuntimeInitialized`, as stock is. That
setting makes the glue **ignore** `wasmBinary` and `instantiateWasm`, and
it checks `locateFile` only for truthiness. The glue always fetches
`new URL("verovio-module.wasm", import.meta.url)`. Imported from a `blob:`
URL, which is how `@barmark/score` imports a `verovio-url` module, that
URL cannot be resolved. "Loading" below changes one link flag to fix this.

## Package shape

**(design call) A workspace package, `packages/verovio`, holding no
compiled files in git.** It keeps the build definition, the facts about
the build, the licence files and a little TypeScript. The `.wasm` and
`.mjs` are built: by CI for each check, from clean by the release
workflow for each publish, and on the VM. Reason: committing 3 MB of
binary for every Verovio upgrade would bloat history for good. A digest
committed in source (below) still pins every build exactly, so nothing is
lost by not committing the binary.

```
packages/verovio/
  build/
    versions.env     VEROVIO_TAG, VEROVIO_COMMIT, EMSDK_VERSION, EMSDK_COMMIT,
                     CMAKE_VERSION, OPT (-Oz), MODIFIED (date)
    data.txt         the data/ entries kept, one per line
    build.sh         the spike's build-lite.sh, made strict: reads versions.env and
                     data.txt, clones Verovio at the tag, refuses a commit mismatch,
                     installs emsdk at the pinned commit and version into a cache dir,
                     builds, prepends the banner, writes dist/
    source.sh        writes verovio-<ver>-source.tar.gz (git archive of the commit)
                     plus build/ (the Corresponding Source bundle)
  src/info.ts        the build's facts (below), committed
  src/index.d.mts    the module's types, the same as verovio/wasm's
  COPYING, COPYING.LESSER   Verovio's own, verbatim from the tag
  OFL.txt            SIL OFL 1.1, for the Leipzig and Bravura metrics in data/
  THIRD-PARTY.md     Emscripten's licence (its glue and libc/libc++ runtime are
                     linked in), and the notices of Verovio's vendored libraries
                     (pugixml, json, crc, tuning-library, midi)
  NOTICE.md          the modified-build notice (Compliance)
  README.md, CHANGELOG.md, package.json
  tests/             cheap tests that need no build (below)
```

**The npm tarball** (`files`) holds `dist/verovio-module.mjs`,
`dist/verovio-module.wasm`, `dist/index.d.mts`, `dist/info.js`,
`dist/info.d.ts`, `build/` (a few kB: how to rebuild it), `COPYING`,
`COPYING.LESSER`, `OFL.txt`, `THIRD-PARTY.md`, `NOTICE.md`, `README.md` and
`CHANGELOG.md`. **(design call) The source tarball is not in the
package.** It is attached to each GitHub release instead (Compliance).
Reason: Verovio's full source with `data/` is tens of MB, which every
`npm install` would download, and GPLv3 §6(d) allows a separate place as
long as the directions are clear.

**Exports** (ESM only, `"type": "module"`):

| Subpath | File | What it is |
|---|---|---|
| `.` | `dist/verovio-module.mjs` (types `dist/index.d.mts`) | `export default createVerovioModule`, the same as `verovio/wasm` |
| `./verovio-module.wasm` | `dist/verovio-module.wasm` | so tools and self-hosters can resolve it |
| `./info` | `dist/info.js` | the constants, with no Verovio in them |
| `./package.json` | | |

`./info` exports these constants:

- `VEROVIO_VERSION` (`"6.4.1"`) and `VEROVIO_COMMIT`
- `MODULE_BYTES` and `WASM_BYTES`
- `MODULE_INTEGRITY` and `WASM_INTEGRITY`, as `sha384-…`
- `WASM_FILE` (`"verovio-module.wasm"`)
- `CDN_URL`, the jsDelivr URL of this package version's `.mjs`

**(design call) The API matches `verovio/wasm` exactly:** a default export
`createVerovioModule(moduleArg?) => Promise<module>`. The module carries
the same `EXPORTED_FUNCTIONS` (Verovio's own `emscripten/exports.txt`)
and the same runtime methods (`cwrap`, `HEAPU8`). So `verovio/esm`'s
`VerovioToolkit` (from stock `verovio` at the **same version**) wraps it
unchanged. Reason: `@barmark/score`'s worker and `engraveChart` then take
either module with no branch. A test imports both modules' types to check
they are compatible, and the equivalence gate checks that they behave the
same.

**(design call) The only behaviour that differs from stock is one link
flag:** `INCOMING_MODULE_JS_API=onRuntimeInitialized,instantiateWasm`. With
it, a caller can hand over the WebAssembly instance itself (Loading).
Stock ignores `instantiateWasm`, so a caller can always pass it. A glue
change does not touch the `.wasm`, and the flag is recorded in NOTICE.md.

**(design call) The glue gets a deterministic banner.** `build.sh`
prepends a one-line comment to the `.mjs`: `/*! Modified build of Verovio
6.4.1 by barmark (not the Verovio project), LGPL-3.0-only: see NOTICE.md
and https://github.com/kevinpeckham/barmark/releases/tag/verovio-vX.Y.Z */`.
Reason: the glue travels alone through jsDelivr and self-hosting, so the
notice should travel inside it. The digest covers the banner.

**`package.json`:**

- `"license": "LGPL-3.0-only"`, matching upstream. The OFL data notice is
  in `OFL.txt` and NOTICE.md.
- `author` names "Laurent Pugin and others (Verovio); build by Kevin
  Peckham".
- The description begins "A modified, smaller build of Verovio for
  barmark".

## Versioning

**(design call) Its own 0.x line, with Verovio's version as data, not as
the package version.** 0.1.0 is Verovio 6.4.1.

- Any Verovio upgrade is a **minor**.
- A build change that changes the bytes but not the SVG (an emsdk bump,
  different flags, a new data entry) is a **patch**.
- A change to the exports or the incoming-API flags is a **minor**.

`VEROVIO_VERSION` and the CHANGELOG name the Verovio in each release. The
package's description ends with "(Verovio 6.4.1)" for npm search. Reason:
mirroring Verovio's version (6.4.1) would leave a build-only fix nowhere
to go. `6.4.1-barmark.1` is a prerelease, which carets skip and npm's
`latest` handles badly. Build metadata (`+verovio.6.4.1`) is dropped by
npm. The rest of the family is 0.x anyway.

**The tag is `verovio-vX.Y.Z`.** The package key is `verovio`, added to
`verify-package`, `verify-release`, the CI `package` matrix, `release.yml`
and the Swamp release-check input.

**What a Verovio upgrade means.** Verovio is now pinned in two places,
and they must agree, since `verovio/esm`'s toolkit and the module are one
version. The order:

1. `@barmark/verovio` minor: a new `versions.env` and `info.ts`. The gate
   compares it against the new stock version.
2. `@barmark/score` release: its exact `verovio` pin, its stock
   constants, and its lite constants (below), all together. A score test
   fails while `VEROVIO_VERSION` differs between `src/verovio.ts` and
   `packages/verovio/src/info.ts`.
3. CLI release (its exact `verovio` pin, as now).
4. Site bump.

A `@barmark/verovio` **patch** changes its digests. That needs a score
patch (new constant values, no API change) and then a site bump. The CLI
release is needed only if score's code changed, and here it did not.

## How it is built

**(design call) emsdk installed at a pinned commit and version, not a
Docker image.** Reason: this is the path the spike proved
byte-reproducible. emsdk installs the same prebuilt LLVM and binaryen on
any x86-64 Linux, so the VM and GitHub's runners run the same tools.
CMake is pinned by version (`pip install cmake==4.4.4` into a venv, as
the spike did). Docker would add a dependency the VM may not have, for no
proven gain. If the cross-machine check below fails, switch to
`emscripten/emsdk:<version>` pinned by digest.

**`src/info.ts` is the anchor.** It commits the four sizes and digests.
`bun run build` (in `packages/verovio`) runs `build.sh` and then **fails
unless the built files match `info.ts` byte for byte**. When the build
inputs change on purpose, `bun run build --update` rewrites `info.ts`, so
the PR diff shows the new digests.

**A CI job `verovio`** (always runs, required):

1. Restore the emsdk cache (key: `EMSDK_COMMIT` + `EMSDK_VERSION`).
2. Restore the dist cache (key: a hash of `packages/verovio/build/**`).
   Only step 3 writes this cache.
3. On a miss: `build.sh` from clean, check against `info.ts`, save the
   cache. On a hit: check the cached files against `info.ts` anyway.
4. The equivalence gate (below).
5. Upload `dist/` as a workflow artifact. The `package (N, verovio)` rows
   and the score browser job use it.

A cache hit means the same inputs were already built from clean by CI and
matched the committed digests. That is the reproducibility claim, so an
ordinary PR costs a cache restore instead of a 5 to 8 minute build on a
4-core runner. **(design call)** Reason: CI time, without weakening the
check. A weekly scheduled run ignores the dist cache and rebuilds from
clean, which catches emsdk downloads that drift under a fixed version
(they should not, but it is cheap to know).

**The release workflow** (`verovio-v*`) always builds from clean, with no
dist cache, and checks against `info.ts`. It runs the gate, then
`verify:package verovio`, publishes with provenance, then attaches the
Corresponding Source bundle and the licence files to the GitHub release
(a job like the CLI's `attach`). npm provenance then attests that the
`.wasm` came from this repo's source through CI.

**On the VM:** `cd packages/verovio && bun run build` (cache in
`~/.cache/barmark-verovio/`). Root `bun test` does **not** need the
build: `packages/verovio/tests` checks only what is committed. Those
tests check that:

- `info.ts` and `versions.env` agree
- NOTICE.md names every flag, every data entry and both versions
- `data.txt` matches the spike's list
- `index.d.mts` matches `verovio/wasm`'s types

**(design call)** Reason: every other package's `bun test` runs without
emsdk, and it should stay that way.

**First implementation step, before anything else is built on it:** build
on the VM and on a GitHub runner and compare. If they differ, take the
Docker fallback above. The spike proved reproducibility only on one
machine.

### The equivalence gate

**(design call) A root script, `scripts/verovio-equivalence.ts`, not a
package test.** Reason: it needs `@barmark/score`'s real `engraveXml`
(`LAYOUT`, `forVerovio`) and both modules. Putting it in either package
would make a dependency cycle.

It runs in the `verovio` CI job, the release workflow, and Swamp's
release-check for `pkg=verovio`. What it does:

- **Corpus:** every `examples/*.chart.md`, the `@barmark/musicxml` test
  fixtures' charts, every chart block in `docs/grammar-v0.1-draft.md`, and
  every `packages/musicxml/tests/fixtures/import/*.chart.md`. Each goes
  through `exportMusicXml`, then `engraveXml` at widths 375 and 1000 with
  `xmlIdSeed: 1` added. That is 72 engravings today, and it grows as the
  corpus grows.
- **Pass:** stock `verovio/wasm` and `@barmark/verovio`'s `dist/` (the same
  `VEROVIO_VERSION`) produce **byte-identical SVG** for every engraving,
  and the page counts match. It fails with each differing file, the first
  differing offset and 200 characters of context on each side.
- **Guards against a vacuous pass:**
  - it fails if the corpus has fewer than 60 engravings
  - it fails if any engraving is empty on either side
  - it fails if the two modules report different `getVersion()`
- **It reports, without failing on them:** each module's instantiate time,
  and the total engraving time for the corpus, so the `-Oz` cost stays
  visible.

## Loading

### The bundler path (the package's own copy, later the default)

`import("@barmark/verovio")` in the worker gives a glue that fetches
`new URL("verovio-module.wasm", import.meta.url)` with
`instantiateStreaming`. Vite and esbuild-style bundlers recognise that
pattern and emit the `.wasm` as an asset beside the chunk. A server that
does not send `application/wasm` costs only a console warning: the glue
falls back to `WebAssembly.instantiate` on an ArrayBuffer. A test in
score's browser suite checks the bundled worker finds its `.wasm` (Vite
7 and 8 through the site's build, and score's own bundled worker).

### The `verovio-url` path: two files, two digests

Today the worker downloads the `verovio-url` with progress, checks
`verovio-integrity` against those bytes, and imports the module from a
`blob:` URL. With a split build, **the glue's digest does not cover the
`.wasm`**, which the glue fetches separately. Nothing in the glue pins the
wasm's bytes. So:

**(design call) A new attribute, `verovio-wasm-integrity`, and the worker
fetches the `.wasm` itself.**

- The worker always passes `instantiateWasm(imports, receive)` to the
  module factory. Stock ignores it. `@barmark/verovio` calls it.
- In the hook, the worker resolves `verovio-module.wasm` against the
  **`verovio-url`** (the real http(s) URL, not the blob). It downloads it
  with progress (the same `fetchModule` reading code, returning bytes)
  and checks `verovio-wasm-integrity`. Then it calls
  `WebAssembly.instantiate(bytes, imports)` and hands the instance to
  `receive`.
- **Fails closed:** if `verovio-integrity` is set and the module asks for
  a wasm while `verovio-wasm-integrity` is absent, the load fails with
  "verovio-wasm-integrity is needed for a Verovio that loads a separate
  .wasm". As with any integrity failure, it then falls back to the
  package's own copy, once, with a warning. A malformed
  `verovio-wasm-integrity` is refused like a malformed `verovio-integrity`.
  Without `verovio-integrity`, neither digest is required (the current
  rule: no digest, no fallback).
- `VerovioSource` gains `verovioWasmIntegrity`. The element observes the
  new attribute, and changing it clears a failure (as the other two do).

Rejected alternatives:

- **Two digests in `verovio-integrity`.** SRI's several-token syntax
  means "any of these", so it would read as the opposite of what it does.
- **The glue checks its own wasm.** That needs a patched glue, and the
  digest would sit inside the file it is meant to protect.
- **`import(verovioUrl)` directly.** A dynamic import in a worker has no
  integrity check.
- **A configurable wasm URL.** jsDelivr and every self-hosting setup keep
  the two files side by side. The filename is fixed by the glue and
  exported as `WASM_FILE`. YAGNI.

**(design call) No `instantiateStreaming` on the verified path.** The
digest must be checked before anything is instantiated. A streaming
compile teed alongside the hash would be safe (compiling runs nothing),
but it saves only the compile of 3 MB, which is a few tens of ms. Most of
the 60 to 80 ms is Verovio's start-up, reading its embedded data. Use the
buffered path. Revisit the tee only if browser timing shows compile time
matters. The bundler path keeps the glue's own `instantiateStreaming`.

**Progress across two files.** The glue (29 kB) is downloaded first and
reported unmeasured. The `.wasm` is then measured with `downloadMeter`.
Today `expected` is always `VEROVIO_MODULE_BYTES` (7.4 MB), which would
be wrong for both lite files, so **(design call)** the worker picks
`expected` by digest from a small table of known builds:

| Digest | `expected` |
|---|---|
| stock module | 7,400,749 |
| lite module | 29,237 |
| lite wasm | 2,957,295 |

A file with no known digest is measured only when it arrives
uncompressed. The progress text ("3.1 of 7.4 MB") is unchanged.

**CSP.** A worker served with its own CSP already needs `blob:` in
`script-src` and the CDN's origin in `connect-src`. Both files come by
`fetch`, so `connect-src` covers both. Compiling WebAssembly from bytes
needs `'wasm-unsafe-eval'` in `script-src`, which stock already needs. The
README says so.

**CORS and MIME.** jsDelivr serves `@barmark/verovio` with CORS `*` and
immutable caching, as it serves `verovio`. Implementation checks that
jsDelivr compresses `.wasm` and serves it as `application/wasm`
(`curl -sI`, recorded in FINDINGS). The verified path does not depend on
the MIME type. The bundler path only warns without it.

## `@barmark/score` integration

**Phase 1, opt-in (score minor, 0.4.0):**

- `verovio-wasm-integrity`, the `instantiateWasm` hook and the
  known-build table, as above.
- New exports from `src/verovio.ts`:
  - `VEROVIO_LITE_CDN_URL`
    (`https://cdn.jsdelivr.net/npm/@barmark/verovio@0.1.0/dist/verovio-module.mjs`)
  - `VEROVIO_LITE_CDN_INTEGRITY`
  - `VEROVIO_LITE_WASM_INTEGRITY`
- **(design call)** These are literals in score, not a runtime import of
  `@barmark/verovio`. Score takes `@barmark/verovio` as an exact
  **devDependency**, and a test holds the literals equal to
  `packages/verovio/src/info.ts` (as `download.test.ts` holds the stock
  constants to the installed file). Reason: in phase 1 a site that does
  not opt in should not install 3 MB it never loads.
- README: a "A smaller Verovio" section with the three attributes,
  the CSP line, the option limits, and the licence wording (Compliance).
- **(design call) The option-limits test** (`tests/verovio-options.test.ts`).
  Score never passes options from callers through to Verovio. This test
  makes that a checked guarantee:
  - `LAYOUT`'s keys plus `scale` and `pageWidth` are within an allow-list.
  - `footer === "none"`.
  - No `font*` key and no tuning or tablature key appears.
  - A recording fake toolkit run through `engraveChart` over the corpus
    sees only `setOptions`, `loadData` (with a string starting `<?xml`,
    never zip data), `getPageCount` and `renderToSVG`.
  - The corpus's MusicXML holds no `<staff-tuning` and no
    `<music-font`.

  The test's comment names `@barmark/verovio` as the reason.
  `header: "auto"` is allowed: titles draw with `text/` (kept), and the
  gate covers titled charts.
- The `@barmark/verovio` README states the limits for anyone calling
  `engraveXml` with their own MusicXML. Implementation characterises what
  the lite build does when asked for Bravura, a footer or tablature (an
  error, garbled output or a silent fallback) and writes it down there.

**Phase 2, default (a later score minor), only when all of these hold:**

1. The `verovio` CI job (clean rebuild matching `info.ts`, plus the
   equivalence gate) has been green and required for at least one
   `@barmark/verovio` release, including the weekly clean rebuild.
2. Score's browser suite loads the lite build both ways (bundled, and
   `verovio-url` with both digests, including the fail-closed and
   mismatch fallbacks) in Chromium, **Firefox and WebKit**. Today's suite
   is Chromium only, and blob imports and wasm hooks are where browsers
   differ.
3. barmark.dev has served the lite build in production for at least two
   weeks with no load failure reported.
4. Bundler check: the site's Vite 8 build and a plain esbuild bundle of
   score's worker each emit and find the `.wasm`.
5. Kevin agrees, since the default changes what every site ships.

At that point, `own()` imports `@barmark/verovio`, which becomes an exact
dependency. Stock `verovio` stays a dependency for `verovio/esm`. The
fallback copy is then the lite one, so a lite failure falls back to lite.
That is acceptable once the criteria hold.

## The CLI

**(design call) The CLI keeps stock Verovio.** Reasons:

- In Node, engraving speed matters more than download size, and `-Oz`
  costs 20 to 30%.
- The binary is tens of MB, so saving about 4.4 MB is a small fraction.
- The equivalence gate means the SVG is the same either way.
- The binaries keep their simple licence story ("bundle it unmodified").

Revisit only if binary size becomes a complaint. RELEASING.md step 13's
"Third-party software" paragraph is unchanged.

## barmark.dev

After the score 0.4.0 release, `site/src/lib/chart.ts` switches its
`verovio-url`, `verovio-integrity` and new `verovio-wasm-integrity` to
the `VEROVIO_LITE_*` constants. The site is phase 2's production
evidence. Text changes on the site:

- The footer's Verovio credit links the `@barmark/verovio` NOTICE and the
  GitHub release that holds the source. It says "a modified build".
- The FAQ's "What engraves the score?" says the site loads a smaller build
  made by barmark, and that the CLI's binaries carry Verovio unmodified.
- Get Started shows the lite attributes as an option beside the stock
  ones.

## LGPL and OFL compliance (not legal advice)

**What is distributed:** a modified Verovio (object code: `.wasm` and
glue) on npm and, through it, on jsDelivr. GPLv3 §§4–6, which LGPLv3
incorporates, then need the following.

1. **Licence texts** in the package: `COPYING` (GPL-3.0) and
   `COPYING.LESSER`, verbatim from the tag.
2. **A prominent modified-build notice with a date (§5(a)).** It appears
   in NOTICE.md, at the top of the README, in the glue banner, and in each
   GitHub release's notes. NOTICE.md says:

   > This is a modified build of Verovio 6.4.1 (© Laurent Pugin and others,
   > LGPL-3.0-only), made by barmark. It is not made or endorsed by the
   > Verovio project; report problems to
   > https://github.com/kevinpeckham/barmark/issues. Modified
   > `<MODIFIED>`. Changes from Verovio's own npm build: built from
   > `version-6.4.1` (commit `fbe8f469…`) with emcc `<version>`;
   > importers disabled (Humdrum, PAE, ABC, GABC, DARMS, MXL); bundled
   > data reduced to `<data.txt>`; compiled and linked with `-Oz`, glue
   > minified with Closure; WebAssembly in a separate file;
   > `instantiateWasm` accepted from the caller. No source file is changed.
   > Only Leipzig is available; see the README for the options this build
   > does not support. Corresponding Source: `<release URL>`.

   `MODIFIED` lives in `versions.env`. It changes whenever the build
   inputs change, and a test checks NOTICE.md agrees with `versions.env`.
3. **Corresponding Source (§6).** Each `verovio-vX.Y.Z` GitHub release
   carries `verovio-6.4.1-source.tar.gz` (the `git archive` of the exact
   commit), the package's `build/` (script, versions, data list) and the
   licence files. **(design call)** It is mirrored there, not only linked
   to rism-digital/verovio: §6(d) lets us use our own server only if we
   keep the source available for as long as we offer the object code, and
   upstream's repository is not ours to keep. NOTICE.md and the README
   give the directions. Emscripten is named by exact version as a build
   tool (a generally available program used unmodified, which §1 leaves
   out of Corresponding Source).
4. **Third-party notices:** `THIRD-PARTY.md` holds Emscripten's MIT and
   UIUC notices (its JS glue, musl, libc++ and compiler-rt are in the
   output) and the notices of the libraries Verovio vendors and builds in.
5. **Fonts:** `data/` holds metrics and glyph outlines derived from
   Leipzig and Bravura (SIL OFL 1.1). `OFL.txt` and NOTICE.md credit them.
   No Reserved Font Name is used in our package's name.
6. **The LGPL "combined work" side** (a site or `@barmark/score` with the
   library) is unchanged. The module stays a separate file that a reader
   can replace (`verovio-url`), which is §4(d)(1)'s shared-library route.

**Wording to update:**

- Score's README "Licence": "an ordinary npm dependency, loaded unchanged
  at run time" stays true of stock. Add: "or, if you choose it, the
  modified build `@barmark/verovio` (LGPL-3.0-only, its source published
  with each release)".
- Score's `package.json` description: "(LGPL-3.0, a dependency loaded
  unchanged)" stays in phase 1. In phase 2 it becomes "engraved by
  Verovio (LGPL-3.0; a smaller build, @barmark/verovio)".
- The site FAQ and footer, as above.
- RELEASING.md: the package table, the tag rulesets, Versions (Verovio is
  now pinned in two packages, and the upgrade order above), and the
  "Checks" table (the `verovio` job; the gate in Swamp).

**(design call) The README says plainly, first line under the title, that
this is a modified build, not the Verovio project's.** LGPL requires only
the modification notice, but the name `@barmark/verovio` could be read as
an official port. Bug reports belong here first, and the Verovio project
should not receive reports about our build.

## `-Oz` or `-Os`

**(design call, Kevin to confirm) `-Oz`.** The gap is 0.18 MB gzip, about
0.15 s on a 10 Mbit/s link, paid once per site visit. On the other side,
engraving is roughly 10 to 20% slower again on each engraving (first view
and every resize). For a reader, the first score waits on download plus
instantiate plus one engraving, and on a phone the download dominates.
The gate reports engraving time for both builds. If the slowest corpus
engraving at width 375 passes 500 ms in Chromium on CI with `-Oz`, build
`-Os` instead: a patch release, one line in `versions.env`.

## Release order

1. **PR 1 (`packages/verovio`):**
   - `build/`, `info.ts`, the licence files and NOTICE
   - the `verovio` CI job, `scripts/verovio-equivalence.ts`
   - `verify-package` and `verify-release` entries, `release.yml` (tag
     case, clean build, attach job)
   - Swamp `pkg=verovio`, the RELEASING.md table
   - FINDINGS entries from the spike: `CMAKE_CXX_FLAGS_RELEASE` overrides
     `-Oz`; `NO_EDIT_SUPPORT` breaks; `INCOMING_MODULE_JS_API` hides
     `instantiateWasm`; the glue's `locateFile` quirk

   It starts with the cross-machine reproducibility check.
2. **Kevin's one-time steps** (below).
3. **Release `verovio-v0.1.0`.**
4. **PR 2 (score 0.4.0):** `verovio-wasm-integrity`, the hook, the
   known-build table, the `VEROVIO_LITE_*` constants, the option-limits
   test, browser tests (Chromium), README and licence wording. Then
   release score.
5. **CLI patch** ("Uses @barmark/score 0.4.0"; still stock Verovio), then
   the `kevinpeckham/songs` bump.
6. **Site:** score 0.4.0 and CLI, `chart.ts` on the lite constants, the
   footer, FAQ and Get Started text.
7. **Later:** phase 2, by its criteria.

## Kevin's one-time steps (listed, not done)

1. On his machine, `npm whoami`, then publish a placeholder
   `@barmark/verovio@0.0.0` (name, version, a one-line README) with
   `npm publish --access public`, under the `@barmark` org.
2. npmjs.com → `@barmark/verovio` → Trusted Publisher: GitHub Actions,
   `kevinpeckham/barmark`, `release.yml`, environment `npm`. Then require
   2FA and disallow tokens.
3. Rulesets: add `verovio-v*` to "release tags". Add `verovio`,
   `package (20, verovio)`, `package (22, verovio)` and
   `package (24, verovio)` to "main"'s required checks, after PR 1 has run
   them once so the names exist.
4. The `npm` environment → Deployment branches and tags: add a tag rule
   `verovio-v*`.
5. Phase 2's go-ahead, when its criteria are met.

## Questions for Kevin (with recommendations)

1. **`-Oz` or `-Os`?** Recommend `-Oz`, with the 500 ms switch rule
   above.
2. **Versioning: its own 0.x (0.1.0 = Verovio 6.4.1) or mirroring
   Verovio's number?** Recommend own 0.x, with Verovio's version in
   `info`, the description and the CHANGELOG.
3. **Build in CI and the release workflow, never committing the binary?**
   It adds about 5 to 8 minutes plus an emsdk download to each
   `verovio-v*` release, and in return npm provenance covers the `.wasm`.
   Recommend yes.
4. **Corresponding Source mirrored as GitHub release assets** (not in the
   npm tarball)? Recommend yes.
5. **Should barmark.dev switch right after score 0.4.0,** as phase 2's
   production evidence? Recommend yes. The fallback to stock with a
   warning covers a failure.
6. **The phase 2 criteria above:** in particular, adding Firefox and
   WebKit to score's browser suite (CI time) and the two-week soak.
   Recommend as written.
7. **Tell the Verovio project?** A courtesy note to rism-digital (Laurent
   Pugin) with the size findings, perhaps offering a size-optimised
   upstream build target. Recommend yes, after 0.1.0 ships, framed as
   findings, not a request. It may also make this package unnecessary one
   day.
8. **The CLI stays on stock Verovio.** Recommend yes. Confirm, since it is
   the one place the two builds differ for users.
