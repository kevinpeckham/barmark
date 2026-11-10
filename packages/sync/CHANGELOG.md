# Changelog

All notable changes to `@barmark/sync` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- `rehashTiming(built, refined, options?)` carries a built chart's timing map
  to a refinement of it (a section named, a chord respelled): the same map
  with the refined chart's hash, checked against it. It refuses, with a
  reason and a message, when there is no map (`no-timing`), the refined
  chart has an error (`unparsed`), it plays another number of bars
  (`bars-differ`), or a played bar's meter changed (`meters-differ`). The
  confidence record is kept when every played bar resolves to as many
  slots, else dropped (`confidenceDropped: true`) with the map kept.
  Exported from `@barmark/sync` and `@barmark/sync/timing`.

### Fixed

- A pickup in 6/8, 9/8 or 12/8 is written in eighths (`[1/8]`, `[2/8]`, `[5/8]` …), its length rounded to whole eighths. Before, it was rounded to whole dotted quarters, so a one-eighth pickup was ignored and a two-eighth one written as `[3/8]`.

## [0.3.0] - 2026-11-09

### Changed

- **Requires `barmark` 0.22.0** (a pickup is bar 0, `ChartParse.pickup`),
  whose minor release a caret range would not reach.
- **Builder diagnostics use written bar numbers.** `BuildDiagnostic.bar` is
  the bar's number in the chart built: a pickup is 0 and the bar after it 1
  (it was the play position, and collisions were shifted by one). The
  timing map, `chartHash`, `barAt`, `secondsAtBar` and confidence records
  are unchanged and still key on the play position, so saved maps stay valid.
- `checkTimingMap` messages about map entries say "map bar N".

## [0.2.1] - 2026-11-08

### Changed

- **Requires `barmark` 0.21.0** (its `PlayedBar.time` and `nameNotes`),
  so an install never pairs this package with a barmark it was not
  tested against. No change in behaviour.

## [0.2.0] - 2026-11-08

### Changed

- **Requires `barmark` 0.20.0**, whose minor release a caret range
  would not reach. No change of its own.

## [0.1.0] - 2026-11-07

The first release. Requires `barmark` 0.19.0 (its key and spelling
exports: `keyFromText`, `conventionalKey`, `printKey`, `spellPitch`).

### Added

- **`chartFromDetections`**: a chord chart, and the timing map that places
  it in the recording, from a detector's bar grid and chord runs (in
  seconds or in frames, as Harte labels or barmark symbols). It votes one
  symbol per slot, writes holds as `/` and repeated multi-chord bars (without a `?`) as
  `%`, lays the bars out `barsPerLine` to a line, and never throws:
  problems come back as `BuildDiagnostic`s with twenty codes. Input is
  bounded: a symbol over 64 characters or 16 notes is `?`, a section name is
  cut to 200 characters, and a build parses section names at most 2,000
  times, dropping any name past that which would need a parse.
- **Titles, sections, changes, tempo and pickups** in the builder: a
  `title`; `sections`, snapped to the nearest bar and written out in full,
  with names checked so they read back as one plain section; `key`,
  `meter` and `tempo` `changes`, written as directive lines before their
  bar (a run that crosses a key change is cut at the change's bar and each
  piece is spelled in its own key); a `tempo`, given or derived as the
  median beat of the grid (half-length and double-length bars folded first), with a `tempo-grid-disagree` warning when it is
  far from the grid's; and a `pickup`, counted as bar 1 of the timing map.
- **The timing map** (`@barmark/sync/timing`): the `TimingMap` format and
  its helpers `chartHash`, `checkTimingMap`, `barAt` and `secondsAtBar`.
- **The confidence record** (experimental): `chartFromDetections` returns
  `confidence` beside the chart, a `ConfidenceRecord` with, per played bar
  and slot, how well the detector's runs back what was written (agreement
  times the runs' own confidence; `?` is 0), and the confidences the input
  gave for `key`, `meter`, `tempo` and `sections`. The shape may change.

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/sync-v0.3.0...HEAD
[0.3.0]: https://github.com/kevinpeckham/barmark/compare/sync-v0.2.1...sync-v0.3.0
[0.2.1]: https://github.com/kevinpeckham/barmark/compare/sync-v0.2.0...sync-v0.2.1
[0.2.0]: https://github.com/kevinpeckham/barmark/compare/sync-v0.1.0...sync-v0.2.0
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/sync-v0.1.0
