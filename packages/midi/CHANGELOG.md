# Changelog

All notable changes to `@barmark/midi` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- `@barmark/midi/perform`: `perform(parse, options?)` turns a parsed
  chart's play order into timed notes in exact quarter notes: a chord
  symbol as its bass in E2–D♯3 under each chord tone in C4–B4 (the bass
  alone, in E1–D♯2, on `electric bass` or `double bass`), note sets and
  voicings exactly as written (without octaves, rising from octave 4),
  every named slot re-attacking and `/` holding across bar lines. One
  track for now. `secondsAt(performance, at)` reads the tempo map.
