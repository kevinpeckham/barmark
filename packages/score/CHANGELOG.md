# Changelog

All notable changes to `@barmark/score` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

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
  width (again after a resize), and shows "Loading score…" meanwhile; a score
  that can't be drawn leaves the grid with a note by the switch. A shadow
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
  `color="black"`; `scoreStyles` is the score's own layout.
- A shared Verovio worker: `engine()` runs every score of a page through one
  module Worker that loads Verovio on first use, and for each element only
  the newest request is answered (`createEngine` takes any `WorkerLike`); a
  crashed worker rejects what is pending and is replaced on the next call.
