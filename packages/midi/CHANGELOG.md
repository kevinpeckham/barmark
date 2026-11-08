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
- Rhythm figures in the performance: an accent sounds at velocity 100
  and a hit at 112 for its whole slot (a `/` after it holds it); a push
  attacks an eighth or a sixteenth early, taking the time from the slot
  played before it in play order, across bar lines, repeats and replays;
  the sustain pedal as controller 64 presses, changes (lift, then press,
  at one time) and lifts, with `--`, a tacet bar and the chart's end
  lifting it; and swing (`swing`, `shuffle`, `swing 16`, with or without
  an amount) moving every second eighth (or sixteenth) after pushes, so a
  pushed "and of 4" swings. Compound meters aren't swung, with one
  `swing-compound` loss.
- The performance's tempo map, meters, keys, markers, words and lyrics:
  tempo in quarter notes a minute from the meter's beat (6/8 at
  `tempo: 60` is 90), with a new tempo wherever a bar's differs, a meter
  change included; 120 (or the `tempo` option) for a chart with none,
  with a `tempo-assumed` loss; `rit.` and `accel.` as a tempo a beat,
  reaching the target at the downbeat of the run's last bar and holding
  it (80% or 120% with no target); a fermata playing the beat before it
  at a third of the tempo, the bar grid unchanged. Keys where they
  change (a church mode other than aeolian with a `mode` loss); each
  section occurrence's heading and each rehearsal mark as a marker, in
  play order; words on a bar at the slot they precede; each sung
  syllable as MuseScore writes it (a space ending a word, `‿` joining an
  elision, verses in order at one time); an open repeat played once with
  an `open-repeat` loss.
