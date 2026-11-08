# Changelog

All notable changes to `@barmark/score` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

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

### Fixed

- The dark theme reaches the notes: Verovio's inner `svg` carries
  `color="black"`, now overridden by the score's styles.
