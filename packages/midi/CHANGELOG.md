# Changelog

All notable changes to `@barmark/midi` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

## [0.3.4] - 2026-11-14

### Changed

- **Requires `barmark` 0.24.0 (with `@barmark/sync` 0.4.2)**, whose minor release a caret range
  would not reach.
- **A chart with a flat sixth exports**: `Cm(b6)` plays C E♭ G A♭ as
  `Cm(b13)` does. Naming notes on import is unchanged: those notes still
  come back as `Abmaj7/C`.

## [0.3.3] - 2026-11-12

### Changed

- **Swing's compound-meter test uses barmark's `beatsOf`** (grammar
  2.1: 6/8, 9/8 and 12/8) instead of its own copy of the rule. No change
  in what plays.

## [0.3.2] - 2026-11-10

### Changed

- **Requires `barmark` 0.23.0**, whose minor release a caret range
  would not reach. No change of its own: the play order it performs is
  barmark's, so an ending continued onto the lines after it (grammar 5.1)
  plays on its passes only.

## [0.3.1] - 2026-11-10

### Changed

- **Requires `@barmark/sync` 0.4.0**, whose minor release a caret range
  would not reach. No change in behaviour.

## [0.3.0] - 2026-11-09

### Added

- **`MidiLoss.written`**: the written number of the bar a loss happened in
  (0 for a pickup), beside `bar`, which keeps its meaning, the play
  position (`PlayedBar.index`, repeated bars counted). `Performance.bars`
  gains `written` too (required: a `Performance` built by hand needs it).

### Changed

- **Requires `@barmark/sync` 0.3.0 and `barmark` 0.22.0**, whose minor
  releases a caret range would not reach.
- **`importMidi` numbers its diagnostics' `bar` as the chart it writes
  does**: a pickup is bar 0 and the first full bar 1 (it was the pickup as
  bar 1). With no pickup the numbers are unchanged. Sync's diagnostics
  already number so.

## [0.2.0] - 2026-11-08

### Added

- **`importMidi(bytes, options?)`**: a chord chart from a Standard MIDI
  File (format 0 or 1), written by `@barmark/sync`'s builder, so it is
  canonical, in play order, four bars a line. The chords come from the
  harmony's notes, the bar grid, key, meter and tempo from the file's
  meta events (a pickup when sync can write it as whole beats; otherwise
  a bar of its own meter), markers become `## ` headings (two on one
  bar keep the first, `marker-dropped`), and the title is a format 0
  file's track name or a note-less track 1's. Options: `tracks` (the
  harmony's tracks, by number or name), `simile` and `barsPerLine`.
  It never throws: `text` is `""` exactly when a diagnostic is an error,
  and otherwise parses with no errors. Each diagnostic has a code (the
  import's own, or sync's), a message that carries no value read from
  the file, and the played bar it concerns (a pickup is bar 1), counted
  once with its first bars; a tempo or meter barmark can't write is
  dropped with sync's diagnostic.
- **`importMidi` reads lyrics** as lyric rows under the bar lines
  (spec 5.8; `lyrics: false` reads none): the first track with lyric
  events, events at one tick as verses 1, 2, … (up to 100; others
  `lyrics-dropped`), other tracks with lyrics named once
  (`lyrics-other-tracks`). Word ends from spaces (trailing, or leading
  on the next syllable), `‿` as `~`; characters a row can't hold as a
  syllable removed, so a syllable is one syllable or nothing. Each bar
  takes the coarsest even grid that holds its syllables' onsets, with
  `/` while the lyric track sounds and `--` where it doesn't. A
  self-check reparses the chart and drops a verse whose rows don't read
  back as placed (`lyrics-dropped`), keeping the chords and the other
  verses. The bar grid runs to the last lyric. MuseScore's elision
  character (U+E551, and SMuFL's U+E550, U+E552) is `~`. Verses are
  assigned by order at each tick; when the number of lyrics at a tick
  varies, `lyrics-verses-uncertain` warns that verses may be mixed. A
  karaoke file with no lyric events gives its text events as lyrics.
  Before a verse's first syllable a slot is `--`. At most 20,000 lyric
  rows are written; later verses are left out (`lyrics-dropped`).
- **Import checked on MuseScore's own files**: seven files MuseScore
  4.7.6 wrote from scores of ours (a lead sheet, a hymn with a pickup
  and two verses, a band, a comping guitar, a waltz, a pedalled piano
  with no chord symbols, and a band with a bass line, sounding slash
  notes and drums) import to charts read over by hand: the chord
  symbols MuseScore plays, not its slash notes' B; the pickup; two
  parts as one chord line; rehearsal marks as headings. The sustain
  pedal holds every note on its channel, across tracks, as MuseScore
  writes a piano's pedal in one staff's track only. The README
  says what import reads and what it doesn't (melody lines, by design),
  its options, and its diagnostics with their severities.
- **`readSmf(bytes)`**: the Standard MIDI File reader import uses, with
  its diagnostics: format, division and tracks of absolute-tick events
  (notes, programs, controllers, the meta events barmark reads), each
  track's name, and never a throw. Text is UTF-8, else windows-1252; a
  newline or a tab becomes a space, other control characters, line and
  paragraph separators, bidi controls and zero-width spaces are removed,
  and text is cut at 200 characters with "…", never inside a character.

## [0.1.0] - 2026-11-08

### Added

- **`exportMidi(text, options?)`**: a chart's play order as a format 1
  Standard MIDI File. Track 1 is the conductor: the title (or the
  `title` option) as its name, the credits (copyright as a copyright
  event, the others as text labelled by role: `Composer: …`,
  `Lyricist: …`, `Arranger: …`), the tempo map, time
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
- **`@barmark/midi/perform`**: `perform(parse, options?)` turns a parsed
  chart's play order into timed notes in exact quarter notes: a chord
  symbol as its bass in E2–D♯3 under each chord tone in C4–B4 (the bass
  alone, in E1–D♯2, on `electric bass` or `double bass`), note sets and
  voicings exactly as written (without octaves, rising from octave 4),
  every named slot re-attacking and `/` holding across bar lines.
  `secondsAt(performance, at)` reads the tempo map.
- **Rhythm figures** in the performance: an accent sounds at velocity 100
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
- **The tempo map, meters, keys, markers, words and lyrics** in the performance:
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
- **Parts and lines** in the performance: a track for each part line in
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

- **A one-bar meter keeps the tempo of the `time:` around it** (Kevin's
  decision, 2026-11-08, grammar 2.4): in `time: 6/8, tempo: 60` a `[2/8]`
  pickup and a `[3/4]` bar play at 90 quarter notes a minute, like the
  6/8 bars; a rit. or accel. steps a dotted quarter at a time through
  such a bar, and a fermata holds its last dotted quarter (a `[2/8]`
  bar, shorter than one, from its downbeat). Needs barmark 0.21.0
  (`PlayedBar.time`).

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/midi-v0.3.4...HEAD
[0.3.4]: https://github.com/kevinpeckham/barmark/compare/midi-v0.3.3...midi-v0.3.4
[0.3.3]: https://github.com/kevinpeckham/barmark/compare/midi-v0.3.2...midi-v0.3.3
[0.3.2]: https://github.com/kevinpeckham/barmark/compare/midi-v0.3.1...midi-v0.3.2
[0.3.1]: https://github.com/kevinpeckham/barmark/compare/midi-v0.3.0...midi-v0.3.1
[0.3.0]: https://github.com/kevinpeckham/barmark/compare/midi-v0.2.0...midi-v0.3.0
[0.2.0]: https://github.com/kevinpeckham/barmark/compare/midi-v0.1.0...midi-v0.2.0
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/midi-v0.1.0
