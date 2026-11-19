# @barmark/midi 0.4: a single line imports as its notes: design

**Status:** approved by Kevin, 2026-11-19 ("The MIDI note-line design
is approved, proceed with the plan"). The plan is
`docs/superpowers/plans/2026-11-19-midi-note-line.md`. The direction is
Kevin's (2026-11-12: a bass line imported from MIDI lost the difference
between a held note and a re-struck one; 2026-11-19: "A reads correctly",
section 5, and "proceed with the design"). My own choices are marked
**(design call)**. A fresh reviewer read it as its builder would, and
its four questions are answered in the text (6.3, 5, 4.2 and 3). No
grammar change.

It extends `2026-11-08-midi-design.md` ("the MIDI design" below; section
numbers with "MIDI" in front point there). That design's non-goals named
this as later work: "a bass line as note sets" and "sub-beat rhythm on
import".

## 1. Intent

`importMidi` reads harmony. It cuts the notes into stretches, names a
chord for each, merges equal neighbours and hands sync one symbol a
beat. That is right for a file of chords. For a file that is one line of
notes, a bass line or a melody, it loses what a player needs:

```
written:   | {E1} | {E1} {E1} {E1} {E1} | {A1} / {A1} / | {G1} {G1}_{G1} / {B1} |
MIDI back: | {E}  | /                   | {A}           | {G} / / {B}           |
```

- **A re-struck note becomes a hold.** Four quarter notes of one pitch
  and one whole note import alike. The grammar tells them apart (2.3: a
  repeated name is a re-attack, `/` is a hold) and `exportMidi` plays
  them differently, so the file is right and the import is where the
  difference is lost.
- **The octave is dropped.** `{E1}` comes back `{E}`.
- **Nothing finer than a beat survives.**

Kevin's file (`interbellum-bass-09.mid`, a played bass part exported
from a DAW; measured 2026-11-19 with the import's own note pairing)
shows a second loss, larger than the first:

| What | Measured |
|---|---|
| Notes | 491, at 480 ticks a quarter, tempo 115, 4/4 |
| Tracks | ten, one per region ("Intro", "Verse"…), on three channels, end to end in time |
| Steps that repeat the pitch before | more than half |
| Attacks within 6 ticks of a sixteenth | nine in ten (a sixteenth is 120 ticks) |
| Notes shorter than a 64th note | 22, plus zero-length ones the reader already drops |
| Attacks of two or more pitches | 3 of 465 (the last three, a closing chord each) |

Today's import treats each track and channel as its own stream, keeps
the lowest and leaves the others out as melodies (MIDI 5.2). So only
the first region is read: from the first Chorus to the last Verse the
chart is `N.C.`. A part cut into regions is how DAWs export, so this is
not a quirk of one file.

The MusicXML import already does what is wanted here: the same bass
line through `exportMusicXml` and `importMusicXml` comes back with its
attacks, octaves and rests.

## 2. Goals, non-goals, anti-goals

**Goals**

- A file whose notes are one line imports as that line: every attack,
  with its pitch and octave, on a grid as fine as sixteenths and
  triplets.
- A line cut into several tracks or channels is still one line.
- A played file, not only a drawn one, reads well: small timing errors
  snap, and what was rounded is reported.
- `--tracks` (`options.tracks`) on a band's file gives one track's line
  as its notes.

**Non-goals**

- **Several lines at once**: a melody over a bass, one part per track,
  `part:` lines, a piano's two hands. That is the wider design, later.
  A file that is not one line imports exactly as it does today.
- Exact note lengths. Attacks are exact; ends are read by the rule of
  section 5.
- Dead notes, accents, hits, pushes, swing (`feel:`), velocity.
- The MusicXML import, the MIDI export and sync: unchanged.
- Any grammar change.

**Anti-goals**

- A file that imports as chords today changing in any way. The seven
  `.mid` fixtures in `packages/midi/tests/fixtures/` must import byte
  for byte as before.
- Notes invented, or notes lost without a diagnostic that counts them.
- A throw, or a chart that does not parse.

## 3. When a file is one line

The test runs on the **pitched notes**: every note outside channel 10
on the tracks `options.tracks` names, or on every track when it names
none. It runs before MIDI 5.2's choice of harmony streams, which the
line reading does not use. Notes are paired as MIDI 5.2 pairs them, the
sustain pedal included.

1. **Short notes** are set aside first (4.1).
2. The notes, by start, are grouped into **attacks**: a note joins the
   attack before it when it starts less than a 32nd note after that
   attack's first note; otherwise it starts a new attack. (Exactly a
   32nd later is a new attack, so 32nd notes stay apart.)
3. The notes are **one line** when both hold:
   - at most one attack in ten has two or more different pitches;
   - at most one attack in ten starts while a note of an earlier attack
     still has more than a sixteenth note left to sound.

Measured with this rule (2026-11-19):

| File | Attacks | Several pitches | Struck under a ringing note | Reading |
|---|---|---|---|---|
| Kevin's bass file | 465 | 0.6% | 0.2% | a line |
| `band.mid`, track 4 alone | 8 | 0% | 0% | a line |
| `bass-and-chords.mid` | 32 | 47% | 72% | chords, as today |
| `hymn.mid` | 10 | 60% | 40% | chords, as today |
| `lead-sheet.mid` | 9 | 78% | 22% | chords, as today |
| `band.mid`, `comping-guitar.mid`, `piano.mid`, `piano-comping.mid` | 8–29 | 55–100% | 0–66% | chords, as today |

Consequences worth knowing:

- Tracks and channels do not matter to the test. Regions end to end are
  one line; a melody and a bass sounding together are not, and import
  as today (`harmony-from-melody`).
- A line played with the sustain pedal down, each note ringing under
  the next, is not a line by this test and imports as today **(design
  call:** the pedal means the notes are meant to sound together, and a
  pedalled arpeggio is harmony).
- A single line imports as chords only on request (section 7). Today's
  chord reading of a single line is poor in any case: it gives one note
  set a beat with the octaves dropped, never a chord name (measured on
  arpeggios in sixteenths and in quarters).

## 4. Reading the line

### 4.1 Short notes

A note shorter than a 64th note (a sixteenth of a quarter: 30 ticks at
480) is left out and counted (`notes-short`, info). In Kevin's file
these are stray triggers: most stand alone in silence or just before a
real note of the same pitch.

When more than a quarter of the pitched notes are that short, none is
left out **(design call:** a file from a drum-style trigger may write
every note a tick long, and leaving them all out would leave no notes).

### 4.2 The grid

An attack's time is its first note's start. Bars and beats are the
grid's (MIDI 5.3) and the grammar's (2.1: in 6/8 the beat is the dotted
quarter).

- **Whose beat.** An attack belongs to the beat it falls in; an attack
  up to a 128th note (a 32nd of a quarter: 15 ticks at 480) before a
  beat belongs to that beat, at its start. The same holds at a bar
  line.
- **A beat's division.** Each beat is divided into 1, 2, 3, 4 or 6
  equal parts, never into parts shorter than a 32nd note: a quarter or
  a dotted quarter may take any of the five, an eighth (3/8, 5/8, 7/8)
  1 to 4, a sixteenth 1 or 2. An attack **fits** a division when it
  lies within a 128th note of one of its points. The beat takes the
  smallest division that every attack in it fits with no two attacks at
  one point.
- **Rounded.** When no division holds a beat's attacks, the beat takes
  4 parts, or 6 where the beat is a dotted note (6/8, 9/8, 12/8), or
  the finest division it may take when that is coarser; and each attack
  moves to its nearest point. **The beat's end is a point too:** an
  attack nearer the next beat than any point inside its own moves
  there, and is then the next beat's attack at its start (every
  division has that point, so the next beat's division is not changed
  by it). A tie between two points goes to the earlier. Attacks that
  land on one point become one attack with every pitch of both; two of
  the same pitch become one note, which is a played attack lost. The
  bar is named in `rhythm-rounded` (warning): one diagnostic for the
  file, naming up to eight bars, then a count of bars, and saying how
  many attacks were joined to another.

The tolerance is small on purpose: the points of 3 and of 4 parts lie a
twelfth of a beat apart, so anything looser could take a triplet for
sixteenths. Five of the 465 attacks in Kevin's file fit no division.

### 4.3 Pitches

- An attack's pitches are written low to high in one note set, each
  once: `{C3}`, `{F3 F4 A4}`.
- A pitch is spelled as the import spells a note set today
  (`spellPitch` for the key in force), then its octave: MIDI 60 is
  `C4`, and the number belongs to the letter (grammar 4.1: MIDI 59
  spelled C♭ is `Cb4`).
- A pitch below `C0` or above `B8` cannot be written (grammar 4.1). It
  is left out and counted (`pitch-range`, warning); an attack left with
  no pitch is no attack.
- The file's octaves are kept as they are. Kevin's bass part lies an
  octave above where a bass sounds (its low notes are G2 and C3); the
  import does not guess at that.

## 5. Where a note ends: holds and rests

Kevin chose reading A on 2026-11-19, from his own file's first bars:

```
A: a note rings to the next attack, unless a beat or more is silent
| {C3} {C3}_{C3} /_{C3} {C3}_{C3} |
| {G2}_{G2} {C3}_{C3} /_{C3} {C3}_/_{E3}_{D3} |

B (not chosen): every silent sixteenth is a rest
| {C3}_-- {C3}_--_{C3}_/ --_{C3} {C3}_--_{C3}_/ |
| {G2}_--_{G2}_/ {C3}_--_{C3}_/ --_{C3} {C3}_--_{E3}_{D3} |
```

The rule:

- A note's **end** is the latest note-off of its attack, moved to the
  nearest point of the division of the beat it falls in (the beat's
  end is a point), and at least one point after the attack. A tie
  between two points goes to the later: the note rings.
- **An end never divides a beat.** A beat's division comes from its
  attacks alone (4.2), so a rest starts on a beat, or on a point the
  attacks in that beat already made. An eighth note followed by a beat
  and a half of silence, `| {C3}_-- -- {D3} {E3} |`, is read as a
  quarter and a beat of rest, `| {C3} -- {D3} {E3} |` **(design call:**
  it keeps the chart plain, in the spirit of reading A: the attacks are
  exact and the ends are approximate).
- The **silence** after it runs from that end to the next attack, or to
  the end of the chart after the last attack.
- When the silence is **shorter than one beat** of the bar the note
  ends in, there is no rest: the note is held (`/`) to the next attack.
- Otherwise the note is held to its end and a rest (`--`) is written
  from there to the next attack.
- Before the first attack, and in a bar nothing sounds in, the line
  rests.

A rest is `--`, not `N.C.` **(design call:** the MIDI design wrote
`N.C.` for silence because a chord reading cannot know the whole band
stopped. Here the line is everything the chart holds, and it stopped.
The MusicXML import writes a line's rests the same way.)

## 6. Writing the chart

### 6.1 A bar's cell

- **Slots.** A bar is written in the fewest slots that keep its
  rhythm: the smallest divisor of its beat count whose slots each start
  with an attack, a rest or a hold, with no attack or rest starting
  inside a slot of more than one beat. A whole note is `| {E1} |`, two
  halves `| {A1} {A1} |`, and a bar with anything inside a beat has one
  slot a beat.
- **Inside a beat.** A beat divided into parts is a group (2.2), one
  member a part: `{G2}_{G2}`, `{C3}_/_{E3}_{D3}`. A member is a note
  set, `/` or `--`.
- **Dotted figures.** A beat in four parts that reads note, hold, hold,
  note is written `{C3}._{D3}`, and note, note, hold, hold is
  `{C3}_{D3}.` (2.2) **(design call:** shorter, and how a player
  writes it).
- **Holds.** `/` holds across beats, bar lines and section headings. A
  note that rings into a new section is `/` there, not the note
  again: writing it again would add an attack nobody played.
- **Simile.** With `simile` on (the default), a bar whose cell is the
  same text as the bar before's is `%`, when it starts with an attack,
  has the same meter, has no heading or directive line before it and is
  not a bar of rest. A bar of rest is always `--`.

### 6.2 The rest of the chart

Everything around the bars is what the import writes today for the
same file: the title, `key:`, `time:` and `tempo:` and their changes
(MIDI 5.4; `key-doubtful` is judged on the line's notes), sections
from markers, a pickup's `[k/d]`, `barsPerLine`, and `printChart`'s
canonical form. The line is a bare bar line: no `part:` is written.

**(Design call)** `@barmark/sync` does not change. Its builder writes
one symbol a beat from chord runs and turns equal neighbours into
holds, so it cannot carry a note line; and the wider design will need
systems of several lines, which sync does not write either. So the
MIDI import builds the chart with sync as it does now, from a
placeholder harmony, and then replaces each bar's cell with the line's,
finding the bars through the parse as `lyrics.ts` does for its rows.
Sync's diagnostics about the placeholder harmony are not reported; its
others (sections, changes, the pickup) are, as today.

### 6.3 Lyrics

Lyric events become lyric rows exactly as today (MIDI 5.8), under the
line's bars. Nothing about them changes in this design, which leaves
two limits a reader should know **(design call:** both need a `part:`
line, which is the wider design's):

- **The words are not on the notes.** With no part declared nobody is
  the singer (grammar 7.7), so the rows are words over the band, and a
  converter engraves them apart from the line. Making the melody the
  singer's needs `part: Voice, instrument: voice`.
- **A row keeps its own grid.** `lyrics.ts` places syllables from the
  file's ticks on one even grid a bar, without 4.2's early-attack rule
  or its per-beat divisions. A syllable whose note was played a few
  ticks before a bar line can sit a bar away from that note. With no
  singer that raises no warning.

### 6.4 The self-check

Before the chart is returned it must parse with no errors, and its
performance (`perform`, the package's own core) must have the line's
attacks: the same pitches at the same times. If either fails, the
import falls back to the chord reading of today with a warning
(`notes-fallback`) **(design call:** as the lyric rows' self-check, so
a bug here costs the line, never the chart).

## 7. The API and the CLI

```ts
type MidiImportOptions = {
  tracks?: (number | string)[];
  lyrics?: boolean;
  simile?: boolean;
  barsPerLine?: number;
  /** Write a file that is one line of notes as its notes (default true); false: read chords from it, as before 0.4. */
  notes?: boolean;
};
```

- `notes: false` gives today's reading for every file.
- `tracks` now also says which tracks the line test reads (section 3).
- The result's shape does not change.
- CLI: `barmark import song.mid --chords` passes `notes: false`
  **(design call** on the flag's name). `--chords` with a MusicXML
  file is a usage error, as `--tracks` is.

## 8. Diagnostics

Added to `MidiImportCode`:

| Code | Severity | When |
|---|---|---|
| `notes-line` | info | the notes are one line and are written as notes (the message says `notes: false` reads chords) |
| `notes-short` | info | notes shorter than a 64th note left out, with their count |
| `rhythm-rounded` | warning | bars where an attack fit no division and was moved |
| `pitch-range` | warning | pitches outside C0–B8 left out, with their count |
| `notes-fallback` | warning | the line failed its self-check; chords were read instead |

`harmony-from-melody` keeps its meaning for the chord reading: several
single lines sounding together, or `notes: false`.

## 9. Testing

Test first, per rule, in `packages/midi/tests/`.

- **Each rule** of sections 3 to 6 on small hand-built files (the test
  helper that builds a file from an event list): held against
  re-struck; octaves and spellings, a flat key and a `Cb`; a line
  across three tracks and two channels; a double stop; a note a few
  ticks early at a bar line; sixteenths, triplets and a 6/8 bar; a beat
  that fits nothing; a short rest and a long one; a note ringing into a
  section; `%` and a bar of rest; a pitch out of range; short notes,
  and the file where a quarter of the notes are short.
- **The line test's table** (section 3) as a test: each fixture's
  reading, and `tracks: [4]` on `band.mid` as a line.
- **Unchanged files:** the seven `.mid` fixtures import byte for byte
  as on main, and so does every file in the existing import tests that
  is not one line. Where an existing test's file is one line, the test
  moves to the new reading or passes `notes: false`, and the change
  says which.
- **The round trip:** for charts of one note line on the grids of 4.2
  (written by a generator, as `property.test.ts` does), `exportMidi`
  then `importMidi` gives a chart whose performance has the same
  attacks; and the same lengths too, where every rest is a beat or
  longer and starts on a beat or on a point an attack in its beat
  makes (section 5). The generator keeps to divisions a beat may take
  (4.2).
- **A real file:** `interbellum-bass-09.mid` as a fixture with its
  expected chart (Kevin agreed on 2026-11-19, section 11). A notice
  beside the two files says: the bass line was arranged and played by
  Kevin Peckham for a song written by Karl Ward; the song is all rights
  reserved and used with permission; neither the file nor its
  transcription is covered by the repository's MIT licence. A test
  holds that neither file is in what `npm pack` would publish.
- **Lyrics:** a melody with lyric events keeps its rows, as today's
  import writes them.
- **Scale and safety:** a 1,000-bar line imports in linear time (as
  `import-scale.test.ts` times, relatively); the bounds of MIDI 5.1
  hold; `smf-fuzz` still never throws.
- **The CLI:** `import` on a line, `--chords`, and the usage error.

## 10. Release

- `@barmark/midi` 0.4.0: a minor, since a single-line file now imports
  differently. README and CHANGELOG say so, with `notes: false` as the
  way back. The MIDI design gets a pointer to this document at its two
  non-goals.
- `@barmark/cli` 0.15.0 (the new flag), the songs pin, the site's pins
  and any sentence on barmark.dev that describes MIDI import.
- `@barmark/lyricsheet` 0.1.1 (the `chordpro` keyword already on main)
  can go out before this CLI release, since a CLI release is happening
  anyway.

## 11. Decisions

**Kevin's, made (2026-11-19):** the direction; reading A (section 5);
short notes left out and counted; `interbellum-bass-09.mid` may be
committed as a fixture, credited as section 9 says ("arranged and
played is correct").

**Design calls** (mine; each is marked where it is made): a pedalled
line reads as harmony (3); the short-note exception (4.1); `--` for a
line's rest, and an end never dividing a beat (5); dotted figures
(6.1); sync unchanged, the cells replaced after it builds (6.2); lyric
rows left as they are, not sung on the notes (6.3); the self-check and
its fallback (6.4); the option `notes` and the flag `--chords` (7).

## 12. Left to the builder

The module layout inside `src/import/` (one module per stage, as the
package has it), the wording of each diagnostic, how the bars' cells
are found in sync's chart, and the constants' names. The numbers in
this document (a 64th note, a 32nd note for an attack and for the
shortest part, a 128th note of tolerance, one in ten, a quarter of the
notes, one beat of silence, divisions 1, 2, 3, 4 and 6, eight bars
named) are the design's and are used as written.
