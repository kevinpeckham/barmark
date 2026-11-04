# MusicXML notation: rhythm slashes, beams, clefs, instruments, two-staff keyboards — design

Status: draft for Kevin's review (2026-11-04). Kevin asked for Claude's
best recommendations on three questions raised by Dorico imports (rhythm
slashes, clefs, arrangement gaps) and approved this batch; the decisions
below are Claude's calls, gathered at the end. No grammar change: every
item is how `@barmark/musicxml` writes what barmark already says.

## Intent

Kevin's Dorico imports of Peaceful Dreams, Morning Song, Example Song
and a three-part arrangement (bass guitar, piano, electric guitar) now
read correctly, with the music right. What's left is how they look to a
player:

- A push or a chord on the "and" (`D / / /_G`) shows as four even
  slashes in Dorico: the rhythm is in the file but hidden.
- Eighths and sixteenths are flagged one by one: the file has no beams,
  and Dorico doesn't add them on import.
- One low pedal note (`{D2}`) puts all 62 bars of Example Song in bass
  clef.
- A bass guitar part is notated at sounding pitch, an octave below how
  bass parts are written; a guitar part likewise.
- A piano part is one treble staff, its left hand on ledger lines.

The aim: a chart imported into Dorico or MuseScore reads like a part an
engraver would hand a player, with no hand fixing.

## Goals

1. **Rhythm slashes** in a bar whose chords don't all fall on the beat.
2. **Beams** on eighths and shorter, for slashes and real notes alike.
3. **Clefs** chosen by the instrument, or by bars, with clef changes for
   a run of low or high bars.
4. **Instruments** recognised from the part's name: clef, octave
   transposition and staves.
5. **Two-staff keyboards**: piano-like parts on a grand staff, notes
   split between the staves by pitch.

## Non-goals

- Two independent lines in one part (an arpeggio over a held left-hand
  note): that is new syntax, designed next with explicit instrument
  names. This design leaves room for it (see "Later").
- Engraving: system breaks, spacing, stem direction beyond the defaults.
- Transposing instruments other than the octave ones here (B♭ trumpet,
  E♭ sax): they come with explicit instruments.

## Anti-goals

- **Changing what plays.** Every item is notation. A test plays every
  export before and after: same notes, same lengths, same play order.
- **A wrong guess from a name.** A part name that isn't clearly an
  instrument in the table gets today's behaviour, never a guess.

## 1. Rhythm slashes

A bar is **rhythmic** when any attack in it (a chord, `N.C.`, `?`, a
note set, a voicing, a push's early note) starts off the beat grid of
2.1's beat, or sits in a tuplet. Otherwise it is a **beat** bar.

- A beat bar is written as now: one stemless slash per beat under slash
  style.
- A rhythmic bar of slashes is written in **rhythm notation**: slash
  noteheads with stems and beams, at the real rhythm. A chord's holds
  join its attack (`D / / /_G` is a D for three and a half beats and a
  G for half a beat), written as the values below. Slash style is off for
  the bar (MusicXML's `use-stems="yes"` region is not used: Dorico ends
  slash regions unpredictably, FINDINGS 2026-11-04).
- A bar mixing slashes and real notes already turns slash style off; its
  slashes follow the same rule (stemmed in a rhythmic bar, stemless in a
  beat bar).

**Values follow the meter.** A value that would hide a beat is split and
tied, as engravers write it: in 4/4 a note never crosses the middle of
the bar unless it starts on a beat and fills whole beats (a half on beat
2 is split; a dotted half on beat 1 is not); in 3/4, 6/8 and the rest,
no value starting off a beat crosses the next beat. This applies to real
notes too (today a value is written however `noteValues` first fits it).

## 2. Beams

Eighths and shorter are beamed within a beat (in 6/8, within its dotted
quarter), and within a half bar in 4/4 and 2/2 when all are eighths, as
is usual for eighth runs. A rest, a quarter or longer, or a beat
boundary breaks the beam. Tuplets beam within their group. Written as
`<beam number="1">begin|continue|end</beam>` (and `number="2"` for
sixteenths, and so on). Slashes in rhythmic bars beam the same way.

## 3. Clefs

In order:

1. The **instrument's clef** when the part names one (section 4).
2. Otherwise **by bars**: the part's clef is bass when most of its bars
   sit below middle C, else treble. A slash bar counts as treble, so a
   part of only slashes is treble. (Today it's by notes, so one long pedal note
   decides a whole chart.)
3. **Clef changes:** a run of consecutive bars that write notes and sit
   on the other side of middle C from the part's clef gets that clef for
   the run, back after it: Example Song opens in bass clef for its
   `{D2}` pedal and changes to treble at the Verse. A run must be two
   bars or more, or a single bar whose notes would need more than three
   ledger lines, so one stray note doesn't flip the clef.

A bar "sits below middle C" when most of its notes do. Slash bars vote
treble (amended with the plan, 2026-11-04: if they didn't vote, Example
Song's four pedal bars would make its whole part bass).

## 4. Instruments from the part's name

A small table, matched on whole words in the part's name, any case
(`part: Bass = Electric Bass` matches; `Bassoon` and `Bass Voice` don't):

| Words in the name | Instrument | Clef | Written | Staves |
|---|---|---|---|---|
| `bass` with `guitar`, `electric`, `upright`, `acoustic`, `double`, `fretless`, or `bass` alone | bass | bass | an octave above sounding | 1 |
| `guitar` (not with `bass`) | guitar | treble 8vb | an octave above sounding | 1 |
| `piano`, `keys`, `keyboard`, `keyboards`, `organ`, `rhodes`, `wurlitzer`, `synth` | keyboard | treble and bass | sounding | 2 |
| anything else | — | by bars (3) | sounding | 1 |

- barmark is concert pitch and stays so. A bass or guitar part writes
  its notes an octave up with `<transpose><octave-change>-1`, so a
  program shows the part as players read it and plays it where it
  sounds. A guitar's clef is `<clef><sign>G</sign><line>2</line>
  <clef-octave-change>-1</clef-octave-change></clef>`.
- The instrument is also named for playback: `<score-instrument>` with
  the program's instrument name (`Electric Bass`, `Electric Guitar`,
  `Piano`) and a General MIDI program, so a program picks a sensible
  sound. An unmatched part has neither, as now.
- A chart with no `part:` is unmatched.
- Explicit instrument names (next design) override the table.

## 5. Two-staff keyboards

A keyboard part has `<staves>2</staves>`, treble above and bass below.

- **Notes split by pitch:** middle C and above on the upper staff, below
  it on the lower. A note set is split, so `{G2 D3 B3 G4}` gives the
  left hand G2 D3 B3 and the right hand G4; a run of single notes
  (an arpeggio) moves between staves note by note.
- **Slashes** on the upper staff, with a whole-bar rest on the lower
  when the bar has no lower notes. The rest is shown (amended
  2026-11-04, Kevin's decision: Dorico honoured a hidden rest,
  `print-object="no"`, in some bars of Morning Song and not in others
  with identical XML; a shown rest is ordinary piano-chart engraving).
- **Chord symbols** above the upper staff.
- Each staff is its own voice in the measure (voice 1 upper, voice 5
  lower, as Dorico and MuseScore write), joined with `<backup>`.
- Clef changes (3) don't apply: each staff keeps its clef.

## Testing

- Unit tests for each item: the rhythmic-bar rule, meter-aware values
  (4/4 middle, 3/4, 6/8), beams (eighths, sixteenths, mixed, tuplets, a
  rest breaking), clef by bars, clef changes and their thresholds, the
  name table (each row, and Bassoon, Bass Voice, "Bass" alone), octave
  transposition and the guitar clef, the keyboard split (a note set
  across middle C, an arpeggio, a slash bar).
- **Playback unchanged:** the play test (`tests/play.ts`) follows the
  sounding pitches and lengths of every example and the grammar's
  examples, before and after.
- Schema: every export validates.
- Dorico: Kevin re-imports Example Song and Three Parts; the PR carries
  the PDFs.

## Release

`@barmark/musicxml` 0.2.0 (a minor: notation changes in every export),
then `@barmark/cli`, barmark.dev and songs, as RELEASING.md says.

## Later (the next design)

- **Two lines in one part** (`Pno.R |` and `Pno.L |`, or similar): a
  keyboard part then takes each staff's notes from its own line, and the
  pitch split applies only to a single line.
- **Explicit instruments** (`part: Bass = Electric Bass (bass guitar)`
  or a new directive): they override the name table and add the other
  transposing instruments.

## Calls Claude made (for Kevin to check)

1. Rhythm notation for a whole bar when any attack is off the beat;
   beat slashes otherwise.
2. Slash style is not used for rhythm slashes (stemmed slash noteheads
   instead), because Dorico ends slash regions unpredictably.
3. Meter-aware values (no value hides the middle of a 4/4 bar), for real
   notes too.
4. Beams within a beat; eighth runs within a half bar in 4/4 and 2/2.
5. Clef by bars, not notes; clef changes for runs of two bars or more
   (or one bar needing more than three ledger lines).
6. An instrument table from whole words in the name, with bass and
   guitar written an octave up and keyboards on two staves.
7. Keyboard notes split at middle C; slashes and chord symbols on the
   upper staff.
8. A minor release, 0.2.0.
