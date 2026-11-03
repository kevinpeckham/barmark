# Changelog

All notable changes to `@barmark/cli` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.5...HEAD
[0.1.5]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.4...cli-v0.1.5
[0.1.4]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.3...cli-v0.1.4
[0.1.3]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.2...cli-v0.1.3
[0.1.2]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.1...cli-v0.1.2
[0.1.1]: https://github.com/kevinpeckham/barmark/compare/cli-v0.1.0...cli-v0.1.1
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/cli-v0.1.0
