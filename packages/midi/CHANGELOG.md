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
  every named slot re-attacking and `/` holding across bar lines.
  `secondsAt(performance, at)` reads the tempo map.
- Rhythm figures in the performance: an accent sounds at velocity 100
  and a hit at 112 for its whole slot (a `/` after it holds it); a push
  attacks an eighth or a sixteenth early, taking the time from the slot
  played before it in play order, across bar lines, repeats and replays
  (a push at least as long as the slot before it stays on the beat, so no
  written chord is lost);
  the sustain pedal as controller 64 presses, changes (lift, then press,
  at one time) and lifts, with `--`, a tacet bar and the chart's end
  lifting it; and swing (`swing`, `shuffle`, `swing 16`, with or without
  an amount) moving every second eighth (or sixteenth) after pushes, so a
  pushed "and of 4" swings. Compound meters aren't swung, with one
  `swing-compound` loss, and neither is a beat with a note off the
  binary grid or one where swing would move a note onto the next
  (sextuplets, or sixteenths under `swing 75%`, play straight, every
  note kept).
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
- Parts and lines in the performance: a track for each part line in
  score order, named by the part (`Electric Guitar 1`) or the part and
  the line (`Piano RH`), with its instrument's General MIDI program
  (piano for a part with no `instrument:`); a chart with no `part:` is
  one track, `Chart`. A melodic instrument's chord symbols (trumpet, the
  saxes, trombone, flute, violin, cello, voice) sound on piano in a
  track of their own, `Voice chords`, while its note sets stay on its
  line's track, so a lead sheet is a `Voice` melody and its chords. A
  tacet part or a resting line sounds nothing; the pedal is on every
  track of its part; lyrics go to the singing line's track and, with
  words, move with a pushed note.
- `exportMidi(text, options?)`: a chart's play order as a format 1
  Standard MIDI File. Track 1 is the conductor: the title (or the
  `title` option) as its name, the credits (copyright as a copyright
  event, the others as `Composer: …` text), the tempo map, time
  signatures (clicking on the meter's beat), key signatures (beyond seven
  sharps or flats written as their enharmonic) and markers; then a track
  for each performed track, with its program at tick 0, its notes
  (note-offs at velocity 64), pedal, lyrics and words. The division is
  the smallest multiple of 480 that makes every time whole, up to 32,640
  and what keeps the chart within SMF's longest time; finer rhythms play
  at 480, rounded but never to nothing, with a `ticks-rounded` loss, and
  a chart too long for any division is an error. Each track has its own
  channel, skipping channel 10; past 15 tracks a part's lines share one
  (by the part's label) and its harmony track another, with a
  `channels-shared` loss. A tempo MIDI can't hold is clamped with a
  `tempo-range` loss; a pitch beyond 0–127 moves by octaves into it. The
  `part` option exports one part as `extractPart` reads it. A chart with
  errors, with no bars, or a `part` naming no part writes nothing. Each
  loss is reported once, at the first bar it happened in. The main entry
  also exports the performance's types and `VERSION`.
