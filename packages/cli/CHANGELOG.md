# Changelog

All notable changes to `@barmark/cli` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-11-04

### Changed

- **Uses** barmark 0.15.0, @barmark/render 0.13.0 and @barmark/musicxml
  0.2.0. Credit lines (grammar 7.5: `composer:`, `lyricist:`,
  `arranger:`, `copyright:`): `check` reports their errors and warnings,
  `format` and `part` keep them in canonical form, `render` sets them
  under the title and the copyright at the foot, and `export --musicxml`
  writes them as `<creator>` and `<rights>`. `export --musicxml` also
  sounds a held note set's notes, tied across bar lines, instead of
  chordless slashes.

## [0.2.2] - 2026-11-04

### Changed

- **Uses** barmark 0.14.1, @barmark/render 0.12.0 and @barmark/musicxml
  0.1.2: `export --musicxml` stops slash style in a bar with a rest, so a
  part's tacet bars show their rests in Dorico.

## [0.2.1] - 2026-11-04

### Changed

- **Uses** barmark 0.14.1, @barmark/render 0.12.0 and @barmark/musicxml
  0.1.1: `export --musicxml` writes slashes one per beat, and prints a
  repeat count above 2 as "×N", so both read correctly in Dorico.

## [0.2.0] - 2026-11-04

### Added

- **`barmark export --musicxml <file>`:** the chart as MusicXML 4.0,
  through `@barmark/musicxml`, with `--out` and `--part <label>`. A chart
  with errors is not exported; a chart with no title takes its file name,
  less the extension.
- **`--version`** names `@barmark/musicxml` too.

### Changed

- **Uses** barmark 0.14.1, @barmark/render 0.12.0 and @barmark/musicxml
  0.1.0.

## [0.1.8] - 2026-11-03

Uses `barmark` 0.14.1 and `@barmark/render` 0.12.0, pinned exactly: fixes
for charts of several parts, and `render`'s pages name a part with
`show-part`.

## [0.1.7] - 2026-11-03

Uses `barmark` 0.14.0 and `@barmark/render` 0.11.0, pinned exactly:
charts may carry several parts, written as systems (barmark's grammar
7.4), and `render` draws them.

### Added

- **`barmark part <label> <file>`** prints one part of a chart of several
  (barmark's grammar 7.4) as a chart of its own: its own bars, the tutti
  bars, and N.C. where it rests. The part's problems go to stderr, as
  `transpose`'s do; an error, or an undeclared label, exits 1, and
  `--out` is not written from a chart with errors.
- **`render --part <label>`** draws only that part.

## [0.1.6] - 2026-11-03

Uses `barmark` 0.13.0 and `@barmark/render` 0.10.0, pinned exactly:
charts may now name their part (`part: Gtr = Electric Guitar 1`);
`check` and `format` read it and `render` shows it in the header.

## [0.1.5] - 2026-11-03

Uses `barmark` 0.12.0 and `@barmark/render` 0.9.1, pinned exactly:
`render` numbers bars as written, each once, so repeats, endings, jumps
and replays no longer move the numbers.

## [0.1.4] - 2026-11-03

Uses `barmark` 0.12.0 and `@barmark/render` 0.9.0, pinned exactly: charts
may now write rehearsal marks (`@B`), words on a bar (`"solo"`),
omissions (`C7(no3)`), voicings (`Cmaj7{E3 G3 B3}`), accents and hits
(`>D`, `^D`) and pushes (`<D`, `<<D`); `check`, `format` and `transpose`
read them and `render` draws them.

## [0.1.3] - 2026-11-03

Uses `barmark` 0.11.0 and `@barmark/render` 0.8.0, pinned exactly: charts
may now write endings (`|1`, `|2`) and directions (`Segno`, `D.S. al
Coda`, …); `check` and `format` read them and `render` draws them.

## [0.1.2] - 2026-11-03

Uses `barmark` 0.10.0 and `@barmark/render` 0.7.3, pinned exactly. No
change to the command.

## [0.1.1] - 2026-11-02

Uses `barmark` 0.9.0 and `@barmark/render` 0.7.2, pinned exactly: charts
may now write a swing amount (`feel: swing 58%`), and `render` shows it.

### Fixed

- **`format --write` replaces each file whole.** The new text goes to a
  temporary file beside the chart, with its permissions, which then
  takes its name; a failure part-way (a full disk, a folder it can't
  write) leaves the chart as it was and reports "cannot write <file>".
- **`transpose --out` writes nothing when the chart has errors**, and
  says "<file> not written: the chart has errors".
- **An unknown flag reads `unknown flag "--strct"`**, with how to pass a
  file name that starts with `-`, instead of Node's message, which ended
  on an unbalanced quote.

## [0.1.0] - 2026-11-02

The first release of the `barmark` command. Uses `barmark` 0.8.0 and
`@barmark/render` 0.7.1, pinned exactly.

### Added

- **The `barmark` command:** `check`, `format`, `render` and `transpose`
  for `.chart.md` files, on npm and as standalone binaries.

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/cli-v0.3.0...HEAD
[0.3.0]: https://github.com/kevinpeckham/barmark/compare/cli-v0.2.2...cli-v0.3.0
[0.2.2]: https://github.com/kevinpeckham/barmark/compare/cli-v0.2.1...cli-v0.2.2
[0.2.1]: https://github.com/kevinpeckham/barmark/compare/cli-v0.2.0...cli-v0.2.1
[0.2.0]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.8...cli-v0.2.0
[0.1.8]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.7...cli-v0.1.8
[0.1.7]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.6...cli-v0.1.7
[0.1.6]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.5...cli-v0.1.6
[0.1.5]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.4...cli-v0.1.5
[0.1.4]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.3...cli-v0.1.4
[0.1.3]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.2...cli-v0.1.3
[0.1.2]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.1...cli-v0.1.2
[0.1.1]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.0...cli-v0.1.1
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/cli-v0.1.0
