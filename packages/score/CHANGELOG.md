# Changelog

All notable changes to `@barmark/score` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **A `scoreerror` event says why the score couldn't be drawn.** Whenever
  `<barmark-score>` shows "The score couldn't be drawn", it fires
  `scoreerror` (`bubbles`, `composed`) with `detail: { reason }`, the
  reason its console warning gives: Verovio failing to load or engrave, a
  refused `verovio-url` or `verovio-integrity`, a `src` that could not be
  loaded, or an engraving that is not clean SVG. Once per failure; a
  retry the chart or a new URL enables fires again if it fails.

### Changed

- **Requires `@barmark/render` 0.19.0** (the tempo beat, the
  `rehearsal-letters` rule), whose minor release the `^0.18` caret would
  not reach.
- **The grid follows `@barmark/render`'s new `rehearsal-letters` rule**:
  no letters beside a chart's own rehearsal marks (`@A`), so the grid's
  headings no longer show two marks, matching the score, which draws only
  the chart's own.

### Fixed

- **The grid's tempo shows the beat it counts**, from `@barmark/render`:
  "♩. = 40" in 6/8, 9/8 and 12/8, where it showed "♩ = 40".

### Technical

- **The README says when Vite needs `worker: { format: "es" }`**: on Vite 8
  too, with `verovio-url`, or the worker inlines Verovio's fallback copy
  and a reader downloads Verovio twice.

## [0.3.0] - 2026-11-10

### Added

- **Loading progress.** While its first score waits, `<barmark-score>`
  shows a themed status region (`role="status"`) and progress bar in
  three phases: "Loading the score engine…" (with a percentage while the
  download can be measured, and "X of Y MB" only when Y is the size
  actually transferred), "Preparing…" while Verovio's WebAssembly
  compiles and "Engraving…". Each phase is announced once; the bar
  carries the percentage and stands still under `prefers-reduced-motion`.
  A `verovio-url` is now downloaded by the worker with progress and
  imported from a `blob:` URL. A compressed response is measured against
  Verovio's decoded size (`VEROVIO_MODULE_BYTES`), never against its
  compressed `Content-Length`, so the bar never runs past 100%. The
  worker's new `Progress` message carries it (`LoadStatus`), and
  `Engine.engrave` takes an `EngraveCall` with `onStatus`
  (`EngineStatus`).
- **`verovio-integrity`.** With an SRI digest (`sha256-`, `sha384-` or
  `sha512-`), the worker checks the `verovio-url` copy with
  `crypto.subtle` before importing it, and on a mismatch or any failure
  to load it warns, naming the reason, and loads the package's own copy
  instead, once. `VEROVIO_CDN_URL` and `VEROVIO_CDN_INTEGRITY` are
  Verovio 6.4.1 on jsDelivr and its sha384, with `VEROVIO_VERSION` and
  the `VerovioSource` type.
- **`preload`.** `"intent"` starts loading Verovio on the first pointer,
  focus or touch on the Score switch; `"idle"` once the page is idle
  (`requestIdleCallback`, or half a second later), or on intent when the
  reader saves data or is on 2G. `"none"`, the default, keeps today's
  behaviour. A preload loads the engine only, shares the page's one load
  and does nothing the second time (`Engine.preload`).

### Changed

- **Verovio is pinned exactly at 6.4.1** (was `^6.4.1`): the decoded size
  and the CDN digest are those of that build.
- **A `verovio-url` is fetched, then imported from a `blob:` URL**, with
  or without `verovio-integrity`, where the worker used to `import()` it
  directly. A worker served with its own Content-Security-Policy needs
  the module's origin in `connect-src` and `blob:` in `script-src`.

## [0.2.0] - 2026-11-09

### Added

- **Limits on what a score may cost, exported.** `EngraveOptions.maxCost`
  and `maxXmlLength`, `scoreCost`, `MAX_SCORE_COST` and `MAX_XML_LENGTH`
  (`engraveChart`), and `createEngine`'s options `grace`, `loadDeadline`
  and `deadline` with their defaults `SUPERSEDED_GRACE_MS`,
  `LOAD_DEADLINE_MS` and `JOB_DEADLINE_MS`, and the `EngineOptions`,
  `Ready` and `WorkerMessage` types. What they bound is under Fixed.

### Changed

- **Requires `barmark` 0.22.0, `@barmark/render` 0.18.0 and
  `@barmark/musicxml` 0.8.0**, whose minor releases a caret range would
  not reach. Grid and Score now number a pickup alike: bar 0, with the
  first full bar 1.

### Fixed

- **A score too large to draw is refused, not attempted.** A short chart
  with repeats can play thousands of bars, and writing a crowded one out
  took gigabytes of MusicXML (and a phone's tab). The export now stops
  writing at `MAX_XML_LENGTH` (50,000,000 characters, `@barmark/musicxml`'s
  new `maxLength`), and before it, as a cheap early refusal, `engraveChart`
  estimates the score's size (`scoreCost`: every played bar's measure in
  every declared part, tacet ones too, each slot, pitch, chord degree,
  syllable and words with the length of its escaped text, and each bar's
  heading, in one pass) and refuses more than `MAX_SCORE_COST`
  (50,000,000) unexported. Either way the reason is "The score is too
  large to draw", so the element shows its note. `EngraveOptions.maxCost`
  and `maxXmlLength` set them. Needs the `@barmark/musicxml` release that
  adds `maxLength`.

- **A slow score no longer holds up every later one.** The worker takes
  one job at a time; a request its element has since replaced is never
  sent, and one already engraving is cut off (the worker is terminated and
  a fresh one takes the requests still waiting) once it has engraved for
  `SUPERSEDED_GRACE_MS` (3 s), so a normal job still finishes and keeps
  the loaded Verovio. A job still loading Verovio is never cut for this.
  Loading Verovio has `LOAD_DEADLINE_MS` (60 s, for a 7 MB download on a
  slow line) and engraving `JOB_DEADLINE_MS` (20 s, from the worker's new
  `Ready` message); past either the job is cut off and its request rejects
  with "The score engine failed", so the element shows its note. A worker
  that crashes fails only the job it was on; the requests still waiting
  run on a fresh one. All three are `createEngine` options (`grace`,
  `loadDeadline`, `deadline`). A fresh worker loads the Verovio the first
  one loaded (its `Ready` says which), so the first `verovio-url` that
  loads still wins for the page.

### Technical

- **The README gives Verovio's copyright and source**, and how to build with
  another Verovio (LGPL-3.0).

## [0.1.1] - 2026-11-09

Requires `@barmark/musicxml` 0.7.2.

### Fixed

- **A chord symbol is drawn as the chart spells it.** Verovio 6.4 appends
  every `<degree>` to the kind text, `print-object="no"` or not, so
  `D7sus4` was drawn `D7sus4(7)` and `G5(7)` as `G5(7)(no3)`. The score
  now drops a degree that is not printed before Verovio reads the
  MusicXML (with `@barmark/musicxml`'s next release, which hides a degree
  its kind text already spells). `Engraved.xml` is the export unchanged.
  The pass is linear (a single `indexOf` scan, no backtracking regex), so a
  hostile MusicXML given to `engraveXml` cannot stall it.
- **The Grid / Score switch follows the element's `theme`.** It sits
  outside the grid's themed `.bm-chart`, and render's `:host{all:initial}`
  reset its colour and font, so on a dark page it was black text in the
  browser's serif. It now takes render's ink and rule for `theme="dark"`,
  for `auto` (or no theme) under a dark colour scheme, and light ones
  otherwise and in print, honouring `--barmark-ink` and `--barmark-rule`,
  in render's label font (`--barmark-label-font`). A page no longer has to
  colour the host itself.
- **Chord accidentals and the tempo's note draw in Chromium.** Verovio
  declares its Leipzig font (the ♯, ♭ and ♩) inside the score's SVG, in the
  shadow root, where Chromium never registers a font face, so `C♯m7` drew
  as `C m7`. The element now copies that face, once per document, into a
  `<style data-barmark-score-font>` in the head. A page that copied it
  itself can drop the copy.

## [0.1.0] - 2026-11-08

First release.

### Added

- `<barmark-score>` (import `@barmark/score/element`, which also registers
  `<barmark-chart>`): the chart as the bar grid or as a full score, with a
  Grid / Score switch (a keyboard radio group). Its chart comes from `text`,
  `src` or a script child, as `<barmark-chart>`'s does, and it takes every
  grid attribute plus `view` (`grid` | `score`) and `verovio-url` (resolved
  against the page, http(s) only); a `viewchange` event follows the view. A
  `view="score"` set before the chart arrives waits for it. The score engine
  loads only on the first switch to the score, engraves at the element's
  width (again after a resize), and shows "Loading score…" meanwhile, the
  first time; a re-engrave keeps the score shown, marked `aria-busy`, until
  the new one lands, so a resize does not blank it. The drawn score is one
  image (`role="img"`) named for the chart's title, or "Score". A score that
  can't be drawn leaves the grid with a note by the switch; a new chart or a
  new `verovio-url` lets the Score radio try again. While `view="score"`
  waits for its chart, Grid is the radio checked, as the grid is what
  shows. Every element on a page shares one worker, so the first
  `verovio-url` that loads is the one used. A shadow
  root drawn by `renderScoreHtml` is taken over without redrawing the grid.
  Importing the package root registers no element.
- `renderScoreHtml` (from `@barmark/score/server`, which never reaches
  Verovio) draws `<barmark-score>` on the server: the bar grid, the Grid /
  Score switch and the chart text, so the grid shows before any script runs;
  any `view` but `"score"` reads as the grid, and `view: "score"` checks the
  Grid radio (the grid is what shows) while the element keeps `view="score"`
  and switches once it loads. `decodeCarried` reads the text back.
- `engraveChart` turns a chart into a full score (MusicXML from
  `@barmark/musicxml`, engraved by Verovio) as one SVG column, or says why
  it cannot (a chart that will not export, a score Verovio cannot read or
  one with no pages: `ok: false`, never a throw; a refusal about the whole
  chart does not read "Line 0: …").
- Safe, themed score markup: `cleanSvg` is an allow-list. A hand-written
  scanner keeps only the elements and attributes Verovio emits (and its own
  two stylesheets) and drops anything else with its content: scripts,
  `foreignObject`, `on*` attributes, links that leave the page and
  attributes whose value holds a character reference. It throws on markup it
  cannot read cleanly (a self-closing `style` or `title`), which
  `engraveChart` turns into `ok: false`. `scorePane` wraps the pages in
  render's `.bm-chart[data-theme]` so the score follows the palette (light,
  dark, auto, print), including the notes, which override Verovio's
  `color="black"`; `scoreStyles` is the score's own layout. `scorePane`
  takes the score's accessible name as an optional third argument (default
  "Score").
- A shared Verovio worker: `engine()` runs every score of a page through one
  module Worker that loads Verovio on first use, and for each element only
  the newest request is answered (`createEngine` takes any `WorkerLike`); a
  crashed worker rejects what is pending and is replaced on the next call.
- The README says how to use the element with Vite: Vite 8 (and Vite+)
  needs no config; Vite 7 needs `optimizeDeps.exclude` and
  `worker.format: "es"`.

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/score-v0.3.0...HEAD
[0.3.0]: https://github.com/kevinpeckham/barmark/compare/score-v0.2.0...score-v0.3.0
[0.2.0]: https://github.com/kevinpeckham/barmark/compare/score-v0.1.1...score-v0.2.0
[0.1.1]: https://github.com/kevinpeckham/barmark/compare/score-v0.1.0...score-v0.1.1
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/score-v0.1.0
