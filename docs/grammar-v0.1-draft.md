# barmark grammar — v0.1 draft (for review)

Status: proposal. Clean-sheet redesign, revised 2026-10-31 with the
decisions recorded at the end. It keeps what musicians already write and
drops what the stem-shovel parser did only for historical reasons.
Compatibility with stem-shovel is not a goal; section 10 is a migration
note.

## Design principles

1. **A line's first characters decide what it is.** A parser never guesses
   whether a line is chords or lyrics from the words in it.
2. **One way to say each thing.** Aliases are accepted on input. The
   canonical printer writes exactly one spelling.
3. **Fix traps in the notation, don't just document them.** If a reasonable
   musician would misread a construct, change the construct.
4. **Never fail silently.** Anything a parser cannot read is an *error*
   (line excluded, line number given). Anything readable but likely
   unintended is a *warning*.
5. **Write it the way musicians already write it on paper.** Simile `%`,
   beat slashes `/`, repeat barlines `|: :|`, `x2`, `N.C.`.
6. **barmark describes harmony in time.** It does not describe who plays
   what. That is orchestration, and it belongs in text lines.

## At a glance

```
# Example Song
key: D, time: 4/4, tempo: 145

## Intro
| {D2} | / | / | / |

## Verse
|: D | A | Bm | G :|
| Em | / | A | A7 |

## Chorus
| G / D / | A | Bm / / A | G |
| G | A | D / / /_G | / |

## Verse
## Chorus x2

## Bridge
feel: swing
| Em7 | A7(b9) | Dmaj7 | Bm7 |
| G -- -- -- | G -- -- -- | N.C. | ? |
feel: straight

## Outro
| D | A | [2/4] D | ... |
```

Reading it: the intro is a low D pedal note held four bars. The chorus
ends with G pushed to the "and" of 4. The repeated verse and the doubled
chorus are written once and replayed by name. The bridge swings, with two
stop-time hits, a bar with no harmony, and one bar the transcriber hasn't
worked out yet. The song ends on a two-beat bar and a ring-out.

## 1. Lines

Each line is classified by its start, after leading whitespace is ignored:

| Line starts with | It is | Example |
|---|---|---|
| `\|` or `\|:` | a **bar line** | `\| D \| A \|` |
| `# ` | the **title** (once, optional) | `# Wagon Wheel` |
| `## ` | a **section** heading | `## Chorus` |
| `key:` `time:` `tempo:` `feel:` (any case) | a **directive** line | `key: Bm` |
| anything else | **text** (lyrics, notes, prose) | `Watch Kevin for the cutoff` |

- Blank lines mean nothing.
- Text lines are kept in the parse tree, so printing round-trips, but they
  have no musical meaning. Text is never scanned for chords, tempos or keys.
- `###` and deeper headings are text.
- Code-fence lines (```` ``` ````) are ignored and their contents are read
  normally. A fence is never required. A barmark file is plain text that any
  editor shows legibly. Outside a fence, markdown previews merge consecutive
  bar lines into one paragraph, so fence a chart (```` ```barmark ````) when
  the markdown preview matters.

Because a line is chords only when it starts with `|`, a typo in a chord
line is always an error. It can never turn the line into lyrics.

## 2. Bars

A bar line is a series of **cells** between pipes. Each cell is one bar.

```
| D | A | Bm | G |
```

- The leading `|` is required. The trailing `|` is required too; if it is
  missing the bar is still read, with a warning.
- How bars are grouped into lines carries no meaning. Four bars per line is
  the recommended phrasing.
- An empty cell (`| |`) is an **error**. Use `/` to hold or `%` to repeat.

### 2.1 Slots

The tokens in a cell are **slots** that divide the bar equally.
Whitespace separates slots, except inside braces (section 4).

| Cell | Meaning (4/4) |
|---|---|
| `\| D \|` | D for the whole bar |
| `\| D A \|` | D for 2 beats, A for 2 beats |
| `\| Am7 / / G7 \|` | Am7 for 3 beats, G7 for 1 beat |
| `\| G / D / \|` | G, then D, 2 beats each (same as `\| G D \|`) |

**Beats.** In simple meters the beat is the bottom number: 4/4 has four
quarter-note beats. In compound meters (6/8, 9/8, 12/8) the beat is the
dotted quarter, the way musicians count them: 6/8 has 2 beats, 9/8 has 3,
12/8 has 4. The same beat is used for `tempo:` and for the slot rule.

A cell whose slot count neither divides the beat count nor is a multiple
of it is a **warning**. For example, 3 slots in 4/4 gives thirds.

### 2.2 Groups: dividing a slot

Joining slot symbols with `_` makes them **share one slot, divided
equally**. Triplets are three-member groups.

| Cell | Meaning (4/4) |
|---|---|
| `\| C D_E_F \|` | C on beats 1–2; D E F as quarter-note triplets on 3–4 |
| `\| C / / D_E_F \|` | C on beats 1–3; D E F as eighth-note triplets on beat 4 |
| `\| C_D_E \|` | half-note triplets across the bar, deliberately |
| `\| D / / /_G \| / \|` | G pushed to the "and" of 4, held through the next bar |

- Group members may be chords, note sets, `/`, `N.C.`, `?` or `--`.
- Groups do not nest.
- The uneven-slot warning checks only top-level slots. A group says its
  subdivision is deliberate, so `| C_D_E |` does not warn.

### 2.3 Slot symbols

| Symbol | Meaning | Where |
|---|---|---|
| a chord | that harmony (section 3) | any slot |
| `{...}` | exactly these notes (section 4) | any slot |
| `/` | **hold**: whatever was sounding continues (a chord, a note set, no-chord or silence) | any slot |
| `N.C.` | **no harmony**: chord instruments stop, though drums, a riff or a voice may continue | any slot |
| `--` | **silence**: the whole band stops | any slot |
| `?` | **unknown harmony**: there is a chord here, not yet written down (always a warning) | any slot |
| `%` | **simile**: repeat the previous bar's contents exactly | alone in a cell |
| `...` | **unmeasured hold**: whatever was sounding continues for an unmeasured span (fermata, ring-out, grand pause). It is not counted as a bar. | alone in a cell |

How the symbols relate:

- A repeated chord name keeps its slot: barmark does not merge `G G` into
  `G`, and players may read it as a re-attack.
- `/` and `%` differ after a bar with more than one slot:
  `| C G | / |` holds G, while `| C G | % |` plays C then G again.
- `N.C.` and `--` differ in who plays. A drum break or a vocal-only line is
  `N.C.`, and a full stop is `--`. Stop-time is `| G -- -- -- |`, and
  `| G / / / |` lets the chord ring.
- Silence is a double hyphen so that a single `-` stays free as the jazz
  minor sign (`C-7`). The two can't be silently confused: `C-` is C minor,
  `C--` is an error, and a lone `-` is an error suggesting `--`. An en or em
  dash alone in a slot (`–`, `—`) is accepted as `--`, because many editors
  and phone keyboards turn `--` into a dash automatically.
- `N.C.` and `{E}` differ in what is claimed. `{E}` says the harmony is the
  note E alone. `N.C.` says no harmony, which is right for a riff that moves
  through many notes.
- `?` is valid so charts can be drafted with gaps, and it always warns so
  no gap gets published unnoticed.
- A hit lasts its whole slot; for a shorter hit use a smaller slot (`G_--`).
- `N.C.` is the canonical spelling; `NC`, `n.c.` and `N.C` are accepted.
- Renderers draw `...` as a fermata.
- The single character `…` is accepted wherever `...` is (here and in
  `x ...`), because many editors and phone keyboards substitute it.

### 2.4 One-bar meter

A time signature in square brackets at the start of a cell sets the meter
for **that bar only**:

```
| D | A | [2/4] G | D |
```

To change the meter from a point onward, use a `time:` line (section 7).
A `%` after a bracketed bar repeats that bar exactly, meter included:
`| [2/4] G | % | D |` is two 2/4 bars, then a bar in the running meter.
The brackets keep a time signature apart from the `6/9` chord. The value
must be valid for `time:`. A bracket anywhere but the start of a cell is
an **error**.

## 3. Chord symbols

```
chord      = root quality? extension? sus? tones? bass?
root       = letter accidental?            letter = A–G (uppercase)
accidental = "#" | "b"                     (♯ ♭ accepted)
quality    = "m" | "dim" | "aug" | "5"
extension  = "6" | "6/9" | "7" | "maj7" | "9" | "maj9" | "11" | "13" | "maj13" | "7alt"
sus        = "sus2" | "sus4"
tones      = "(" tone ("," tone)* ")"
tone       = accidental? ("2" | "4" | "5" | "6" | "7" | "9" | "11" | "13")
bass       = "/" root
```

`sus` follows the extension, the way musicians write it: `7sus4`, `9sus4`.

**The parentheses rule (Logic semantics).** The quality and extension
define the chord, and a parenthesis adds exactly the tones listed. An
altered tone (`b5`, `#5`, `b9`, `#9`, `#11`, `b13`) **replaces** the
natural tone of the same number if the chord has one; otherwise it adds.
`5` means no third.

| Symbol | Pitches |
|---|---|
| `G5(7)` | G D F |
| `C(9)` | C E G D |
| `Am7(b5)` | A C E♭ G (the ♭5 replaces the 5) |
| `C13(b9)` | C E G B♭ D♭ A (the ♭9 replaces the 9) |
| `D/F#` | D major over F♯ |

**Alterations without parentheses** (`C7b9`, `Am7b5`) are accepted, but
only directly after an extension. That keeps the root's accidental
unambiguous: `Ab5` is always the A♭ power chord, never A(♭5), and `Cb9` is
C♭9. The canonical form puts alterations in parentheses.

Appendix A is the full vocabulary: the interval of every building block,
which combinations are valid, every accepted alias, and the machine output.
An unknown chord symbol is an **error**, and the whole bar line is
excluded.

## 4. Note sets

Braces give a harmony as **exact notes** instead of a name. Use them for a
single note (a pedal or unison riff), for a voicing nobody can name, or
for a voicing whose register matters.

```
| {E} | {E} | D | A |              the note E alone
| {C E F# B} | G |                 a chord given by its notes
| {E1} | / | D | A |               low E (a 4-string bass's open string)
| {C3 G3 E4} | {B2 F#3 D4} |       exact voicings
```

- Braces hold one or more note names: a letter, an optional accidental, an
  optional octave number. A brace group is one slot.
- **Notes are written low to high, and the first note is the bass.**
- **A note set has no root unless one is marked.** barmark never names one
  on its own. A linter may suggest a name ("`{C E G Bb}` is `C7`"), but the
  printer keeps what the author wrote. Writing notes instead of a name is a
  choice, not an error.
- **`!` after a note marks it as the root**, when the author knows the root
  but the voicing doesn't put it in the bass. The first note is still the
  bass; `!` only adds the root. At most one `!` per set.

```
| {D E! G} |               root E, bass D: E minor 7 with no fifth, over D
| {D3 E3! G3 B3} |         with octaves, the ! follows the octave
```
- `{}` is an **error**, and so is more than one `!` in a set.

### 4.1 Octaves

Octave numbers are allowed **only inside braces**. In a chord name a
number is an extension (`C7`, `C13`), so it can't also be an octave.

- Scientific pitch notation: middle C is **C4**. This matches the MIDI and
  ISO convention; some manufacturers call it C3, and barmark does not.
- The number belongs to the letter: `B#3` sounds as C4, and `Cb4` sounds as
  B3.
- Octaves are **sounding pitch**. Guitar and bass are written an octave
  above where they sound; a guitar's low E string is `{E2}`.
- Within one brace group, every note has an octave or none does. Mixing is
  an **error**. The range is 0–8; anything outside it is an **error**.
- With octaves, the pitches define the order. Notes written out of
  ascending order are a **warning**, and the canonical form prints them
  ascending. Without octaves, written order is the voicing, and a repeated
  note is a **warning**.

## 5. Repeats

`x N` repeats **whatever its line denotes.**

| Written | Plays |
|---|---|
| `\| D \| A \| x2` | that bar line twice |
| `## Chorus x2` | that section twice |
| `\|: ... :\|` across one or more lines | the enclosed bars twice |
| `\|: ... :\| x3` | the enclosed bars three times |
| `\| D \| A \| x ...` | that line an unmeasured number of times: a fade-out, or a vamp until cue |

- **`x ...` is an open repeat.** It goes wherever `x N` can go (a bar line,
  `:|`, or a heading), and the music plays at least once with the number of
  passes unknown. As the last thing in a chart it means the song ends while
  still repeating (a fade or a cut). Anywhere else it is a vamp, and the band
  moves on when cued. The cue is orchestration, so it goes in a text line.
  An open repeat may contain counted ones: a section marked `x ...` can hold
  a line marked `x2`.
- `x ...` repeats a whole loop, while a `...` cell holds a single chord.
  `| E7 | / | x ...` followed by `| A | ... |` is a vamp, a cue, and a final
  chord that rings.
- `X` and `×` are accepted for `x` (`X2`, `×2`, `× ...`), because charts
  are typed all three ways. The canonical form is a lowercase `x`. Other
  spellings (`2x`, `(x2)`) are errors that suggest `x2`.
- N is a whole number, at least 2. The spec sets no upper limit, and
  tools may warn above 8.
- `|:` must open a bar line and `:|` must close one. They pair within one
  section. An unpaired mark is an **error**, and nothing is half-repeated.
- **Endings (1st/2nd voltas) are reserved for v0.2.** In v0.1, `|1`, `|2`
  and similar marks are an **error** ("endings not yet supported"), so
  adding endings later changes the meaning of no existing chart.

## 6. Sections

- `## Name` begins a section. It continues until the next `##`.
- **A section with no bar lines replays the most recent section with that
  name.** A section is written once and referenced by name after that. A
  section holding only lyrics or notes (verse 2's words, for example)
  replays the changes.
- Names match case-insensitively with whitespace collapsed; otherwise the
  match is exact. `## Verse 2` does not match `## Verse`. An empty section
  that matches nothing is an **error**.
- A heading may carry any label, including numerals that tie it to outside
  data (`## II - Verse`). Matching uses the full text.
- **Elision.** `->` at the end of a replay heading cuts the replay's last
  bar: the next section's first bar lands where that bar would have been.

  ```
  ## Chorus ->
  ## Outro
  | G | C | G | ... |
  ```

  `->` is allowed only on a replay heading. A written-out section just leaves
  the bar out, because line length means nothing. It cuts exactly one bar,
  and with `x N` only the last pass (`## Chorus x2 ->`). If the cut
  occurrence comes first, write it out short and write the full version later
  under the same name: replays use the most recent section with that name.
  `→` is accepted for `->`.
- Bars before the first heading belong to an unnamed section.
- The written order is the play order.

## 7. Directives

```
key: D, time: 4/4, tempo: 145, feel: swing
```

| Directive | Values | Default |
|---|---|---|
| `key:` | a root plus optional `m` (`D`, `Bm`, `F#m`; `B minor` accepted), or a root and a mode: `A mixolydian`, `E dorian` | none (key unknown) |
| `time:` | `n/d` where d is 2, 4, 8 or 16 | `4/4` |
| `tempo:` | beats per minute from 1 to 999, counting the meter's beat (2.1): `145` (`145 bpm` accepted). In 6/8, `tempo: 60` is 60 dotted quarters a minute. | none (tempo unknown) |
| `feel:` | `straight`, `swing`, `shuffle`, `swing 16` | `straight` |

- **Modes.** `key:` accepts `major`, `minor`, and the seven church modes
  (`ionian`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `aeolian`,
  `locrian`), in any case. `key: D` means D major, because that is what
  musicians mean. A converter that doesn't know the mode leaves `key:` out
  rather than guess.
- Directives before the first bar set the starting values.
- A directive after bars takes effect **at the next bar**, never
  retroactively.
- Several directives may share a line, separated by commas. Naming the same
  directive twice on one line is an error.
- Tempo is optional. A chart without one is complete; tools that need time
  ask for it.
- The four names are a closed set with no aliases. A text line starting
  with a near miss (`meter:`, `bpm:`, `groove:`) gets a warning suggesting
  the right name.

### 7.1 Feel

Feel matters to barmark in one place: **where off-beat subdivisions land.**

| Value | Meaning |
|---|---|
| `straight` | subdivisions are even |
| `swing` | swung eighths: the second eighth of each beat lands at ⅔ of the beat (2:1) |
| `shuffle` | the same timing as `swing`; kept as written because musicians mean a different groove |
| `swing 16` | swung sixteenths: each eighth's second sixteenth lands at ⅔ |

- Swing moves only off-beat subdivisions. Groups of three are already
  triplets and are unaffected.
- A swung 4/4 and a 12/8 describe the same timing; write whichever the band
  reads more easily.
- Any other value is an **error**. Feels that move no chord (half-time,
  double-time, laid back) belong in a text line.

## 8. The canonical form

A canonical printer writes:

- single spaces inside pipes, and the trailing `|`
- canonical chord spellings (Appendix A) with ASCII `#` and `b`.
  Typography (♯ ♭, superscripts, small caps for N.C.) is the renderer's job.
- the fewest slots per cell: `| G / D / |` prints as `| G D |`, and
  `| -- -- |` as `| -- |`. Only a slot with no attack of its own merges
  (`/`, a repeated `--`, a repeated `N.C.`); a repeated chord name stays
  (`| G G |`), and so does `| ? ? |`. A group never absorbs the holds after
  it (`| D_E_F / |` stays: merging would move the triplet), and a cell is
  never reduced to a slot count that is uneven for its meter
  (`time: 3/4` keeps `| G / / D / / |`)
- note sets with octaves in ascending order
- one blank line before each `##`, except that consecutive headings (a run
  of replays) stay together; other blank lines are the author's, with runs
  collapsed to one
- text lines, and any line with an error, exactly as written (trailing
  whitespace trimmed), so a re-read reports the same errors
- code-fence lines as written
- directives lowercased, comma-separated, in the order key, time, tempo,
  feel

Canonicalizing changes spelling only. It never rewrites one chord as a
different chord with the same notes (`aug7` stays `aug7`; `7(#5)` stays
`7(#5)`).

Printing preserves meaning: the printed chart plays the same bars with the
same directives and sections and reports the same errors (formatting
warnings such as a missing `|` may disappear), and `print` is stable when
applied twice.

## 9. Errors and warnings

| Kind | Situation |
|---|---|
| error | unknown or rejected chord symbol (with a suggestion where one exists) |
| error | empty cell `\| \|`, or empty note set `{}` |
| error | a lone `-` in a slot (suggests `--` for silence) |
| error | `%` or `...` sharing a cell with other slots or inside a group |
| error | unpaired `\|:` or `:\|` |
| error | ending marks (`\|1`, `\|2`): reserved for v0.2 |
| error | empty section that references no earlier section |
| error | `->` anywhere but the end of a replay heading |
| error | `/` or `%` with nothing before it |
| error | invalid directive value (`time: 4/3`, `tempo: fast`, `feel: lazy`) |
| error | `[n/d]` not at the start of a cell, or with an invalid meter |
| error | a note set mixing octave and no octave, or an octave outside 0–8 |
| error | more than one root mark `!` in a note set |
| warning | `?` (unknown harmony) |
| warning | missing trailing `\|` |
| warning | top-level slot count uneven for the meter |
| warning | `x N` with N > 8 |
| warning | note set with octaves out of ascending order; repeated note without octaves |
| warning | a natural tone in parentheses that the chord already has (`C7(7)`) |
| warning | a text line that looks like an old-style label (`Chorus:`, `[Chorus]`), an old bare chord line, or a misnamed directive (`meter:`, `bpm:`), with a suggested fix |

Every message gives the line number and quotes the offending token.

## 10. Migrating from stem-shovel charts

| Old | New |
|---|---|
| `\| Am7 Am7 Am7 G7 \|` | `\| Am7 / / G7 \|` (a converter rewrites old repeated names to `/`; in barmark a repeated name may read as a re-attack) |
| `\| G \| \| \|` (empty = hold) | `\| G \| / \| / \|` |
| `/` alone = repeat bar | `%` (`/` alone now means hold) |
| `D A Bm G` (bare line) | `\| D \| A \| Bm \| G \|` |
| `[Chorus]`, `Chorus:` | `## Chorus` |
| `Key: D · 4/4 · 145 bpm` in prose | `key: D, time: 4/4, tempo: 145` |
| `N.C.` meaning silence | `--` (`N.C.` now means no harmony only) |
| `CM7`, `C2` | `Cmaj7`, `Csus2` or `C(9)` |
| `G5(7)` read as G7 | `G5(7)` = G D F |
| `Structure:` line (proposed) | empty `##` sections that replay |

A mechanical converter can do every row except two: N.C., which needs a
human to say whether the band was silent, and the structure line.

## Decisions log (2026-10-31)

| Question | Decision |
|---|---|
| Markdown rendering | No fence required. The whole file is parsed and fences are transparent. |
| Endings (voltas) | Deferred to v0.2; the syntax is reserved now as an error. |
| One-bar meter | `[n/d]` at the start of a cell. `time:` keeps "from here on". |
| Alterations | `C7b9`/`Am7b5` accepted after an extension. Canonical uses parentheses. Altered tones replace their natural counterpart. |
| Directive names | `key` / `time` / `tempo` / `feel`, closed set, no aliases. |
| Compound meters | 6/8, 9/8, 12/8 count dotted-quarter beats for `tempo:` and the slot rule. |
| Single notes and named-by-notes chords | Brace note sets, low to high, first note is the bass, no root. |
| Octaves | Inside braces only. Scientific pitch, middle C = C4, sounding pitch. |
| Triplets and subdivisions | `_` groups share one slot equally. No nesting. |
| Feel | `feel:` directive: straight, swing, shuffle, swing 16. |
| N.C. | No harmony, not silence. Maps to Harte `N`. |
| Unknown harmony | `?`, valid, always a warning. Maps to Harte `X`. |
| Silence and stops | `--` slot symbol: the whole band stops. En/em dash accepted. |
| `-` as a minor alias | Kept (`C-7` = `Cm7`), because silence is `--`. |
| Pushes | No dedicated mark in v0.1; written with groups (`/_G`). |
| Root in a note set | `!` after the note: `{D E! G}`. Optional; the first note stays the bass. |
| Modes | `key:` accepts a mode name (`A mixolydian`). A bare root means major. |
| Elision | `->` at the end of a replay heading cuts its last bar. Written sections omit the bar. |
| Fades and vamps | `x ...`: an open repeat. Machine output records the count as open. |
| Canonical printing | Spelling and layout only. Lines with errors and text lines print as written; a repeated chord name is kept. |
| Repeat spellings | `x`, `X` and `×` all accepted; canonical `x`. |
| `%` after a one-bar meter | `%` repeats the previous bar exactly, its `[n/d]` included. |
| Appendix A's provisional calls | Approved by Kevin: `C2`/`C4` are rejected with `Csus2` or `C(9)` suggested, and a note set's Harte label uses the bass as root when none is marked. |
| Section form and chord parts | Machine output gains `form` on each section occurrence and `parts` on each chord (A.7), for renderers and hosts such as stem-shovel's section timeline. No change to what any chart means. |

## Open questions

- The ending syntax for v0.2.
- Whether pushes need a shorter mark once real charts are written.
- Articulation (short, choked hits) beyond slot length.
- Exact voicings on named chords (`Cmaj7{E3 G3 B3 C4}`).
- Omissions (`(no3)`, `(no5)`).
- Custom swing ratios.

---

## Appendix A — chord vocabulary

This appendix is normative. In the reference implementation the tables
below are one data file that both the parser and this page read, and every
row is a conformance test.

### A.1 Intervals

Intervals are written as scale degrees above the root: `1 b2 2 b3 3 4 b5 5
#5 6 bb7 b7 7 b9 9 #9 11 #11 b13 13`. A chord's pitches are spelled from
the root's letter, so B♭m gives D♭, never C♯.

### A.2 Building blocks

| Block | Intervals |
|---|---|
| (no quality) | 1 3 5 |
| `m` | 1 b3 5 |
| `dim` | 1 b3 b5 |
| `aug` | 1 3 #5 |
| `5` | 1 5 |
| `sus2` | replaces the third with 2 |
| `sus4` | replaces the third with 4 |
| `6` | adds 6 |
| `6/9` | adds 6 9 |
| `7` | adds b7 (on `dim`, adds bb7) |
| `maj7` | adds 7 |
| `9` | adds b7 9 |
| `maj9` | adds 7 9 |
| `11` | adds b7 9 11 |
| `13` | adds b7 9 13, and 11 on a minor chord |
| `maj13` | adds 7 9 13 |
| `7alt` | adds b7, removes 5; altered fifth and ninth are left to the player |

**The eleventh rule.** A natural 11 and a major third never sound together.
So `C13` omits the 11 and `Cm13` includes it, which is the standard
convention. By the same rule, `C11` omits the third. (Approved
2026-10-31.)

### A.3 Valid combinations

| Quality | Allowed extensions | `sus` allowed |
|---|---|---|
| (none) | `6` `6/9` `7` `maj7` `9` `maj9` `11` `13` `maj13` `7alt` | with none, `7`, `9`, `13` |
| `m` | `6` `6/9` `7` `maj7` `9` `maj9` `11` `13` | no |
| `dim` | `7` | no |
| `aug` | `7` `maj7` | no |
| `5` | none (add tones in parentheses) | no |

Any other combination is an **error**.

### A.4 Common symbols, spelled on C

| Symbol | Pitches | Symbol | Pitches |
|---|---|---|---|
| `C` | C E G | `C9` | C E G B♭ D |
| `Cm` | C E♭ G | `Cmaj9` | C E G B D |
| `Cdim` | C E♭ G♭ | `Cm9` | C E♭ G B♭ D |
| `Caug` | C E G♯ | `C11` | C G B♭ D F |
| `Csus2` | C D G | `Cm11` | C E♭ G B♭ D F |
| `Csus4` | C F G | `C13` | C E G B♭ D A |
| `C5` | C G | `Cm13` | C E♭ G B♭ D F A |
| `C6` | C E G A | `Cmaj13` | C E G B D A |
| `Cm6` | C E♭ G A | `C9sus4` | C F G B♭ D |
| `C6/9` | C E G A D | `C7(b9)` | C E G B♭ D♭ |
| `C7` | C E G B♭ | `C7(#9)` | C E G B♭ D♯ |
| `Cmaj7` | C E G B | `C7(#11)` | C E G B♭ F♯ |
| `Cm7` | C E♭ G B♭ | `C7(b13)` | C E G B♭ A♭ |
| `Cmmaj7` | C E♭ G B | `C7alt` | C E B♭ + altered tones open |
| `Cdim7` | C E♭ G♭ B𝄫 | `C(9)` | C E G D |
| `Cm7(b5)` | C E♭ G♭ B♭ | `C5(7)` | C G B♭ |
| `Caug7` | C E G♯ B♭ | `C/E` | C E G, bass E |
| `C7sus4` | C F G B♭ | `C/Bb` | C E G B♭, bass B♭ |

### A.5 Aliases

Accepted on input, printed canonically:

| Accepted | Canonical |
|---|---|
| `min`, `-` | `m` |
| `maj` alone (`Cmaj`) | nothing (`C`) |
| `°` | `dim` |
| `°7` | `dim7` |
| `+` | `aug` |
| `+7` | `aug7` |
| `sus` | `sus4` |
| `Maj7`, `ma7`, `Δ`, `Δ7` | `maj7` |
| `ø`, `ø7` | `m7(b5)` |
| `m(maj7)`, `minmaj7` | `mmaj7` |
| `add2`, `add4`, `add9`, `add11` | `(2)`, `(4)`, `(9)`, `(11)` |
| `7b9`, `m7b5` (alteration after an extension) | `7(b9)`, `m7(b5)` |
| `♯`, `♭` | `#`, `b` |

### A.6 Rejected, with a suggestion

| Input | Why | Suggestion |
|---|---|---|
| `M`, `M7`, `CM` | one shifted letter from `m` | `maj7`, or `C` |
| `C2`, `C4` | means sus2 in some traditions and add9 in others | `Csus2` or `C(9)` |
| lowercase root (`d`) | ambiguous with prose | `D` |
| double accidentals (`Cbb`) | never needed for a root | the enharmonic root |
| German `H` | ambiguous with B | `B` |

### A.7 Machine output

Each slot parses to one record:

| Field | Meaning |
|---|---|
| `kind` | `chord`, `notes`, `nc`, `unknown`, `silence` |
| `root` | spelled root: the chord's root, the `!` note of a note set, or empty for an unmarked set |
| `intervals` | the chord's intervals, after every rule above |
| `pitches` | spelled pitch classes, or pitches with octaves for note sets |
| `bass` | spelled bass note: the slash bass, the first note of a set, otherwise the root |
| `alteredOpen` | true for `7alt` |
| `elided` | on a section occurrence: true when `->` cut its last bar |
| `form` | on a section occurrence: which distinct section it plays, numbered from 0 in order of first appearance; a replay shares its written section's number, so hosts can label form (A, B, A, B, C) |
| `parts` | on a chord: the canonical root, quality, extension, sus, tones (in canonical order) and bass its spelling is built from; empty for a note set |
| `repeat` | on a bar line, section or repeat bracket in the parse tree: a count, or `open` for `x ...` |
| `harte` | the Harte label: `C:7(b9)`, `N` for N.C. and silence (`--`), `X` for `?` |
| `source` | the symbol as written |

The bass note counts among the chord's pitches: `C/Bb` contains B♭. For
note sets, the Harte label uses the marked root when there is one
(`{D E! G}` → `E:1(b3,b7)/b7`). Otherwise it uses the bass, because Harte
requires a root: `{C E F# B}` → `C:1(3,#4,7)`. That is a representation, not
a claim about the chord's name.
