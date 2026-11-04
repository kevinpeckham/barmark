# Changelog

All notable changes to `@barmark/musicxml` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **Credits** (barmark's grammar 7.5): each `composer:`, `lyricist:` and
  `arranger:` line is a `<creator>` of that type, in that order, and each
  `copyright:` line a `<rights>`, as Dorico's own export writes them. An
  exported part carries the chart's credits. No `<credit>` page text:
  Dorico ignores it on import, and a program that sets credits from
  `<creator>` would print them twice.

## [0.1.2] - 2026-11-04

### Fixed

- **Slash style stops in a bar with a rest:** a part's tacet bars and a
  bar such as `| G -- -- -- |`. Dorico drew beat slashes over the rest
  and hid it, so a tacet piano read as playing.

## [0.1.1] - 2026-11-04

### Fixed

- **Slashes are written one per beat** (dotted quarters in 6/8, 9/8 and
  12/8), not one note per slot. Dorico ends a slash region after the
  last measure that holds a direction or attributes, and showed every
  later bar as a whole-note slash (a hollow diamond). Beat slashes read
  correctly whether or not a program keeps slash style on. Pushes still
  tie across the bar line, and a slot off the beat grid (a third of a
  4/4 bar) keeps its own value.
- **A repeat played 3 or more times also prints "×N"** above its closing
  bar line, as barmark.dev shows it. Dorico ignores `times` on import
  (and doesn't write it on export), so the count was lost there.

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

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.1.2...HEAD
[0.1.2]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.1.1...musicxml-v0.1.2
[0.1.1]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.1.0...musicxml-v0.1.1
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/musicxml-v0.1.0
