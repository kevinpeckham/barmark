# Changelog

All notable changes to `@barmark/fretboard` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-11-14

### Changed

- **Requires `barmark` 0.24.0**, whose minor release a caret range
  would not reach.
- **A flat sixth gets a shape**: `Cm(b6)` and `Cm(b13)` are the same note
  set and get the same shape, which sounds the flat sixth.

## [0.1.0] - 2026-11-13

### Added

- The package, with its types (`Tuning`, `Shape`, `Barre`) and standard
  guitar tuning (`GUITAR`): guitar chord shapes for barmark chords. It
  draws nothing; standard tuning is the only tuning in 0.1.
- **`shapeFor(slot, voicing?)`**: the shape for a named chord (our own
  table of open and movable shapes, then a finder for every other chord),
  a note set (each note placed on its own string, exactly, with a muted
  string allowed inside; `{C3 G3 E4}` is `x3x0x0`) or a chord with a
  written voicing. It answers `{ ok: true, shape, caveat }` or
  `{ ok: false, reason }` and never throws. `caveat` is `"shell"` for an
  altered chord (`7alt`: root, third and flat seventh), `"voicing-replaced"`
  when the written voicing fits no hand and the name's own shape stands
  in, else `null`. `reason` is `"single-note"` or `"not-playable"`.
- **`shapesFor(slot)`**: ranked alternatives for a named chord, the first
  being `shapeFor`'s, without repeats; `[]` for a note set.
- **`soundsChord(shape, chord, tuning?)`**: whether a shape sounds a chord:
  its lowest note is the chord's bass, every tone the chord needs sounds
  and nothing outside the chord does. **`sounding(shape, tuning?)`** lists
  a shape's MIDI notes.
- **`shapeOf(text)`, `shapeText(shape)` and `shapeFrom(frets)`**: a shape
  from `"x32010"` or from the spaced form (`"x 10 12 12 11 10"`, which is
  what `shapeText` writes when a fret is 10 or more; `shapeOf` reads both
  and throws on anything else), as that text, and from absolute frets with
  its `base` and `barre` worked out.
- **The limits of a shape for a named chord**: at most a 3-fret span, four
  fingers (a barre counts as one finger only at the lowest fret, so the
  ninth chord `x32333` is not used and `C9` is `x3233x`), frets 0 to 15, a
  moved shape never starting above the seventh fret (the table steps aside
  there, and whenever its shape does not sound the chord, so the finder
  answers), at least three
  strings (two for a power chord), no muted string inside (`D/F#` is
  `200232`) and the bass the lowest sounding note, not the lowest string.
  The fifth may be left out of a chord of four or more tones, and the
  ninth and eleventh under a thirteenth. Octaves are sounding pitch, so a
  guitar part written at guitar pitch is an octave off.
- `shapeFor` and `shapesFor` take no tuning in 0.1: only standard guitar
  exists, and the parameter comes with the first other tuning.

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/fretboard-v0.1.1...HEAD
[0.1.1]: https://github.com/kevinpeckham/barmark/compare/fretboard-v0.1.0...fretboard-v0.1.1
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/fretboard-v0.1.0
