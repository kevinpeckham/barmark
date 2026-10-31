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
