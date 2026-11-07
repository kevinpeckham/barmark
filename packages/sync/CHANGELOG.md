# Changelog

All notable changes to `@barmark/sync` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **`chartFromDetections`**: a chord chart, and the timing map that places
  it in the recording, from a detector's bar grid and chord runs. It votes
  one symbol per slot, writes holds as `/` and repeated multi-chord bars
  as `%`, lays the bars out `barsPerLine` to a line, and never throws:
  problems come back as diagnostics.
- **The timing map** (`@barmark/sync/timing`): the `TimingMap` format,
  `chartHash`, `checkTimingMap`, `barAt` and `secondsAtBar`.
