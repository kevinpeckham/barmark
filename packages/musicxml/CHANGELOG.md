# Changelog

All notable changes to `@barmark/musicxml` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **Instruments from the part line** (barmark's grammar 7.3): a part's
  `instrument:` chooses its clef, staves and playback sound over the
  guess from its name. A transposing instrument is written at its pitch:
  a trumpet in Bb a major second up, an alto sax a major sixth, a tenor
  sax a ninth, with the key signature, the notes and the chord symbols'
  roots and basses all written, and a `<transpose>` taking them back. The
  bass's octave transposition is unchanged.
- **`clef:`** fixes a part's clef for the whole part, one staff, with no
  clef changes; `alto` writes a C clef on the third line.

## [0.3.0] - 2026-11-04

### Added

- **Rhythm slashes:** a bar where something sounds anew off the beat (a
  push's early note, a group's member, a triplet) shows its rhythm:
  stemmed slash noteheads, with a chord's `/` holds joined to it, outside
  slash style. `| D / / /_G |` is a half tied to a dotted quarter, then
  an eighth. Bars on the beat keep stemless slashes in slash style.
- **Beams:** eighths and shorter beam within a beat, sixteenths on a
  second level (a lone one hooks); in 4/4 a half bar of plain eighths
  beams as one. Rests, longer values and stemless slashes break a beam.
- **Instruments from the part's name**, on whole words in any case: a
  bass (`Bass`, `Bass Guitar`, `Electric Bass`, … but not `Bassoon` or
  `Bass Voice`) is written an octave up in bass clef with a
  `<transpose>`; a guitar has the treble 8vb clef; a keyboard (`Piano`,
  `Keys`, `Organ`, `Rhodes`, `Synth`, …) is on two staves. Each gets a
  `<score-instrument>` and a General MIDI program (Electric Bass 34,
  Electric Guitar 28, Piano 1), so a program picks a sound. Other parts
  are as before.
- **Keyboards on two staves:** treble and bass, notes split at middle C
  (a note set across it splits, an arpeggio moves between staves),
  slashes and chord symbols on the upper staff, a whole-bar rest on
  the lower where it has nothing to play; voice 1 and voice 5, joined by
  `<backup>`.

### Changed

- **Note values follow the meter:** in 4/4 and 2/2 a value never hides
  the middle of the bar unless it starts the bar and fills whole beats;
  a value off the beat in other meters, and a rest off the beat in any,
  is cut at the next beat. `| {C4} {D4} / {E4} |` writes D4 as two tied
  quarters. In 6/8, 9/8 and 12/8 a value shows its whole beats (a dotted
  quarter tied to an eighth), and 12/8 shows its middle. A hold after a
  triplet's note ties on rather than stretching the triplet past its
  beat, and a chord's hold that opens a bar showing its rhythm ties from
  the bar before.
- **Clefs by bars:** a part is bass when most of its bars sit below
  middle C (a bar of slashes counts as treble), not when most of its
  notes do, so one long pedal note no longer makes a chart of slashes
  bass. A run of two bars or more on the other side, or one bar needing
  more than three ledger lines, changes clef for the run; a bar of rests
  inside a run keeps its clef. A slash sits on its staff's middle line.

What every export sounds is unchanged: a test freezes each example's
and each grammar example's sounding notes and chord symbols.

## [0.2.0] - 2026-11-04

### Added

- **Credits** (barmark's grammar 7.5): each `composer:`, `lyricist:` and
  `arranger:` line is a `<creator>` of that type, in that order, and each
  `copyright:` line a `<rights>`, as Dorico's own export writes them. An
  exported part carries the chart's credits. No `<credit>` page text:
  Dorico ignores it on import, and a program that sets credits from
  `<creator>` would print them twice.

### Fixed

- **`/` holds what was sounding** (grammar 2.3), not always a slash. After
  a note set or voicing it lengthens those notes in the same bar
  (`| {G2} / / {G2} |` is a dotted half and a quarter) and
  ties them over a bar line, so a pedal note `| {D2} | / | / |` sounds
  through; after `--` it stays a rest. Only a chord's hold is a slash.
  Before, a held note set exported as chordless slashes and played
  nothing.

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

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.3.0...HEAD
[0.3.0]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.2.0...musicxml-v0.3.0
[0.2.0]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.1.2...musicxml-v0.2.0
[0.1.2]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.1.1...musicxml-v0.1.2
[0.1.1]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.1.0...musicxml-v0.1.1
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/musicxml-v0.1.0
