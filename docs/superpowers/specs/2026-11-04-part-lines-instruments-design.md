# Part lines and instruments — design

Status: approved (Kevin, 2026-11-04: "go with your recommendations on
#131"). A grammar change; the decisions are gathered at the end. It
follows the MusicXML notation design (#129, built in #138), whose
instrument table and two-staff keyboards it builds on.

## Intent

Two things a real arrangement needs that barmark can't say today:

1. **Two lines of music in one part.** A pianist's right hand plays an
   arpeggio while the left holds a bass note; a guitarist's melody rings
   over a bass. Today a part has one line, so the only way is two parts
   (`Pno R`, `Pno L`), which a score program shows as two instruments.
2. **Which instrument a part is.** The notation design guesses from the
   name (`Bass Guitar` is a bass, `Piano` a keyboard). A guess fails for
   names like "Keys 2", "Low End" or "Horn", and it can't say a B♭
   trumpet or an alto sax, whose parts are written transposed.

## Goals

- A part may write **up to four lines** (two hands, or a melody and a
  bass) that play at the same time, in one system row group.
- A part may name its **instrument** from a fixed list, which sets its
  clef, written transposition, staves and playback sound in converters.
- Nothing that reads today changes meaning.

## Non-goals

- Drums and percussion: their notation (a percussion clef, noteheads per
  instrument) is a design of its own.
- Lyrics: still the structured-lyrics roadmap item.
- Free-form instrument names: the list is closed, so a converter always
  knows what to write.

## Anti-goals

- **A second line that changes the harmony.** Chord symbols belong to the
  part, once; the extra lines are notes.
- **Lines that need each other to read.** As with systems (7.4), every
  line carries the structure, so each reads on its own.

## 1. Part lines (proposed grammar 7.6)

```
# Morning Song
part: Pno = Piano, instrument: piano
part: Bs = Bass, instrument: electric bass

## Verse
Pno.RH | G{B3 D4 G4} | C{C4 E4 G4} | D{D4 F#4 A4} | G{B3 D4 G4} |
Pno.LH | {G2}        | {C3}        | {D3} / {F#2} / | {G2}       |
Bs     | {G1}        | {C2}        | {D2}         | {G1}         |
```

- **A line label.** A declared part's label, a dot, and a name of
  letters and digits (`Pno.RH`, `Pno.LH`, `Gtr.2`) is one **line** of
  that part. The names are the author's; nothing is declared. Matching
  is in any case, as labels are.
- **In a system.** Line labels join systems as part labels do (7.4): a
  system is a run of labelled lines in which no line label repeats.
  `Pno.RH` and `Pno.LH` in one system are the piano's two lines, played
  together. A part may write its lines in some systems and a single
  `Pno |` line in others.
- **The first line carries the harmony.** The part's first line in a
  system (in written order) may hold chords, `N.C.`, `?`, voicings and
  note sets, as any line does. Its other lines hold **notes only**: note
  sets, `/`, `--`, `%`, words, accents, hits and pushes. A chord name,
  `N.C.` or `?` on another line is an **error** suggesting a note set or
  a voicing on the first line.
- **Each line its own.** `/` holds what that line played, and `%`
  copies that line's previous bar, in written order (2.3, as for parts).
  After a system where the line wasn't written, both are errors.
- **A line not written** in a system where its part is: it rests (a
  whole-bar rest per bar), not tacet.
- **Structure** (repeats, endings, marks, directions, fermatas, one-bar
  meters, bar counts) is written on every line, exactly as 7.4 asks of a
  system's lines.
- **Limit:** four lines per part; a fifth is an error. (MusicXML has no
  hard limit, but no instrument part reads with more.)
- **Score order** within a part is the order of first appearance in the
  chart; the canonical form sorts a system's lines into it.
- **Single-part charts** may use lines too: `part: Pno = Piano` then
  `Pno.RH |` and `Pno.LH |`. Without a `part:` there is no label to hang
  a line on, so lines need one.

## 2. Instruments (proposed grammar 7.3 addition)

```
part: Tpt = Trumpet, instrument: trumpet in Bb
```

- **`instrument:` after the name** on the `part:` line, after a comma.
  Today `part: Guitar, key: G` is an error ("a line of its own"); the
  same position takes `instrument:`. A name that really contains
  ", instrument:" is not a case worth supporting.
- **A closed list,** in any case, each with what a converter needs:

| Instrument | Clef | Written | Staves | GM program |
|---|---|---|---|---|
| `piano` | treble + bass | sounding | 2 | 1 |
| `electric piano` | treble + bass | sounding | 2 | 5 |
| `organ` | treble + bass | sounding | 2 | 17 |
| `synth` | treble + bass | sounding | 2 | 81 |
| `acoustic guitar` | treble 8vb | sounding (the clef carries the octave) | 1 | 26 |
| `electric guitar` | treble 8vb | sounding (the clef carries the octave) | 1 | 28 |
| `electric bass` | bass | octave up | 1 | 34 |
| `double bass` | bass | octave up | 1 | 33 |
| `trumpet in Bb` | treble | major 2nd up | 1 | 57 |
| `alto sax` | treble | major 6th up | 1 | 66 |
| `tenor sax` | treble | major 9th up | 1 | 67 |
| `trombone` | bass | sounding | 1 | 58 |
| `flute` | treble | sounding | 1 | 74 |
| `violin` | treble | sounding | 1 | 41 |
| `cello` | bass | sounding | 1 | 43 |
| `voice` | treble | sounding | 1 | 53 |

- **Concert pitch, always.** A chart is written at sounding pitch; the
  instrument only tells a converter how to notate it. A transposing
  instrument's part comes out transposed in MusicXML (`<transpose>`), and
  the renderer can show it transposed later as an option.
- An unknown instrument is an **error** listing the near ones
  (`instrument: bass` suggests `electric bass` or `double bass`).
  `instrument:` without a part line keeps today's near-miss warning.
- **Without `instrument:`** the converters keep the name table of the
  notation design (a guess only for clear names).
- **Lines and staves.** A two-staff instrument puts a part's first line
  on the upper staff and its second on the lower; a third and fourth
  line become second voices on those staves. A one-staff instrument
  writes its lines as voices on its staff (voice 1 stems up, voice 2
  down). A keyboard part written as one line keeps the notation design's
  split at middle C.

## Machine output (A.7)

- `parts` on the parse: each part gains `instrument` (its list name, or
  absent) and `lines` (the line names in score order, empty when the
  part writes none).
- On a played bar's part entry: `lines`, one entry per line written
  there (`name`, `slots`, `words`), when the part writes lines; the
  part's `slots` are its first line's.

## Renderer and converters

- `@barmark/render`: each line is a row in its system, labelled
  `Pno.RH`; note lines show their note sets as today.
- `@barmark/musicxml`: as above (staves, voices, transposition,
  `<score-instrument>` and `<midi-instrument>` from the list).
- `extractPart` keeps the part's lines with their labels (a single-part
  chart may write lines, so the extract reads as written).

## Testing

Parser: line labels, systems with lines, the harmony rule (chord on a
second line is an error), `/` and `%` per line, a line not written
(rests), four-line limit, structure checks across lines, `instrument:`
values, unknown instrument errors, the near miss. Printer: canonical
order, round trip. Converters: staves and voices per instrument,
transposition for trumpet and sax, playback unchanged. Dorico: Kevin
imports a piano-and-bass chart and a horn chart.

## Release

A grammar change: `barmark` minor, then `@barmark/render` and
`@barmark/musicxml` minors, the CLI, barmark.dev's guide (7.3, 7.6) and
the songs bump.

## Decisions (Kevin, 2026-11-04)

Kevin took every recommendation:

1. **Line syntax `Pno.RH |`**, with no declaration.
2. **Harmony on the first line only**; a chord name, `N.C.` or `?` on
   another line is an error.
3. **Up to four lines per part.**
4. **`instrument:` on the `part:` line.**
5. **The instrument list above** as the first set; drums get their own
   design.
6. **An unknown instrument is an error**, with near suggestions.

A guitar is written at sounding pitch under its treble 8vb clef, which
carries the octave: the table follows the notation work (#138), whose
Dorico import confirmed it.
