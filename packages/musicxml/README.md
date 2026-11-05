# @barmark/musicxml

Export [barmark](https://barmark.dev) chord charts to MusicXML 4.0, so a
chart opens in MuseScore, Dorico, Sibelius or Finale with the same bars,
chords, repeats, sections and parts, and plays in the chart's play order.

```sh
npm install @barmark/musicxml
```

```ts
import { exportMusicXml } from "@barmark/musicxml";

const result = exportMusicXml(text); // or exportMusicXml(text, { part: "Gtr" })
if (result.ok) save("chart.musicxml", result.xml);
else console.error(result.diagnostics);
```

Options: `part`, the label of one part to export alone, and `title`, a
title for a chart that has none. `exportMusicXml` never throws. A chart with an error returns
`{ ok: false, diagnostics }` and no XML; otherwise `{ ok: true, xml,
diagnostics }`, where the diagnostics are warnings. The
[`barmark` command](https://www.npmjs.com/package/@barmark/cli) does the
same from a terminal: `barmark export --musicxml chart.md --out
chart.musicxml`.

## What it writes

A `score-partwise` file, one part per `part:` (a chart with none is one
part, "Chart"), at concert pitch except where an instrument transposes:

- **Chords** are `<harmony>` symbols over slash notes, with barmark's own
  spelling shown and `<degree>`s that make the exact chord. barmark never
  invents a melody.
- **Note sets and voicings** (`{C E G}`, `Cmaj7{E3 G3 B3}`) are real
  notes; a part whose notes sit low gets a bass clef.
- **Instruments:** a part's `instrument:` gives its clef, staves and
  playback sound; a transposing one (trumpet in B♭, alto and tenor sax)
  is written at its pitch with a `<transpose>`. `clef:` fixes a clef,
  alto included. Without either, the instrument is guessed from the
  part's name.
- **Part lines** (`Pno.RH`, `Pno.LH`): a keyboard's hands on its two
  staves, a third and fourth line as second voices; a one-staff part's
  lines as voices.
- **Pedal:** `+` and `*` are pedal marks with playback, under a
  keyboard's lower staff.
- **Rhythm:** slots, groups (as tuplets, or a dotted figure), holds, silences (rests), `N.C.`,
  accents, hits and pushes (an early, tied note, as played).
- **Order:** repeats, `x N`, endings, `Segno`, `Coda`, `To Coda`, `Fine`,
  `D.C.` and `D.S.` are MusicXML repeats and jumps, so playback follows
  the chart. A replayed section is written out in full; so is a repeated
  section that holds repeats of its own. Measures show barmark's written
  bar numbers.
- **Directives:** key, time, tempo (a metronome mark), rit. and accel.,
  and the feel (MusicXML 4.0 swing).
- **Text:** section headings, rehearsal marks, words on bars, and every
  text line (lyrics, `###` notes) as words, so nothing written is lost.
  In a score of several parts, headings, rehearsal marks, tempo, feel and
  jumps are written once, over the top part.
- **Credits:** the title as the work's title; composers, lyricists,
  arrangers and copyright lines as the file's creators and rights.

## In Dorico

Checked in Dorico Elements 6.2.31, whose MusicXML import handles a few
things its own way:

- **Credits land on the flow, not the project.** The title becomes the
  project's title, but composer, lyricist, arranger and copyright go to
  Flow 1's information, which the default first page doesn't print. In
  File → Project Info, copy Flow 1's fields to the project.
- **Chord symbols are global.** Dorico imports every chord symbol as a
  global one, shown on every staff set to show chord symbols, keeping
  the first part's chord where parts differ. No import setting changes
  this; parts that play different chords need local chord symbols added
  in Dorico.
- **Repeat counts aren't read.** A repeat played more than twice is also
  printed as words ("×3"), since Dorico ignores the count in the file.

Not yet: lyrics placed as `<lyric>` syllables (barmark doesn't place them
by beat), MusicXML import, and MIDI.

## License

MIT
