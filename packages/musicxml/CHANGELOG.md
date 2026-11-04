# Changelog

All notable changes to `@barmark/musicxml` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-04

### Added

- **`exportMusicXml(text, { part?, title? })`:** a barmark chart as
  MusicXML 4.0 (`score-partwise`) that validates against the MusicXML 4.0
  schema and plays in the chart's play order.
- **Parts:** one part per declared part, each exported as `extractPart`
  gives it, with its tacet bars as measure rests.
- **Chords** as `<harmony>` over slash notes, with degrees that spell the
  exact chord and barmark's own spelling as the kind's text; note sets and
  voicings as real notes.
- **Rhythm:** groups as tuplets, pushes as early tied notes, accents and
  hits as articulations.
- **Order:** repeats, endings and jumps as MusicXML repeats and `<sound>`s;
  replays written out; barmark's written bar numbers shown. Where MusicXML
  can't hold a chart as written (a D.S. or D.C. through a repeated section
  that holds repeats), the chart is written in play order; a push that
  would cross a repeat or a jump stays on the beat, marked "push".
- **Directives and text:** key, time, tempo, rit. and accel., feel,
  headings, rehearsal marks, fermatas, words on bars and text lines.
- **Errors:** a chart with errors, or with no bars, returns its
  diagnostics and no XML; characters XML can't hold are left out.

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.1.0...HEAD
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/musicxml-v0.1.0
