# MusicXML import: design

Status: draft for Kevin's review (2026-11-05). Kevin skipped the opening
design questions and asked for a design from Claude's recommendations,
then decided several points in review; those are marked as his. The
lists at the end separate his decisions from Claude's calls.

## Intent

The other direction of the MusicXML export (2026-11-03): a lead sheet or
score from MuseScore, Dorico, Sibelius, Finale or iReal Pro becomes a
barmark chart that reads, plays and prints as the original's harmony
does: its chords, and the note sets, voicings and part lines barmark
already writes. That brings existing charts into barmark without
retyping them, and closes the loop on the export: a chart that goes out
to MusicXML and comes back plays the same, and reads as close to how it
was written as the file allows.

The roadmap (BRIEF.md, packages item 4) lists converters to and from
MusicXML; the export design said import comes later, in the same
package.

## Goals

- `importMusicXml(xml: string, options?: { part?: string })` in
  `@barmark/musicxml` returns `{ text, diagnostics }`: a barmark chart in
  canonical form (as `barmark format` prints it), and what was dropped,
  approximated or left as `?`. A diagnostic is `{ severity: "error" |
  "warning", message, part?, measure? }`, `measure` being the file's
  measure `number` attribute.
- `readMxl(bytes: Uint8Array): Promise<string>` unpacks a compressed
  `.mxl` file to its MusicXML, with no dependency (the platform's
  `DecompressionStream("deflate-raw")`, in Node 20.6+, Bun and browsers).
- `barmark import <file.musicxml|file.mxl> [--out file.chart.md]
  [--part name]` in `@barmark/cli`, following `export`'s conventions for
  `--out` and output: the chart to standard output or the file,
  diagnostics on standard error as `file: measure N (Part): message`.
  Exit 1 when the import produced nothing (an error), else 0.
- **The chart always parses without errors.** The importer parses its
  own output; an error there is an importer bug, reported as an error
  diagnostic (and every test asserts there are none).
- **Round trip:** every fixture chart within scope (see "Testing"),
  exported and imported, plays the same as the original.
- **Never throws.** Bad XML, an unsupported structure or a file with
  nothing to import gives an empty `text` and an error diagnostic.
- **The export marks a note set's root** (see "The marked root"), so
  `!` survives a round trip.

## Non-goals

- **Melody.** Notes are read only as note sets, voicings and part lines,
  in parts whose notes behave as chords ("Notes"); a melody never
  becomes a run of note sets.
- **Chord recognition.** The importer never names chords from notes;
  notes come in as notes, or not at all ("No chord symbols").
- **Rhythm figures:** accents, hits, pushes and pedal marks. A push
  comes back as the rhythm the export wrote for it (`| D / / /_G | / |`),
  which plays the same; it isn't marked as a push.
- **Lyrics** as `<lyric>` syllables; layout, fonts, page and system
  breaks; MIDI.
- **Grammar changes.** The importer writes only what the grammar has.
  Gaps it finds become diagnostics, and a list of them for Kevin.
- **A barmark.dev import page.** A natural follow-up (drop a file on the
  playground), designed separately.

## Anti-goals

- A wrong chord printed with confidence. An unreadable chord is `?` with
  a warning and its original text kept, never a guess.
- Notes that move. A note is placed exactly or its part is read as
  chords alone.
- Output that doesn't parse, or that barmark would reformat.
- A wall of diagnostics: each kind of loss is reported once per part,
  with a count and the first few measures ("notes read as a melody and
  left out in 64 measures: 1, 2, 3, …").

## What it reads

| MusicXML | barmark |
|---|---|
| `work-title` (else `movement-title`) | `# Title` |
| `creator` composer, lyricist, arranger; `rights` | credit lines (7.5); typed page `<credit>`s when there are no `creator`s |
| `<harmony>` | a chord symbol ("Reading a chord symbol"); `kind` `none` is `N.C.` |
| `<key>` | `key:` (major and minor; another mode as its relative major or minor, with a warning) |
| `<time>` | `time:`; a change for one bar that changes back is 2.4's one-bar meter |
| `<sound tempo>` or a `<metronome>` | `tempo:`; rit. and accel. words as 7.2's gradual changes |
| `<swing>` (MusicXML 4.0) | `feel:` |
| `<repeat>`, `<ending>` | `\|: … :\|`, `x N`, endings (5, 5.1); a repeat of a whole line or section as `x N` on it |
| segno, coda, `<sound>` `dalsegno`/`dacapo`/`tocoda`/`fine`, words matching 5.2's table | direction cells |
| `<rehearsal>` of letters or digits | `@A` |
| bold `<words>` above, at a bar's start | `## Heading` |
| `<words>` below the staff | a text line before that bar's row (lyrics, `###` notes) |
| other `<words>` | words on the bar (2.6) |
| a fermata at a bar's end (on the bar line or its last note) | `...` after the bar |
| rests | `--` (silence) |
| notes with a `<harmony>`, attacked together and lasting its span | a voicing, `Cmaj7{E3 G3 B3}` ("Notes") |
| notes attacked together with no `<harmony>` | a note set, `{C4 E4 G4}` |
| a chord or notes held on | `/` |

Marks that belong to the whole score (headings, rehearsal marks,
directives, jumps) are read once, from whichever part carries them: the
export writes them over the top part only, and other programs vary.

### The export's own marks

The export adds text for programs that ignore parts of MusicXML. The
importer reads each back as what it stands for, never as extra words:

- words `?` alone on a bar with no `<harmony>`: `?`;
- "×N" words beside a backward repeat (Dorico ignores `times`): part of
  that repeat;
- `times="1"` with the words "repeat as needed": `x ...`;
- a no-break space after a leading "A" (Dorico drops a leading "A"):
  a plain space;
- per-beat slash notes, and slash notes in general: rhythm only.

### Reading a chord symbol

In order, the first that gives a chord barmark's grammar accepts
(Kevin agreed the order, 2026-11-05):

1. **Its meaning:** root, `kind`, `<degree>`s and bass, built through
   barmark's chord model and printed canonically, at concert pitch
   through the part's `<transpose>`. When meaning and display text
   disagree, meaning wins (as Dorico reads it).
2. **Its display text:** the root, then `kind`'s `text` (and the bass),
   parsed as a barmark chord symbol. This catches `kind="other"` used as
   text only (`<kind text="7alt">other</kind>`). It reads what the
   program printed; it isn't a guess.
3. **Otherwise `?`,** which always warns, with the original written as
   words on the bar ("C(♭9♯11)"). This covers qualities outside
   Appendix A (`Tristan`, `Neapolitan`), degrees barmark can't spell,
   and a `<function>` (roman numeral) with no root.

### No chord symbols

A file with no `<harmony>` anywhere imports its notes as note sets when
`@barmark/musicxml` wrote it; any other gives an error naming the parts
that hold notes and the `--part` to import one ("no chord symbols;
these parts have notes: Piano, Bass. Import one as note sets with
--part"). Naming a note set is a linter's job later (4), never the
importer's (Kevin agreed, 2026-11-05).

Chord symbols exported as plain text (older Sibelius and Finale files
write `<words>Cmaj7</words>`) stay words on their bar, which is honest
about where they were placed, with one diagnostic: "text that looks like
chord symbols in 12 measures; the program exported them as text".
"Looks like" means the whole text parses as a barmark chord symbol.

### Placing attacks in a bar

An attack's onset (a chord symbol's, or a note's) is its position in the
bar, from `<offset>` and the durations, `<backup>`s and `<forward>`s
before it in its voice. Each line's bar is written on the coarsest equal
grid that puts every onset on a slot boundary: one slot, then halves,
then beats, then the beat's subdivisions (2.1). An onset off the beat
grid is written as a group (2.2) when a two- or three-member group of
its beat reaches it exactly (an eighth, a triplet), or as a dotted pair
(¾ and ¼ of a beat). A **chord symbol** finer than that moves to the
nearest beat with a warning; a **note** never moves ("Notes"). Anything
held over a slot or bar line is `/`. A bar identical to the bar before,
in the same line, is `%`.

### Notes

The export writes a chord as a `<harmony>` over slash notes, a voicing
as a `<harmony>` over notes that start and end with it, and a note set
as notes with no `<harmony>`. A note set is therefore indistinguishable,
bar by bar, from a melody under a held chord, so the importer decides
per part:

- **A chord part** reads its notes: every chord's span holds slash notes
  (a plain chord) or one attack of notes held to the span's end (a
  voicing), and every attack lands exactly on the grid. Attacks with no
  `<harmony>` are note sets.
- **Any other part with chords is a melody part:** its chords are read
  and its notes left out, with one diagnostic. A lead sheet is the usual
  case.
- **A part with notes and no chords** (a bass line) is read as note sets
  when `@barmark/musicxml` wrote the file (its `<encoding><software>`),
  or when it is named with `--part`; otherwise it is listed in one
  diagnostic with the `--part` to import it, so a full score doesn't
  import every instrument as note sets.

Pitches are sounding pitch (4.1), through the part's `<transpose>`
(octave changes included), and always carry octaves. A voicing note
that isn't in its chord (an error in 4.2) drops the voicing: the chord
is written alone, with a warning.

### The marked root (`!`)

A note set's marked root (`{D3 E3! G3 B3}`) has no natural home in
MusicXML, which records a root only inside a `<harmony>`, and a hidden
`<harmony>` would come into Dorico and MuseScore as a chord symbol.
Today the export drops it silently. Kevin's decision (2026-11-05): the
export writes an XML processing instruction, `<?barmark root?>`, as the
first child of the root note's `<note>`, and the importer reads it back
as `!`. Other programs ignore it, so nothing changes there; a file
re-saved by another program loses it, and there is nothing to warn
about. The export change ships with the import: a CHANGELOG entry, and
a test that the marker is written and the file still validates.

### Part lines

Kevin's decision (2026-11-05): part lines (7.6) are imported. A part's
staves and voices are its lines, the export's layout read backwards
(`voicesFor` in `measure-xml.ts`):

| MusicXML | Line |
|---|---|
| staff 1, its first voice | the first line; it carries the chords |
| staff 2, its first voice | the second line |
| a second voice on staff 1, then on staff 2 | the third and fourth lines |
| one staff, voices in order | lines one to four |

- **Names.** MusicXML doesn't keep line names, so the importer supplies
  them: `RH`, `LH`, `RH2`, `LH2` on a two-staff part, `1` to `4` on a
  one-staff part (`Gtr.1`).
- **When lines are read.** The first line must be a chord line
  ("Notes"); the others hold notes only, so they need only land exactly
  on the grid (chords of notes are note sets, rests `--`). A part whose
  first line is a melody, whose other lines fall off the grid, or which
  has more than four voices is read as its chords alone, with one
  diagnostic naming why.
- **A line that rests** through a whole system is left out of it, which
  the grammar reads as resting (an LH-only intro writes `Pno.LH` alone).
  A part with one line throughout is written bare (`Pno |`).

### Parts

Decided system by system, as the grammar reads several parts (7.4)
(Kevin agreed, 2026-11-05):

- **Tutti where they agree.** In a system where every playing part has
  the same chords, one unlabelled (tutti) line is written; where they
  differ, each part writes its labelled line. Morning Song's intro comes
  back as one line and its verse as `Gtr` and `Pno`.
- **"The same"** means the same chord at every slot, at concert pitch. A
  part carrying voicings, note sets or part lines in a system is never
  merged there, since merging would drop its notes.
- **Resting parts.** A part that rests through a system (no chords, no
  notes) is left out of it, which the grammar reads as tacet, and
  doesn't stop the others merging. A part with chord symbols in some
  sections only (a guitar's solo) rests elsewhere.
- **One part throughout** (a lead sheet, or parts that always agree)
  gives a chart with no `part:` lines, unless part lines need a label.
- **What a part keeps:** `part: Gtr = Electric Guitar 1` from
  `<part-name>` and `<part-abbreviation>`; a label cleaned to the
  grammar's letters and digits (`Pno.` is `Pno`), else the name's first
  letters, numbered to tell duplicates apart; `instrument:` when the
  part's `<instrument-name>` (or MIDI program) is one barmark knows, so
  clefs and transposition survive the way back out.
- **`--part name`** imports one part alone (name or abbreviation, any
  case), with its notes as note sets when it has no chords.

### Sections and repeats

- A heading starts a section. A section whose bars (and every part's
  lines) match an earlier section of the same name exactly is written
  as a replay (an empty heading, 6), as charts write it; the export
  writes replays out in full, so this restores how the chart read.
- Repeats pair within a section (5). A file whose repeats, endings or
  jumps can't be written that way (a repeat crossing a heading, endings
  without a repeat, two codas) is written out in played order instead,
  with a warning, so it still plays the same.

### Systems

A system (one row of bars, with every part's lines) holds up to four
bars, the grammar's recommended phrasing. A new system starts at every
heading, repeat mark, ending, direction, `...`, text line and directive,
and wherever the parts' agreement changes (tutti to labelled, or a part
starting or stopping).

## Testing

- **Round trip (the yardstick):** every fixture chart in the barmark
  and musicxml packages (the grammar's examples, `examples/`, the
  export's test charts) that uses no accents, hits, pushes or pedal:
  export, import, and compare the expanded play order (`expand`) part by
  part and bar by bar: meter, key, tempo, feel, section name, rehearsal
  mark, words, and each line's timeline of chords and notes. Lines are
  compared by position, since the file doesn't keep their names. The
  comparison is of what plays, not how it is written.
- **Reads as written:** Morning Song comes back with its tutti intro and
  its `Gtr`/`Pno` verse; a chart with a replayed chorus comes back with
  the replay; a marked root comes back with `!`.
- **Real files from the programs,** small and made by us so their
  licence is clear, each with its expected chart checked in. MuseScore 4
  is installed on the VM and on mac-bench (Kevin, 2026-11-05): its
  command line converts headless on the VM, so MuseScore fixtures (lead
  sheets, a piano part, one `.mxl`) are regenerated by a script. Dorico
  files come through mac-bench if `File.Export` runs without a dialog (a
  spike decides; otherwise Kevin exports a few once). Finale, Sibelius
  or iReal Pro files as Kevin can produce them. CI reads the checked-in
  files and never needs either program.
- **Dorico round trip** through mac-bench: barmark → export → Dorico →
  Dorico's MusicXML → import → same play order. It runs only where
  `MAC_BENCH_URL` is reachable, not in CI.
- **The cases above, one test each:** a melody part (lead sheet) gives
  chords and no note sets; a piano part with real piano writing gives
  chords alone; a voicing with a note outside its chord gives the chord
  alone; `kind="other"` with readable text comes in by its text; a
  `Tristan` comes in as `?` with its text as words;
  `<words>Cmaj7</words>` stay words with one diagnostic; a file with no
  harmony gives the `--part` error; each of the export's own marks
  reads back as what it stands for.
- Malformed input (bad XML, a truncated or rootless `.mxl`) never throws.
- For every test: the chart parses with no errors, and `format` leaves
  it unchanged.

## Releases

`@barmark/musicxml` 0.5.0 (import, and the marked-root export change),
with a README section on importing; `@barmark/cli` 0.6.0 with
`barmark import`; barmark.dev's Get Started gaining an import line; the
songs bump; per RELEASING.md.

## Left to the builder

- **The XML parser.** The export only writes XML; reading needs a parser
  that keeps document order (MusicXML's meaning depends on it), works in
  browsers, Node and Bun, never fetches the DTD, exposes processing
  instructions (for `<?barmark root?>`), and is small, maintained and
  pinned exactly. `fast-xml-parser` with `preserveOrder` is the likely
  choice; another that meets these is fine.
- Module layout, internal types, and the exact diagnostic wording.
- How the `.mxl` reader finds the rootfile (`META-INF/container.xml`,
  else the first `.musicxml`/`.xml` in the archive).

## Kevin's decisions (2026-11-05)

1. Import note sets, voicings and part lines, not chords alone.
2. The export marks a note set's root with `<?barmark root?>`; the
   importer reads it back as `!`.
3. A chord symbol is read by its meaning, then its display text, else
   `?` with the original kept as words.
4. A file with no chord symbols imports note sets only from barmark's
   own files or with `--part`; chord symbols written as text stay words,
   with one diagnostic.
5. Parts merge into tutti lines system by system where their chords
   agree; parts with notes never merge; parts keep name, label and
   instrument.
6. MuseScore 4 goes on the VM and on mac-bench.

## Claude's calls (for Kevin to check)

1. A part's notes are read only when it is a chord part (every chord's
   span is slashes or one held attack, every note exactly on the grid);
   otherwise its chords alone. Parts of notes alone come in only from
   barmark's files or with `--part`.
2. Line names are `RH`/`LH`/`RH2`/`LH2` or `1`–`4`, since the file
   doesn't keep them.
3. Chord symbols off the grid snap to the nearest beat with a warning;
   notes never do.
4. A section identical to an earlier one of the same name comes back as
   a replay; a bar identical to the one before comes back as `%`.
5. Repeats barmark can't hold are written out in played order, with a
   warning.
6. Bold words above at a bar's start are headings; words below are text
   lines; other words are words on the bar; a fermata at a bar's end
   is `...`.
7. The `<?barmark root?>` marker goes inside the root note's `<note>`.
8. `.mxl` needs no new dependency; XML parsing adds one.
9. No grammar changes; gaps found go to Kevin as a list.
