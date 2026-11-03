# Changelog

All notable changes to `@barmark/musicxml` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- `exportMusicXml(text, { part?, title? })`: a barmark chart as MusicXML 4.0
  (`score-partwise`) that validates against the MusicXML 4.0 schema and
  plays in the chart's play order.
  - One part per declared part, each exported as `extractPart` gives it.
  - Chord symbols as `<harmony>` over slash notes, with degrees that spell
    the exact chord; note sets and voicings as real notes.
  - Groups as tuplets, pushes as early tied notes, accents and hits.
  - Repeats, endings and jumps as MusicXML repeats and `<sound>`s; replays
    written out; barmark's written bar numbers shown.
  - Key, time, tempo, rit. and accel., feel, headings, rehearsal marks,
    words on bars and text lines.
  - Where MusicXML can't hold a chart as written (a D.S. or D.C. through a
    repeated section that holds repeats), the chart is written in play
    order; a push that would cross a repeat or a jump stays on the beat,
    marked "push".
  - A chart with no bars is an error, since MusicXML needs a measure;
    characters XML can't hold are left out.

[Unreleased]: https://github.com/kevinpeckham/barmark/commits/main/packages/musicxml
