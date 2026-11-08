# Changelog

All notable changes to `@barmark/musicxml` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
package uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Fixed

- **A chord's degrees are not printed when its kind text already spells
  them.** `<kind text="7sus4">` with an added 7, or `text="5(7)"` with a
  subtracted 3, now writes each such `<degree>` with `print-object="no"`,
  so a program that prints the text and then the degrees no longer shows
  `D7sus4(7)` or `G5(7)(no3)`. The degrees are still written, so the
  chord means the same notes to a program that reads kind and degrees
  (and to the import). A kind text that does not name the whole chord
  leaves its degrees printed.
- **A keyboard's lower staff is not drawn in slashes.** A two-staff part
  no longer writes `<measure-style number="1"><slash>`: Verovio applied it
  to both staves and drew the lower staff's whole-bar rest as slashes. Its
  slash notes already carry slash noteheads and no stems. Its first
  measure now writes `<slash type="stop"/>`, as Verovio carries slash
  style on from the part before it.

## [0.7.1] - 2026-11-08

### Fixed

- **A tempo on a one-bar meter counts the `time:` meter's beat**
  (Kevin's decision, 2026-11-08, grammar 2.4). `time: 6/8, tempo: 60`
  then a `[2/8]` pickup wrote its metronome as an eighth = 60 and its
  `<sound tempo>` as 30; it is now a dotted quarter = 60 and 90, so the
  pickup plays at the speed of the 6/8 bars and imports back as
  `tempo: 60` (it read back as 20). The same holds for a rit.'s target
  and an `a tempo` on such a bar. A bar no pass plays after a one-bar
  meter is now in the running meter, as written, not the one-bar
  meter's (and so is its tempo). Needs barmark 0.21.0 (`PlayedBar.time`).

## [0.7.0] - 2026-11-08

### Changed

- **Requires `barmark` 0.20.0**, whose minor release a caret range
  would not reach.
- **barmark's two new direction rules reach the export** (grammar 5.2
  and 6, Kevin's decisions of 2026-11-08). A chart whose `al Coda` goes
  on at a `Coda` with no bar after it (none written later, and no later
  replay heading) is now an error, so the export refuses it rather than drop
  the coda sign, which had no measure to go on. And an elided replay that
  a `Fine` or `To Coda` stops early, after the jump, plays up to the stop:
  `## Intro ->` replaying `| E7 | Fine |` after a `D.S. al Fine` now
  exports and round-trips playing E7, as barmark plays it.

## [0.6.4] - 2026-11-07

### Fixed

- **A repeat inside a repeat exports in play order.** `|: D | x2` then
  `| A :|` plays D D A twice, but the export wrote the line's `x2` and
  the outer `:|` as two backward repeats, which MusicXML can't nest: the
  import played it as four bars, MuseScore as five. A `|: … :|` that
  holds a bar line's `x N` (its endings included) is now written out as
  it plays, as a repeated section holding repeats already was; repeats
  with none inside keep their repeat bar lines.
- **A jump through a replay that repeats, or that holds the Fine or To
  Coda, plays as barmark plays it.** A replay is written out as it plays,
  so after a D.C. or D.S. its written-out passes played again where
  barmark plays every repeat once, and its Fine or To Coda, which a
  replay's measures don't carry, was never reached. Such a chart is now
  exported in play order, as one whose repeated section is written out
  already was. So is one with a replay that repeats at all: after the
  jump it plays one pass, and its `->` cuts from that pass.
- **A jump written after a repeat plays after its passes.** `|: A | B :|`
  then `| D.C. |` went out with the D.C. on the repeat's last measure,
  where MuseScore 4.7 (and the import) take it on the first pass: the
  file played A B, then the D.C., where barmark plays the repeat first.
  MusicXML can't say "after the passes" there, so such a chart is now
  exported in play order. A jump written inside the repeat
  (`|: A | B | D.C. :|`), which barmark takes on the first pass, keeps
  its marks.
  Known limit, for every chart written in play order (by the export or
  the import's fallback): bars before the first heading that a jump plays
  again come back under the heading before them, since barmark can't
  write the unnamed section mid-chart. They play the same bars.
- **`|:` and `:|` on a bar line with no bar export.** A bar line of
  directions or `...` alone (`| ... :|`, `|: Segno |`) lost its repeat
  mark, so the file played the repeat from the wrong bar or not at all.
  The `:|` now closes the repeat on the bar before it, the `|:` opens it
  on the bar after.
- **Text lines of bars no pass plays survive the round trip.** A chart
  written in play order (by the export, or by the import's fallback) left
  out the bars after a Fine or To Coda that never play, and the text
  lines among them or after them went too. They now come after the bar
  played last before them in written order, so text written later stays
  later.
- **A text line written twice imports twice.** The import read each
  text line once, to read once the lines the export writes in every
  part, so two lines alike in a row came back as one. It now keeps as
  many as one part writes.

## [0.6.3] - 2026-11-07

### Changed

- The npm description and the README's opening now name the import
  (MusicXML and `.mxl` to a chart) beside the export, with `mxl`,
  `import` and `export` keywords.

### Fixed

- **Dorico's section names import as headings.** The import took only
  bold words above a bar's start as a heading; Dorico writes system text
  with no `font-weight`, so `Intro` and `Verse` came in as quoted words.
  On the first part of another program's file, plain (not italic) words
  above a bar's start are a heading too when they name a section: Intro,
  Verse, Pre-Chorus, Chorus, Bridge, Solo, Interlude, Break, Tag, Outro,
  Ending, Refrain or Instrumental, perhaps numbered or lettered
  (`Verse 2`, `Chorus B`), in any case, with a trailing `:` or `.` left
  out of the heading (`Verse 1:`). `Coda` stays the coda sign's
  direction; bold words are headings as before, and barmark's own files
  are read as before.
- **Dorico's placeholder project info is left out.** Dorico fills empty
  project info with greyed `Project Composer` and `Project Copyright`
  page credits, which came in as `composer:` and `copyright:` lines. In a
  file whose `<software>` is Dorico, those, `Project Lyricist`,
  `Project Arranger` and a `Project Title` title are dropped.
- **A comping part's slashes in a voice of their own stay its rhythm.**
  Dorico writes a guitar's slashes in voice 2 and a voiced bar in voice 1,
  each silent (a `<forward>`) where the other plays, and the import gave
  two lines (`ElGtr.1`, `ElGtr.2`). On one staff, a voice of slashes and
  rests alone whose slashes sound only where the other voice is silent (a
  `<forward>` or a rest) is now read as that voice's rhythm, on one line:
  `| F#m7(b5) / B7{B2 D#3 A3 B3 F#4} -- |`. A rest with the other voice's
  notes or slashes in it is a gap and is dropped, so MuseScore's shape,
  explicit rests in both voices, folds too. Slashes that sound with the
  other voice's notes still make a line of their own.
- **A half-diminished chord imports as `m7(b5)`, not `dim(7)`.** Dorico
  writes `<kind text="m7">half-diminished</kind>` with no `<degree>`; the
  shown `m7` isn't the chord, so its meaning names it. A kind with a
  Harte shorthand of exactly its notes and no `<degree>`
  (half-diminished, diminished-seventh, major-minor and the like) is now
  named by that shorthand (`hdim7` is `m7(b5)`, the grammar's name for
  `ø`), not by its interval list.

## [0.6.2] - 2026-11-07

### Changed

- **Requires `barmark` 0.19.0**, whose minor release a caret range
  would not reach. No export or import change.

## [0.6.1] - 2026-11-07

### Changed

- **Requires `barmark` 0.18.0.**

### Fixed

- **Text lines keep their place through export and import** (issue
  #173). Text before the first heading (such as a `title:` line) came
  back inside the first section, text at a section's foot came back in
  the next section, and text after the last bar came back mid-line, before
  that bar. The export now writes text before a heading ahead of the
  heading's direction, and text at a section's foot or after the last bar
  below that bar, after its notes; the import reads words below the staff
  written before a bold heading as text before it (in the export's own
  files; another program's direction order isn't read as placement), and
  words below after a measure's notes as text after its bar. Text at the foot of a section
  whose passes are written out no longer moves to the section's first bar.
- **Many words in one measure import in linear time.** Words above the
  staff each looked through the whole measure for a `<swing>`, so a file
  with 50,000 words in a bar took minutes; a measure's swing, and the
  text lines ahead of its heading, are now worked out once.

## [0.6.0] - 2026-11-07

Needs `barmark` 0.17.0.

### Added

- **Import: melodies and verses** (barmark's grammar 4.3 and 7.7). A
  part that sings (lyrics, or a `voice.*` instrument sound) comes in as a
  lead sheet: chords on its bare line, the melody with verse 1's
  syllables on `Vox.Mel` (on the bare line when the part has no chords),
  `~` for an elision (`<elision>`, or MuseScore's U+E551 glyph) and `:/`
  for a melisma (`<extend/>`, or a word's first or middle syllable over
  unsung notes, as MuseScore writes one). Later verses are `lyrics N:`
  rows; a section sung again to the same notes with new words is a
  replay heading with its `lyrics:` rows; inside a repeat, verse N stays
  pass N. Each part of a choir keeps its own syllables, the rows being the
  first voice part's. A lyric staff (`<?barmark lyrics?>`, or a one-line
  staff named "Lyrics" with only slashes and words) comes back as lyric
  rows. A rhythm the grammar can't write snaps to the nearest it can,
  with a warning naming the measures. The self-check compares every
  verse's syllables as the chart plays them. Endings that no pass plays
  are now an error rather than an empty chart. Barmark → MusicXML →
  barmark gives a lead sheet back as written.
  Lyrics the import can't place (on a line that doesn't sing, on slash
  notes, a part's later verses with no one to sing them) are a warning
  naming the part and the measures, never dropped silently, and saying
  why: on a line that doesn't sing, on a rest or a tied note, on slash
  notes, or two syllables snapped onto one note. A repeat with
  more stacked verses than passes keeps every verse as a `lyrics N:` row
  and its play count, passing on barmark's "verse N is never sung".
  Lyrics with curly quotes or brackets (`“Ho-`, `[x]`) import cleanly.
  A lyric row's `/` means what barmark reads: where the chart plays a bar
  after a breath (a repeat written out in played order) and nothing is
  held, the row writes `--`, and a bar that only breathes is one `--`. A
  syllable of hyphens alone is no syllable, so it never reads as a breath.
  A lyric row writes its bars on one grid, as many slots a beat as its
  finest bar, so a held syllable keeps its holds (`fear / /` beside
  `grace / that`), except where a hold would sing on a new note or
  follow a breath. A system whose rows sing verse 1 alone writes
  `lyrics:`, however other systems number theirs (an ending's rows stay
  numbered in a chart that numbers its verses). A melody bar playing
  the notes of the bar before it, unsung, is `%` (which copies notes, not
  syllables). A lyric staff's rows stay the voice part's: the chart
  keeps its `part:` lines even where every part plays one tutti line.
  A melisma ends at the held note that carries its own `<lyric>` (our
  `<extend/>` alone, or an extend's `type="stop"`): the unsung note or
  breath after it stays unsung, and a melisma before a repeat's endings
  no longer holds into the first. A word's first or middle syllable holds
  over unsung notes, as MuseScore writes a melisma, only until its verse
  writes such a held note. A lyric row starting with `/` holds on what
  its verse's row before it left held, as barmark reads it, so a verse 2
  melisma held across two systems, or from a repeat's body into the
  second ending that sings it, comes back as written. A melisma holds
  along play order: each ending starts from what the body held, and a
  first ending doesn't hold verse 2, which its pass doesn't sing. With
  nothing held (the verse breathed, or hasn't sung yet) the row's `/` is
  written `--`; where a repeat or ending between the rows leaves it
  unsure what barmark holds, it is `--` too, and a warning names the
  measure.

- **Export: lyrics** (barmark's grammar 4.3 and 7.7). A syllable on a
  note is a `<lyric number="1">` on it, with `syllabic` (single, begin,
  middle or end, from the word's `-`s); `~` writes `<elision>` between
  the syllables on one note; `:/` writes a `<lyric>` of `<extend/>`
  alone on its note, and `<extend type="start"/>` on the syllable it
  holds (which MuseScore keeps), and so does a lyric row's `/` over a
  new note of the melody; a tied note carries its syllable on without a
  mark. A keyboard part's syllables go on the staff that sounds their
  note. A numbered verse is `<lyric number="N">` on the same
  notes: stacked on bars written once, or sung on a repeat's pass N. A
  replay is written out, so its lyric rows go on its own measures. A
  lyric row with no melody under it (no part sings, or the singer writes
  no notes) is a part of its own after the others, "Lyrics": a one-line
  percussion-clef staff of slash notes at the syllables' onsets, held as
  the row holds them, rests where every verse breathes, the syllables on
  the slashes, its instrument at volume 0, and `<?barmark lyrics?>` in
  its first measure so the import can read it back as a lyric row. A
  part exported alone (`part`) leaves it out. Text-line lyrics are words,
  as before.

### Changed

- **Import:** lyrics are no longer text lines under each row, and the
  "lyrics written as text lines" warning is gone; a singing part's melody
  is no longer "left out as a melody". The `lead-sheet` fixture now reads
  `part: Vo = Voice, instrument: voice` with its melody and a `lyrics 2:`
  row.
- **Export:** a part's bare line with its named lines written after it
  (`Vox` over `Vox.Mel`, barmark's amended grammar 7.6) plays with them in
  the same measures. One that writes no notes (chords, `/`, `N.C.`,
  words) is `<harmony>` and its words over the first named line, each
  before the note it falls on (an `<offset>` where none does), with no
  voice of its own: a lead sheet is one voice with chord symbols, a
  piano's hands stay on their staves. One with note sets or voicings is
  the next voice on the upper staff, after the named lines. Where the
  part writes only its bare line, it plays in the first line's place;
  systems without it export as before.

### Fixed

- **Import:** a pickup written as barmark's export writes it (a short
  first bar in its own `<time>`, then the full meter) is a `[1/4]` pickup
  again under `time: 3/4`, not `time: 1/4` then `time: 3/4`; and a pickup
  doesn't count toward a system's four bars.
- **Export:** a lyric row or a `---` line between a repeat's endings no
  longer cuts the repeat's passes short (`times` on the backward
  repeat), as barmark already reads them.
- **Import:** where one labelled system would otherwise run into the
  next (a part stops or enters), a `---` line keeps them apart, instead
  of a text line such as `Gtr tacet` or `Pno enters`. Needs `barmark`
  with `---` (it ends a labelled system).
- **Import:** a melody doubled in thirds (or any two-note melody) in a
  part that writes slashes somewhere is read as a melody, its notes left
  out with the melody warning, instead of as voicings and note sets. In
  another program's file, a bar of a chord part reads as voicings only
  where its attacks land on chord changes or beats; an attack off both
  makes the bar a melody's only when its pitches move from the voicing
  sounding and it isn't a push into the next chord, so re-struck and
  pushed comping keeps its voicings. A melody bar writes its chords
  alone and the warning names it; the part's other bars keep their
  notes.

## [0.5.0] - 2026-11-06

### Added

- **Import:** `importMusicXml(xml, { part? })` reads a MusicXML
  `score-partwise` file (MuseScore, Dorico, Sibelius, Finale, or this
  package's own export) back into a canonical barmark chart: the title
  and credits (typed page credits when the file names no creators),
  chord symbols (by meaning, then display text, else `?` with the
  original kept as words, with a warning), keys (modes as written),
  meters and one-bar meters, tempo, rit. and accel., the feel, headings,
  rehearsal marks, words and text lines, repeats (`x N` on a whole line
  or section), endings and jumps, fermatas, lyrics as text lines,
  replayed sections, parts (merged into tutti lines where they agree),
  and a chord part's voicings, note sets and part lines. Where one
  labelled system would otherwise run into the next (a part stops or
  enters), a text line such as `Gtr tacet` or `Pno enters` keeps them
  apart, since the grammar joins consecutive labelled lines. It returns
  `{ text, diagnostics }` and never throws. A diagnostic is `{ severity,
  message, part?, measure?, measures? }`: `measure` is the first measure
  it is about (the file's `number`), and `measures`, when present, every
  measure its message names, so a program needn't read the message.
  Measure numbers longer than 64 characters and part names longer than
  200 are cut with "…". Each kind of loss is one warning per part with
  a count and the first measures (a loss of the whole score, such as a
  meter, is reported once, with no part), and a file that gives nothing
  (bad XML, `score-timewise`, no chord symbols in another
  program's file) returns empty text and an error. A file with no chord
  symbols names the parts that hold notes (and any words that look like
  chord symbols), and `part` (a part's name, abbreviation or id,
  ignoring case and punctuation) imports one of them as note sets;
  beside parts with chords, the parts of notes alone are named in one
  warning. Marks barmark can't write (dynamics and hairpins, slurs and
  ornaments, grace notes, chord diagrams, a capo, pedal, accents,
  fermatas within a bar) are one warning each; those on the notes alone
  aren't reported for a part whose notes are left out anyway.
  `<other-direction>` text is read as words. Chord symbols marked
  `print-object="no"` (hidden in the program's score) are imported like
  any other: they are still the file's harmony. Chord symbols a program
  exported as plain words stay words, with one warning (a lone root
  letter, a common section label, counts only beside fuller symbols).
  Control characters in the file are dropped, so a score can't put
  escape sequences into a chart or a message; numeric character
  references (`&#233;`, `&#x266d;`) are decoded first. The XML is read
  with fixed bounds: at most 100 elements deep, entities expanding to at
  most 100,000 characters, no external entities. The chart it writes is
  parsed and played back against what it meant to write; any difference
  is an `importer bug` error (the first three, then a count). Tested on
  MuseScore 4 files as well as the export's own.
- **`readMxl(bytes)`** unpacks a compressed `.mxl` to its MusicXML text
  with no dependency (`DecompressionStream("deflate-raw")`: Node 20.12
  or later, Bun, browsers), following `META-INF/container.xml`, else the
  first `.musicxml` or `.xml`. It reads UTF-8, or UTF-16 with a
  byte-order mark. It treats the archive as untrusted: at most 1000
  entries, at most 64 MiB unpacked per entry (checked while inflating),
  every offset checked, ZIP64 and encrypted entries refused. A bad
  archive rejects with an `Error` naming the problem.
- **`decodeXmlBytes(bytes)`** turns a MusicXML file's bytes into text
  (UTF-8, or UTF-16 with a byte-order mark), as `readMxl` does inside an
  archive.
- **A note set's marked root survives:** the root of `{D3 E3! G3 B3}`
  (and of a voicing) is written as a `<?barmark root?>` processing
  instruction on its `<note>`, and read back as `!`. Other programs
  ignore it; nothing sounds or looks different.

### Documentation

- **README: "In Dorico"** notes what Dorico's MusicXML import does with
  credits (they go to Flow 1's information, not the project's), chord
  symbols (always global) and repeat counts, and "What it writes" now
  lists credits.

## [0.4.1] - 2026-11-05

### Fixed

- **A score shows its marks once:** headings, rehearsal marks, tempo,
  rit. and accel., the feel, jumps and a repeat's words are written in the
  top part only, so Dorico no longer shows them over every staff, where
  they ran into the part above (a piano's Ped. brackets). They carry
  `system="only-top"` too, for programs that read it. A part exported
  alone with `part` still writes them all.
- **A heading or text line starting with the word "A"** keeps it in
  Dorico, which reads a leading "a" as the article in "a tempo" and drops
  it ("A" vanished, "A section" showed "section"): a no-break space now
  follows that "A". Other programs show the same text.
- **`x ...` plays once** in notation programs, as barmark plays it: the
  repeat writes `times="1"` (none meant twice).
- **A bar no pass plays** (one between `D.C. al Coda` and `Coda`) keeps
  the meter, key, tempo and feel of the bar before it, rather than 4/4 and
  no key, so the bar after it no longer repeats them as changes.
- **A push across the last ending** into the bar after it is written
  early: the last ending plays on, so it isn't a repeat to stay out of.
- **Values shorter than a 128th** are written as 256th, 512th and
  1024th notes, and anything shorter still takes its true length, so the
  bar adds up.

## [0.4.0] - 2026-11-04

Needs `barmark` 0.16.0.

### Added

- **Instruments from the part line** (barmark's grammar 7.3): a part's
  `instrument:` chooses its clef, staves and playback sound over the
  guess from its name. A transposing instrument is written at its pitch:
  a trumpet in Bb a major second up, an alto sax a major sixth, a tenor
  sax a ninth, with the key signature, the notes and the chord symbols'
  roots and basses all written, and a `<transpose>` taking them back. A
  key that would be written past seven sharps or flats is spelled
  enharmonically: an alto sax in B major writes A♭, not G♯. The
  bass's octave transposition is unchanged.
- **Part lines** (barmark's grammar 7.6): a keyboard's first line goes
  on the upper staff and its second on the lower, as written, with no
  split at middle C; a third and fourth line are second voices on those
  staves, stems down. A one-staff part writes its lines as voices 1–4.
  A staff's line that rests a bar gets a whole-bar rest. A keyboard part
  with no lines is split at middle C as before.
- **Pedal marks** (barmark's grammar 2.9): a press writes a pedal start
  with `damper-pedal="yes"` playback, a release a stop, and a press with
  the pedal down a stop then a start; the pedal lifts where the part falls
  tacet and at the chart's end. The marks go under the lower staff of a
  keyboard.
- **Dotted figures** (grammar 2.2): `C._D` writes a dotted eighth and a
  sixteenth, beamed, with no tuplet; `C_D.` the reverse.
- **`clef:`** fixes a part's clef for the whole part, one staff, with no
  clef changes; `alto` writes a C clef on the third line.

## [0.3.0] - 2026-11-04

### Added

- **Rhythm slashes:** a bar where something sounds anew off the beat (a
  push's early note, a group's member, a triplet) shows its rhythm:
  stemmed slash noteheads, with a chord's `/` holds joined to it, outside
  slash style. `| D / / /_G |` is a half tied to a dotted quarter, then
  an eighth. Bars on the beat keep stemless slashes in slash style.
- **Beams:** eighths and shorter beam within a beat, sixteenths on a
  second level (a lone one hooks); in 4/4 a half bar of plain eighths
  beams as one. Rests, longer values and stemless slashes break a beam.
- **Instruments from the part's name**, on whole words in any case: a
  bass (`Bass`, `Bass Guitar`, `Electric Bass`, … but not `Bassoon` or
  `Bass Voice`) is written an octave up in bass clef with a
  `<transpose>`; a guitar has the treble 8vb clef; a keyboard (`Piano`,
  `Keys`, `Organ`, `Rhodes`, `Synth`, …) is on two staves. Each gets a
  `<score-instrument>` and a General MIDI program (Electric Bass 34,
  Electric Guitar 28, Piano 1), so a program picks a sound. Other parts
  are as before.
- **Keyboards on two staves:** treble and bass, notes split at middle C
  (a note set across it splits, an arpeggio moves between staves),
  slashes and chord symbols on the upper staff, a whole-bar rest on
  the lower where it has nothing to play; voice 1 and voice 5, joined by
  `<backup>`.

### Changed

- **Note values follow the meter:** in 4/4 and 2/2 a value never hides
  the middle of the bar unless it starts the bar and fills whole beats;
  a value off the beat in other meters, and a rest off the beat in any,
  is cut at the next beat. `| {C4} {D4} / {E4} |` writes D4 as two tied
  quarters. In 6/8, 9/8 and 12/8 a value shows its whole beats (a dotted
  quarter tied to an eighth), and 12/8 shows its middle. A hold after a
  triplet's note ties on rather than stretching the triplet past its
  beat, and a chord's hold that opens a bar showing its rhythm ties from
  the bar before.
- **Clefs by bars:** a part is bass when most of its bars sit below
  middle C (a bar of slashes counts as treble), not when most of its
  notes do, so one long pedal note no longer makes a chart of slashes
  bass. A run of two bars or more on the other side, or one bar needing
  more than three ledger lines, changes clef for the run; a bar of rests
  inside a run keeps its clef. A slash sits on its staff's middle line.

What every export sounds is unchanged: a test freezes each example's
and each grammar example's sounding notes and chord symbols.

## [0.2.0] - 2026-11-04

### Added

- **Credits** (barmark's grammar 7.5): each `composer:`, `lyricist:` and
  `arranger:` line is a `<creator>` of that type, in that order, and each
  `copyright:` line a `<rights>`, as Dorico's own export writes them. An
  exported part carries the chart's credits. No `<credit>` page text:
  Dorico ignores it on import, and a program that sets credits from
  `<creator>` would print them twice.

### Fixed

- **`/` holds what was sounding** (grammar 2.3), not always a slash. After
  a note set or voicing it lengthens those notes in the same bar
  (`| {G2} / / {G2} |` is a dotted half and a quarter) and
  ties them over a bar line, so a pedal note `| {D2} | / | / |` sounds
  through; after `--` it stays a rest. Only a chord's hold is a slash.
  Before, a held note set exported as chordless slashes and played
  nothing.

## [0.1.2] - 2026-11-04

### Fixed

- **Slash style stops in a bar with a rest:** a part's tacet bars and a
  bar such as `| G -- -- -- |`. Dorico drew beat slashes over the rest
  and hid it, so a tacet piano read as playing.

## [0.1.1] - 2026-11-04

### Fixed

- **Slashes are written one per beat** (dotted quarters in 6/8, 9/8 and
  12/8), not one note per slot. Dorico ends a slash region after the
  last measure that holds a direction or attributes, and showed every
  later bar as a whole-note slash (a hollow diamond). Beat slashes read
  correctly whether or not a program keeps slash style on. Pushes still
  tie across the bar line, and a slot off the beat grid (a third of a
  4/4 bar) keeps its own value.
- **A repeat played 3 or more times also prints "×N"** above its closing
  bar line, as barmark.dev shows it. Dorico ignores `times` on import
  (and doesn't write it on export), so the count was lost there.

## [0.1.0] - 2026-11-04

### Added

- **`exportMusicXml(text, { part?, title? })`:** a barmark chart as
  MusicXML 4.0 (`score-partwise`) that validates against the MusicXML 4.0
  schema and plays in the chart's play order.
- **Parts:** one part per declared part, each exported as `extractPart`
  gives it, with its tacet bars as measure rests.
- **Chords** as `<harmony>` over slash notes, with degrees that spell the
  exact chord and barmark's own spelling as the kind's text; note sets and
  voicings as real notes.
- **Rhythm:** groups as tuplets, pushes as early tied notes, accents and
  hits as articulations.
- **Order:** repeats, endings and jumps as MusicXML repeats and `<sound>`s;
  replays written out; barmark's written bar numbers shown. Where MusicXML
  can't hold a chart as written (a D.S. or D.C. through a repeated section
  that holds repeats), the chart is written in play order; a push that
  would cross a repeat or a jump stays on the beat, marked "push".
- **Directives and text:** key, time, tempo, rit. and accel., feel,
  headings, rehearsal marks, fermatas, words on bars and text lines.
- **Errors:** a chart with errors, or with no bars, returns its
  diagnostics and no XML; characters XML can't hold are left out.

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.7.1...HEAD
[0.7.1]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.7.0...musicxml-v0.7.1
[0.7.0]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.6.4...musicxml-v0.7.0
[0.6.4]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.6.3...musicxml-v0.6.4
[0.6.3]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.6.2...musicxml-v0.6.3
[0.6.2]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.6.1...musicxml-v0.6.2
[0.6.1]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.6.0...musicxml-v0.6.1
[0.6.0]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.5.0...musicxml-v0.6.0
[0.5.0]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.4.1...musicxml-v0.5.0
[0.4.1]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.4.0...musicxml-v0.4.1
[0.4.0]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.3.0...musicxml-v0.4.0
[0.3.0]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.2.0...musicxml-v0.3.0
[0.2.0]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.1.2...musicxml-v0.2.0
[0.1.2]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.1.1...musicxml-v0.1.2
[0.1.1]: https://github.com/kevinpeckham/barmark/compare/musicxml-v0.1.0...musicxml-v0.1.1
[0.1.0]: https://github.com/kevinpeckham/barmark/releases/tag/musicxml-v0.1.0
