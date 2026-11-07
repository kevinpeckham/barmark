# Changelog

All notable changes to `@barmark/sync` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **Sections, changes, tempo and pickups** in `chartFromDetections`: a
  `title`; `sections`, snapped to the nearest bar, written out in full,
  with repeat and elision marks stripped from their names; `key`, `meter`
  and `tempo` `changes`, snapped to bars and written as directive lines
  (a run is spelled in the key in force where it starts); a `tempo`,
  given or derived from the grid, with a `tempo-grid-disagree` warning
  when it is far from the grid's; and a `pickup`, written as a one-bar
  meter bar on the first line and counted as bar 1 of the timing map.
  The chart now starts with `tempo:` whenever a tempo is given or can be
  derived from the grid.
- **`chartFromDetections`**: a chord chart, and the timing map that places
  it in the recording, from a detector's bar grid and chord runs. It votes
  one symbol per slot, writes holds as `/` and repeated multi-chord bars
  as `%`, lays the bars out `barsPerLine` to a line, and never throws:
  problems come back as diagnostics.
- **The timing map** (`@barmark/sync/timing`): the `TimingMap` format,
  `chartHash`, `checkTimingMap`, `barAt` and `secondsAtBar`.
