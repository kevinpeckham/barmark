# Changelog

All notable changes to `@barmark/render` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

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
