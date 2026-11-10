# `@barmark/engraver`: design

Status: approved by Kevin (2026-11-10), with his answers to the ten questions at the end. **Kevin** decided
that the lighter Verovio becomes its own npm package in the barmark
family, and named it `@barmark/engraver` (see Name). Everything else is a **design call**
(Claude's, with a reason), open to correction. The questions only Kevin
can answer are at the end. No grammar change.

## Intent

`<barmark-score>` makes a reader download Verovio before the first score
appears. The stock npm module is 7,400,749 bytes (2.36 MB gzip) and takes
about 180 to 240 ms to instantiate. A Verovio 6.4.1 built only for what
barmark uses is about 2.99 MB (1.00 MB gzip, 0.78 MB brotli) and
instantiates in about 60 to 80 ms. `@barmark/engraver` publishes that
build so a site can load it, first by choosing to (`verovio-url`) and
later by default.

Its promise is narrow and checked: **for what `@barmark/score` asks of
it, it draws exactly what stock Verovio of the same version draws.**

## Name

Decided by Kevin (2026-11-10): **`@barmark/engraver`**. The name leaves
out "verovio" on purpose:

- **Audit heuristics.** Supply-chain scanners such as Socket and Snyk flag
  a package that carries another project's name and ships that project's
  binary, modified, from a different publisher. That pattern looks like
  squatting or impersonation.
- **Honesty.** A modified build should not look like the Verovio
  project's own package. What it is gets said plainly in its README
  instead.

Alternatives considered:

- `@barmark/score-engine`: too easily confused with `@barmark/score`.
- `@barmark/verovio-lite`: the same audit risk as `@barmark/verovio`.

The stock npm package `verovio`, Verovio the project and its licence keep
their names everywhere below. The Corresponding Source asset keeps the
name `verovio-6.4.1-source`, because it is Verovio's source.

## Starting point (the spike; details in FINDINGS)

The spike's variant "d3":

- a separate `.wasm` file
- these importers left out: Humdrum, PAE, ABC, GABC, DARMS, MXL
- `data/` trimmed to `Bravura.xml`, `Leipzig.xml`, `Leipzig/`,
  `Leipzig.css` and `text/`
- `-Oz` in both `CMAKE_CXX_FLAGS` and `CMAKE_CXX_FLAGS_RELEASE`
- `--closure 1` on the glue
- built with emcc 7.0.0 and CMake 4.4.4

On 72 engravings its SVG was byte-identical to stock. Engraving is about
20 to 30% slower.

The trimmed data breaks other fonts, `fontTextLiberation`, footers other
than `none`, and tablature tunings. `NO_EDIT_SUPPORT` does not compile at
6.4.1.

PR 1 records these surprises in FINDINGS.md, and also these two:

- the glue ignores `instantiateWasm` unless it is linked with
  `INCOMING_MODULE_JS_API` naming it
- the `.wasm` embeds absolute build paths (Building)

## Package shape

**(design call) A workspace package, `packages/engraver`, holding no
compiled files in git.** The `.wasm` and `.mjs` are built in CI, by the
release workflow, and on the VM. Reason: committing 3 MB of binary per
Verovio upgrade would bloat history for good, and a committed digest
pins every build exactly anyway.

```
packages/engraver/
  build/versions.env  VEROVIO_TAG, VEROVIO_COMMIT, EMSDK_VERSION, EMSDK_COMMIT,
                      CMAKE_VERSION, OPT (-Oz), MODIFIED (date)
  build/data.txt      the data/ entries kept
  build/build.sh      clones Verovio at the tag (refusing a commit mismatch),
                      installs emsdk at the pin, builds, prepends the banner,
                      writes dist/
  build/source.sh     the Corresponding Source bundle (git archive of the commit + build/)
  src/info.ts         the build's facts, committed (below)
  src/index.d.mts     the module's types, the same as verovio/wasm's
  COPYING, COPYING.LESSER, OFL.txt, THIRD-PARTY.md, NOTICE.md
  README.md, CHANGELOG.md, package.json, tests/
```

**The npm tarball** holds `dist/verovio-module.{mjs,wasm}`,
`dist/index.d.mts`, `dist/info.{js,d.ts}`, `build/`, the licence files,
NOTICE.md, the README and the CHANGELOG.

**(design call) The source tarball is not in the npm package.** It is
attached to each GitHub release instead (Compliance). Reason: Verovio's
source is tens of MB, which every install would download.

**Exports** (ESM only):

| Subpath | Target |
|---|---|
| `.` | `dist/verovio-module.mjs`: `export default createVerovioModule`, the same as `verovio/wasm` |
| `./verovio-module.wasm` | the wasm |
| `./info` | constants only |
| `./package.json` | |

`./info` exports these constants:

- `VEROVIO_VERSION` and `VEROVIO_COMMIT`
- `MODULE_BYTES` and `WASM_BYTES`
- `MODULE_INTEGRITY` and `WASM_INTEGRITY` (sha384)
- `WASM_FILE` (`"verovio-module.wasm"`)
- `CDN_URL`

`info.ts` holds the numbers of the build as linked with the flag below.
The spike's re-link gives a 29,355 B glue and a 2,957,295 B wasm; the
final numbers come from the prefix-mapped build.

**(design call) The API matches `verovio/wasm`.** The module has the same
`EXPORTED_FUNCTIONS` (Verovio's `exports.txt`) and the same runtime
methods, so `verovio/esm`'s `VerovioToolkit` at the **same version** wraps
it. Reason: score's worker and `engraveChart` take either module without
a branch.

**(design call) The only behaviour that differs from stock is one link
flag:** `INCOMING_MODULE_JS_API=onRuntimeInitialized,instantiateWasm`.
Review confirmed three things by relinking:

- the `.wasm` is byte-identical with or without the flag
- the hook bypasses the glue's own fetch
- stock ignores the hook

The flag is named in NOTICE.md.

**(design call) A deterministic banner on the glue:** `/*! Modified build
of Verovio 6.4.1 by barmark (not the Verovio project), LGPL-3.0-only: see
NOTICE.md and <release URL> */`. Reason: the glue travels alone on
jsDelivr, so the notice should travel inside it. The digest covers the
banner.

**`package.json`:**

- `"license": "LGPL-3.0-only"`, as upstream
- the description begins "A modified, smaller build of Verovio for
  barmark" and ends with "(Verovio 6.4.1)"

## Versioning

**(design call) Its own 0.x line, with Verovio's version as data.** 0.1.0
is Verovio 6.4.1.

- A Verovio upgrade, or a change to the exports or flags, is a **minor**.
- A build change that alters the bytes but not the SVG (emsdk, flags,
  data) is a **patch**.

Reason: mirroring 6.4.1 leaves a build-only fix nowhere to go,
prereleases (`6.4.1-barmark.1`) are skipped by carets, and npm drops build
metadata.

The tag is `engraver-vX.Y.Z` and the package key is `engraver`. It is added
to `verify-package`, `verify-release`, the CI `package` matrix,
`release.yml` and Swamp's release-check input.

**A Verovio upgrade.** Verovio is now pinned in two packages (score's
stock `verovio` and this build), and `verovio/esm`'s toolkit must match
the module. **(design call) The two move together in one PR:**

- `versions.env` and `info.ts`
- score's exact `verovio` pin
- score's stock constants and its `ENGRAVER_*` literals

Score's test that the two `VEROVIO_VERSION`s agree therefore never sees
`main` half-done. Then release `@barmark/engraver`, then score, then the
CLI (its exact `verovio` pin, as now), then the site. Reason: a
version-check that only `verify:release score` runs would let `main`
carry a mismatch unnoticed until release day.

Q9 asks whether stock may lead when the lite build lags.

A `@barmark/engraver` **patch** changes only digests. It needs a score
patch (new literal values) and a site bump. The CLI is unaffected unless
score's code changed.

## Building

**(design call) emsdk installed at a pinned commit and version.** It
installs the same prebuilt LLVM on any x86-64 Linux. CMake is pinned
through `pip install cmake==4.4.4` in a venv. Docker would not help with
the problem below, which is path-dependence and not tool drift.

**Paths in the output.** The d3 `.wasm` embeds absolute build paths:

- `__FILE__` strings from `…/verovio/src/json/jsonxx.cc` and its header
- the emsdk sysroot's clang resource directory

A runner would therefore produce different bytes from the VM's. `build.sh`
fixes this in three ways:

- It adds `-ffile-prefix-map=$SRC=verovio -ffile-prefix-map=$EMSDK=emsdk`
  to **both** `CMAKE_CXX_FLAGS` and `CMAKE_CXX_FLAGS_RELEASE`, and to the
  link.
- It pins clang's resource directory to a constant: `-resource-dir`
  passed explicitly, under the mapped emsdk prefix, so the string it
  leaves is the same everywhere.
- After the build, it fails if the `.wasm` or `.mjs` contains any
  absolute path (`/home/`, `/tmp/`, `/opt/`, `/Users/`, the runner's
  workspace, or `$SRC` or `$EMSDK` themselves).

**The first implementation step,** before anything else is built on it:
build on the VM and on a GitHub runner, and compare the bytes. If they
still differ, find what else is embedded before going further.

**`src/info.ts` is the anchor.** `bun run build` fails unless the built
files match `info.ts` byte for byte. `bun run build --update` rewrites
`info.ts`, so a PR shows its new digests.

**What ties the published bytes to the inputs (design call, worded
precisely).** npm provenance attests only that the tarball came from
`release.yml` at a commit. The tie between the `.wasm` and the source is:

- a clean rebuild from the pinned inputs
- a byte-identical match with the committed `info.ts`, which anyone can
  repeat with `build/`

**The CI job `engraver`** always runs and is a required check:

1. Restore the emsdk cache (key: the emsdk pins).
2. Restore the dist cache (key: a hash of `packages/engraver/build/**`).
   Only a clean build that matched `info.ts` writes this cache.
3. On a miss, build from clean and check against `info.ts`. On a hit,
   check the cached files against `info.ts`.
4. Run the equivalence gate.
5. Upload `dist/` as an artifact.

A weekly scheduled run ignores the dist cache. **(design call)** Reason:
an ordinary PR then pays a cache restore, not a 6 to 8 minute build on 4
vCPU, and the check is not weakened.

**The `package (N, engraver)` rows** run after `engraver` and download its
artifact into `packages/engraver/dist`. `verify:package engraver` then packs
what is there, with no build step: the package's `prepack` checks
`dist/` against `info.ts` and never compiles. The score `browser` job
uses the same artifact.

**The release workflow (design call): a separate `build-engraver` job**
(timeout 30 min), only for `engraver-v*` tags.

- It builds from clean with no dist cache (the emsdk cache is allowed).
- It checks the result against `info.ts`, runs the gate and uploads
  `dist/`.
- `verify` consumes that artifact, so its 20-minute limit, which already
  covers Playwright, stays as it is.
- After `publish` and `confirm`, an `attach` job like the CLI's adds the
  Corresponding Source bundle and the licence files to the GitHub
  release.

**On the VM:** `cd packages/engraver && bun run build` (cache in
`~/.cache/barmark-engraver/`). Root `bun test` needs no build:
`packages/engraver/tests` checks only what is committed. Those tests check
that:

- `info.ts` and `versions.env` agree
- NOTICE.md names every flag, every data entry and both versions
- the types match `verovio/wasm`'s

### The equivalence gate

**(design call) A root script, `scripts/engraver-equivalence.ts`.** It
needs score's real `engraveXml` and both modules, so putting it in either
package would make a dependency cycle. It runs in the `engraver` job, in
`build-engraver`, and in Swamp's release-check for `pkg=engraver`, in Node
22.

- **Corpus:**
  - `examples/*.chart.md`
  - the `@barmark/musicxml` test fixtures' charts
  - the chart blocks in the grammar draft
  - `packages/musicxml/tests/fixtures/import/*.chart.md`
  - one long chart (a committed fixture of a few hundred bars), so page
    breaks are covered
- **Method:** each chart goes through `exportMusicXml`. Before each
  engraving the script calls `vrv.setOptions({ xmlIdSeed: 1 })`, then
  `engraveXml` at widths 375 and 1000.
- **Pass:** the SVG is byte-identical between stock `verovio/wasm` and
  `dist/` at the same `VEROVIO_VERSION`, and the page counts match. A
  failure names the file and the first differing offset, with context.
- **Guards against an empty pass:** it fails if there are fewer than 60
  engravings, if any engraving is empty, or if `getVersion()` differs.
- **Reports, without gating:** each module's instantiate time, each
  engraving's time, and the slowest one.

## Loading

**The bundler path** (the package's own copy, the default in phase 2):
the glue fetches `new URL("verovio-module.wasm", import.meta.url)` with
`instantiateStreaming`. Bundlers emit the `.wasm` beside the chunk. A
server that does not send `application/wasm` costs only a console
warning, because the glue falls back to an ArrayBuffer.

**The `verovio-url` path.** The glue's digest does not cover a
separately fetched `.wasm`. **(design call) A new attribute,
`verovio-wasm-integrity`, and the worker fetches the `.wasm` itself:**

- The worker calls `m.default({ instantiateWasm })`. Stock ignores the
  hook; `@barmark/engraver` calls it with `(imports, receive)`.
- **A missing `verovio-wasm-integrity` while `verovio-integrity` is set
  is a synchronous throw from the hook:** "verovio-wasm-integrity is
  needed for a Verovio that loads a separate .wasm".
- Otherwise the hook starts an async task:
  1. Resolve `WASM_FILE` against the **`verovio-url`** (not the blob).
  2. Download it with progress (`fetchModule`'s reading code, returning
     bytes).
  3. Check `verovio-wasm-integrity`.
  4. Call `const { instance, module } = await WebAssembly.instantiate(bytes,
     imports)`.
  5. Call `receive(instance, module)`.

  The hook returns `{}`, Emscripten's signal that it will call `receive`
  asynchronously.
- **Fail-closed without hanging:** if the async task fails, `receive` is
  never called and the factory's promise would never settle. So the
  worker awaits `Promise.race([m.default({ instantiateWasm }), failed])`,
  where `failed` is a promise the hook rejects with the task's error. A
  synchronous throw from the hook rejects the factory directly.

  Either way the load fails, and, with `verovio-integrity` set, falls back
  to the package's own copy once with a warning, as today. The engine's
  60-second load deadline stays as a backstop.
- A malformed `verovio-wasm-integrity` is refused like a malformed
  `verovio-integrity`. Without `verovio-integrity`, neither digest is
  required (today's rule).
- `VerovioSource` gains `verovioWasmIntegrity`. Changing the attribute
  clears a failure.

Rejected alternatives, one line each:

- Two tokens in `verovio-integrity`: SRI reads several tokens as "any of
  these".
- A glue that checks its own wasm: the digest would sit inside the file it
  protects.
- `import(verovioUrl)`: a dynamic import in a worker has no integrity
  check.
- A configurable wasm URL: the glue fixes the filename, and the two files
  always sit side by side.
- Teeing into `compileStreaming`: it saves tens of ms. Most of the 60 to
  80 ms is Verovio's start-up. Revisit if browser timing says otherwise.

**Progress.** The glue (29 kB) is reported unmeasured. The `.wasm` is
measured with `downloadMeter`. `expected` (today always 7.4 MB) is looked
up by the file's digest among the known builds (stock module, lite
module, lite wasm). A file with an unknown digest is measured only when
it arrives uncompressed.

**CSP:** `connect-src` for the CDN (both files come by `fetch`), `blob:` in
`script-src`, and `'wasm-unsafe-eval'` (which stock already needs).

**jsDelivr:** CORS `*`, immutable. Implementation records in FINDINGS
whether it compresses `.wasm` and serves `application/wasm`. The
verified path does not depend on either.

## `@barmark/score`

**Phase 1, opt-in (score 0.4.0):**

- `verovio-wasm-integrity`, the hook with its race, and the digest-keyed
  `expected`.
- New exports `ENGRAVER_CDN_URL`, `ENGRAVER_CDN_INTEGRITY` and
  `ENGRAVER_WASM_INTEGRITY`. **(design call)** They are literals:
  `@barmark/engraver` is an exact devDependency, and a test holds the
  literals equal to `packages/engraver/src/info.ts`. Reason: a site that
  doesn't opt in shouldn't install 3 MB.
- **(design call) The option-limits test** (`tests/verovio-options.test.ts`):
  - `LAYOUT`'s keys plus `scale` and `pageWidth` are within an
    allow-list.
  - `footer === "none"`.
  - No `font*` key and no tuning or tablature key appears.
  - A recording fake toolkit run through `engraveChart` over the corpus
    sees only `setOptions`, `loadData` (a string starting `<?xml`, never
    zip data), `getPageCount` and `renderToSVG`.
  - The corpus's MusicXML has no `<staff-tuning` and no `<music-font`.

  `header: "auto"` is allowed: titles use `text/`, and the gate covers
  titled charts.
- The `@barmark/engraver` README states the limits for anyone calling
  `engraveXml` with their own MusicXML. Implementation characterises what
  the build does when asked for Bravura, a footer or tablature, and
  writes it down there.

**Phase 2, the default (a later score minor), only when all of these
hold:**

1. The `engraver` job and the gate have been required checks through at
   least one `@barmark/engraver` release, and the weekly clean rebuild is
   green.
2. **Score's browser job** loads the lite build both ways, including the
   fail-closed, hang and mismatch cases, in Chromium, Firefox and WebKit.
   The extra browsers are for this job only.
3. barmark.dev has served the lite build for at least two weeks with no
   load failure.
4. The site's Vite 8 build and a plain esbuild bundle of the worker each
   emit and find the `.wasm`.
5. Kevin agrees.

Then `own()` imports `@barmark/engraver`, which becomes an exact
dependency. `verovio` stays a dependency for `verovio/esm`.

**(design call) The CLI keeps stock Verovio.** Reasons:

- In Node, engraving speed matters more than size, and `-Oz` costs 20 to
  30%.
- About 4.4 MB is small next to the binary.
- The SVG is identical either way.
- The binaries keep "bundled unmodified".

RELEASING.md step 13's paragraph is unchanged.

## LGPL and OFL compliance (not legal advice)

A modified Verovio (the `.wasm` and the glue) is distributed on npm and
jsDelivr, so the GPLv3 sections that LGPLv3 incorporates apply.

1. **Licence texts:** `COPYING` and `COPYING.LESSER`, verbatim from the
   tag.
2. **A prominent modified-build notice with a date (§5(a)):** in
   NOTICE.md, as the README's first line, in the glue banner, and in each
   release's notes. NOTICE.md says:

   > This is a modified build of Verovio 6.4.1 (© Laurent Pugin and others,
   > LGPL-3.0-only), made by barmark. It is not made or endorsed by the
   > Verovio project; report problems to
   > https://github.com/kevinpeckham/barmark/issues. Modified `<MODIFIED>`.
   > Changes from Verovio's npm build: built from `version-6.4.1` (commit
   > `fbe8f469…`) with emcc `<version>`; importers disabled (Humdrum, PAE,
   > ABC, GABC, DARMS, MXL); bundled data reduced to `<data.txt>`;
   > compiled and linked with `-Oz` and build paths mapped; glue minified
   > with Closure; WebAssembly in a separate file; `instantiateWasm`
   > accepted from the caller. No source file is changed. Only Leipzig is
   > available; see the README for unsupported options. Corresponding
   > Source: `<release URL>`.

   A test holds NOTICE.md to `versions.env`.

   **(design call)** The README's first line says plainly: "A modified
   build of Verovio 6.4.1 (LGPL-3.0-only), made by barmark, not by the
   Verovio project". It links the Corresponding Source and the build steps
   (`build/`, `bun run build`). Reason: the package's name does not say
   Verovio (see Name), so the first line must, and reports belong here.
3. **Corresponding Source (§6), (design call) mirrored:** each
   `engraver-vX.Y.Z` release carries `verovio-6.4.1-source.tar.gz` (a
   `git archive` of the commit), `build/` and the licence files. Reason:
   §6(d) requires us to keep it available for as long as we offer the
   object code, and upstream's repository isn't ours. Emscripten is named
   by exact version as a generally available build tool.
4. **`THIRD-PARTY.md`:**
   - Emscripten's MIT and UIUC notices (its glue, musl, libc++ and
     compiler-rt are in the output)
   - the libraries Verovio vendors
   - `data/text/` (Times metrics) named as **Verovio-derived data under
     Verovio's licence**, not as OFL
5. **OFL:** `Leipzig/`, `Leipzig.xml`, `Leipzig.css` and `Bravura.xml`
   derive from Leipzig and Bravura (SIL OFL 1.1). `OFL.txt` and NOTICE.md
   credit them. No Reserved Font Name is used in our package's name.
6. **The combined work** (a site with score) is unchanged. The module
   stays a separate, replaceable file (`verovio-url`), which is
   §4(d)(1)'s shared-library route.

**Wording to update** (in the PRs below):

- **Score README "Licence":** keep "loaded unchanged" for stock, and add
  "or, if you choose it, the modified build `@barmark/engraver`
  (LGPL-3.0-only, its source published with each release)".
- **Score's `package.json` description:** changes only in phase 2.
- **barmark.dev:**
  - the footer's credit says "a modified build" and links its NOTICE and
    release
  - the FAQ says the site loads a smaller build made by barmark, while
    the CLI carries Verovio unmodified
  - Get Started shows the lite attributes as an option
- **RELEASING.md:** the package table, the rulesets, the Versions section
  (the joint upgrade PR) and the Checks table.

## Release order

1. **PR 1, `packages/engraver`.**
   - It starts with the cross-machine reproducibility check.
   - It contains `build/`, `info.ts`, the licence files and NOTICE; the
     `engraver` CI job; the gate script and the long-chart fixture;
     `verify-package` and `verify-release` entries; `release.yml`
     (`build-engraver`, the tag case, `attach`); Swamp `pkg=engraver`;
     RELEASING.md; FINDINGS.
2. **Kevin's one-time steps** (below), once the cross-machine result is in
   (Q10).
3. **Release `engraver-v0.1.0`.**
4. **PR 2, score 0.4.0** (phase 1, with Chromium browser tests and the
   README), then release it.
5. **CLI patch** ("Uses @barmark/score 0.4.0"; still stock Verovio), then
   the `kevinpeckham/songs` bump.
6. **Site:** score 0.4.0 and the CLI; `site/src/lib/chart.ts` on the
   three `ENGRAVER_*` constants; the footer, FAQ and Get Started text.
7. **Later:** phase 2, by its criteria.

## Kevin's one-time steps (listed, not done)

1. `npm whoami`, then publish a placeholder `@barmark/engraver@0.0.0` with
   `npm publish --access public` (`@barmark` org).
2. npmjs.com → Trusted Publisher: GitHub Actions, `kevinpeckham/barmark`,
   `release.yml`, environment `npm`. Then require 2FA and disallow tokens.
3. Rulesets: add `engraver-v*` to "release tags". Add `engraver` and
   `package (20|22|24, engraver)` to "main"'s required checks, after PR 1
   has run them.
4. `npm` environment: a tag rule for `engraver-v*`.
5. Phase 2's go-ahead.

## Questions for Kevin (with recommendations)

**Decided by Kevin (2026-11-10): yes to all ten recommendations below.** Each "Recommend" now reads as the decision.

1. **`-Oz` or `-Os`?**
   - The size gap is 0.18 MB gzip (about 0.15 s at 10 Mbit/s), paid once
     per site visit.
   - On the other side, `-Os` engraves roughly 10 to 20% faster on every
     engraving.
   - On a phone the download dominates the first score.

   Recommend `-Oz`, with a rule measured where the gate measures, in Node
   22 on CI: if the slowest width-375 engraving passes 500 ms, ship `-Os`
   as a patch (one line in `versions.env`).
2. **Own 0.x versions, or mirror Verovio's number?** Recommend own 0.x
   (0.1.0 = 6.4.1).
3. **Build in CI and the release workflow, never committing the binary?**
   It costs a 30-minute-limit `build-engraver` job per release. Recommend
   yes.
4. **Corresponding Source as GitHub release assets, not in the npm
   tarball?** Recommend yes.
5. **barmark.dev switches right after score 0.4.0,** as phase 2's
   evidence? Recommend yes. It falls back to stock with a warning.
6. **The phase 2 criteria,** including Firefox and WebKit in score's
   browser job and the two-week soak? Recommend as written.
7. **A courtesy note to the Verovio project** (rism-digital, Laurent
   Pugin) with the size findings? Recommend yes, after 0.1.0, framed as
   findings.
8. **The CLI stays on stock Verovio?** Recommend yes.
9. **Score's Verovio upgrades now wait on a working emsdk pipeline. Who
   rebuilds, and may score upgrade stock ahead of the lite build?**
   Recommend:
   - Claude rebuilds on the VM, and the joint PR's CI confirms it.
   - Stock may lead: if the lite build fails at the new version, score
     upgrades stock alone, and the lite build follows within the next
     score release.
   - During that window, a lite module would be one version behind the
     toolkit, and the toolkit must match the module. So the worker
     compares the loaded module's `getVersion()` with the toolkit's
     version and treats a mismatch as a load failure: it falls back to
     the package's own stock copy with a warning. A site that opted in
     gets stock until lite follows, and nothing breaks.
   - The version-equality test reads "equal, or lite marked as lagging"
     in `info.ts`.
   - Phase 2 never ships while lite lags.
10. **Should the cross-machine reproducibility result be in before Kevin
    does the one-time npm steps?** Recommend yes. If the bytes can't be
    made to match across machines, the package's design changes before
    anything is published under its name.
