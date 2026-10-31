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
