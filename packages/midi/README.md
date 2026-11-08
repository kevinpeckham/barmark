# @barmark/midi

MIDI for [barmark](https://barmark.dev) chord charts: export a chart's
play order as a Standard MIDI File, to hear it in a sequencer or a
notation program, and import a MIDI file as a chord chart. Export has
been checked in MuseScore 4.7.6 (its MIDI import, read through the
MusicXML it writes); other programs are untested. The performance core,
chart to timed notes, is the `@barmark/midi/perform` subpath.

```sh
npm install @barmark/midi
```

It requires `barmark` 0.21.0 or later (import names chords with its
`nameNotes`). It has no runtime MIDI library: the file is written and
read by hand.

## Export

```ts
import { exportMidi } from "@barmark/midi";

const result = exportMidi(text); // or exportMidi(text, { part: "Gtr", title: "song", tempo: 96 })
if (result.ok) save("chart.mid", result.bytes);
else console.error(result.diagnostics);
```

Options: `part`, the label of one part to export alone (as `extractPart`
reads it); `title`, a title for a chart that has none; and `tempo`, beats
a minute for a chart with no `tempo:` (default 120). `exportMidi` never
throws. A chart with an error, with no bars, or a `part` naming no part
returns `{ ok: false, diagnostics }` and no bytes; otherwise `{ ok: true,
bytes, diagnostics, losses }`, where the diagnostics are the chart's
warnings and `losses` says what MIDI couldn't hold (below).

### What sounds

The file plays the chart's **play order**: repeats, endings, `x N`,
jumps, replays and `%` as the parser resolves them, one bar after
another. Every named slot attacks again (`| G G |` twice, `| G / |`
once); `/` holds what sounds, across bar lines; `N.C.`, `--`, `?`, a rest
and a tacet bar sound nothing. Notes last exactly their slot, with no
gap.

**The voicing rule.** A chord symbol is a block chord for its slot: its
bass (the slash bass when written) in E2–D♯3, under each of its chord
tones once in C4–B4, so the bass is doubled above, as MuseScore plays a
chord symbol. `G7/B` is B2 under D4 F4 G4 B4. On an `electric bass` or a
`double bass` the bass sounds alone, in E1–D♯2. A voicing
(`Cmaj7{E3 G3 B3}`) or a note set (`{C3 G3 E4}`) sounds exactly as
written; notes without octaves (`{C E G}`) rise from octave 4. `7alt`
sounds the tones it spells. It is a guide to the harmony, not an
arrangement.

**Velocities.** 80 a note, 100 an accent `>`, 112 a hit `^`. A hit
lasts its whole slot (a `/` after it holds it); write `G_--` for a short
one.

**Pushes** (`<` an eighth, `<<` a sixteenth) attack early, taking the
time from the slot played before them, across a bar line, a repeat or a
jump. A push at least as long as the slot before it stays on the beat,
so no written chord is lost.

**The pedal** (`+`, `*`) is controller 64 on every track of its part:
down, a change (up and down at one time), and up at `--`, a tacet bar and
the end.

**Swing** (`feel: swing`, `shuffle`, `swing 16`, with or without an
amount: ⅔ for the bare word, `swing 58%` for 58%) plays the second eighth
of each quarter (or sixteenth of each eighth) late, after pushes, so a
pushed "and of 4" swings. A beat with a note off the binary grid
(triplets, sextuplets), or one where swing would run a note into the
next, plays straight; compound meters aren't swung (a `swing-compound`
loss).

**Tempo, ramps and fermatas.** The tempo is written in quarter notes a
minute from the beat of the `time:` meter, a one-bar meter's bar
included (6/8 at `tempo: 60` is 90, a `[2/8]` pickup too), with a new
tempo wherever a bar's differs. `rit.` and `accel.` are a tempo a beat,
straight from the tempo before to the target, reaching it at the
downbeat of the run's last bar (80% or 120% with no target); `a tempo`
returns. A fermata `...` plays the beat before it at a third of the
tempo, so it lasts three times as long while the bar grid stays the same.

**Meters, keys, markers, words and lyrics.** Time signatures where the
meter changes (a one-bar `[2/4]` included), clicking on the meter's
beat; key signatures where the key changes (a church mode other than
aeolian as its parent major's, a `mode` loss). Each section heading as a
marker every time it plays, and each rehearsal mark. Words on a bar are a
text event on their line's track. Each sung syllable is a lyric event on
the singing line's track, as MuseScore writes them: a space ends a word,
`‿` joins an elision, verses in order at one time.

### Tracks and channels

A format 1 file. Track 1 is the conductor: the title (or the `title`
option) as its name, the copyright as a copyright event and the other
credits as text labelled by role (`Composer: …`, `Lyricist: …`,
`Arranger: …`), the tempo map, time and key signatures
and markers. Then a track for each part line in score order, named by
the part (`Electric Guitar 1`) or the part and the line (`Piano RH`),
with its instrument's General MIDI program (piano for a part with no
`instrument:`); a chart with no `part:` is one track, `Chart`. A melodic
instrument (trumpet, the saxes, trombone, flute, violin, cello, voice)
plays its note sets on its own track and its chord symbols on piano in a
track of their own, `Voice chords`, so a lead sheet is a melody and its
chords.

Each track has its own channel, skipping channel 10 (General MIDI's
drums, never written). Past 15 tracks a part's lines share a channel,
and its chords track another, with a `channels-shared` loss. Lines that
share a channel share its notes too: when two of them sound the same
pitch, the first note-off ends both, as in any sequencer.

### Losses

Each loss is reported once, at the first bar it happened in:

| Code | When |
|---|---|
| `open-repeat` | `x ...` plays once: MIDI can't repeat as needed |
| `mode` | a church mode is written as its parent major's signature |
| `tempo-assumed` | the chart has no tempo; 120 (or `tempo`) is used |
| `tempo-range` | a tempo MIDI can't hold, clamped |
| `channels-shared` | more than 15 tracks |
| `swing-compound` | swing in 6/8, 9/8 or 12/8, not applied |
| `ticks-rounded` | a rhythm needing more ticks a quarter than the file can have (32,640, fewer in a long chart): played at 480, rounded |

The division (ticks a quarter) is the smallest multiple of 480 that
makes every time whole, within two caps: 32,640 (the largest multiple of
480 SMF's division holds), and whatever keeps the chart's end within
SMF's latest tick, which in a long chart is lower. Past either cap the
file uses 480 and rounds each time to the nearest tick, never a note to
nothing (`ticks-rounded`). A pitch beyond MIDI's 0–127 moves by octaves
into it, and a key beyond seven sharps or flats is written as its
enharmonic. A chart too long for any division is an error.

## Import

```ts
import { importMidi } from "@barmark/midi";

const { text, diagnostics } = importMidi(bytes); // or importMidi(bytes, { tracks: [2, "Piano"] })
if (text === "") console.error(diagnostics);
```

`importMidi` reads a format 0 or 1 file and writes a chord chart with
`@barmark/sync`'s builder: canonical, in play order (no repeats), four
bars a line. It never throws; `text` is `""` exactly when a diagnostic
is an error, and otherwise parses with no errors.

### What is read

- **The chords** come from the notes that carry the harmony: drums
  (channel 10) and single-note lines other than the lowest (a melody,
  slash notes) are left out, unless `tracks` names the tracks to read.
  Each chord is named from the pitch classes sounding (barmark's
  `nameNotes`), else written as a note set of up to three notes, else
  `?`; where nothing sounds, `N.C.`.
- **Bars, key, meter and tempo** come from the file's time, key and
  tempo events. A short first bar before a new meter is a pickup when it
  is whole beats of the meter after it; otherwise it is a bar of its own
  meter. A doubtful key signature is left out; a gradual tempo change is
  written as its last tempo. A tempo or meter barmark can't write
  (`tempo:` is 1 to 999, `time:` up to 32 beats) is dropped with a
  diagnostic.
- **Chords are read at beat resolution**, so a push on an off-beat (the
  last eighth of a bar, say) is written on the next beat.
- **Lyrics** become lyric rows under the bar lines (unless `lyrics:
  false`): from the first track with lyric events, or in a karaoke
  (`.kar`) file with none, its text events (the `@` lines left out, a
  leading `\` or `/` read as a line break). MIDI has no verse number, so
  **verses are assigned by order at each tick**: the first lyric at a
  tick is verse 1, the second verse 2, and so on (up to 100). Where one
  verse holds while another sings, the singing verse's syllable is read
  as verse 1; when the number of lyrics at a tick varies, a
  `lyrics-verses-uncertain` warning says verses may be mixed. A syllable
  continues its word unless its text ends in a space or the next begins
  with one; `‿` and MuseScore's elision character are an elision (`~`).
  The bars run on to the last lyric, past the last chord if need be.
  Each bar's syllables sit on the coarsest grid that holds them (the bar,
  its beats, a beat in two, three or four), the slots between held (`/`)
  while the track's notes sound, else `--` (also before a verse's first
  syllable); a breath shorter than that grid's slot is lost. Characters a
  row can't hold as a syllable (`|`, `"`, braces, `_`) are removed. At
  most 20,000 rows are written. The chart is checked before it is
  returned: a verse whose rows don't read back as placed is left out
  (`lyrics-dropped`), never the chords.
- **Markers** become `## ` headings, on the bar line nearest them; two
  on one bar keep the first. **The title** is a format 0 file's track
  name, or track 1's name when track 1 has no notes (a conductor track).
  Names are tidied: a newline is a space, control and invisible
  characters go, and a name that would read as something else (`x2`) is
  repaired or dropped.

- **MuseScore's files** read as they sound. MuseScore 4 plays its chord
  symbols, on a channel of their own in the part's track (the bass in
  octave 2 under the chord around middle C), and that is where the
  chords come from. It plays slash notes as one pitch a beat (B3 or B4,
  the staff's middle line) on the part's own channel: a single-note
  line, left out like a melody, so C doesn't come back as Cmaj7. Its
  rehearsal marks are markers (`## A`); its section names (staff text)
  and its title aren't in the file at all. The sustain pedal holds every
  note on its channel, whichever track it is in: MuseScore writes a
  piano's two staves as two tracks on one channel, and the pedal in one
  of them. Checked on MuseScore 4.7.6's files of a lead sheet,
  a hymn with a pickup and two verses, a band, a comping guitar, a waltz,
  a pedalled piano and a band with bass and drums.

### What isn't read

1. **Repeats, endings and jumps.** MIDI has none: the chart is the
   file's play order written out (a bar repeated exactly comes back as
   `%`, with `simile`).
2. **Rhythm finer than a beat.** A push or an eighth-note change is
   written on the beat it falls into, as the chord holding most of the
   beat.
3. **Rhythm figures.** Accents, hits, pushes, the pedal and swing aren't
   written; silence is `N.C.`, never `--` (a file can't tell the band
   stopped from the chord instruments stopping).
4. **Gradual tempo changes and fermatas.** A ramp is written as its last
   tempo (`tempo-ramp`); a tempo that changes inside a bar and is back
   by the next is left out (`tempo-in-bar`).
5. **Credits, words and text events**, other than the title, markers and
   a karaoke file's lyrics; programs and instrument names.
6. **Drums.** Channel 10 is never read (`drums-left-out`).
7. **Melody lines, by design.** The import reads the harmony, so a
   single-note line that isn't the lowest comes back only through the
   chords it sounds in, or not at all: a melody or a `Vo.Mel` line, a
   pedal-tone line, a chart's own `Pno.LH` single notes over a bass part
   (`melody-left-out` names them). The lowest single-note line is a bass
   line and gives the chords their bass.
8. **Parts.** The whole file is one chord line: several parts are read
   together, so a guitar's G over a piano's Em is `Em7`.
9. **Inversions under a held chord.** The same upper voices over a new
   bass inside a bar are one chord; a new bass at a bar line is a slash
   chord.
10. **Format 2 files and SMPTE time** (errors), and files past the
    bounds: 16 MiB, 1,024 tracks, 2,000,000 events, 500,000 notes or
    10,000 bars (`too-large`).

### Options

- `tracks`: the tracks to read the chords from, by 1-based number or
  track name (any case, every track of that name), in place of the
  default choice. Every pitched note on them counts, single-note lines
  included (channel 10, the drums, is still left out), so naming a
  MuseScore part's track reads its slash notes too and adds B to every
  chord: leave `tracks` out for MuseScore's files.
  An entry naming no track is a `track-unknown` warning; when none
  match, the default choice is used.
- `lyrics`: read lyrics (default true).
- `simile`: write a bar that repeats the one before as `%` (default
  true).
- `barsPerLine`: bars a line (default 4).

### Diagnostics

Each diagnostic has a `code`, a `severity`, a `message`, and where it
can, a `track` (1-based, in file order) and the played `bar` (a pickup
is bar 1). A problem that repeats
is reported once, with a count and its first bars.

| Code | Severity | When |
|---|---|---|
| `not-midi` | error | no `MThd` header, or a division of 0 |
| `format-2` | error | a format 2 file |
| `smpte` | error | SMPTE time division: no beats to make bars from |
| `too-large` | error | past a bound (above) |
| `no-notes` | error | no pitched notes outside channel 10 |
| `truncated` | warning | a chunk runs past the file, or the file ends inside a header; read to its end |
| `track-count` | warning | the header's track count is wrong |
| `bad-event` | warning | junk in a track; the rest of that track skipped |
| `meta-invalid` | warning | a tempo, time or key signature barmark can't use, ignored |
| `meter-mid-bar` | warning | a time signature inside a bar |
| `key-doubtful` | warning | a key signature the notes don't fit, left out |
| `harmony-from-melody` | warning | every line is a single line; all are read |
| `track-unknown` | warning | a `tracks` entry naming no track |
| `chord-unnamed` | warning | `?` written for notes with no name |
| `lyrics-dropped` | warning | a verse that didn't read back as placed, or past 100 verses at a tick or 20,000 rows |
| `lyrics-verses-uncertain` | warning | the number of lyrics at a tick varies, so verses may be mixed |
| `unknown-chunk` | info | a chunk other than `MTrk`, skipped |
| `drums-left-out` | info | channel 10's notes |
| `melody-left-out` | info | the single-note lines left out of the harmony |
| `tempo-ramp` | info | a gradual tempo change, written as its last tempo |
| `tempo-in-bar` | info | a tempo that changes inside a bar and is back by the next, left out |
| `marker-dropped` | info | a second marker on one bar |
| `lyrics-other-tracks` | info | lyrics on tracks after the first with them, not read |

Plus `@barmark/sync`'s builder's codes as they come: a section name it
had to change, a key respelled, a meter or a tempo barmark can't write
(`tempo:` is 1 to 999, `time:` up to 32 beats), dropped.

`readSmf(bytes)` is the reader underneath: the file's format, division
and tracks of absolute-tick events, each track's name, and its
diagnostics.

## `@barmark/midi/perform`

The performance without the bytes: what a chart sounds like, in exact
quarter notes, for a player to schedule or a test to read.

```ts
import { parseChart } from "barmark";
import { perform, secondsAt } from "@barmark/midi/perform";

const p = perform(parseChart(text)); // or perform(parse, { tempo: 96 })
for (const track of p.tracks)
	for (const note of track.notes) schedule(note.pitch, secondsAt(p, note.at), note.velocity);
```

A `Performance` has the title and credits, the played bars (index,
onset, meter), the tempo map (`tempos`, quarter notes a minute), keys,
markers, the tracks (name, part, line, role, program, notes, pedal,
lyrics, words), its end and its losses. A time is a fraction `{ n, d }`
of a quarter note from the first downbeat, so swing and tuplets never
drift; `secondsAt` turns one into seconds through the tempo map. The
subpath imports none of the MIDI file code. The main entry exports the
same types. Pitches are as written: a long note set without octaves can
climb past MIDI's 127, which `exportMidi` folds back by octaves and a
player should too.

## License

MIT
