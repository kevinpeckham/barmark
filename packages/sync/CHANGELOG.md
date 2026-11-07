# Changelog

All notable changes to `@barmark/sync` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

Requires `barmark` 0.19.0 (its key and spelling exports: `keyFromText`, `conventionalKey`, `printKey`, `spellPitch`).

### Added

- **`chartFromDetections`**: a chord chart, and the timing map that places
  it in the recording, from a detector's bar grid and chord runs (in
  seconds or in frames, as Harte labels or barmark symbols). It votes one
  symbol per slot, writes holds as `/` and repeated multi-chord bars (without a `?`) as
  `%`, lays the bars out `barsPerLine` to a line, and never throws:
  problems come back as `BuildDiagnostic`s with twenty codes. Input is
  bounded: a symbol over 64 characters or 16 notes is `?`, a section name is
  cut to 200 characters, and a build repairs at most 2,000 section names.
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
