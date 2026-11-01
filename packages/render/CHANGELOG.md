# Changelog

All notable changes to `@barmark/render` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Changed

- A little space (0.35 of the chord size) between consecutive bar rows,
  and between bars that wrap onto another line on a narrow screen, so
  one row's bar lines no longer run into the next row's.

## [0.3.0] - 2026-11-01

Draws gradual tempo changes. Depends on `barmark` ^0.5.0, which reads
them.

### Added

- Gradual tempo changes. A `tempo: rit. to 90` line reads
  "→ Tempo rit. to ♩ = 90" (`a tempo` reads as itself), and every bar
  played inside a rit. or accel. has a dashed line along its top, in
  the directive colour, with `data-tempo-change="rit"` or `"accel"`.
  Uses barmark 0.5.0's `tempoChange`.

## [0.2.1] - 2026-11-01

Two fixes found while moving barmark.dev to the element. Depends on
`barmark` ^0.3.0, which warns when a chart has no bar lines.

### Fixed

- **Triplet brackets work on any paper.** The bracket is drawn either
  side of its number, leaving a gap, instead of under it with the number
  painted over in the paper colour. A see-through `--barmark-paper` used
  to show the number in a box.
- **A chart from `renderChart` keeps its options when the element
  loads.** The `<barmark-chart>` it wraps the chart in now carries them as
  attributes (`theme`, `bar-numbers="off"`, `rehearsal-letters`). Before,
  a page that rendered a dark chart on the server and imported
  `@barmark/render/element` saw it switch to the system theme, and lose
  its rehearsal letters once given new `text`.

## [0.2.0] - 2026-11-01

Easier to read, and the bar numbers easier to scan. Every size below was
chosen on barmark.dev. The chart looks different, so check pages that
style it. Requires `barmark` 0.2.0 or later.

### Changed

- **Chords are 16px by default** (`--barmark-size` was `1.25rem`, now `1rem`),
  and no label is under 12px: the meta line, headings, bar numbers, lyrics,
  repeat counts, triplet marks and diagnostics are all larger in proportion.
- **Bar numbers sit flush left** in a fixed gutter, on their row's chord
  baseline. Section headings, lyrics, note lines and mid-chart changes
  start at the first bar line, so a `3/4` never sits among the numbers.
- **Chords start at the left** of their share of the bar instead of centred,
  and no bar is narrower than a bar holding D7sus4.
- **A change written mid-chart names itself** and marks where it takes
  effect: "→ Time 3/4 · Tempo ♩ = 120", with a rule, not a lone "3/4".
- **`###` note lines are italic** at weight 400 (Edwin has no bold, so 600 was
  faked), and lyrics and note lines use Georgia, which has a true italic.
- **A single ringed note** has room inside its ring and sits on the chord
  baseline (it was 1px low).

### Added

- **A `text` property on `<barmark-chart>`** for live editing: set it and the
  chart redraws, batched with attribute changes. While it is a string it
  wins over `src` (no fetch) and the script child; `null` returns to them.
  Text set before the element is defined is kept.
- **`--barmark-text-font` and `--barmark-label-font`**: the fonts for lyrics
  and note lines, and for the meta line, mid-chart changes, headings and
  diagnostics.
- **`--barmark-directive` and `--barmark-note`**: the colours of mid-chart
  changes and of note lines.

## [0.1.0] - 2026-10-31

The first release: barmark charts as an evenly spaced bar grid, as HTML
that needs no script or as the `<barmark-chart>` web component. Requires
`barmark` 0.2.0 or later.

### Added

- **`layoutChart(text)`**: the chart as data to draw. Bar lines become rows
  with their play-order bar numbers (numbering stops after an open repeat),
  `%` becomes the bar it copies, and text lines, directives and lines with
  errors keep their place.
- **Replays are drawn in full** with their own bar numbers. A replay's own
  text lines (verse 2's words) replace the written section's in order;
  `->` marks the bar the parser cut. Optional rehearsal letters (A, B, …,
  AA) mark each section occurrence in play order.
- **`renderChart(text, options)`** returns the chart as a `<barmark-chart>`
  element holding a declarative shadow root, and `renderChartUnwrapped`
  the bare markup (`bm-` classes) for pages that bring the stylesheet.
  Options: `theme`, `barNumbers`, `rehearsalLetters`, `diagnostics`. All
  chart text is escaped.
- **Chords in canonical form,** with ♯ and ♭ glyphs and the extension as a
  superscript; single notes ringed; note sets in braces with the root
  underlined; groups under a tuplet count; fermatas, one-bar meters, N.C.,
  silence and `?` each drawn distinctly.
- **Spoken names:** every bar reads to a screen reader as music ("bar 9: A
  seven sus four, hold"), with sections labelled by their headings and
  repeats spoken ("play 2 times").
- **Styles, light and dark.** The chart follows the system's colour scheme
  (`theme: "auto"`), or is forced `light` or `dark`; printing is always
  light, and Windows High Contrast keeps bar lines and marks visible. Both
  palettes meet WCAG AA contrast. Everything is sized in em from
  `--barmark-size`, and a section too wide for its container wraps its
  rows rather than scrolling sideways. Pages restyle the chart through
  `--barmark-font`, `--barmark-size`, `--barmark-ink`, `--barmark-paper`,
  `--barmark-muted`, `--barmark-rule` and `--barmark-accent`, or
  `::part()`.
- **Edwin ships with the package,** unmodified, with its OFL licence
  (`@barmark/render/fonts/Edwin-Roman.otf`). Pass `fontUrl` to emit its
  `@font-face` rule before the chart, or call `fontFaceCss(url)` once per
  page. The family is registered as "barmark Edwin"; without it the chart
  falls back to Georgia or another serif.
- **`<barmark-chart>`** (`import "@barmark/render/element"`): renders a
  chart from its `src` URL or a child `<script type="text/barmark">`, and
  again when either changes. Attributes (and matching properties):
  `theme`, `bar-numbers="off"`, `rehearsal-letters`. It registers the font
  itself, reuses a server-rendered shadow root (which still follows
  `theme` and `bar-numbers`), fetches a `src` once, renders once per batch
  of changes, and shows a failed load as an error inside the chart.

### Technical

- **Browser tests** (Playwright, Chromium) in CI: the chart looks pixel
  for pixel the same on a page with hostile CSS, themes follow the system
  and the page's custom properties, long rows wrap on a phone and at 400%
  zoom without sideways scrolling, the element renders and re-renders, and
  a screen reader hears "bar 9: D". Run them with `bun run test:browser`.

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/render-v0.3.0...HEAD
[0.3.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.2.1...render-v0.3.0
[0.2.1]: https://github.com/kevinpeckham/barmark/compare/render-v0.2.0...render-v0.2.1
[0.2.0]: https://github.com/kevinpeckham/barmark/compare/render-v0.1.0...render-v0.2.0
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/render-v0.1.0
