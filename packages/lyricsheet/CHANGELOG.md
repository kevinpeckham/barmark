# Changelog

All notable changes to `@barmark/lyricsheet` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Changed

- The package's npm keywords include `chordpro`, so a search for the format
  finds it.

## [0.1.0] - 2026-11-19

### Added

- The package: a barmark chart exported as a lyric sheet in ChordPro's
  text format, and what the export could not carry. It needs `barmark`
  and `@barmark/fretboard`; ChordPro is a separate project that this
  package only writes for. From the command line it is `barmark export
  --lyricsheet` (`@barmark/cli`).
- **`exportLyricsheet(chart, options?)`** answers `{ ok: true, text,
  diagnostics, losses }` or `{ ok: false, diagnostics }` and never
  throws, under Node or Bun. Options: `part` (the part's label), `title`
  (for a chart with none) and `diagrams: "guitar"`. A chart with an
  error, an unknown part or no bars is refused; with `part`, an error
  anywhere in the chart refuses, since the words come from the whole
  chart. Types: `LyricsheetOptions`, `LyricsheetResult`,
  `LyricsheetLoss`, `LyricsheetLossCode`; `VERSION`.
- **The header**: title, credits, key, time and tempo as directives. A
  sheet always has a title line (the chart's, else `title`, else
  `{title: }`).
- **Sung sections** as lyric environments, in play order: each chord
  before the syllable it lands on, a chord on no syllable standing
  alone, `{chorus}` for a replayed chorus singing the same words, a
  repeat singing the same words kept in one environment. `N.C.`, stops,
  `?`, note sets, words, rehearsal marks and fermatas are annotations;
  key, time and tempo changes are written where they happen, each with
  a comment a reader sees; text lines, rit., accel. and feel are
  comments. One part's harmony (the one named, else the first that
  writes chord symbols) and the singer's words.
- **Sections with no words** as grids (`{start_of_grid: label="Intro"
  shape="1+4x4+1"}`), so a chart with no lyrics loses almost nothing: a
  cell per beat of the bar's own meter (6/8 two, 12/8 four), `.` for a
  beat held, `/` for a name played again, `C~G` for chords sharing a
  beat, `%` where the chart wrote it, words as right-margin text and
  rehearsal marks as left-margin text. An occurrence that plays its
  written lines straight through keeps `|:`, `:|`, voltas and `x N`;
  any other (cut by a jump, an ending for several passes) is written as
  played.
- **`diagrams: "guitar"`**: a `{define: Am base-fret 1 frets x 0 2 2 1
  0}` line for every chord name the sheet writes, once each in the
  order first written, between the header and the first section, from
  `@barmark/fretboard`'s shapes. A shape that reaches the fifth fret
  starts at its lowest fretted one, since a diagram is four frets tall.
  A written voicing is the name's shape when every use of the name
  writes that one voicing and a hand can play it. A chord name
  ChordPro's parser rejects is accepted once it is defined.
- **Losses**, each reported once with its bars: `key-mode`,
  `other-parts`, `other-lines`, `stacked-verses`, `chord-moved`,
  `text-changed`, `chord-names`, `note-sets`, `voicing`, `marks`,
  `bar-meter`, `fermata`, `mark-moved`, `no-shape` and `shell-shape`.
  The README's table says what each means.
- **Chart text never reaches a reader as markup.** Brackets, braces and
  angle brackets that would make a tag (even across two syllables) are
  written as parentheses, a lyric line's leading `#` after a space, a
  control character or a Unicode noncharacter as a space, a
  line-ending backslash as `/`; and since ChordPro unescapes `{`
  and `\u{7b}` on every line before it reads it, a backslash before a
  `u` is written with a word joiner (U+2060, drawn as nothing) after
  it. Each is a `text-changed` loss.
- **Bounded time**: linear in the chart, however large a repeat count
  (`x 999999999` after a jump builds no more bars than the chart
  plays).
- Checked by a golden sheet for every fixture chart (with diagrams for
  four); a played yardstick that reads each sheet back into chords and
  words in play order; ChordPro's own `chordpro --strict` on every
  golden, on the maintainer's machine only; scale tests that a
  quadratic fails, the large shapes also under Node; and every chart of
  the corpus, with and without diagrams.

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/lyricsheet-v0.1.0...HEAD
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/lyricsheet-v0.1.0
