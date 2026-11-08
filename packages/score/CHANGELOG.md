# Changelog

All notable changes to `@barmark/score` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- `<barmark-score>` (import `@barmark/score/element`): the chart as the bar grid or
  as a full score, with a Grid / Score switch (a keyboard radio group). Its
  chart comes from `text`, `src` or a script child, as `<barmark-chart>`'s does,
  and it takes every grid attribute plus `view` (`grid` | `score`) and
  `verovio-url` (resolved against the page, http(s) only); a `viewchange`
  event follows the view. A `view="score"` set before the chart arrives waits
  for it. The score engine loads
  only on the first switch to the score, engraves at the element's width (again
  after a resize), and shows "Loading score…" meanwhile; a score that can't be
  drawn leaves the grid with a note by the switch. A shadow root drawn by
  `renderScoreHtml` is taken over without redrawing the grid. Importing the
  package root registers no element.
- `renderScoreHtml` (from `@barmark/score/server`, which never reaches Verovio) draws
  `<barmark-score>` on the server: the bar grid, the Grid / Score switch and the
  chart text, so the grid shows before any script runs; `decodeCarried` reads the
  text back.
- The package and its engraving core: `engraveChart` turns a chart into
  a full score (MusicXML from `@barmark/musicxml`, engraved by Verovio)
  as one SVG column, or says why the chart will not export.
- Safe, themed score markup: `cleanSvg` drops scripts, `foreignObject`,
  `on*` attributes and links that leave the page; `scorePane` wraps the
  pages in render's `.bm-chart[data-theme]` so the score follows the
  palette (light, dark, auto, print); `scoreStyles` is the score's own
  layout.
- `cleanSvg` is an allow-list: a hand-written scanner keeps only the
  elements and attributes Verovio emits (and its own two stylesheets),
  drops anything else with its content, and throws on markup it cannot
  read cleanly; `engraveChart` turns that into `ok: false`.

- A shared Verovio worker: `engine()` runs every score of a page through
  one module Worker that loads Verovio on first use, and for each element
  only the newest request is answered (`createEngine` takes any
  `WorkerLike`); a crashed worker rejects what is pending and is replaced
  on the next call.

### Fixed

- `renderScoreHtml` reads any `view` but `"score"` as the grid.
- The dark theme reaches the notes: Verovio's inner `svg` carries
  `color="black"`, now overridden by the score's styles.

- `cleanSvg` drops attributes whose value holds a character reference and
  refuses a self-closing `style`, `title` or other raw-text element.
- `renderScoreHtml` with `view: "score"` checks the Grid radio, since the
  grid is what shows before any script runs (and without JavaScript); the
  element keeps `view="score"` and switches once it loads.
- A refusal about the whole chart (line 0) no longer reads "Line 0: …".
