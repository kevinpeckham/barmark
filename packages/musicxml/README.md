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
part, "Chart"), everything at concert pitch:

- **Chords** are `<harmony>` symbols over slash notes, with barmark's own
  spelling shown and `<degree>`s that make the exact chord. barmark never
  invents a melody.
- **Note sets and voicings** (`{C E G}`, `Cmaj7{E3 G3 B3}`) are real
  notes; a part whose notes sit low gets a bass clef.
- **Rhythm:** slots, groups (as tuplets), holds, silences (rests), `N.C.`,
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

Not yet: lyrics placed as `<lyric>` syllables (barmark doesn't place them
by beat), MusicXML import, and MIDI.

## License

MIT
