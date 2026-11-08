# @barmark/midi

MIDI for [barmark](https://barmark.dev) chord charts: export a chart's
play order as a Standard MIDI File, to hear it in a sequencer or a
notation program. So far it has been checked in MuseScore 4.7.6 (its MIDI
import, read through the MusicXML it writes); other programs are
untested. The performance core, chart to timed notes,
is the `@barmark/midi/perform` subpath. (Import, a MIDI file to a chart,
comes later.)

```sh
npm install @barmark/midi
```

It requires `barmark` 0.20.0 or later. It has no runtime MIDI library:
the file is written by hand.

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
minute from the meter's beat (6/8 at `tempo: 60` is 90), with a new
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
and its chords track another, with a `channels-shared` loss.

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
same types.

## License

MIT
