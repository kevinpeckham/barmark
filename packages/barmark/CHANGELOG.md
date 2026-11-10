# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is 0.x, a minor release may change the grammar or the API.
Releases follow the process in [RELEASING.md](RELEASING.md).

## [Unreleased]

## [0.22.0] - 2026-11-09

A grammar change: a chart's pickup is bar 0 (2.4), which now defines a
pickup. Charts without a pickup read and number as before. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **`ChartParse.pickup`**: true when the chart's first written bar is a
  pickup (grammar 2.4: in a one-bar meter shorter, by value, than the
  meter in force at the next written bar, and that bar not short itself).
  **`opensWithPickup(bars)`** gives the same answer from played bars
  alone. The grammar now defines a pickup.

### Changed

- **A pickup is bar 0** (grammar 2.4): in a chart that opens with one,
  every played bar's `written` is one less than before, so bar 1 is the
  first full bar, as notation and the MusicXML export number it; a repeat,
  replay or D.C. that plays the pickup again shows 0 too. Charts without
  a pickup are numbered as before. `index`, the play position, does not
  change, so times keyed by it stay valid.

- **A line's passes that sing nothing are one warning.** "pass 3 of this
  repeat sings nothing: its bars have verses 1 and 2" stays as it was for
  one pass; several are now listed together, a run of three or more as a
  range ("passes 1 and 3–9 of this repeat sing nothing: …"), and a list
  past five items shows four and counts the rest ("verses 1, 2, 3, 4 and
  2496 more"). 2,500 verses over a bar played 10,000 times gave 7,500
  warnings of about 14 KB each (105 million characters, which the site
  rendered as one list); now one of 92 characters.

- **The npm homepage is https://www.barmark.dev**, not the package's
  folder on GitHub.

### Fixed

- **A bar played many times no longer costs its size on every play.** A
  shared chart of one bar with thousands of lyric syllables, notes or
  slots, repeated thousands of times, made the parse copy every syllable
  for every play (lyrics) and walk every slot of every play twice (the
  pedal warnings, through a matrix of every slot of every played bar):
  seconds to minutes and over a gigabyte from a few kilobytes. A played
  bar now shares its written bar's data: two plays of one bar return the
  same `slots`, `words` and `lyrics[].syllables` arrays (and the same
  `PlayedLyrics` object), which a caller must not mutate; each written
  bar's syllables, pushes and pedal effect are read once per meter it
  plays in. The parse costs the written chart plus the played bars, never
  their product. The parse's data is otherwise unchanged; `pedalStates`
  still builds its matrix for callers that want it, but `parseChart`
  doesn't call it.
- **A chart of many parts parses in time near linear in its size, not
  cubic.** Each part's projection scanned the whole system for its own
  line at every line it projected, and rebuilt the systems by copying;
  choosing a system's reference line compared every line with every
  other; reading a labelled line re-listed the declared parts; finding
  who sings read every bar line once per part, and gathered the lyric
  rows by copying their list for each row; folding a bar looked for each
  part's streams among all of them. 600 one-bar parts in one system
  (19 KB) took about 9 s; at 50 KB, 1,500 such parts took minutes (now
  0.9 s), 1,383 parts under 1,383 verses 18 s (now 1.3 s). And each part
  read every line of the chart although it may play only its share of
  the bars: 3,227 parts resting through 2,000 systems one part writes
  took 19 s, 2,113 parts under 6,339 tutti lines 27 s (now 1.1 s each).
  A part of a chart of several now reads at most ten times its share of
  the bars in lines; one that stops there says so ("expansion stopped
  after 0 bars: each of 1000 parts reads at most 100 lines"). Real charts
  read every line: four parts may each read 25,000.
  A third review, and an audit of every loop over parts, voices, lines,
  systems, rows and played bars, found more of the same: each part's
  voice was looked for among every voice and every stream (1,979 parts
  each singing, 50 KB: 59 s, now 0.3 s); a part's own line was looked up
  again at every line of its system, and every part walked every line of
  the chart (800 parts of four lines: 3.3 s, now 0.7 s; 777 parts of two
  lines in two systems: 1.9 s, now 0.6 s), and the parts' score order
  read every system once per part; a lyric row under a replay heading
  was copied onto every part's line of the replayed system (1,354 parts
  and 1,354 replays, each with its own row: 3.8 s, now 0.3 s), and so was
  each row's list of covered lines. Printing a 10,000-bar line counted
  its bars again for every bar (2.2 s, now 0.5 s). A test now parses each
  of these shapes at eight times the parts and fails if it takes twenty
  times as long.
- **The verses a bar sings count toward the expansion's budget.** Outside
  a repeat a bar sings every verse written over it, so 1,560 verses under
  one bar replayed 5,000 times (55 KB) made 7.8 million verse references
  (1.3 s, 61 MB). Each verse a written bar sings when it plays again now
  counts as work (its first play's are as many as are written), and a
  chart past the budget stops with an error that says so ("expansion
  stopped after 64 bars: the bars played again sing too many verses
  (98,280)"; both numbers count only the bars output, so a bar a
  replay's `->` cuts is not counted, and a bar the budget stops is
  neither sung nor checked): now 0.1 s and 2 MB. Once play stops at any
  limit, the stop is the only report of what it cut short: no "the parts
  fall out of step" for a part that stopped early, and no "verse N is
  never sung" for verses the stop left unsung: a row play never reached,
  or reached in a repeat with passes enough for its verse. A verse its
  repeat can never reach is still reported (`lyrics 3:` under `x2`), stop
  or not. A part whose play ended at `Fine`, after the jump, reports no
  stop for the lines past its share, which it would never have played. Repeats that play too much with no
  bars to count (fermatas) now say "expansion stopped after N bars: its
  repeats play too many times", not the bar cap's "expansion stopped at
  10000 bars", which is kept for the bar cap itself. Real charts use a tiny share of it: the examples
  and fixtures at most 153 of 100,000.

## [0.21.0] - 2026-11-08

### Added

- **`nameNotes(pitchClasses, bass, key)`** names a chord from the pitch
  classes sounding over a bass, spelled for the key, or returns null when
  none fits: the name grammar 4's linter may suggest for a note set, and
  what `@barmark/midi`'s import will call. Every root is tried, with the
  fifth supplied where it is missing. The fewest added tones wins, a
  slash and a supplied fifth costing one each; ties go to triads, then
  sevenths, sixths, sus, extended chords and added tones, then the root
  in the bass, then `(9)`, `(11)`, `(13)` over `(2)`, `(4)`, `(6)`.
  Suffixes no one writes are never suggested: a degree both plain and
  altered (`b9` with `9`), `(7)` on a sixth chord, a tone on `dim` or
  `dim7`, an altered tone on `5`, `6` or `6/9`. `{G B F}` over G is `G7`,
  `{E G C}` over E is `C/E`, `Am7/C`'s notes are `C6`, `{G B F E}` is
  `G7(13)`; two pitch classes name only a power chord (`E5`). The bass is
  spelled by its interval from the root, or by pitch when that would
  double (`E(#9)/G`); with no key, a black-key root takes the spelling
  with fewer awkward notes (`Db`, `C#m`, `G#dim7`).
- **`time` on a played bar in a one-bar meter** (Kevin's decision,
  2026-11-08, grammar 2.4, A.7): the meter of the `time:` in force,
  whose beat `tempo:` counts there, so a short or odd bar never changes
  speed. In `time: 6/8, tempo: 60` a `[2/8]` pickup plays at 60 dotted
  quarters a minute, not 60 eighths. Absent on any other bar, where
  `meter` is the `time:` meter. No change to what any chart means
  otherwise.

### Fixed

- **`printChart` prints many lyric rows in linear time.** Deciding
  whether a row lies just under its bar line scanned every line of the
  chart for a heading in between, once a row: 100 verses under each of
  500 bar lines took 9 s to print. The headings are now found by halves;
  the same chart prints in about a second, parse included.
- **A part's tacet stand-in for a `%` is as long as the bar it copies**
  (grammar 7.4, 2.4). Where one part writes `| [2/8] G | % |` and another
  has no line, the resting part's bar for the `%` was a bar of the
  running meter (`| [2/8] N.C. | N.C. |` in 6/8), so an extracted part
  and the score disagreed on the bar's length. It is now `[2/8] N.C.`,
  across line breaks and after a tutti line too. A bar of several parts
  also takes its `time` from the part its meter comes from, the first
  that plays, so a `%` of a one-bar meter where the lead part rests no
  longer loses it (it played at 30 quarter notes a minute in 6/8 at
  `tempo: 60`, not 90).

## [0.20.0] - 2026-11-08

### Changed

- **`->` cuts the replay's last bar as written** (Kevin's decision,
  2026-11-08, grammar 6). It used to cut the last bar played, so a
  `Fine` or `To Coda` that stopped the replay early, after the jump, cut
  a bar before the stop instead: `## Intro` holding `| E7 | Fine |`,
  replayed as `## Intro ->` after a `D.S. al Fine`, played nothing. Now
  the cut bar is the last one written in the replayed section (from the
  last pass with `x N`); when play stops before it, it is never reached,
  the replay plays up to the stop and its occurrence's `elided` is false.
- **A `Coda` with no bar after it is an error** (Kevin's decision,
  2026-11-08, grammar 5.2): "Coda has no bar after it, so To Coda has
  nowhere to go on", on the `Coda`'s line. The `Coda` an `al Coda` goes
  on needs a bar after it: a bar written later in the chart, or a later
  heading that replays one (`## Chorus` alone, the last chorus as the
  coda). Like every direction error, it drops the jump. Before, such a chart parsed cleanly and played
  nothing after `To Coda`.

## [0.19.1] - 2026-11-07

### Fixed

- **`harteToBarmark` names an interval list as its shorthand does.**
  `C:(1,b3,b5,b7)` gave `Cdim(7)`, the alphabetical first of the names
  spelling those notes, while `C:hdim7` gave `Cm7(b5)`, the grammar's
  spelling of `ø`. When several names spell the notes equally well, the
  one a Harte shorthand means now wins, so both give `Cm7(b5)`. Only the
  half-diminished seventh was named differently.

## [0.19.0] - 2026-11-07

### Added

- **`keyFromText`, `conventionalKey`, `printKey` and `spellPitch`.** Read a key
  as people and detectors write it (`F♯ minor`, `Bb Maj`), spell it with the
  fewest accidentals, print it as `key:` does, and spell any pitch class in a
  key.

### Technical

- `transposeChart`'s keyless spelling and its key-signature helpers now live in
  `src/chart/keys.ts`, shared with `spellPitch`; behaviour is unchanged.

## [0.18.0] - 2026-11-07

### Fixed

- **A cell of many quoted words parses in linear time.** Each word
  re-read the whole cell and re-split what came before it, so 20,000
  words in one bar took about 25 seconds; `barmark check` on a hostile
  chart, and the MusicXML import's check of what it wrote, waited on it.
- **A text line starting `constructor:` or `__proto__:` gets no near-miss
  warning.** The directive and credit near misses were looked up on plain
  objects, so those words found `Object.prototype` and suggested
  "function Object() { [native code] }:".

### Changed

- **`title: X` warns as a near miss, suggesting `# X`** (Kevin's ruling,
  2026-11-07, issue #173), as `meter:` suggests `time:`. A chart's title
  is its `#` line; the `title:` line stays text and prints as written.

## [0.17.1] - 2026-11-07

A parse is plain data that owns its objects, and the README says what it
holds and how to store charts.

### Fixed

- **A chord's unaltered interval is `alter: 0`, never `-0`,** so a parse
  written to JSON and read back is the same object, as the README now
  promises.
- **Two parses share no objects.** A chord's intervals were the chord
  vocabulary's own objects, shared by every parse in the process, so
  changing one parse's intervals changed every later parse's. Each chord
  now has its own.

### Technical

- **The README documents the parse result**: what is written and what is
  played, and why to store a chart's text and treat a stored parse as a
  cache. A test holds every example chart's parse to a JSON round trip.

## [0.17.0] - 2026-11-07

A grammar change: syllables on notes (4.3), lyric rows and verses in play
order (7.7), a part's bare line sharing a system with its named lines
(7.6, amended), `---` breaks and a leading `\` (1). Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

**Changes what an existing chart means.** A line of only `---` (three or
more hyphens) is now a break that ends a system, not text. A part's bare
line followed directly by its named lines (`Pno | C |` then
`Pno.RH | … |`) is now one system, the bare line the part's first line;
it used to be two systems played one after the other (put `---` between
them for that). Also: a `lyrics:` or `lyrics N:` line followed by a bar
line is a lyric row, and a text line's leading `\` is no longer shown.

### Added

- `---` (three or more hyphens alone) ends a system and means nothing else;
  it parses as a `break` line and prints as `---` (grammar 1, 7.4).
- Syllables on notes (grammar 4.3): `{G4}:maz-` sings a syllable on a note
  set, a trailing `-` continues the word, `:/` holds the syllable before
  over a new note and `~` joins elided syllables (`{C4}:the~end`). A dotted
  note takes its dot before the colon (`{C4}.:maz-`). The slot gains
  `syllable` (the new `Syllable` type); the printer writes it back, and `%`
  copies a bar's notes without their syllables. A syllable on a chord
  name, a voicing, `/`, `--`, `N.C.` or `?`, an empty one, or `:/-` (a
  hold can't begin or continue a word) is an error.
  A syllable ends only at a space, `_`, `|`, `{` or a straight quote, so
  curly quotes and brackets are characters of it (`{C4}:“Ho-`,
  `{C4}:[x]`): they open no words and no one-bar meter.
- Lyric rows (grammar 7.7): `lyrics:` or `lyrics N:` (verse N) then a bar
  line writes syllables on the beats, its bars divided as a chord row's
  (`/` holds, `_` splits a slot, `--` is a breath). A row covers the bar
  line or system just above it, or under a replay heading the replayed
  section's lines in order, and must match its bar count. It parses as a
  `lyrics` line (the new `LyricSlot` type) with `verse`, `cells` and
  `covers`, the source lines of the bar lines it covers. The printer lines
  a row up under its bars, the wider cell of each column setting its
  width. A row with no bar line above it, a wrong bar count, an empty bar
  or syllable, a quote or brace, or a verse number of 0 or past
  `Number.MAX_SAFE_INTEGER` is an error.
- Verses in play order (grammar 7.7): each played bar gains `lyrics`, one
  `PlayedLyrics` per verse it sings, each syllable with its onset `at` in
  whole notes and `note` (true when a note of the singing line starts
  there). Syllables on notes are verse 1 and `lyrics N:` verse N; outside a
  repeat every verse is sung, and inside one verse N on pass N (a second
  ending holds verse 2's words; a jump's pass back sings pass 1's). Bars
  whose only verse is verse 1 sing it on every pass; a lone `lyrics N:`
  row (N from 2) sings on pass N only, and the other passes warn. A
  replay's rows replace its words. The first part with `instrument: voice`,
  else the first with syllables, sings; its `DeclaredPart` gains `sings`,
  the line its notes carry the syllables on. `lyrics 1:` or an unnumbered
  row under notes with syllables, an unnumbered row among numbered ones and
  a verse written twice over the same bars are errors; a row's syllable
  where the singing line starts no note, and a `:/` with nothing sung
  before it, warn. Another part's extract (`extractPart`, `printPart`)
  leaves the singer's rows out.
  Syllables on a part's notes are that part's, so a choir chart's bars
  carry one `PlayedLyrics` per part and verse (verse order, then score
  order), each part's `DeclaredPart.sings` set; lyric rows stay the
  singer's, and only the singer's syllables clash with a row over them.
  A numbered verse that no pass sings, a repeat's pass that sings
  nothing where other passes sing, and syllables on notes that no pass
  sings (verse 1 on a second ending), warn.
  A row's `/` where the singing line starts a new note is a held syllable
  there (`{ kind: "held" }`, `note: true`), as `:/` on the notes is: a
  melisma the converters extend and the renderer draws.
  A row starting with `/` holds on what its verse last sang, in play
  order, unless the verse breathed since, so a verse holds a word across
  a line break. Before its verse has sung anything the `/` sings nothing
  and warns as a `:/` with nothing sung before it does (so the export
  writes no `<extend/>` with nothing before it).

### Changed

- `Line` gains the `break` and `lyrics` kinds, so an exhaustive `switch`
  on `Line["kind"]` needs a case for each.
- A text line written with a leading `\` now holds its text without the
  backslash, marked `escaped: true`; the printer writes the backslash back.
  The escaped-pipes warning still applies to the rest of the line, and a
  chart whose only text is escaped no longer warns that it has no bar lines.
- A `---` line between endings no longer ends the repeat (grammar 5.1);
  like text and credit lines, it may sit between them, and so may a lyric
  row under an ending.
- `lyrics:` followed by a bar line is now a lyric row, not text with a
  warning to write `lyricist:`; followed by anything else it still warns.
- A part's named lines written after its bare line now join it in a
  system (grammar 7.6, amended): `Vox` then `Vox.Mel` play together, the
  bare line as the part's first line (it holds the harmony; `Vox.Mel` holds
  notes only). Such a part lists the bare line first in
  `DeclaredPart.lines` as `""`, and its bars' `lines` give it the name
  `""`; `extractPart(text, "Vox", "")` extracts it alone. A bare line
  counts toward the four lines. Named lines written straight after their
  part's bare line used to start a new system and now join it; put `---`
  between them to keep them apart. A bare line after its part's named
  lines still starts a new system. A bare line that is a fifth line
  (an error) is dropped and none of the part's lines plays it: its four
  named lines play, the first of them first.

## [0.16.0] - 2026-11-04

A grammar change: part lines (7.6), sustain pedal marks (2.9), dotted
figures (2.2), and `instrument:` and `clef:` on the `part:` line (7.3).
Charts that read before read the same. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **Part lines** (grammar 7.6): up to four lines per part, labelled
  `Pno.RH |` and `Pno.LH |`, in systems as parts are. The first line in a
  system carries the harmony and the others notes only; a fifth line, or
  a chord on another line, is an error. Bar lines gain `lineName`,
  declared parts gain `lines`, and the canonical form sorts a system's
  lines into score order: the order of the part's first system writing
  two or more of its lines, so an intro for the left hand alone keeps the
  right hand first. `streamKey` and `MAX_LINES` are exported.
  Each line plays on its own: a played bar's part entry gains `lines`
  (`LineBar`: name, line, slots, words), one per line playing there, and
  the part's `slots` are its first playing line's. A bare line and a tutti
  line play as the part's first line; a line not written rests. A
  single-part chart's bars, and an extracted part's, carry `lines`
  themselves, and `printPart` keeps the `Pno.RH |` labels.
  `extractPart(text, label, lineName)` gives one line alone, as a
  converter writes it: resting (tacet) where the line isn't written.
- **Sustain pedal marks** (grammar 2.9): `+G` presses or changes the
  pedal, `*G` lifts it; `--`, a tacet bar and the chart's end lift it too.
  A chord slot gains `pedal`, and `pedalStates` gives whether the pedal is
  down at the end of each slot, in play order. A `*` with the pedal
  already up is a warning.
- **Dotted figures** (grammar 2.2): a dot after one member of a
  two-member group, `C._D` (a dotted eighth and a sixteenth in a beat)
  or `C_D.`. Group members gain `dotted`, and `memberShares` gives each
  member's share of its slot. `N.C._G` keeps its meaning, and a misplaced
  `...`, `D.S.` or `D.C.` keeps its own message.
- **`instrument:` and `clef:` on the `part:` line** (grammar 7.3):
  `part: Tpt = Trumpet, instrument: trumpet in Bb`, `part: Ld = Lead,
  clef: bass`. The instrument comes from a list of 16 (`INSTRUMENTS`,
  `instrumentInfo`), each with its clef, written transposition, staves
  and General MIDI program, for converters. `Part` gains `instrument` and
  `clef`, present when written. An unknown instrument is an error naming
  the near ones; `clef:` on a keyboard is an error.

## [0.15.0] - 2026-11-04

A grammar change: credit lines (7.5). Charts that read before read the
same, unless a text line starts with a credit's name and a colon.
Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **Credit lines** (grammar 7.5): `composer:`, `lyricist:`, `arranger:`
  and `copyright:`, each a line of its own, allowed anywhere in a chart
  and repeatable. `ChartParse.credits` lists each role's entries in
  written order; a `Line` of kind `"credit"` keeps the line, and the
  printer writes it where it was written. An empty credit is an error;
  `author:`, `music:`, `words:`, `arr:`, `rights:` and the other near
  misses warn with the right name. `CREDIT_ROLES` is exported.
- A text line starting with one of the four names and a colon is now a
  credit, not text.

## [0.14.1] - 2026-11-03

### Fixed

- In a system, the line that differs from the one most lines agree with
  is the error, wherever it sits; before, an odd first line made every
  other line of its system the error (grammar 7.4).
- Parts that play one bar in different meters (a `%` copying a one-bar
  meter) are reported on every line that plays it, naming the meters.
- `printPart` leaves out a `part:` line set aside for sharing a label,
  which would otherwise declare a part again in the extract.
- If parts ever fell out of step, the first place they part is now an
  error instead of a silent fallback.

## [0.14.0] - 2026-11-03

### Added

- **Several parts in one chart** (grammar 7.4): one `part: Label = Name`
  line per part, bar lines labelled with their part (`Gtr | G | C |`),
  and **systems**: consecutive labelled lines that share bars, one per
  part. A part missing from a system is tacet; an unlabelled line is
  tutti. Every line of a system writes the same bars and structure
  (repeats, endings, marks, directions, fermatas, one-bar meters), and
  the reader checks it. `%` and a leading `/` resolve per part, in
  written order; after the part was tacet they are errors.
- The parse gains `parts` (score order); in a multi-part chart each
  played bar gains `parts` (`{ line, slots, words? }` per part, null
  where tacet), and `tacet: true` where the first part rests (its slots
  then read `N.C.`). Lines gain `part` and `system`.
- `extractPart(text, label)`, `printPart(text, label)` and
  `projectPart(lines, parts, label)`: one part as a single-part chart.
- `printChart` prints a system in score order with its labels padded and
  its pipes lined up.
- A bar line after a word that is not a declared part (`Bass | E | A |`)
  is text with a warning, in any chart; one whose first word is a chord
  (`G | C | D |`) warns that a bar line starts with `|` and suggests
  `| G | C | D |`.

### Changed

- A second `part:` line is no longer an error. `ChartParse.part` is the
  one part of a single-part chart (null for several) and is deprecated
  in favour of `parts`.
- Several parts share the expansion budget: each part expands at most
  `MAX_EXPANDED_BARS / parts` bars.

## [0.13.0] - 2026-11-03

### Added

- **`part:` names the chart's part** (grammar 7.3, issue #70): `part:
  Electric Guitar 1`, or with a short label, `part: Gtr = Electric
  Guitar 1`. It goes on a line of its own, once, before the first bar,
  and the name may hold commas. The parse gains `part` (`{ name, label?
  }`, or null) and a `part` line kind; the canonical form is `part:
  Label = Name`. Errors for a missing name or label, a `part:` after the
  first bar or a second one, and one sharing its line with a directive;
  `instrument:` and `parts:` are near misses.

## [0.12.0] - 2026-11-03

Rehearsal marks and words on a bar, issue #70 (grammar 2.5 and 2.6);
omissions, voicings, accents, hits and push marks (grammar 2.7, 2.8, 3
and 4.2).

### Added

- **Rehearsal marks:** `@` and a label of letters and digits, alone in a
  cell (`| @B | D | A |`), marks the bar after it. A mark is not a bar
  and takes no time; a repeat or replay plays it with its bar. Cells
  gain `kind: "rehearsal"`, and played bars `rehearsal`, the label.
- **Words on a bar:** quoted words in a cell (`| "solo" D |`,
  `| D "rit." G |`) sit before the slot they precede, or at the bar's
  end after the last. Curly quotes are accepted. They carry no musical
  meaning. Cells and played bars gain `words` (`{ text, at }`), present
  only when written.
- **Omissions:** `no3` and `no5` in a chord's parentheses leave out its
  third or fifth (`C7(no3)`, `C7(b9,no5)`). `(omit3)` and `(omit 3)`
  are accepted and print as `(no3)`; `C(no3)` prints as `C5`. Harte
  labels mark them with `*` (`C:7(*3)`).
- **Voicings:** a chord name followed by a note set gives the chord and
  its exact notes (`Cmaj7{E3 G3 B3 C4}`). Every note must be in the
  chord. Chord slots gain `voicing`, and it transposes with the chord.
- **Accents and hits:** `>D` accents a chord or note set and `^D` makes
  it a hit, short and accented. Chord slots gain `articulation`
  (`"accent"` or `"hit"`).
- **Push marks:** `<D` arrives an eighth early and `<<D` a sixteenth,
  taking the time from the slot played just before it in play order,
  so a pushed downbeat works inside repeats, replays and jumps. Chord,
  `N.C.` and `--` slots gain `push` (`"eighth"` or `"sixteenth"`).
- **Errors with line numbers** for an omission the chord can't make, a
  voicing note not in its chord, an accent on anything but a chord or
  note set, a push with nothing before it or longer than the slot it
  borrows from, a push on `/`, `%`, `?` or inside a group, and `^<D`
  (with the fix `<^D`); and for a mark that shares its cell (with
  the fix), a bad label, a mark with no bar after it, two marks on one
  bar, an unclosed quote, empty quotes and words with no bar.

### Fixed

- **A bar line dropped for an error no longer counts its directions as
  bars** in the written numbers of the bars after it.

## [0.11.0] - 2026-11-03

Endings and directions, issue #70 (grammar 5.1 and 5.2).

### Added

- **First and second endings:** an ending is a bar line of its own,
  `|1 G | G7 :|` then `|2 G | C |`, also `|1-3` and `|1,3`. Endings
  follow a `|: … :|` repeat, and each pass plays its own ending. Bar
  lines carry `ending`, the passes it plays on.
- **Directions:** `Segno`, `Coda`, `To Coda`, `Fine`, and one jump per
  chart, `D.C.` or `D.S.`, alone or `al Fine` / `al Coda`. A direction
  is a cell of its own (`kind: "direction"`), a place between bars, not
  a bar. Play order follows the jump; after it, every repeat plays
  once and takes its last ending.
- **Errors with line numbers** for endings that don't add up (a pass with
  no ending or two, a last ending that goes back) and for directions
  the jump can't use (no Segno before `D.S.`, `al Coda` with no
  `To Coda`, a mark no jump uses, a second jump).
- **`printPasses` and `printDirection`**, the canonical spellings.

### Changed

- **`|1` was reserved and is now an ending;** a chart that wrote it had an
  error before, so no valid chart changes meaning.

## [0.10.0] - 2026-11-03

Written bar numbers on played bars, issue #70. No chart changes meaning.

### Added

- **Written bar numbers** (issue #70): every played bar has `written`, its
  number as written, counting each written bar once in written order (`%`
  included, `...` not). A repeat or replay plays its bars under the numbers
  they were written with, so a host can speak a printed score's measure
  numbers. A bar line dropped for an error has `written` too, the bars its
  pipes write, so the numbers after it hold (grammar A.7).

## [0.9.0] - 2026-11-02

An optional swing amount for `feel:` (`swing 58%`), issue #66. Charts
that read before read and print the same. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **A swing amount** (grammar 7.1, issue #66): `feel: swing 58%`,
  `feel: shuffle 62.5%`, `feel: swing 16 55%`. The amount is where the
  swung note lands, as a percentage of its pair, from 50% to 75%
  inclusive, with the `%` required. It reaches `Directives.swingPercent`
  and each played bar's `swingPercent`; both are absent for the bare word,
  which stays the triplet feel (66.7%). `swing 66.7%` reads and prints as
  `swing`, so every chart that read before reads and prints the same.
- Errors, each on its line: an amount outside 50% to 75%, more than one
  decimal place, a missing `%` (`swing 58` suggests `swing 58%`), an amount
  on `straight` (suggests `swing` with it), and an amount with no kind.

## [0.8.0] - 2026-11-02

`(add9)` and friends inside parentheses, clearer messages for an empty
section and a rejected tone, and grammar notes from Stem Shovel's issues.
Charts that read before read the same. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **`(addN)` reads inside parentheses** (issue #62). `Am(add9)`,
  `C(add2)`, `C(add4)` and `C(add11)` are aliases of `Am(9)`, `C(2)`,
  `C(4)` and `C(11)`, alone or in a list (`C(b9,add11)` is `C(b9,11)`),
  and print in the canonical form. `add13` and `add#11` stay errors.
  Grammar Appendix A.5 and the decisions log.

### Changed

- **An empty section that matches nothing says how to fix it** (issue
  #63). `## Progression` with no bars and no earlier section of that name
  reported `no earlier section named "Progression" to replay`; it now
  reports `"Progression" has no bars and no earlier section has that
  name; write its bars under it, or remove the heading`. When the name is
  written out later in the chart, the message says replays use only
  earlier sections and gives that line. It is still an error: a section
  with no bars replays (grammar §6), and there is no intentionally empty
  section.
- **Grammar notes; no chart changes meaning.** §8 gains a note for
  generators: write one slot per beat (the 2.1 beat, so 6/8 has two),
  then canonicalize; a length that is not a whole number of beats needs
  an eighth-note grid or a `_` group; leave out a section with no bars
  (issue #64). §2.3: a tool that knows only the chord part writes `N.C.`
  for its rests, not `--` (issue #65). §7.1: `feel:` names a kind of
  groove, not an amount, so `swing 60%` stays an error, and the "custom
  swing ratios" open question is closed (issue #66).

### Fixed

- **A rejected tone in parentheses is named as written.** `C(add9x)`
  reported `"x" is not a tone a parenthesis can add`, and `Am(add9)`
  reported `""`, because a bare `add9` was looked for inside the group
  too; the message now quotes the tone as written (`"add9x"`).

## [0.7.0] - 2026-11-02

Print a chart you have already parsed, and conformance fixtures from real
charts. No grammar change: every chart reads as before. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **`printParsed(text, parsed)`**: the canonical text from a `parseChart`
  result you already have, so a caller that needs both the parse and the
  printed chart reads the text once.
- The stem-bench conformance fixtures (`tests/conformance/`): the four
  public Badverbs charts exactly as stored in Stem Shovel, with expected
  readings derived from the band's declared section starts and
  stem-bench's independently-built verified bar lists (Study 16), plus
  the grammar's trap rules as tests. A parser change that alters what a
  real chart means now fails CI before it ships.

## [0.6.0] - 2026-11-01

Transposition, and scale degrees for numeral views. No grammar change:
every chart reads as before. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **`transposeChart(text, { to } | { semitones })`** returns the chart in
  another key as canonical text, with diagnostics. Chord roots, slash
  basses, note sets (octaves included) and every `key:` line move, so a
  modulation moves too; text lines never change. Chords are spelled by
  their interval from the first key, so each keeps its place in the key,
  and double sharps and flats are written as the plain note. Given
  semitones, the new key takes the signature with fewer accidentals (F#
  over Gb on a tie; minor keys and modes by their own signatures); a chart
  with no `key:` spells roots from one table. Lines with errors stay as
  written, with a warning, as does a note pushed outside octaves 0–8. A
  target key for a chart with no `key:`, or a target that isn't a key, is
  an error and returns the text unchanged.
- **`degreeOf(root, key)`**: a root's scale degree above the key's tonic,
  measured against the major scale for every mode (in A minor, C is b3),
  for numeral views such as `@barmark/render`'s.

## [0.5.0] - 2026-11-01

Charts can say where the tempo slows down or speeds up. A grammar
decision (§7.2); no chart that read before changes meaning. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- Gradual tempo changes (grammar §7.2). `tempo:` also takes `rit.`,
  `accel.`, either one `to` a tempo (`tempo: rit. to 90`), and
  `a tempo`; `rall.`, `ritardando`, `rallentando` and `accelerando`
  read too. A change runs from the next bar to the next `tempo:` or the
  end of the chart. Each played bar inside one has `tempoChange`
  (`{ kind, from, to }`), so a host knows the beat is not steady there;
  `tempo` stays the steady tempo. The printer writes `rit.`, `accel.`
  and `a tempo`.
- Two warnings: `a tempo` with no change in force, and `rit. to` a
  tempo that isn't slower (or `accel. to` one that isn't faster).

## [0.4.0] - 2026-11-01

Charts written in Logic Pro's chord spelling read as they are. A grammar
decision (two new aliases, §3 and Appendix A.5); no chart that read
before changes meaning. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **Logic Pro's parentheses are read.** Groups in a row are one list
  (`C7(b9)(#11)` is `C7(b9,#11)`), and `(5)` on a bare root is the power
  chord (`F#(5)(7)` is `F#5(7)`: F♯ C♯ E). Both print in the canonical
  form. Grammar §3, Appendix A.5 and the decisions log.

## [0.3.0] - 2026-11-01

A chart in another format no longer reads as an empty one. A grammar
decision (two new warnings, §9); no chart's meaning changes. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **A chart with no bar lines warns.** A chart with text but no bar line
  at all warns once, at its first text line, instead of looking like an
  empty file (issue #1). Grammar §9 and its decisions log.
- **Escaped pipes warn, with the fix.** A text line such as `D \| A \| G`,
  as some editors save a bar line, warns and suggests `| D | A | G |`.

## [0.2.0] - 2026-10-31

Machine output for renderers and hosts (`form`, `parts`), the first
grammar decision since 0.1.0 (directives under a replay heading), and the
move to a workspace beside `@barmark/render`. Implements the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md),
with Appendix A's provisional calls now approved (no behaviour change).

### Added

- **`form` on each section occurrence:** which distinct section it plays, numbered from 0 in order of first appearance. Every replay shares its written section's number, so a host can label the form (A B A B C) or mark repeated sections in a timeline.
- **`parts` on each chord record:** the canonical root, quality, extension, sus, tones and bass the canonical spelling is built from (`null` for a note set), so renderers can typeset and speak a chord without re-reading its text.

### Changed

- **A directive under a replay heading takes effect after the replay.** A chart with `## Chorus` (a replay) followed by `key: E` used to play that Chorus in E; now the change starts at the next section, as the grammar's "written order is play order" says. Write the directive before the heading to change the replay itself.
- **Peaceful Dreams uses plain section names** (`## Verse`, not `## II Verse`): headings are the author's text, and form now comes from `form`.

### Technical

- **`main` and release tags are protected, and publishing needs approval.** Changes reach `main` through pull requests that pass CI; `v*` tags cannot be moved or deleted; the npm publish job runs in an `npm` environment that waits for approval and that npm's trusted publisher requires. After publishing, the release workflow installs the new version from npm and reads a real chart with it (`scripts/smoke.mjs`, shared with `verify:package`).
- **Dependabot** proposes monthly, grouped updates for actions and dev dependencies, with a two-week cooldown. Jobs have time limits, superseded pull-request runs are cancelled, and releases never run concurrently. `actions/checkout` is now v7.0.1 and `actions/setup-node` v7.1.0, which ends the Node 20 deprecation warnings.
- **The repository is a Bun workspace.** The package lives in `packages/barmark/` (`package.json` names the directory), beside the coming `@barmark/render`; the verify scripts, CI's package check and the Swamp `release-check` take the package to check.
- **Releases are tagged per package:** `barmark-vX.Y.Z` (and `render-vX.Y.Z` for `@barmark/render`); the release workflow publishes the package its tag names, packed with `bun pm pack`.
- **Fallow guards the code's health.** `bun run fallow` fails on dead code, duplicated code, or complexity beyond `.fallow-health-baseline.json` (the 17 functions above threshold at 0.1.0). It runs in CI (findings annotate the pull request), in the release workflow, and in the Swamp `release-check` as a fourth assertion. Three internal-only exports lost `export`, and the verify scripts share `scripts/lib.ts`.

## [0.1.0] - 2026-10-31

The first working release: the reference parser and printer for the
[grammar v0.1 draft](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md).

### Added

- **`parseChart(text)`** reads a whole `.chart.md` chart into the document as written (title, sections, directives, bar lines, text) and the bars in play order. Every bar carries its section, key, meter, tempo and feel. Section replays, `x N` and `|: :|` repeats, open repeats (`x ...`), `%` simile, `->` elision, fermatas (`...`) and one-bar meters (`[2/4]`) are all expanded. Problems come back as errors and warnings with line numbers, and the parser never throws.
- **`printChart(text)`** rewrites a chart in canonical form: standard spellings (`♯`→`#`, `X2`/`×2`→`x2`, `→`→`->`, `…`→`...`, `NC`→`N.C.`), the fewest slots per cell (`| G / D / |` → `| G D |`), and tidy directives and headings. Printing keeps the meaning (same bars, same errors) and is stable. Lines with errors, and lyrics, print exactly as written.
- **`parseChord(symbol)`** reads a chord symbol (Appendix A's vocabulary, with aliases such as `CM7`→`Cmaj7` rejected with a suggestion) into its root, intervals, spelled pitches, bass and canonical spelling.
- **`parseNoteSet("{D E! G}")`** reads a chord given by its notes, with optional octaves and a marked root.
- **Harte labels:** `toHarte` writes the Harte (2005) label for any chord or note set, and `harteToBarmark` converts a Harte label back. Every label in the McGill Billboard and Isophonics Beatles datasets converts with exactly the same notes.
- TypeScript declarations ship with the package.

### Changed

- The package is ESM only, with an `exports` map, and needs Node 20 or later. The 0.0.x placeholder's `VERSION` and throwing `parse()` are gone.

## [0.0.3] - 2026-10-31

### Changed

- **The README links the grammar v0.1 draft.**

## [0.0.2] - 2026-10-31

### Technical

- **First publish through npm trusted publishing** (OIDC, with provenance), from the GitHub release workflow.

## [0.0.1] - 2026-10-30

### Added

- **A placeholder package that holds the `barmark` name** while the spec and parser are written.

[Unreleased]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.22.0...HEAD
[0.22.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.21.0...barmark-v0.22.0
[0.21.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.20.0...barmark-v0.21.0
[0.20.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.19.1...barmark-v0.20.0
[0.19.1]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.19.0...barmark-v0.19.1
[0.19.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.18.0...barmark-v0.19.0
[0.18.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.17.1...barmark-v0.18.0
[0.17.1]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.17.0...barmark-v0.17.1
[0.17.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.16.0...barmark-v0.17.0
[0.16.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.15.0...barmark-v0.16.0
[0.15.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.14.1...barmark-v0.15.0
[0.14.1]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.14.0...barmark-v0.14.1
[0.14.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.13.0...barmark-v0.14.0
[0.13.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.12.0...barmark-v0.13.0
[0.12.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.11.0...barmark-v0.12.0
[0.11.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.10.0...barmark-v0.11.0
[0.10.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.9.0...barmark-v0.10.0
[0.9.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.8.0...barmark-v0.9.0
[0.8.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.7.0...barmark-v0.8.0
[0.7.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.6.0...barmark-v0.7.0
[0.6.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.5.0...barmark-v0.6.0
[0.5.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.4.0...barmark-v0.5.0
[0.4.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.3.0...barmark-v0.4.0
[0.3.0]: https://github.com/kevinpeckham/barmark/compare/barmark-v0.2.0...barmark-v0.3.0
[0.2.0]: https://github.com/kevinpeckham/barmark/compare/v0.1.0...barmark-v0.2.0
[0.1.0]: https://github.com/kevinpeckham/barmark/compare/v0.0.3...v0.1.0
[0.0.3]: https://github.com/kevinpeckham/barmark/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/kevinpeckham/barmark/releases/tag/v0.0.2
[0.0.1]: https://www.npmjs.com/package/barmark/v/0.0.1
