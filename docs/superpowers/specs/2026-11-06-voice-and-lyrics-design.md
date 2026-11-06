# Voice parts and lyrics — design

Status: approved (Kevin, 2026-11-06, after the lead-sheet preview). A grammar change, with
five smaller grammar changes from the MusicXML import riding along. It
replaces BRIEF.md roadmap item 5 ("a structured lyric line").

## Intent

Today a lyric is a free text line between rows. Nothing knows which
word falls on which beat, so a chart can't show a singer where the words
go, and a score with a melody and lyrics can't come into barmark without
losing both: the MusicXML import (musicxml 0.5.0) drops the melody and
writes the words as text lines.

Kevin's aim: **a score with a melody and lyrics converts from MusicXML
into barmark and back again without losing format or information**, and
the same chart converts to ChordPro and MIDI. Rendered, a chart shows the
melody and its syllables together, each at its place in the bar.

Two kinds of song need this, and the design serves both:

- **Sung melodies**: a voice part with pitches and rhythm, a syllable on
  each note.
- **Rhythmic words with no melody**: rap, spoken word, a chant, where
  the place each syllable lands matters as much as what they say. Kevin
  (2026-11-06): lyrics are placed "with the beats of the bar" for this
  reason.

## Goals

- A **voice part** writes its melody with the notes and rhythm barmark
  already has (note sets, slots, groups, dots, holds), and a **syllable
  on each note**.
- A **lyric row** places syllables on the beats of the bar, with no
  melody, and gives later verses their words.
- Several verses: by section replay, and by pass within a repeat.
- **Neither is required.** Free-form text lines stay what they are.
- MusicXML import and export carry melody and lyrics both ways, losing
  nothing barmark can say.
- The lyric model already fits ChordPro and MIDI (phases 2 and 3), so
  neither needs a grammar change later.

## Non-goals (phase 1)

- ChordPro and MIDI converters: phases 2 and 3, outlined at the end.
- Melodies on parts other than a voice: a horn line or a guitar riff
  stays out of the import (named in a warning, as today). The grammar
  doesn't forbid writing one; the importer just doesn't produce it yet.
- Slurs, dynamics, ornaments, grace notes, lyric font styling and
  per-syllable placement above or below the staff.
- Rhythms the grammar can't write (nested tuplets, a dot on one member
  of a group of three): the import snaps them and reports a loss, as it
  does for chords today.

## Anti-goals

- **A syllable written twice.** Every syllable lives in exactly one
  place: on a note, or in a lyric row. Both over the same bars is an
  error, so a chart can't disagree with itself.
- **Lyrics that need a melody.** A lyric row stands alone; rap must not
  need fake notes.
- **Changing what any chart means today.** Text lines stay text, and a
  chart with no voice part or lyric row reads exactly as before.

## 1. A voice part and its melody

A voice part is an ordinary part (7.3, 7.4, 7.6), usually with
`instrument: voice` (already on the list: treble clef, sounding, GM 53).
Its melody uses existing syntax: note sets for pitches, slots and `_`
groups for rhythm, a dot for dotted pairs, `/` to hold (a tie), `--` for
a rest.

A lead sheet is one part whose **first line carries the harmony** and
whose second line is the melody, exactly as part lines already work
(7.6: the first line holds chords, the other lines hold notes):

```
# Amazing Grace
part: Vox = Voice, instrument: voice
key: G, time: 3/4

## Verse
Vox       | [1/4] N.C.    | G                           | G          / G7       | C            / /      | G              |
Vox.Mel   | [1/4] {D4}:A- | {G4}:maz- / {B4}:ing_{G4}:/ | {B4}:grace / {A4}:how | {G4}:sweet / {E4}:the | {D4}:sound / / |
lyrics 2: | 'Twas         | grace / that                | taught / my           | heart / to            | fear / /       |
```

It draws as one row group for the part: chords, the melody's pitch
names, then each verse's syllables under the notes they land on (the
preview Kevin approved, 2026-11-06).

In a band chart the singer can be a part of its own beside the
rhythm section (`Gtr | G | …` and `Vox | {G4}:… |` in one system).

**A lead sheet's chords are on the voice part's first line** (Kevin,
2026-11-06): it is how part lines already work and matches MusicXML,
where a lead sheet's `<harmony>` sits on the voice part. Chords as a
part of their own would make two instruments in MusicXML, which isn't
how a lead sheet comes in from MuseScore or Dorico. A lyric row and
syllables belong to the part's melody line: its second line in a lead
sheet, its only line when the singer is a part of its own.

## 2. Syllables on notes (Kevin, 2026-11-06)

A syllable follows its note after a colon: `{G4}:maz-`.

- **The syllable** runs to the next space, `_`, `|` or `{`; it may hold
  any other character (`in'`, `don't`, `¡Ay`). A dot directly after the
  brace is the rhythm's dot, so a dotted note with a syllable is
  `{C4}.:maz-`.
- **A trailing `-`** says the word continues: `{G4}:maz-` then
  `{B4}:ing` is "mazing". A syllable with no trailing `-` ends its word.
  (MusicXML `syllabic` begin/middle/end/single comes from these.)
- **A bare note is unsung** (an "ooh", a vocalise, a lick on the voice
  staff): MusicXML writes no `<lyric>` on it. **`:/` holds the syllable
  before it** over a new note, a melisma: `{B4}:ing_{G4}:/` (MusicXML
  `<extend>`). A tied note (`/` in the melody) holds its syllable
  without a mark. (Kevin, 2026-11-06.)
- `%` on a voice line copies the bar's notes, not its syllables, as it
  doesn't copy words (2.6). *Claude's call.*
- **`~` joins two syllables on one note** (an elision: `{C4}:the~end`).
  (MusicXML `<elision>`.) *Claude's call.*
- A syllable only follows a note set. On a chord, `/`, `--`, `N.C.` or
  `?` it is an **error**.
- A note set of two or more notes takes one syllable (a choir's
  divisi sing the same word).

## 3. Lyric rows on the beats (Kevin, 2026-11-06)

A **lyric row** writes syllables in bars, divided the way a chord row is
divided:

```
        | Am7                       | D9                       |
lyrics: | I_got roll-_in' on_the /  | beat_and -- I_keep it_up |
```

- `lyrics:` then a bar line. Each slot holds a syllable, `/` holds the
  one before, `_` splits a slot, `--` is a breath (no syllable sounding).
  Trailing `-` and `~` work as in section 2. **Every other token is a
  syllable**, `Fine` and `x2` included: a lyric row writes no structure
  (repeat marks, endings, marks, one-bar meters, `%`, `...`, words);
  those are the system's. A `...` cell isn't a bar, so the row has no
  cell for it. *Claude's call.*
- **It covers the bar line just above it**: in a labelled chart, the
  system above (7.4); in a single-part chart or after a tutti line, that
  one bar line. It has the same bar count; a different count is an
  **error**. Several lyric rows may follow one bar line (verses).
  *Claude's call.*
- **Under a replay heading** (section 4) the rows cover the replayed
  section's written lines in order, one row per line, each with that
  line's bar count. *Claude's call.*
- **It ends the system** it follows, as any non-bar line does (7.4).
- **Whose words.** In a chart with a voice part, a lyric row is that
  part's (the first part with `instrument: voice`, else the first part
  with syllables on notes). With no voice part it is the chart's words,
  sung or spoken over the band. *Claude's call.*
- **Against a melody**: each syllable lands on the note sounding at its
  onset. A syllable where the voice has no note starting is a
  **warning** (it can't go to MusicXML, which hangs syllables on notes).
  A system whose voice line has syllables of its own and also a lyric row
  is an **error**, except numbered rows for verse 2 and later (section 4).
- Today `lyrics:` is a near miss for `lyricist:` (7.5) that warns. That
  stays for `lyrics:` followed by anything other than a bar line.

## 4. Verses

- **By section** (recommended way; Kevin agreed 2026-11-06). A verse
  brought back by name replays the bars and takes its words from a lyric
  row under the heading. The grammar already says "a section holding
  only lyrics … replays the changes"; that becomes the structured form:

  ```
  ## Verse
  lyrics: | 'Twas | grace / that | taught / my | heart / to | fear |
  ```

  A replay without a lyric row sings the words it was written with.
- **Numbered verses** (Kevin, 2026-11-06): `lyrics 1:`, `lyrics 2:` …
  stack verses on the bars above them, anywhere, as a lead sheet stacks
  them. The number is the verse, MusicXML's `<lyric number="N">`.
  - Outside a repeat they don't change the play order: the bars play as
    written, and the verses are the words sung on them each time the
    song comes round (MusicXML means the same).
  - Inside a repeat (`|: :|` or `x N`, on a bar line or a heading),
    verse N is sung on pass N; a second ending holds only verse 2's
    words. A jump's pass back (D.C., D.S.) doesn't count as a pass.
    *Claude's call.*
  - Syllables on the notes are verse 1. A `lyrics 1:` row over notes
    that carry syllables is an **error**; so is mixing an unnumbered
    row with numbered ones over the same bars. *Claude's call.*
- Free-form text lines stay legal everywhere and mean nothing musical.

## 5. Drawing (`@barmark/render`)

A voice line draws as a row under the chords: each note as its pitch
name at its place in the bar, and the syllable under it, both spaced
by beat like chords are (the mockup Kevin approved on 2026-11-06). A
lyric row draws as syllables alone, spaced by beat. Either row may be
absent. Hyphens draw between syllables of a word, and a held syllable
draws an extender line. The exact typesetting is the builder's.

## 6. The parse

`parseChart` exposes syllables so converters never re-read text:

- each note-set slot on a part line gains `syllable?: { text, continues,
  elision? }`;
- each played bar gains `lyrics`: per verse, the syllables with their
  onset (beat position) and the note they land on, if any;
- a lyric row is a new kind of line in the parse tree, so `printChart`
  round-trips it, and the canonical form aligns its cells like a bar
  line's.

Field names are the builder's; the shape is what matters: onset by
beat, the verse number, whether the word continues, and the note.

## 7. MusicXML

- **Export**: a voice line's syllables become `<lyric number="1">` on
  their notes with `syllabic`, `<extend>` on held syllables and
  `<elision>`. Verse rows become `number="N"` (by pass) or the written-out
  verse's lyrics (by section, since export writes replays out). A lyric
  row with no melody becomes a one-line slash-notated rhythm staff
  carrying the syllables, marked with a processing instruction
  (`<?barmark lyrics?>`, as `<?barmark root?>` marks a root) so the
  import turns it back into a lyric row: barmark → MusicXML → barmark
  round-trips too. *Claude's call.* Today's text-line lyrics keep their
  current export.
- **Import**: a part with lyrics, or with `instrument: voice` in its
  program's sound, keeps its melody as the voice line (the harmony
  stays its first line, as the import writes it now) with syllables on
  the notes. Verse 2 and later on a repeat come back as numbered rows;
  a section that comes back with the same notes and new words becomes a
  replay with a lyric row. The current "lyrics as text lines" step goes,
  and so does its placement warning. Rhythms the grammar can't write
  snap with a loss, as chords do.
- **The round trip** is the acceptance test, in both directions: the
  MuseScore fixtures (the existing lead sheet, whose two verses are
  stacked on bars written once, and new ones with a melisma, a tie across a bar, a pickup,
  an elision) come in and go back out with the same notes, rhythm and
  lyrics.

## 8. The grammar changes riding along (Kevin, 2026-11-06)

Decided from the MusicXML import, shipped in the same grammar change:

1. **`---` ends a system.** A line of only `---` (three or more
   hyphens) ends a labelled system and means nothing else. The importer
   writes it between systems that would otherwise join, and stops
   writing its "X tacet" / "X enters" cue lines.
2. **A resting part blocks a tutti line.** The grammar stands; the
   import spec's call 10 is confirmed.
3. **A leading `\` makes a text line**, and the backslash isn't shown.
   The escaped-pipes warning (9) stays when the rest of the line still
   has `\|`.
4. **A bare replay of `## X x2` plays once.** One sentence in section 6,
   and a test.
5. **A melody in thirds is not voicings** (import only): a bar's notes
   read as voicings only where its attacks land on chord changes or slash
   beats. No grammar change.

Each goes into the draft's decisions log with the date.

## 9. Later phases (outline)

- **Phase 2, ChordPro** (`@barmark/chordpro`, `barmark import` and
  `export --chordpro`): words with each chord at the syllable it falls
  on, `{start_of_verse}`/`{soc}` to headings. Needs from phase 1: each
  chord's onset against the syllables' onsets, which section 6 gives.
  A ChordPro file has no rhythm, so its import writes free text lines,
  or lyric rows with one syllable per chord change (to decide then).
- **Phase 3, MIDI** (import and export): lyric meta events at note
  onsets, which beat placement already gives; the hard parts are
  quantising performed timing, finding chords in what parts play, and
  splitting tracks into parts.

## Decisions

| Decision | By |
|---|---|
| Melody is a voice part's notes; lyrics can also stand alone | Kevin, 2026-11-06 |
| Lyric rows are placed by beats, for rap and spoken word | Kevin, 2026-11-06 |
| Syllables can be written on notes, with a `:` separator | Kevin, 2026-11-06 |
| Verses by section replay; numbered rows only inside a repeat | Kevin, 2026-11-06 (Claude's recommendation) |
| ChordPro and MIDI import and export, as later phases | Kevin, 2026-11-06 |
| A lead sheet's chords on the voice part's first line, melody on its second | Kevin, 2026-11-06 (after the preview) |
| A bare note is unsung; `:/` holds a syllable over a new note | Kevin, 2026-11-06 |
| Numbered verse rows anywhere; inside a repeat, verse N on pass N | Kevin, 2026-11-06 |
| The five import grammar changes (section 8) | Kevin, 2026-11-06 |

## Claude's calls

1. `~` for an elision.
2. A lyric row writes no structure and must match its system's bar count.
3. A lyric row belongs to the chart's first voice part.
4. The importer keeps a melody only for a part with lyrics or a voice
   instrument (phase 1).
5. A lyric row covers the bar line or system just above it; under a
   replay heading, one row per written line of the section.
6. In a lyric row every token but `/`, `--`, `_`, `~` and a trailing `-`
   is a syllable; it writes no structure.
7. Inside a repeat verse N is pass N; a jump's pass back isn't a pass;
   `lyrics 1:` over syllabled notes, and unnumbered with numbered rows,
   are errors.
8. `%` on a voice line copies notes, not syllables.
9. A lyric row with no melody exports marked `<?barmark lyrics?>`, so it
   comes back as a lyric row.
10. The lyric row's staff (Task 7) is a part after the chart's parts,
    named "Lyrics" with an instrument of the same name at MIDI volume 0:
    words have no pitch, so a program shouldn't play one. It is a
    one-line staff with a percussion clef and unpitched slash notes
    (stems up, the row's rhythm): a slash at each syllable's onset in
    any verse, held while a verse holds, a rest where every verse
    breathes. A part exported alone (`part`) leaves it out.
11. `:/` writes `<extend/>` alone on the held note, as section 7 says,
    and also `<extend type="start"/>` on the syllable it holds: MuseScore
    4.7 drops a `<lyric>` with no text and keeps a melisma only as an
    extend on its syllable (FINDINGS.md).
