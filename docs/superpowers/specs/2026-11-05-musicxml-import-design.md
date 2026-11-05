# MusicXML import: design

Status: draft for Kevin's review (2026-11-05). Kevin skipped the design
questions and asked for a design from Claude's recommendations, so every
decision below is Claude's call unless marked as Kevin's. The calls list
at the end gathers them.

Kevin's decision (2026-11-05): import note sets (4) and voicings (4.2),
which barmark already supports, not chords alone.

## Intent

The other direction of the MusicXML export (2026-11-03): a lead sheet or
score from MuseScore, Dorico, Sibelius, Finale or iReal Pro should become
a barmark chart that reads, plays and prints as the original's chords
do. That brings existing charts into barmark without retyping them, and
it closes the loop on the export: a chart that goes out to MusicXML and
comes back should play the same.

The roadmap (BRIEF.md, packages item 4) lists converters to and from
MusicXML; the export design said import comes later, in the same
package.

## Goals

- `importMusicXml(xml: string, options?)` in `@barmark/musicxml` returns
  `{ text, diagnostics }`: a barmark chart in canonical form (as
  `barmark format` prints it) and what was dropped or guessed, each with
  its MusicXML measure number and part.
- `readMxl(bytes: Uint8Array): Promise<string>` unpacks a compressed
  `.mxl` file to its MusicXML, with no dependency (the platform's
  `DecompressionStream("deflate-raw")`, in Node, Bun and browsers).
- `barmark import <file.musicxml|file.mxl> [--out file.chart.md]
  [--part name]` in `@barmark/cli`: the chart to standard output or the
  file, diagnostics on standard error as `file: measure N: message`.
- **The chart always parses without errors.** Anything the importer
  can't place is left out, or written as `?`, with a diagnostic.
- **Round trip:** for every chord chart in the test fixtures, the chart
  imported from its own export plays the same as the original (see
  "Testing").
- **Never throws.** Bad XML, a file with no chord symbols or an
  unsupported structure gives an empty `text` and an error diagnostic.

## Non-goals

- **Melody.** Notes are read only as note sets and voicings, in parts
  whose notes behave as chords (see "Notes"); a melody is never turned
  into a run of note sets.
- **Part lines** (7.6: a keyboard's hands, second voices). A part with
  more than one staff or voice is read as chords only, this version.
- **Chord recognition.** A file with no `<harmony>` gives an error, "no
  chord symbols to import"; the importer never guesses chords from
  notes.
- **Rhythm figures:** accents, hits, pushes read from slash rhythms, and
  pedal marks. Pushes written by barmark's export are an exception only
  if they fall out of the placement rule below.
- **Lyrics** as `<lyric>` syllables; layout, fonts, page and system
  breaks; MIDI.
- **Grammar changes.** The importer writes only what the grammar has.
  Gaps it finds become diagnostics, and a list of them for Kevin; any
  grammar addition is his decision, later.
- **A barmark.dev import page.** A natural follow-up (drop a file on the
  playground), designed separately.

## Anti-goals

- A wrong chord printed with confidence. An unreadable harmony is `?`
  with a warning, never a guess.
- Output that doesn't parse, or that barmark would reformat.
- A wall of diagnostics: each kind of loss is reported once, with a
  count and the first few measures ("notes ignored in 64 measures:
  1, 2, 3, …"), not once per note.

## What it reads

| MusicXML | barmark |
|---|---|
| `work-title` (else `movement-title`) | `# Title` |
| `creator` composer, lyricist, arranger; `rights` | credit lines (7.5); page `<credit>`s of those types when there are no `creator`s |
| `<harmony>`: root, kind, degrees, bass | a chord symbol, built through barmark's chord model and printed canonically; `kind` `none` is `N.C.` |
| `<harmony>` in a transposing part | read at concert pitch, through the part's `<transpose>` |
| `<key>` | `key:` (major and minor; other modes as their relative major or minor, with a diagnostic) |
| `<time>` | `time:`; a one-bar change as 2.4's one-bar meter when it changes back |
| `<sound tempo>` or a `<metronome>` | `tempo:`; rit. and accel. words as 7.2's gradual changes |
| `<swing>` (MusicXML 4.0) | `feel:` |
| `<repeat>` with `times` | `\|: … :\|` and `x N`; a whole line or section repeat as `x N` on it |
| `<ending>` | endings (5.1) |
| segno, coda, `<sound>` `dalsegno`/`dacapo`/`tocoda`/`fine`, and words matching 5.2's table | direction cells |
| `<rehearsal>` of letters or digits | `@A` |
| bold `<words>` at a bar's start | `## Heading` (barmark's export writes headings so) |
| other `<words>` | words on a bar (2.6) |
| notes attacked together with a `<harmony>` and lasting its span | a voicing, `Cmaj7{E3 G3 B3}` (see "Notes") |
| notes attacked together with no `<harmony>` | a note set, `{C4 E4 G4}` |
| a held chord with nothing new | `/`; a bar identical to the one before, as the canonical form prints it |

A no-break space after a leading "A" (the export's Dorico workaround) is
read back as a plain space.

### Placing chords in a bar

A chord's onset is its position in the bar, from `<offset>` and the
durations, `<backup>` and `<forward>` before it in its part. The bar is
written on the coarsest equal grid that puts every onset on a slot
boundary: one slot, then halves, then beats (2.1). An onset off the beat
grid is written as a group (2.2) when a two- or three-member group of
its beat reaches it exactly (an eighth, a triplet); anything finer moves
to the nearest beat with a diagnostic. A chord held over the bar line
is `/` in the next bar.

### Notes

The export writes a chord as a `<harmony>` over slash notes, a voicing
as a `<harmony>` over notes that start and end with it, and a note set
as notes with no `<harmony>`. A note set is therefore indistinguishable,
bar by bar, from a melody under a held chord, so the importer decides
per part:

- **A chord part** reads its notes. Every chord's span holds either
  slash notes (a plain chord) or one attack of notes held to the span's
  end (a voicing), and every other attack lands on the slot grid
  ("Placing chords"). Attacks with no `<harmony>` are note sets. Notes
  tied over a bar line, or into the next slot, are `/`.
- **Any other part with chords is a melody part:** a chord's span holds
  more than one attack of notes, or a note falls off the grid. Its
  chords are read and its notes ignored, with one diagnostic ("Lead:
  notes read as a melody and left out"). A lead sheet is the usual case.
  Snapping is never applied to notes: a note that would have to move
  makes the part a melody part.
- **A part with notes and no chords** (a bass line) is read as note
  sets when the file was written by `@barmark/musicxml` (its
  `<encoding><software>`), or when it is named with `--part`. Otherwise
  it is listed in one diagnostic, with the `--part` to import it, so a
  full score doesn't import every instrument as note sets.

Pitches are sounding pitch (4.1), through the part's `<transpose>`
(octave changes included). Octaves are always written, since MusicXML
always has them. A voicing note that isn't in its chord (an error in
4.2) drops the voicing: the chord is written alone, with a warning.
`!` (a marked root) is never written; MusicXML has no way to say it.

### Parts

Parts that carry `<harmony>` are read, and parts of notes alone as
"Notes" says; the rest are listed in one diagnostic. Parts whose chords are the same throughout make one chart
line, as a lead sheet's do. Parts whose chords differ become several
parts (7.4), each named from its `<part-abbreviation>` (else
`<part-name>`). `--part name` / `options.part` imports that part alone.

### Repeats the grammar can't hold

Repeats pair within a section in barmark (5). A file whose repeats,
endings or jumps can't be written that way (a repeat crossing a heading,
endings without a repeat, two codas) is written out in played order
instead, with a warning, so it still plays the same.

### Lines

Four bars to a line, the grammar's recommended phrasing; a new line at
every heading, repeat mark, ending and directive.

## Testing

- **Round trip (the yardstick):** every chord chart among the barmark
  package's fixtures (the grammar's examples, `examples/`, the export's
  test charts), note sets and voicings included, minus those using part
  lines, accents, hits or pushes:
  export, import, and compare the expanded play order (barmark's
  `expand`) bar by bar: meter, key, tempo, feel, section name,
  rehearsal mark, words, and the chord timeline. Section replays don't
  survive (the export writes them out), so the comparison is what plays,
  not how it's written.
- **Real files from the programs,** small, made by us so their licence
  is clear: lead sheets exported from MuseScore 4 (its command line runs
  headless on the VM), Dorico (through mac-bench, if `File.Export` can
  run without a dialog: a spike decides; otherwise Kevin exports a few
  once), and any others Kevin can produce (Finale, Sibelius, iReal Pro).
  Each fixture has its expected chart checked in.
- **Dorico round trip** through mac-bench: barmark → export → Dorico →
  Dorico's MusicXML → import → same play order. It runs only where
  `MAC_BENCH_URL` is reachable, not in CI.
- **Melody stays out:** a MuseScore lead sheet (melody and chords in one
  part) imports as its chords with no note sets; a voicing with a note
  outside its chord imports as the chord alone.
- Unit tests per mapping row, and malformed input (bad XML, no
  harmony, a `.mxl` without a rootfile) never throwing.
- The produced chart parses with no errors, and `format` leaves it
  unchanged, for every test.

## Releases

`@barmark/musicxml` 0.5.0 (a new feature), `@barmark/cli` 0.6.0 with
`barmark import`, barmark.dev's Get Started gaining an import line, and
the songs bump, per RELEASING.md.

## Left to the builder

- **The XML parser.** The export only writes XML; reading needs a
  parser that keeps document order (MusicXML's meaning depends on it),
  works in browsers, Node and Bun, never fetches the DTD, and is small
  and maintained, pinned exactly. `fast-xml-parser` with
  `preserveOrder` is the likely choice; another that meets these is
  fine.
- Module layout, internal types, and the exact diagnostic wording.
- How the `.mxl` reader finds the rootfile (`META-INF/container.xml`,
  else the first `.musicxml`/`.xml` in the archive).

## Claude's calls (for Kevin to check)

1. Note sets and voicings are read only from chord parts (every chord's
   span is slashes or one held attack, every note on the grid); other
   parts with chords give their chords alone. Parts of notes alone are
   read only from barmark's own files or with `--part`.
1a. Part lines (several staves or voices in a part) are not read yet.
2. The output is canonical barmark, and must parse without errors;
   unreadable chords become `?`.
3. Bold words at a bar's start become `## Headings`; other words, words
   on a bar.
4. Parts with identical chords merge into one line; differing ones
   become `part:` parts; parts without chords are skipped.
5. Repeats barmark can't hold are written out in played order, with a
   warning.
6. Off-grid chords snap to the nearest beat (with a diagnostic) unless
   an eighth or triplet group reaches them.
7. `.mxl` is supported with no new dependency; one dependency is added
   for XML parsing.
8. The round-trip yardstick compares what plays, not how the chart is
   written.
9. No grammar changes; gaps found go to Kevin as a list.
