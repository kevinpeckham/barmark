# @barmark/musicxml

Export [barmark](https://barmark.dev) chord charts to MusicXML 4.0, so a
chart opens in MuseScore, Dorico, Sibelius or Finale with the same bars,
chords, repeats, sections and parts, and plays in the chart's play order.
And import the other way: a MusicXML or compressed `.mxl` score from any of
them comes back as a chart (`importMusicXml`, `readMxl`; see [Import](#import)).

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

## Import

```ts
import { decodeXmlBytes, importMusicXml, readMxl } from "@barmark/musicxml";

// bytes: the file's contents (a Uint8Array); UTF-8, or UTF-16 with a byte-order mark
const xml = file.endsWith(".mxl") ? await readMxl(bytes) : decodeXmlBytes(bytes);
const { text: chart, diagnostics } = importMusicXml(xml); // or { part: "Piano" }
```

`importMusicXml` reads a `score-partwise` file into a canonical barmark
chart: chord symbols, credits, keys, meters, tempo, sections, repeats,
endings and jumps, words, parts, and the voicings, note sets and part
lines of parts whose notes act as chords. A part that sings (it has
lyrics, or a `voice.*` instrument sound) keeps its melody: its chords on
its bare line (`Vox |`), its notes with verse 1's syllables on a melody
line (`Vox.Mel | {G4}:maz- / {B4}:ing |`, or the bare line when it has no
chords), `~` for an elision and `:/` for a melisma, MuseScore's ways of
writing both included. Later verses are `lyrics N:` rows under each
system; a section sung again to the same notes with new words is a replay
with its `lyrics:` rows. In a choir each part keeps its own syllables. A
lyric staff (the export's, or MuseScore's one-line "Lyrics" staff of
slashes) comes back as lyric rows. A rhythm barmark can't write snaps to
the nearest it can, with a warning naming the measures; another part's
melody is still left out, its chords kept. A chord symbol barmark can't name
(a Tristan chord) comes in as `?`, its original kept as words on the bar.
It never throws: what couldn't come over is in `diagnostics`, one warning
per kind and part, and a file that gives nothing returns empty `text` and
an error. A file with no chord symbols names the parts that have notes;
`part` (a part's name, abbreviation or id, ignoring case and punctuation)
imports one of them as note sets. The tests read real MuseScore 4 files as
well as the export's own. `readMxl` unpacks a compressed `.mxl` (it needs
`DecompressionStream("deflate-raw")`: Node 20.12 or later, Bun or a
browser) and rejects a damaged or oversized archive with an `Error`.

## What it writes

A `score-partwise` file, one part per `part:` (a chart with none is one
part, "Chart"), at concert pitch except where an instrument transposes:

- **Chords** are `<harmony>` symbols over slash notes, with barmark's own
  spelling shown and `<degree>`s that make the exact chord, unprinted
  (`print-object="no"`) where the spelling already says them. barmark
  never invents a melody.
- **Note sets and voicings** (`{C E G}`, `Cmaj7{E3 G3 B3}`) are real
  notes; a part whose notes sit low gets a bass clef. A marked root
  (`E3!`) is kept as a `<?barmark root?>` processing instruction on its
  note, which other programs ignore and the import reads back as `!`.
- **Instruments:** a part's `instrument:` gives its clef, staves and
  playback sound; a transposing one (trumpet in B♭, alto and tenor sax)
  is written at its pitch with a `<transpose>`. `clef:` fixes a clef,
  alto included. Without either, the instrument is guessed from the
  part's name ("Acoustic Guitar" is barmark's acoustic guitar).
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
  bar numbers. A first bar in a one-bar meter shorter than the `time:`
  (`[1/4]`) is a pickup: measure 0, `implicit`, under the running time
  signature.
- **Directives:** key, time, tempo (a metronome mark), rit. and accel.,
  and the feel (MusicXML 4.0 swing).
- **Lyrics:** syllables on notes (`{G4}:maz-`) are `<lyric>`s on their
  notes with `syllabic`; `~` is an `<elision>`, `:/` an `<extend>`, a
  tie carries its syllable on. Verse N (`lyrics N:`, or pass N of a
  repeat) is `<lyric number="N">` on the same notes; a replay's words go
  on its written-out measures. A lyric row with no melody under it is a
  part of its own, "Lyrics": a silent one-line staff of slash notes at
  the syllables' onsets, marked `<?barmark lyrics?>` in its first
  measure.
- **Text:** section headings, rehearsal marks, words on bars, and every
  text line (free-text lyrics, `###` notes) as words, so nothing written is lost.
  In a score of several parts, the description (the text before the
  first heading), headings, rehearsal marks, tempo, feel and jumps are
  written once, over the top part.
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

Not yet: ChordPro and MIDI.

## License

MIT
