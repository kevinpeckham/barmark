# MIDI import and export: design

Status: ready to build (2026-11-08). Kevin asked for "a package that
imports and exports midi to / from barmark" and skipped the design
questions, so every decision below is **Claude's call** unless it is
marked otherwise. Kevin gave the go-ahead on the five open questions as
recommended, and delegated the review's rulings to Claude; those are
marked **Claude's ruling, 2026-11-08**. The calls list at the end
gathers the rest. No grammar change.

## Intent

MIDI is the one music format every program reads: DAWs (Logic, Ableton,
GarageBand, Reaper), notation programs, phone apps, hardware. A barmark
chart that exports to a `.mid` can be played, practised against, dropped
into a session as a guide track, or opened where MusicXML can't go.
Going the other way, the MIDI files people already have (a DAW sketch, a
MuseScore playback file, a backing track) become charts without being
retyped.

BRIEF.md's roadmap lists the converters in phases: MusicXML (shipped as
`@barmark/musicxml`), ChordPro, MIDI. The MusicXML export's design said
MIDI would come later "in an `@barmark/midi`".

MIDI is a different kind of format from MusicXML. It has no chord
symbols, no repeats, no sections: it is notes in time, plus a tempo map
and a few labelled events. So:

- **Export** is a performance: the chart's play order, sounded. Every
  musical fact comes from `parseChart`; what MIDI adds (a register for a
  chord, a velocity for an accent) is a fixed, documented rule.
- **Import** is a transcription: bars from the file's meter and tempo
  map, chords named from the notes sounding, in written-out play order,
  as `@barmark/sync`'s builder already writes a chart from timed chords.

## Goals

- A new workspace package, `@barmark/midi`, in `packages/midi/`, with
  `exportMidi(text, options?)` and `importMidi(bytes, options?)`.
- **Export** writes a Standard MIDI File, format 1, for any chart that
  parses without errors: chord charts, note sets and voicings, melody and
  part lines, rhythm figures (accents, hits, pushes, pedal), swing,
  several parts, lyrics.
- **Import** reads Standard MIDI Files of format 0 and 1 and returns a
  canonical chart (as `barmark format` prints it) that parses without
  errors, plus diagnostics with codes. It never throws.
- **The round trip plays the same harmony.** A chart in scope (section
  9), exported and imported, sounds the same pitch classes on every beat
  (allowing a fifth the namer supplies); a chart in generator form comes
  back exactly.
- A shared **performance** core (chart → timed note events) behind its
  own subpath, `@barmark/midi/perform`, so the notation player in the
  backlog can reuse it without the file writer.
- `barmark export --midi` and `barmark import file.mid` in `@barmark/cli`,
  after the library.

## Non-goals

- **Repeats, endings, jumps and replays in the file.** MIDI has none;
  export writes play order, import writes play order out (as sync does).
- **Melody and parts on import** (v1). Import writes one chord line for
  the whole file (open question 2). A lead sheet's melody, a bass line as
  note sets, one part per track: a later design.
- **Sub-beat rhythm on import** (v1). Chords land on beats (sync's slot
  rule): a push comes back on the beat it pushed into; eighth-note
  changes come back as the chord holding most of the beat (open question
  3).
- **Rhythm figures on import**: accents and hits (velocity), pushes,
  pedal, swing, `--` (a MIDI file can't tell the band stopped from the
  chord instruments stopping, so silence imports as `N.C.`, grammar 2.3).
- **Gradual tempo changes and fermatas on import** (v1): a ramp writes
  its end tempo; a stretch inside a bar writes nothing (5.4).
- **Credits, words and text events on import**, other than the title.
- **Format 2** files, **SMPTE** time division, **RIFF-wrapped** (`.rmi`)
  and **karaoke** (`.kar` text-event lyrics) conventions.
- **Transposing instruments.** Everything is concert pitch, as barmark is.
- **Audio.** No synthesis, no SoundFont: a program number is the whole
  sound.

## Anti-goals

- **An export that looks right and plays wrong.** The file plays the
  chart's play order (repeats, endings, jumps, replays, pushes) exactly
  as `parseChart(text).bars` gives it; a test player checks it with an
  independent MIDI parser.
- **A second parser.** Export reads `parseChart`'s output and never chart
  text; import writes chart text only through sync's builder and
  `printChart`.
- **A wrong chord printed with confidence.** Import names a chord only
  from a fixed vocabulary with a fixed preference order (5.6); anything
  it can't name is a note set or `?`, with a warning.
- **Output that doesn't parse, or that barmark would reformat.**
- **A wall of diagnostics.** Each kind of loss is reported once, with a
  count and the first few bars.

## Constraints

- Bun workspace member like the others: TypeScript strict, Biome (tabs),
  Fallow, test first, CHANGELOG, conventional commits, MIT, `engines:
  node >=20`.
- Runtime dependencies: `barmark`, and `@barmark/sync` from the import
  step on (import builds on sync's builder), `workspace:^`. **No MIDI
  library at runtime** (1.2).
- Parsers never throw on user input; neither does `importMidi`, whatever
  the bytes. Input is bounded (5.1).
- `@barmark/render`'s rule holds here: export never re-decides the music.
  Bar numbers, what `%` copies, what a replay plays, the play order a
  push borrows from, pedal state (`pedalStates`) and who sings all come
  from the parser; the export only times what it is given.
- The grammar draft is not changed. (Another branch is changing elision
  and Coda rules; export consumes `parse.bars`, so it follows whatever
  play order the parser gives.)

## 1. Where it lives

### 1.1 The package

`packages/midi/`, published as `@barmark/midi`, tag prefix `midi-v`.
Two entries, as sync has `./timing`:

- `"."`: `exportMidi`, `importMidi` and their types; re-exports the
  performance types.
- `"./perform"`: `perform`, the performance types and `secondsAt`. It
  imports nothing from the SMF code or the importer.

Options weighed for the performance core (the brief's "chart → timed
note events"):

| Option | For | Against |
|---|---|---|
| In `barmark` | Next to the parser whose timing it reads | A voicing rule, velocities and GM programs are interpretation, not grammar; `barmark` would gain a release line of performance choices |
| Its own package, `@barmark/perform`, now | Cleanest dependency for the player | A second new package (placeholder publish, trusted publisher, CI, CLI release, songs bump) for a consumer that doesn't exist yet |
| **A subpath of `@barmark/midi`** | One new package; the seam exists, so splitting later is moving a folder | The player would install `@barmark/midi` for it until then |

**Claude's call: the subpath** (open question 4), as sync did with
`./timing`: split it out when the player is built.

### 1.2 Reading and writing SMF: hand-written

The main JavaScript MIDI libraries, checked 2026-11-08:

| Library | Version | Notes |
|---|---|---|
| `midi-file` | 1.2.4 (2023), MIT, no deps | Reads and writes raw events; small and solid. On a truncated file it returns a partial result with no error (checked: cut at 30 bytes, it reports one track); a header claiming more tracks than exist, likewise. Text decoded byte by byte |
| `@tonejs/midi` | 2.0.28 (2022) | A friendly note-level model built on `midi-file`; no lyrics or markers model, no updates since 2022 |
| `midifile-ts` | 1.5.2 (2025) | TypeScript reader/writer; same shape as `midi-file` |
| `midi-writer-js` | 3.2.1 (2026) | Writer only |
| `jzz-midi-smf` | 1.9.9 (2025) | Part of the JZZ ecosystem; larger than the job |
| `midi-json-parser` | 8.1.75 (2026) | Worker-based, four runtime deps |

**Claude's call: a small hand-written reader and writer** (about 400
lines with tests), because the importer needs what none of them gives:
diagnostics for truncation, a bad header and junk events (not silent
partial results); limits on sizes and counts; UTF-8 text with windows-1252
fallback and control characters removed; and a writer whose event order
at one tick is ours to define (5.1, 3.2). The SMF format is small and
fixed (1988), so there is nothing to keep up with.

`midi-file@1.2.4`, pinned exactly, is a **devDependency**: the tests read
every exported file back with it, an independent parser, and compare its
events with ours (section 9).

## 2. The API

```ts
// @barmark/midi
type MidiExportOptions = {
  /** Only this part, as `extractPart` gives it. */
  part?: string;
  /** The title when the chart has none (the CLI passes the file name). */
  title?: string;
  /** Beats a minute, counting grammar 2.1's beat, for a chart with no tempo (default 120). */
  tempo?: number;
};
type MidiLossCode =
  | "open-repeat"      // `x ...` played once
  | "mode"             // a church mode written as its parent major's signature
  | "tempo-assumed"    // the chart has no tempo; `options.tempo` used
  | "tempo-range"      // a tempo MIDI can't hold, clamped
  | "channels-shared"  // more than 15 pitched tracks
  | "swing-compound"   // swing in 6/8, 9/8 or 12/8 not applied
  | "ticks-rounded";   // a rhythm finer than 32,640 ticks a quarter, rounded
type MidiLoss = { code: MidiLossCode; message: string; bar?: number };
type MidiExportResult =
  | { ok: true; bytes: Uint8Array; diagnostics: ChartDiagnostic[]; losses: MidiLoss[] } // warnings only
  | { ok: false; diagnostics: ChartDiagnostic[] };                                     // at least one error
function exportMidi(text: string, options?: MidiExportOptions): MidiExportResult;

type MidiImportOptions = {
  /** The tracks that carry the harmony: 1-based numbers or track names (any case). Default: chosen (5.2). */
  tracks?: (number | string)[];
  /** Read lyric events into lyric rows (default true). */
  lyrics?: boolean;
  /** As sync's BuildOptions. */
  simile?: boolean;
  barsPerLine?: number;
};
type MidiImportDiagnostic = {
  severity: "error" | "warning" | "info";
  code: MidiImportCode;   // section 5.9, plus sync's BuildCode
  message: string;
  /** 1-based track chunk, in file order. */
  track?: number;
  /** The played bar of the chart written. */
  bar?: number;
};
type MidiImportResult = { text: string; diagnostics: MidiImportDiagnostic[] };
function importMidi(bytes: Uint8Array, options?: MidiImportOptions): MidiImportResult;
```

`text` is `""` exactly when there is an error diagnostic. Export with
chart errors writes nothing, as `exportMusicXml` and `transpose` behave.

```ts
// @barmark/midi/perform
/** A time or length in quarter notes, exact, from the first bar's downbeat. */
type Quarters = { n: number; d: number };
type PerformedNote = { pitch: number; at: Quarters; length: Quarters; velocity: number };
type PerformedTrack = {
  name: string;
  /** The part's label and line name; null in a chart with no parts or a bare line. */
  part: string | null;
  line: string | null;
  /** "harmony": a melodic instrument's chord symbols, sounded on piano (3.3). */
  role: "line" | "harmony";
  /** General MIDI program, 1–128. */
  program: number;
  notes: PerformedNote[];
  pedal: { at: Quarters; down: boolean }[];
  lyrics: { at: Quarters; verse: number; text: string }[];
  words: { at: Quarters; text: string }[];
};
type Performance = {
  title: string | null;
  credits: Credits;
  /** One per played bar: its index, onset and meter. */
  bars: { index: number; at: Quarters; meter: Meter }[];
  /** Quarter notes a minute, from `at` on; the first is at 0. */
  tempos: { at: Quarters; qpm: number }[];
  keys: { at: Quarters; key: Key }[];
  markers: { at: Quarters; text: string }[];
  tracks: PerformedTrack[];
  end: Quarters;
  losses: MidiLoss[];
};
function perform(parse: ChartParse, options?: { tempo?: number }): Performance;
/** Seconds from the start at a point, through the tempo map. */
function secondsAt(p: Performance, at: Quarters): number;
```

Times are exact fractions, so swing, tuplets and dotted figures never
drift; ticks are chosen only when the file is written (3.2).

## 3. Export

### 3.1 Play order

The file plays `parse.bars` in order: the parser has already resolved
repeats, endings, `x N`, jumps, replays and elisions, `%` and one-bar
meters. Fermatas come from `parse.events` (they aren't bars). An open
repeat (`x ...`) plays one pass, as `parse.bars` gives it, with an
`open-repeat` loss: MIDI can't repeat "as needed".

### 3.2 Time

- **Quarters, then ticks.** The performance is in exact quarter notes.
  The writer picks the division (ticks a quarter) as the smallest
  multiple of 480 that makes every onset and length whole, up to 32,640
  (the largest multiple of 480 under SMF's 15-bit limit). Beyond that it
  uses 480 and rounds to the nearest tick, never to zero length, with a
  `ticks-rounded` loss. 480 covers halves, thirds, fifths and sixteenths;
  a septuplet gives 3,360.
- **Event order at one tick**, within a track: note-offs, pedal up,
  meta events (marker, lyric, text), pedal down, program changes and
  other controllers, note-ons. A re-attack
  of a sounding pitch therefore ends the old note before the new one
  starts. Lyrics precede their note, as karaoke players expect.
- **Writer conventions**: note-off as `0x80` with velocity 64 (not a
  zero-velocity note-on); no running status; an end-of-track on every
  track at the chart's end.

### 3.3 Tracks, channels and programs

Format 1:

1. **Track 1, the conductor:** the title as its name (a format 1 file's
   first track name is the sequence name), tempo, time and key
   signatures, markers, the copyright credit as a copyright meta event,
   and the other credits as text events (`Composer: …`). No notes.
2. **One track per part line**, in score order: a chart with no `part:`
   is one track named "Chart"; a part's bare line is named by the part
   (`Electric Guitar 1`); its named lines by the part and the line
   (`Piano RH`, `Piano LH`), as grammar 7.3 says a converter writes a
   MIDI track name.
3. **A harmony track** for a part whose instrument is melodic (trumpet,
   the saxes, trombone, flute, violin, cello, voice): its chord symbols
   sound on piano (GM 1) in a track of their own, `Voice chords`, as
   MuseScore 4 plays chord symbols on a channel of their own (section 8).
   A lead sheet's `Vo` line of chords and `Vo.Mel` melody becomes a Voice
   track with the melody and a Voice chords track with the harmony.
   Note sets on such a line stay on its own track.

**Programs** come from the grammar's instrument list (7.3's GM column,
`INSTRUMENTS[i].program`), written as a program change (value − 1) at
tick 0. A part with no `instrument:` is piano (GM 1): no guessing from
names.

**Channels:** each track its own, in track order, from 1 to 16 skipping
**10** (General MIDI drums), so 15 are available. With more than 15
tracks, a part's lines share their part's channel; with more parts than
that, channels repeat in turn, with a `channels-shared` loss. Channel 10
is never written.

### 3.4 Slots to notes

Each line's played slots, timed as barmark's `slotTimes` times them
(grammar 2.1, 2.2: groups, dotted members), become notes. **Claude's
ruling, 2026-11-08:** `slotTimes` isn't exported from barmark (only
`memberShares` is), so the package implements it in exact quarters in
`src/perform/quarters.ts`, over the exported `memberShares`, and a test
pins it to barmark's private `slotTimes` by a relative import, as the
key signature is pinned (3.7). Export needs no barmark change.

| Slot | Sounds |
|---|---|
| a chord symbol | the default voicing (3.5), for the slot |
| a voicing `Cmaj7{E3 G3 B3}` | exactly the written notes |
| a note set `{C3 G3 E4}` | exactly the written notes |
| a note set without octaves `{C E G}` | from octave 4, each note the next above the one before (C4 E4 G4), as the MusicXML export and render's notes view read them |
| `/` | holds whatever sounds: the notes continue, across bar lines in play order |
| `N.C.`, `--`, `?` | nothing on this line (`?` already warns in the chart) |
| a tacet bar (several parts) | nothing |

- **Every named slot re-attacks.** `| G G |` attacks G twice; `| G / |`
  once (grammar 2.3: a repeated name keeps its slot).
- **Notes are exactly their length:** no legato gap; the next attack's
  note-off comes first at the same tick (3.2).
- **The sung line**: a note set with a syllable sounds like any note set.

### 3.5 The chord voicing

A chord symbol sounds as a **block chord for its slot**, held through
its holds: the chart's own rhythm, no invented comping (Claude's call;
the brief offered block-per-slot or per-beat, and per-beat would invent
re-attacks the chart doesn't write).

- **Bass:** the chord record's `bass` (the slash bass when written), in
  E2–D♯3 (MIDI 40–51).
- **Upper:** each pitch class of the record's `pitches`, at its lowest
  octave from C4 (60–71), sounded together. A record's `pitches` include
  a slash bass (`C/Bb` is C E G B♭, as A.4 spells it), so **the bass is
  always doubled above**, as MuseScore's chord playback doubles it (F2
  under C4 E4 F4 A4 for Fmaj7, section 8).
- **On a bass instrument** (`electric bass`, `double bass`): the bass
  note alone, in E1–D♯2 (28–39).
- `7alt` sounds the tones it spells (root, 3, ♭7); the altered tones are
  the player's.

So `G7/B` sounds B2 under D4 F4 G4 B4. The rule is
deliberately plain: it puts every tone in one octave over a bass, which
is what the import reads back most reliably, and it is what a chord
chart's MIDI is for (a guide, not an arrangement).

### 3.6 Rhythm figures

- **Velocity:** 80 a note; an accent `>` 100; a hit `^` 112.
- **A hit** sounds its whole slot at velocity 112, and a `/` after it
  holds it, as after any chord. **Claude's ruling, 2026-11-08:** grammar
  2.3 says a hit lasts its whole slot and 2.7 that a mark only adds
  weight ("a short note without an accent is a shorter slot"), so the
  export doesn't shorten it; a shorter hit is written `G_--`.
- **Pushes** (`<` an eighth, `<<` a sixteenth) move the slot's attack
  earlier by that length, taking it from the slot played before it in
  play order on the same line: that sound ends at the new attack, even
  across a bar line, a repeat or a jump (grammar 2.8). The slot then
  sounds to its own end.
- **Pedal** (`+`, `*`, grammar 2.9): controller 64 at 127 down, 0 up, on
  **every channel of the part** (all its line tracks and its harmony
  track): the pedal belongs to the part. A change (`+` with the pedal
  down) is 0 then 127 at one tick. It lifts at `--`, a tacet bar and the
  end, as `pedalStates` reads it. `pedalStates` reads a bar's top-level
  slots, which are the first part's, so another part's states come from
  `pedalStates` over its own bars, built from `PlayedBar.parts[i]` as
  `{ ...bar, slots: partBar?.slots ?? [], tacet: partBar === null ?
  true : undefined }`.
- **Swing** (`feel: swing`, `shuffle`, with or without an amount): every
  time point on a line (attacks and ends alike, so lengths stay whole)
  at the second eighth of a quarter, k + ½, moves to k + p, where p is
  the amount (0.58 for `swing 58%`; ⅔ for the bare word). `swing 16`
  moves the second sixteenth of each eighth the same way. Pushes land
  first and swing then moves them, so a pushed "and of 4" is swung.
  Triplets are untouched (their points are at thirds). In compound
  meters (6/8, 9/8, 12/8) swing is not applied, with one
  `swing-compound` loss: their beats already divide in three.

### 3.7 Tempo, meter, key; gradual changes; fermatas

- **Tempo** in quarter notes a minute: barmark's tempo counts grammar
  2.1's beat, so qpm = bpm × the beat's length in quarters (6/8 at
  `tempo: 60` is 90 qpm). A tempo event goes wherever a bar's qpm
  differs from the bar before's, which includes a meter change under an
  unchanged `tempo:`. Microseconds a quarter are rounded to whole;
  outside SMF's range (1 to 16,777,215 µs) the tempo is clamped, with a
  `tempo-range` loss. A chart with no tempo plays at `options.tempo`
  (120), with a `tempo-assumed` loss.
- **Time signature** at bar 1 and wherever a bar's meter differs from
  the bar before's; a one-bar `[2/4]` is a signature on that bar and the
  running meter again on the next, as MuseScore writes a pickup (section
  8). The click (MIDI clocks a metronome click) is 24 × the beat in
  quarters, so 6/8 clicks on dotted quarters; 32nds a quarter is 8.
- **Key signature:** sharps or flats from the key, minor flag for
  `minor` and `aeolian`. Another mode is written as its parent major's
  signature (A mixolydian as D major's, 2 sharps) with one `mode` loss:
  MIDI's key meta knows only major and minor. The signature count is
  computed in the package; a test pins it to barmark's own (the private
  `signature` in `chart/keys.ts`).
- **rit. and accel.** (grammar 7.2): over the run of bars carrying the
  change, one tempo event a beat, linear in qpm from the steady tempo,
  **reaching the target at the downbeat of the run's last bar and holding
  it through that bar**. Over a run of n bars the ramp spans the beats of
  its first n − 1 bars; beat k of those m beats (from 0) plays at from +
  (to − from) · (k + 1) / (m + 1), so the last bar's downbeat is exactly
  the target. That way the import, which reads tempo at downbeats (5.4),
  finds the target on a whole bar. A one-bar run reaches the target at
  its own downbeat. With no target, rit. ends at 80% of the steady tempo
  and accel. at 120%. `a tempo` returns to the bar's steady tempo.
- **Fermata** `...`: the last beat before it lasts three times as long:
  a tempo event at that beat at a third of the qpm, and the qpm in force
  again at the next bar. The notes sounding there simply continue, so
  the hold is heard; the bar grid in ticks is unchanged, so the import
  still finds the same bars.

### 3.8 Markers, words, lyrics, title

- **Markers** (meta 0x06) on the conductor track: each section
  occurrence's heading (`SectionOccurrence.name`, no repeat or elision
  marks) at its first bar, in play order, so a replayed chorus gets a
  marker each time it plays; each rehearsal mark's label (`B`) at its
  bar, as MuseScore writes rehearsal marks (section 8). On one bar, the
  heading's marker comes first.
- **Words on a bar** (`"solo"`): a text event (0x01) on the line's
  track, at the slot they precede.
- **Lyrics:** each played syllable (`PlayedBar.lyrics`) as a lyric event
  (0x05) on the singing part's singing line's track (the chart's first
  line's when no part sings), at its onset. Several verses on one note
  are written at the same tick in verse order, as MuseScore does. A
  syllable that ends its word ends in a space; one that continues
  doesn't, and has no hyphen (MuseScore's convention, which the import
  reads back). An elision `the~end` is written `the‿end` (U+203F, the
  undertie). A held syllable (`:/`) writes nothing.
- **Text** is UTF-8.

### 3.9 What export reports

Chart diagnostics as `parseChart` gives them (warnings only, or errors
and no file), and the losses of section 2, each once per file, with the
first bar it happened in. As `exportMusicXml` does (`score.ts`): a chart
with no bars is `{ ok: false }` with the error "the chart has no bars to
export", and `part` naming no declared label (matched in any case) is
`{ ok: false }` with "no part labelled X" before the chart's own
diagnostics, both at line 0.

## 4. The performance

`perform(parse)` is everything in section 3 except bytes: tracks with
notes, pedal, lyrics and words; the tempo map (ramps and fermatas
included); meters, keys and markers; in exact quarters. The writer turns
it into ticks and events. A player (the backlog's `@barmark/player`)
would call `perform` and `secondsAt`, and schedule notes on Web Audio,
never touching SMF code.

It also answers the question "what does this chart sound like" for the
tests: export, import and the property tests all compare against what
`perform` says, and `perform` itself is tested against the grammar's
examples slot by slot.

## 5. Import

### 5.1 Reading the file

- **Header:** `MThd` first, length at least 6 (extra header bytes
  skipped). Format 0 and 1 are read; format 2 (independent sequences) is
  an error, `format-2`. A division with its top bit set (SMPTE frames)
  is an error, `smpte`: there are no beats to make bars from. A division
  of 0 is `not-midi`.
- **Chunks:** `MTrk` chunks are read in order; any other chunk is
  skipped (`unknown-chunk`, info, once). A track count that differs from
  the header's is a warning, `track-count`. A chunk whose length runs
  past the file is read to the end, warning `truncated`.
- **Events:** running status, kept across meta and sysex events
  (leniently: the SMF spec says they cancel it, but files exist that rely
  on it, and keeping it never misreads a valid file, since a valid file
  restates its status after them); a zero-velocity note-on is a note-off,
  as MuseScore writes every note-off (section 8);
  sysex (`F0`, `F7`) skipped. A VLQ longer than four bytes, a data byte
  with no running status, or a status byte that can't appear in a file
  (`F1`–`FE` other than `FF`) ends that track with a warning,
  `bad-event`; the events before it are kept. Meta events read: track
  name, text, copyright, lyric, marker, tempo, time signature, key
  signature, end of track; others are ignored. A tempo of 0, a time
  signature whose denominator isn't 2, 4, 8 or 16 (barmark's `time:`),
  or a key signature outside −7..7 or 0..1 is ignored with a warning
  (`meta-invalid`).
- **Text:** UTF-8 when the bytes are valid UTF-8, else windows-1252
  (Claude's ruling, 2026-11-08: not strict Latin-1, since 0x80–0x9F
  are the curly quotes, dashes and € Windows programs write, and
  "don’t" must survive; the five bytes it leaves unassigned decode as
  C1 controls and are removed); control characters removed; cut at 200
  characters with "…".
- **Bounds:** at most 16 MiB, 1,024 track chunks, 2,000,000 events,
  500,000 notes and 10,000 bars (`MAX_EXPANDED_BARS`), a pickup counted
  as a bar. Past any of them:
  error `too-large`, naming the limit, and an empty chart. The reader is
  linear in the file's size.

### 5.2 Which notes carry the harmony

- **Notes:** a note-on and the next note-off of the same pitch on the
  same track and channel; a second note-on of a sounding pitch ends the
  first there (a re-strike). A note still sounding at the end ends at the
  last event of its track. Zero-length notes are dropped. At one tick, a
  note-off (or zero-velocity note-on) comes before a re-strike of its
  pitch whatever the file order, so a file that writes the new note-on
  before the old note-off keeps both notes (Claude's ruling, 2026-11-08;
  only a note-on of a pitch still sounding moves, so an on and an off of
  a silent pitch at one tick stay a zero-length note, and nothing else
  moves, so the pedal keeps its place).
- **Sustain pedal:** controller 64 at 64 or more holds a released note
  on its channel until the pedal lifts or the pitch is struck again.
- **Streams:** the notes of one track on one channel. Channel 10 is
  drums: left out (`drums-left-out`, info).
- **Melody streams are left out of the harmony:** a stream that is
  monophonic (two or more of its notes sound together for less than 10%
  of its sounding time) and isn't the lowest stream is a melody, a lead
  line or MuseScore's slash notes (which sound as one repeated pitch,
  section 8). One `melody-left-out` info names them (eight at most,
  then a count). The lowest stream is the one lowest at its 10th
  percentile pitch (its pitches sorted, the one a tenth of the way up),
  ties to the lower median pitch, then to file order (Claude's ruling,
  2026-11-08, revised: not the lowest median, which made B3 slash notes
  the bass beside MuseScore's chord playback, F2 C4 E4 F4 A4, whose
  median is E4, and added B to every chord; and not the lowest note,
  which let one stray low hit on a pad or a lead make it the bass and
  leave the real bass line out). When
  the lowest stream is monophonic it is a bass line and stays: it gives
  the bass. When no stream is polyphonic (only melody streams), all are
  used, warning `harmony-from-melody`.
- **Melody lines are not part of the round trip, by design.** The
  harmony is what the import reads, so a chart's own single-note lines
  that aren't its lowest (a melody, a `Vo.Mel` line, a pedal-tone line, a
  piano's left-hand single notes over a separate bass part) come back
  only through the chords they sound in, or not at all. Section 9's
  yardstick compares only what the import keeps.
- **`options.tracks`** names the harmony tracks instead (numbers or
  names); unknown entries warn `track-unknown`, and when none match, the
  default choice is used.
- No harmony notes at all is an error, `no-notes`.

### 5.3 The bar grid

- **The tempo map** is every tempo event in the file, any track (MuseScore
  writes it in track 1 beside notes), by tick; at one tick the last in
  file order wins; 120 qpm before the first. **Time signatures** the same
  way, 4/4 before the first (the SMF defaults).
- **Bars** run from tick 0, each the length of its meter. A time
  signature that falls inside a bar starts a new bar there (`meter-mid-bar`
  warning): the cut bar's meter is its length in the signature's units
  (`3/8`) when whole, else in sixteenths, rounded.
- **The end** is the end of the bar in which the last harmony note
  ends, or the last lyric falls; later bars (a long end-of-track) are
  dropped. A bar spans its start up to but not including the next bar's
  start, so a note ending exactly on a bar line ends in the bar before
  it: ending at tick 1920 in 4/4 at 480, the grid ends at 1920.
  A note ringing up to a 16th past a bar line (a legato release of the
  last chord) ends there too, so it adds no bar of `N.C.`; a note struck
  in a bar always keeps it (Claude's ruling, 2026-11-08, from Task 13b's
  jitter test).
- **A pickup:** the first bar is a pickup when it is shorter than the
  second and a time signature at the second bar changes the meter, as
  MuseScore writes one (1/4 then 3/4, section 8) and as the export writes
  a one-bar `[1/4]`. Bars of silence at the start (a count-in) are kept:
  they are bars of the file.
- **The nominal clock.** Sync's builder works in seconds and divides each
  bar evenly into beats. A MIDI bar is even in ticks, not in seconds once
  the tempo moves inside it (a ramp, a fermata stretch). So the importer
  hands sync **tick time** (a quarter is half a second), and states the
  real tempo itself: `tempo` and tempo `changes` explicitly, from 5.4.
  Sync's `tempo-grid-disagree` is then an artefact of the nominal clock
  and is dropped.

### 5.4 Key, meter and tempo

- **Key:** each key signature becomes a key (sharps or flats, major or
  minor: `sf=-1, mi=1` is `Dm`), the first as sync's `key`, the rest as
  key changes. Sync then respells it (`conventionalKey`). **A doubtful
  key is dropped:** where the key's scale (major; or natural minor plus
  the raised 7th) covers less than 60% of the harmony's sounding time
  while it is in force, the key is left out, warning `key-doubtful`. DAWs
  write C major at tick 0 by default, and a wrong key would misspell
  every chord. No key signature: no `key:` line (grammar 7: a converter
  that doesn't know leaves it out).
- **Meter:** each bar's meter; a change becomes a `time:` line before
  its bar (sync's meter changes). A pickup's meter is not a change: sync
  writes the pickup's `[k/d]` itself, and the starting meter is the
  second bar's. A one-bar change comes back as two
  `time:` lines, not `[2/4]` (sync has no one-bar meters; the pickup is
  the exception).
- **Tempo:** a bar's tempo is the qpm in force at its downbeat, in
  grammar 2.1's beat (qpm ÷ the beat in quarters) of the time signature
  in force (a bar cut short by a signature counts its signature's beat,
  a pickup the beat of the bar after it), rounded to two
  decimals. A `tempo:` line is written where a bar's tempo differs from
  the bar before's. A **ramp**, the downbeat tempo changing in the same
  direction on two or more consecutive downbeats (so three or more bars)
  **with the tempo moving inside each bar between them** (Claude's
  ruling, 2026-11-08: tempos that change only at bar lines are steps the
  chart wrote, `tempo: 100 | C | tempo: 110 | C | tempo: 120 | C |`, and
  each is kept), writes only its final tempo, at its final bar
  (`tempo-ramp`, info): v1 writes no `rit.`/`accel.`. The export's ramp
  moves a beat at a time inside its bars and reaches its target at a
  downbeat (3.7), so it is read as a ramp and its target comes back
  exactly.
  A tempo that changes inside a bar and is back by the next downbeat (a
  fermata stretch) writes nothing (`tempo-in-bar`, info, with a count).
  The export's ramp and fermata therefore come back as a step and as
  nothing.

### 5.5 Chords from notes: segments

The harmony streams' notes are cut into **segments**, each one chord.
**Chord boundaries come from the harmony voices; the bass line moves a
chord only at a bar line** (Claude's ruling, 2026-11-08, fix round 2,
revising round 1, whose carry merged real changes: `| C | C7 |`,
`| Cmaj7 | C |` and Peaceful Dreams' `D7sus4` then `D5` each read one
chord; round 1 had itself revised the first draft, under which a walking
bass under off-beat comping read four symbols a bar):

- **Stretches:** where every harmony note has stopped, a segment of
  **no harmony** begins; a note struck as the last one stops is no gap.
- **The bass line** is the harmony choice's lowest stream (5.2: lowest
  at its 10th percentile, ties to the lower median) when it is a single
  line (overlap under a tenth of its time), so a grace note or a slide
  doesn't lose it; else none, and every note is a harmony voice
  (MuseScore's piano). One helper, `bassLine` in `streams.ts`, serves
  both.
- An **attack** is two or more harmony-voice notes starting within a
  16th note of the first (a block chord, a strum, a stab, a chord whose
  notes are each played up to a 32nd early or late: Claude's ruling,
  2026-11-08, from Task 13b's jitter test). Its **sound** is the pitch
  classes struck and those the voices still hold (to at least the first
  struck note's end).
- **A stretch's first chord** starts with the stretch, or, when a bar
  line falls after the stretch starts and at or before its first attack,
  at that bar line: what leads in before it reads note by note
  (`| {D2} | / | / | / | D |` comes back as written; a ruling from Task
  13b, accepted 2026-11-08).
- **A later attack starts a new chord** when its sound differs from the
  chord's in any way, a pitch class added or dropped. Two carry:
  - inside a bar, a re-strike that only drops notes, each stream
    striking above its own lowest voice in the chord (a thinner voicing:
    Cmaj7 on beat 1, then E G on beat 3, stays `Cmaj7`; a guitar's dyad
    over a piano's held chord is compared with the guitar's own notes);
  - a lone new top note over a chord whose every pitch class is **held
    from before**, not re-struck (a melody note: MuseScore's `piano.mscx`
    bar 2 stays `Em`; `| C | C7 |` with the Bb on top re-strikes all, so
    it cuts).
  A written sustain pedal holds notes, but a changed sound still cuts.
- **The bass:** where the bass line strikes a new pitch class **at a bar
  line** (within the attack window of it) under the chord, a new chord
  starts there, and `nameNotes` gives the slash (`C/E | C/G`, `Dm7 | F`,
  `Cdim7 | Ebdim7`, a held pad over C F G C reads `C | C(11)/F | C/G |
  C`). Inside a bar, the bass line moving never starts a chord (a
  walking bass under held comping or off-beat stabs stays one chord).
- **Rests:** a chord carries through its voices' rests until they next
  strike. A change first heard after such a rest starts where the bass
  moved at a bar line in the rest (Dm7 to G7 as stabs on 2 and 4 over a
  walking bass changes at the bar line, over G2, not on beat 2 over B2);
  where the bass didn't move, at the attack (a pedal C2 under a C stab
  and a G stab on beat 3 of the next bar: `| C | / / G(11)/C / |`).
- A stretch with no attack at all, single lines only, cuts where two
  notes start together or one starts as all others stop: it reads note
  by note.
- **Different sounds** named an import are at most 20,000 (`nameNotes`
  costs up to a millisecond each, and a hostile file can make every
  segment different); past that, `?` with one `chord-unnamed`.
- **What sounds in a segment:** each pitch class weighted by how long it
  sounds within the segment. Past a stretch's lead-in, the harmony
  voices count only while two or more notes struck in its attacks sound,
  so single notes struck after a stab stops (a fill, `C` then `C5 B4
  A4`) don't rename it; the bass line counts only as the chord's bass.
  Single lines (a lead-in, a stretch without attacks) always count. A
  segment where nothing counts (the bass moved at a bar line while the
  voices rest) takes the sound of the one before it. Pitch classes under
  a quarter of the strongest one's weight are passing tones, left out.
  The **bass** is the lowest note struck at the segment's start (within
  the window), or held into it from before when it sounds at least
  until the first struck note stops (a pedal point, a bass held under
  stabs); its pitch class is always kept. So the tail of the chord
  before, played legato into this one, is not its bass (Claude's ruling,
  2026-11-08: a G2 held a 16th into a C chord made it `C/G`).
- **The name** comes from barmark's `nameNotes` (5.6). With none: a note
  set of the kept pitch classes when there are at most three (bass
  first, then upward, no octaves, spelled for the key), else `?`, warning
  `chord-unnamed` (once, with a count and the first few bars; never the
  notes, a value read from the file, since the report counts by message).
  A chord is spelled for each key in force over it (the first from bar
  1), as sync will write it (`conventionalKey`: chords under a `Cb`
  signature are spelled in B); a chord carried over a key change is
  spelled anew there.
- **No harmony** is `N.C.`: the importer always says what sounds, so
  sync never writes `?` for a gap.
- Each segment is a **chord run** (`{ start, end, symbol }`, nominal
  seconds), consecutive equal symbols merged. Sync then votes one symbol
  a beat by plurality of covered time, ties to the chord already
  sounding at the beat's start (sync 6.3): a chord pushed an eighth early
  ties its first beat and wins the next, so it comes back on the beat.

The two numbers (a 16th for an attack, a quarter of the strongest weight
for a passing tone) are tuned against the fixtures; changing them is a
FINDINGS entry. Known limits: a broken chord whose notes never overlap
and start one at a time from silence reads note by note (each note a
fresh start); a pedalled or held arpeggio reads as its chord; under a
written pedal the names are what the pedal holds (`| +C | F | G | *C |`
reads `C | Fmaj9 | Dm13/F | C`, cut where written); a bass moving inside
a bar under the same voices is no new chord; a voice moving only its top
note to a new pitch class over a chord all held is read as melody.

### 5.6 Naming a chord: `nameNotes` in barmark

```ts
/** A chord symbol for sounding pitch classes over a bass, spelled for the key; null when none fits. */
function nameNotes(pitchClasses: number[], bass: number, key: Key | null): string | null;
```

**Claude's call: it lives in `barmark`** (open question 1): it is
vocabulary knowledge (it reads the internal suffix table that
`harteToBarmark` uses), and it is the function grammar 4's linter would
call to suggest a name for a note set. The rule, settled by a spike over
Appendix A.4 and common inversions:

1. **Three or more pitch classes.** Each sounding pitch class is tried as
   the root; its intervals are spelled every way a semitone count can be
   (3: ♭3 or ♯9; 6: ♭5 or ♯11; 8: ♯5 or ♭13; 9: 6/13 or 𝄫7) and looked up
   in barmark's suffix table (Appendix A's combinations, up to three
   added tones). A root whose perfect fifth isn't sounding is tried with
   it supplied too, since voicings leave fifths out (`{C E Bb}` is `C7`).
2. **Suffixes no one writes are dropped** (Claude's ruling, 2026-11-08,
   from Fable's review): a degree held both plain and altered (`b9` with
   `9`, `b7` with `7`: a cluster, not a chord; two alterations, as in
   `7(b9,#9)`, stay), a `(7)` tone on a `6` or `6/9` chord, any added
   tone on `dim` or `dim7`, and an altered tone on `5`, `6` or `6/9`.
   Without this the table names anything (`{C C# D D# E}` was
   `C#mmaj7(b9,9)/B#`, `{C E G A Bb}` was `C6(7)`, `{B G F Ab}` was
   `Fdim(9)/Cb`).
3. **The least cost wins:** one for each added tone in parentheses
   (`m7(b5)` counts none: it is the half-diminished shorthand), one when
   the root isn't the bass, one when the fifth was supplied. (A half for
   the supplied fifth was tried and reverted, 2026-11-08: it renamed
   first-inversion triads as sixth chords, `{Eb C G}` as `Eb6` rather
   than `Cm/Eb`, and named nothing better.)
4. **Ties** (the order is Claude's ruling, 2026-11-08, from Fable's
   review): triads, then sevenths, then sixths, then sus, then extended
   chords, then added tones; then the root in the bass (`{C E G Bb Db
   Eb}` is `C7(b9,#9)`, not `Eb13(b9)/C`; `{G C F}` is `G7sus4`); then
   `(9)`, `(11)`, `(13)` over `(2)`, `(4)`, `(6)` (`{G B F E}` is
   `G7(13)`); then the shorter suffix; then the root nearest above the
   bass.
5. **Two pitch classes** a perfect fifth apart are a power chord (`E5`);
   any other dyad, and a single note, is null (the importer writes the
   note set).
6. **Spelling** (Claude's ruling, 2026-11-08, from Fable's review): the
   root by `spellPitch(root, key)`. The bass by its interval from the
   root, but by `spellPitch(bass, key)` when that spelling has a double
   accidental, or is E♯, B♯, C♭ or F♭ while the root has no key or is
   outside the key's scale (`{G E G#}` is `E(#9)/G`, not `E(#9)/F##`).
   A root with no key or outside the key's scale takes its enharmonic
   spelling when that has fewer faults among the root, its third and the
   bass, a fault being a double accidental or an E♯, B♯, C♭ or F♭ that
   `spellPitch` would not itself produce: keyless `{Db F Ab}` is `Db`
   (not `C#` over `E#`), `{G# B D F}` is `G#dim7` (not `Abdim7`, whose
   seventh is E𝄫), `{C# E G#}` stays `C#m`. A root in the key's scale
   keeps the key's spelling (`C#/E#` in C♯ major, `Cb/Gb` in G♭).

Known residuals of the rule (kept, not named the way a musician would):
`{D F G C}` is `G7sus4/D` (`Dm7(11)` costs 2, the slash 1), `{C Eb F
Bb}` is `F7sus4/C`, `{C E G# D}` is `Eaug7/C` (the augmented triad's
symmetry), `{C G B}` is `G(11)/C` (no `(no3)` in the table), and
rootless shells such as `{E Bb D}` (`Bb(b5)/E`) are named rather than
null. In import the bass line usually supplies the root, and then the
shell names as written (`{E Bb D}` over C is `C9`, `{Bb E A}` over C is
`C7(13)`); the residual arises only with no bass line under it.

What the spike gave (key-less): every A.4 symbol on C comes back as
itself except `C11` (`C9sus4`, the same notes), `C/Bb` (`C7/Bb`, the
same notes) and `Am7/C` (`C6`: with the bass as root the cost is lower;
the same notes). `F/G` is `G9sus4`, `{G B F}` is `G7`, `{B D F A}` is
`Bm7(b5)`, `{E G C}` is `C/E`. Where names differ the pitch classes are
equal, which is what the round trip compares (section 9).

### 5.7 Building the chart

`chartFromDetections` (sync) gets:

- `grid.bars`: the bar starts in nominal seconds, and the end;
- `chords.runs` with `symbol` (5.5), covering every bar;
- `key`, `meter`, `tempo` and `changes` from 5.4;
- `sections` from **markers** (meta 0x06, any track): a marker's text
  is a section name at its tick. Two markers on one bar: the first in
  file order is kept and the others dropped (`marker-dropped`, info),
  since the export writes a heading before a rehearsal mark and sync
  would keep the later. Cue points are ignored. Sync strips and collapses
  hostile names (`x2`, `->`, newlines).
- `pickup.start` when 5.3 found one;
- `title`: in a format 0 file, its track's name; in format 1, track 1's
  name when track 1 has no notes (a conductor track; MuseScore's track 1
  is its first part, named "Voice", which is not a title).

Sync writes holds, `%`, sections written out in full, directive lines and
the layout, prints with `printChart` and never throws. Its diagnostics
pass through with their codes (`path` and `at`, which are nominal, are
dropped; `bar` is kept).

So a marker named "A" (a MuseScore rehearsal mark) becomes `## A`: the
import has no rehearsal marks, and a section is what a marker most often
is.

### 5.8 Lyrics

Read unless `lyrics: false`. They become **lyric rows** (grammar 7.7)
under the chart's bar lines: with no melody line in the chart, a row's
words are "the chart's, sung or spoken over the band, on no melody",
which the grammar allows.

- **From** the first track (file order) with lyric events; other tracks
  with lyrics are named in one info, `lyrics-other-tracks`. A file with
  no lyric events but a karaoke track (text events 0x01 with `@` header
  lines, as `.kar` files write) reads that track's text events instead,
  the `@` lines left out and a leading `\` or `/` (a line-break marker)
  read as a word's end (Kevin's ruling via the coordinator, Task 14 fix
  round 1).
- **Verses:** lyric events at one tick are verses 1, 2, … in file order
  (MuseScore writes two verses so, section 8, and so does the export),
  up to 100; the rest are left out with a `lyrics-dropped` warning
  (Claude's call, Task 14: barmark's parser and printer slow with the
  rows under one bar line, and a hostile file can put every event at one
  tick). MIDI has no verse number, so a verse that holds where another
  sings takes the other's place; when the number of lyrics at a tick
  varies within the track, one `lyrics-verses-uncertain` warning says
  verses may be mixed. At most 200,000 rows (a verse under a bar line)
  are written; later verses are left out (`lyrics-dropped`).
- **Syllables:** a syllable continues its word (`-`) unless its text ends
  in whitespace, or the next syllable of its verse begins with
  whitespace (karaoke files put the space first); a trailing `-` is kept
  as the continuation. `‿` and SMuFL's lyric elisions U+E550–U+E552
  (MuseScore writes U+E551) become `~`. Characters a lyric row can't hold
  as a syllable (`|`, `"`, `{`, `}`, `_`, whitespace inside) are removed
  (whitespace inside becomes `~`); a syllable left empty, or reading as
  `/`, `--` or `-` alone, is skipped. Leading, trailing and doubled
  `~` are removed (`~a`, `a~`, `a~~b` would be errors), and so is a
  `/-` (an error in a row).
- **Placement:** in each bar, the coarsest even grid that puts every
  syllable's onset on a slot: the whole bar, then each divisor of its
  beats (onsets on beats 1 and 3 of 4/4 are two slots), then its beats
  each in two, three or four (`_` groups; a beat whose later slots all
  hold is written as one slot). An onset finer than that moves to the
  nearest point (of the grid nearest every onset, ties to the coarser);
  one nearer the next bar line stays on the last slot; a breath shorter
  than the grid's slot is lost. Two syllables of one verse on one slot
  are joined as an elision. A slot with no syllable is `/` when the
  lyric track's own notes are sounding at its start after the verse's
  first syllable, else `--`.
- **Rows:** sync writes no repeats, so played bars and written bars
  match one to one, `%` included. After the build, each bar line gets one
  row per verse that has a syllable on it, and the chart is printed
  again. A lone verse 1 is `lyrics:`; with more verses every row is
  numbered (`lyrics 1:`, `lyrics 2:`, …), since grammar 7.7 makes an
  unnumbered row among numbered ones an error.
- **Self-check, per verse:** the chart must parse with no errors and
  its `PlayedBar.lyrics` must hold every syllable placed. On a failure
  the importer drops the failing verse's rows and checks again, verse by
  verse, before giving up on lyrics altogether; each dropped verse is
  one `lyrics-dropped` warning naming it. An importer bug can't cost the
  chords, nor the verses that did place.

### 5.9 Import diagnostics

| Code | Severity | When |
|---|---|---|
| `not-midi` | error | no `MThd` header, or a division of 0 |
| `format-2` | error | format 2 |
| `smpte` | error | SMPTE time division |
| `too-large` | error | past a bound of 5.1 |
| `no-notes` | error | no pitched notes outside channel 10 |
| `truncated` | warning | a chunk runs past the file |
| `track-count` | warning | the header's track count is wrong |
| `bad-event` | warning | junk in a track; the rest of it skipped |
| `meta-invalid` | warning | a tempo, time or key signature barmark can't use |
| `meter-mid-bar` | warning | a time signature inside a bar |
| `key-doubtful` | warning | a key signature the notes don't fit |
| `harmony-from-melody` | warning | only melody streams; used anyway |
| `track-unknown` | warning | an `options.tracks` entry matching nothing |
| `chord-unnamed` | warning | `?` written for unnameable notes |
| `lyrics-dropped` | warning | the lyric rows failed the self-check, or past a bound of 5.8 |
| `lyrics-verses-uncertain` | warning | the number of lyrics at a tick varies, so verses may be mixed (5.8) |
| `unknown-chunk`, `drums-left-out`, `melody-left-out`, `tempo-ramp`, `tempo-in-bar`, `marker-dropped`, `lyrics-other-tracks` | info | as above |

Plus sync's `BuildCode`s as they come (most can't arise from this
input; `section-*`, `after-last-bar`, `change-collision`, `key-respelled`,
`meter-*` and `tempo-unreadable`, a tempo outside 1–999 bpm, can).

## 6. Where import meets sync, and what sync lacks

Building on `chartFromDetections` gives the importer, for free and
already fuzzed: holds and `%`, sections written out, key, meter and tempo
changes, a pickup, the title, layout, canonical printing, and its never-
throw guarantee. What it lacks, and how this design handles each:

| Sync lacks | Here |
|---|---|
| Seconds that aren't even within a bar | The nominal clock (5.3) |
| Lyrics | A step after the build (5.8) |
| Slots finer than a beat; pushes | Not in v1 (open question 3) |
| Melody, note lines, several parts | Not in v1 (open question 2) |
| `rit.`/`accel.`, `...`, one-bar meters | Not in v1: a step, nothing, two `time:` lines |
| Rehearsal marks | Markers become headings |
| `--` | Not distinguishable in MIDI anyway |

No sync change is needed for v1. If v2 adds sub-beat slots or gradual
tempo changes, they are sync options first (its spec 6.1 already names a
beat grid as the seam), so SS gets them too.

## 7. The CLI

After the library, in `@barmark/cli`, pinned exactly as it pins the
others:

- `barmark export --midi <chart> --out song.mid [--part label]`. `--out`
  is required (Claude's call: a binary file on a terminal is never
  wanted, and it keeps `Io` text-only); without it, a usage error. Chart
  diagnostics and losses go to standard error; with chart errors nothing
  is written, as `--musicxml` behaves. The flag follows the existing
  `--musicxml` (open question 5).
- `barmark import song.mid [--out file.chart.md] [--tracks 1,Piano]`,
  chosen by the extension `.mid` or `.midi`. Diagnostics on standard
  error as `file: bar N (track T): severity: message`, control
  characters shown as U+FFFD as `import` already does; exit 1 when the
  import produced nothing.
- `--version` lists `@barmark/midi`.

## 8. What MuseScore 4 writes (spike, 2026-11-08)

`mscore -o x.mid` on the musicxml import fixtures (`lead-sheet`, `band`,
`hymn`, `comping-guitar`, `dorico-band`) and on an exported chart with
marks, read with a throwaway dumper:

- **Format 1, 480 ticks a quarter.** Tempo, time and key signatures sit
  in **track 1 beside its notes**: there is no conductor track, and
  track 1's name is the first part's ("Voice"), not the title. The title
  isn't written at all.
- **One track per part** (an empty track for a piano's second staff).
  The files seen used channel indices 0–8 and 10–12, none on index 9,
  but none had more than nine channels before it, so whether MuseScore
  skips channel 10 on purpose is **unverified**.
- **Chord symbols are played**, on a channel of their own inside the
  part's track, with program 1 (piano): the bass in octave 2 and the
  chord close above C4 (Fmaj7 is F2 C4 E4 F4 A4), held for the chord's
  length. This is the best case for the import, and it is why the export
  voices chords the same way (3.5).
- **Slash notes are played as a pitch** (B3 or B4, the staff's middle
  line) on the part's own channel, one per beat. This is why melody
  detection (5.2) leaves out monophonic streams: otherwise B would be
  added to every chord (C + B is Cmaj7).
- **Lyrics:** one lyric event per syllable, both verses at the same tick
  in verse order; no hyphens; a trailing space ends a word ("Hap",
  "py "). An elision is SMuFL's U+E551 between the syllables ("andI "),
  which shows as "andI" where the font lacks it.
- **A pickup** is a 1/4 time signature then 3/4 at the next bar.
- **Rehearsal marks become markers** ("A"); section headings (bold
  words) don't. So MuseScore files bring no section names unless they
  have rehearsal marks.
- **rit. to 90** became a single tempo step to 90 at the end; **a
  fermata** changed nothing; **swing** wasn't applied (the pushed eighth
  stayed straight). One note at velocity 96 against 80 sat where the
  accent was, but on a slash note: whether that is MuseScore's accent is
  **unverified**.
- Notes end one tick early before a re-attack, and **every note-off is
  a zero-velocity note-on** (the reader treats them alike, 5.1).

Dorico's MIDI export would come through mac-bench, whose `dorico
--export` drives only MusicXML today: adding `mid` is a mac-bench change
on Kevin's Mac, later.

## 9. Testing

Test first, per rule, in `packages/midi/tests/`.

- **SMF:** the writer's bytes for small cases, exactly; every written
  file read back by `midi-file@1.2.4` (devDependency) with the same
  events as our reader gives; the reader on hand-built bytes for each
  rule of 5.1 (running status, zero-velocity note-on, format 0, SMPTE,
  format 2, a truncated chunk, a wrong track count, a five-byte VLQ, a
  stray status byte, sysex, an unknown chunk, UTF-8 and windows-1252 text).
  A test helper builds files from readable event lists.
- **Performance:** one test per row and rule of section 3 on small
  charts (each slot kind, the voicing, a bass part, holds across bars, a
  push across a bar line and back over a repeat, a hit held by `/`, pedal
  on every channel of a part, swing and
  swing 16, swing in 6/8, tempo per beat in 6/8, a ramp, a fermata, a
  one-bar meter, markers on replays, words, two verses, an elision,
  channels past 15, channel 10 never used).
- **Export plays the chart:** a test player reads the file with
  `midi-file` and lists, for each beat, the pitch classes sounding just
  after it starts. It must equal what `parse.bars` sounds there, read
  from the chart alone (holds resolved, a push from its early attack,
  nothing for `N.C.`, `--`, `?`), for every
  chart in `examples/`, the grammar's own example and the musicxml
  package's jump charts. This keeps "looks right, plays wrong" in check
  through repeats, endings, jumps and replays.
- **Round trip, exact:** charts in generator form (one line, chords on
  beats, written out, `/` across bar lines, chords whose `nameNotes`
  name is themselves, sections as headings, key, meter and tempo lines,
  a pickup) come back as `printChart` of the original, exactly.
- **Round trip, by ear (the yardstick):** for every single-part chart
  above and the jump charts' single-part seeds, the import's chart sounds
  at every beat what the original's **voted** beat sounds: per line, the
  slot covering the plurality of the beat, ties to the one sounding at
  the beat's start (sync's vote, so pushes and eighth-note changes are
  compared as the import writes them), unioned over what the import
  keeps: chord symbols, voicings and note sets of two or more notes on
  every line, single-note sets only on the lowest line (5.2). Sampling
  at the beat's start stays the export player's measure. One allowance: the import
  may add the perfect fifth above its chord's root, which `nameNotes`
  supplies when a chord leaves it out (5.6; `C7alt` comes back as `C7`).
  Several-part charts are compared as the union of their parts, except
  on beats where that union has no name (the import writes `?` there, by
  rule); the test counts those beats and reports them.
- **Property:** the musicxml package's seeded `jumpChart` generator (reused
  by relative import, as its `played.ts` reuses barmark's fixtures);
  each seed's chart, exported and imported, passes the yardstick, and
  the import's chart parses with no errors and prints unchanged. Plus
  the robustness of sync's own test: every note onset moved by up to a
  32nd and legato overlaps of up to a 16th give the same chart.
- **Fuzz** (seeded, 2,000 cases): random and mutated bytes (truncations,
  flipped bytes, huge lengths, random event streams) never throw;
  `text` parses with no errors and prints unchanged, or is `""` with an
  error.
- **Scale:** 10,000 bars and 200,000 notes import in linear time (ten
  times the input at most twenty times as long), and export of a
  1,000-bar chart likewise.
- **Real files**, regenerated by a VM-only script, `bun
  scripts/midi-fixtures.ts`, as `scripts/musescore-fixtures.ts` does:
  MuseScore 4 converts the existing `.mscx` fixtures (and two new ones:
  a piano comping part with pedal, a bass-and-chords band) to `.mid`
  under `packages/midi/tests/fixtures/`; the expected charts are read
  over by hand once, then checked in. CI reads them and never needs
  MuseScore. The script also converts a few exported charts back
  through MuseScore (`mscore -o x.musicxml ours.mid`) to check MuseScore
  opens them with the bar count we wrote.
- **Notation programs and DAWs**, by hand before the first release:
  Peaceful Dreams and Morning Song open in MuseScore 4, GarageBand or
  Logic, and Dorico (through mac-bench or Kevin), with screenshots in the
  pull request.
- For every test: the import never throws, its chart parses with no
  errors, and `format` leaves it unchanged.

## 10. Release

**Claude's ruling, 2026-11-08,** on the release order (this branch was
designed on barmark 0.19.1; barmark 0.20.0 and render 0.17.0 are out):

1. `@barmark/midi` **0.1.0**, export alone, depending on `barmark
   ^0.20.0`: it needs no barmark change (3.4, 3.7).
2. `barmark` **0.21.0** with `nameNotes`.
3. Patches of every package that depends on `barmark` with a caret
   (`@barmark/render`, `@barmark/musicxml`, `@barmark/sync`,
   `@barmark/midi`), each "Requires barmark 0.21.0". RELEASING.md's
   "a barmark minor needs a renderer release" is generalised to every
   caret dependant (plan Task 1), since in 0.x `^0.20.0` stops before
   0.21.0.
4. `@barmark/midi` **0.2.0** with import.
5. `@barmark/cli` **0.7.0** with both commands; the CLI then bundles
   `@barmark/sync` through midi, so its release checks cover sync's and
   midi's code too (plan Task 16).
- **`@barmark/midi` is a new package:** before its first release
  **Kevin** does RELEASING.md's "A new package's first release": the
  placeholder 0.0.0 publish, the trusted publisher, `midi-v*` in the
  "release tags" ruleset and the `npm` environment, and the `package (N,
  midi)` checks in the "main" ruleset.
- After the CLI, the `songs` bump and a Get Started line on barmark.dev
  (RELEASING.md steps 13–14).

## Decisions on the open questions

Kevin (2026-11-08) asked Claude to go ahead on its own recommendations
for every open question, so each one below is **decided as recommended**
(Claude's recommendation, Kevin's go-ahead). Revisit any on review.

1. **Should the import name chords from notes?** The MusicXML import
   never names a note set (your decision, 2026-11-05), and grammar 4
   says barmark never names one on its own, though a linter may suggest
   a name. But a MIDI file has no chord symbols at all: without naming,
   a MIDI import is a chart of note sets. **Recommendation: yes,** with
   `nameNotes` in barmark as the linter's suggestion function (5.6), a
   fixed vocabulary and order, and a note set or `?` when nothing fits.
   (Sync's spec ruled out re-colouring detected chords from audio notes;
   MIDI notes are exact, which is why this is different.)
2. **One chord line, or one part per track?** **Recommendation: one
   chord line in v1**: the harmony is the ensemble's, so it is read from
   all harmony tracks together, and the chart is what a band reads. Parts
   per track need melody and note-line quantisation, which is the
   MusicXML import's grid work again; a v2 design.
3. **Import on sync's builder, at beat resolution?** **Recommendation:
   yes for v1** (section 6): it reuses a fuzzed, canonical writer and
   keeps import small. The cost: pushes and eighth-note changes come
   back on the beat. The alternative, an own writer with the MusicXML
   import's grid placement, is a later step that would add sub-beat
   slots to sync first.
4. **The performance core as a subpath, `@barmark/midi/perform`?**
   **Recommendation: yes** (1.1), split into `@barmark/perform` when the
   player is built.
5. **`--midi` or `--to midi`?** The brief said `export --to midi`; the
   CLI already has `export --musicxml`. **Recommendation: `--midi`**,
   matching it; `--to <format>` for both would be a separate CLI change.

## Claude's calls (for Kevin to check)

1. A new package, `@barmark/midi`, depending on `barmark` and
   `@barmark/sync`; SMF format 0 and 1 in, format 1 out.
2. A hand-written SMF reader and writer; `midi-file@1.2.4` only as a
   test devDependency, to read our files back independently.
3. Export in play order from `parse.bars`; an open repeat plays once.
4. One track per part line after a conductor track; programs from the
   grammar's instrument list, piano when none; channel 10 never used.
5. A melodic instrument's chord symbols sound on a piano harmony track
   of their own, as MuseScore plays chord symbols.
6. A chord symbol is a block chord for its slot and its holds: bass in
   E2–D♯3, every chord tone once in C4–B4; a bass instrument plays the
   bass alone in E1–D♯2.
7. Note sets without octaves rise from octave 4.
8. Velocity 80, accent 100, hit 112 for its whole slot (Claude's
   ruling, 2026-11-08); pushes move the attack and shorten the sound
   before it in play order; pedal as controller 64 on every channel of
   the part.
9. Swing moves every time point at the second eighth (or sixteenth); not
   applied in compound meters.
10. rit./accel. as a per-beat linear ramp reaching the target at the
    run's last downbeat, or 80%/120% without one; a fermata triples the last beat before it by tempo, so
    ticks and bars are unchanged.
11. Headings and rehearsal marks as markers; words as text events; lyrics
    as lyric events, MuseScore's convention, `‿` for an elision.
12. A mode other than major or minor is written as its parent major's
    signature, with a loss.
13. Ticks: the smallest multiple of 480 that makes every time whole, up
    to 32,640, else 480 and rounding.
14. Import reads the whole tempo and meter map from any track; bars in
    ticks; a pickup when a shorter first bar is followed by a meter
    change; trailing empty bars dropped; count-in bars kept.
15. The nominal clock for sync; its `tempo-grid-disagree` dropped.
16. Monophonic streams other than the lowest are melody and left out of
    the harmony; drums (channel 10) left out; `options.tracks` overrides.
17. Segments cut at multi-note attacks and fresh starts; passing tones
    under a quarter of the strongest weight dropped; the bass is the
    lowest note at the segment's start.
18. `nameNotes` in barmark, with the cost and tie rules of 5.6.
19. No harmony is `N.C.`; unnameable notes are a note set (up to three
    pitch classes) or `?`.
20. Key signatures trusted unless the notes fit the key under 60%.
21. Tempo by downbeat; ramps (two or more same-direction downbeat
    changes) collapse to their end; in-bar dips ignored.
22. Markers become headings, the first on a bar kept; the title only
    from a conductor track or a format 0 track's name.
23. Lyrics as lyric rows on the coarsest grid, verses by order at a
    tick, with a self-check that drops them rather than the chords.
24. Bounds: 16 MiB, 1,024 tracks, 2,000,000 events, 500,000 notes,
    10,000 bars, a pickup included.
25. The CLI's `export --midi` requires `--out`.
26. Release: midi 0.1.0 (export), barmark 0.21.0 (`nameNotes`), the
    caret dependants' patches, midi 0.2.0 (import), cli 0.7.0 (Claude's
    ruling, 2026-11-08); the new package's first publish is Kevin's.
27. `slotTimes` reimplemented in quarters over `memberShares`, pinned
    to barmark's by a test (Claude's ruling, 2026-11-08).
28. The import's running status survives meta and sysex events.
29. Lyric verses are dropped one at a time when the self-check fails.
