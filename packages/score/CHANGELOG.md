# Changelog

All notable changes to `@barmark/score` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/score-v0.1.0...HEAD
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/score-v0.1.0
