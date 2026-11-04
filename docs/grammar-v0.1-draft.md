# barmark grammar — v0.1 draft (for review)

© 2026 Kevin Peckham. This specification is licensed under
[CC BY 4.0](LICENSE) (https://creativecommons.org/licenses/by/4.0/):
you may share and adapt it, and build implementations of it, with credit:
"Barmark grammar by Kevin Peckham, barmark.dev". The reference code is MIT
([LICENSE](../LICENSE)).

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
| `part:` (any case) | a **part** the chart is for (before the first bar, 7.3, 7.4) | `part: Electric Guitar 1` |
| `composer:` `lyricist:` `arranger:` `copyright:` (any case) | a **credit** line (7.5) | `composer: Kevin Peckham` |
| a part's label, then `\|` | that part's **bar line**, in a chart with several parts (7.4) | `Gtr \| G \| C \|` |
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

A bar line is a series of **cells** between pipes. Each cell is one bar,
except `...` (2.3), a rehearsal mark (2.5) and a direction (5.2), which
mark a place between bars.

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
  A tool that knows only the chord part, such as a chord player writing
  its own rests, writes `N.C.`; only a source that knows the whole band
  stopped writes `--`.
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

### 2.5 Rehearsal marks

`@` and a label, alone in a cell, is a **rehearsal mark** on the bar after
it: the boxed letter or number of a printed score.

```
## Verse
| D | A | Bm | G |
| @B | D | A | G | D |
```

- A label is letters and digits: `@A`, `@B2`, `@17`. The `@` keeps a mark
  from reading as a chord.
- A mark is not a bar and takes no time. It marks the next bar written
  after it, on the same line or the next, and goes wherever that bar goes:
  a repeat or a replay plays the mark with its bar.
- A section heading names a section (section 6); a mark names a place,
  often mid-section. A chart may use either or both.
- Errors: a mark that shares its cell (the message suggests a cell of its
  own), `@` with no label or with other characters, a one-bar meter on a
  mark, two marks with no bar between them, and a mark with no bar after
  it.

### 2.6 Words on a bar

Quoted words in a cell sit on the bar, before the slot they precede:

```
| "solo" D | A | D "rit." G | A "fill" |
```

- `"solo"` is on the first bar's D, `"rit."` on the G, and `"fill"`, after
  the last slot, at the end of its bar.
- Words carry **no musical meaning**: `"rit."` slows nothing, and only
  `tempo: rit.` (7.2) does. They are for what a player reads at that
  spot (a cue, a feel, a part).
- Curly quotes are accepted, because many editors and phone keyboards
  substitute them. Words may hold spaces, but not `|` or a quote.
- Words on `%` are on the whole bar; `%` copies the chords of the bar
  before it, not its words.
- Errors: an unclosed quote, empty quotes, and words with no bar to sit
  on (alone in a cell, or with `...`, a mark or a direction).

### 2.7 Accents and hits

A mark before a chord or a note set says how it is played:

| Slot | Meaning |
|---|---|
| `>D` | **accented**: D, played with more weight |
| `^D` | a **hit**: short and accented, the big-band "rooftop"; a choked hit too |

```
| >D / ^G ^G | ^A -- -- -- |
```

- A short note without an accent is a shorter slot, as before
  (`| G_-- |`, 2.3); a mark only adds weight.
- Group members take marks too: `^D_E_F` is a hit on D.
- Only a chord or a note set takes one. On `/`, `N.C.`, `--` or `?` it is
  an **error**.

### 2.8 Pushes

A push brings a slot in early, the way a band anticipates a downbeat:

| Slot | Meaning |
|---|---|
| `<G` | G arrives an **eighth note** early |
| `<<G` | G arrives a **sixteenth note** early |

```
## Intro
| N.C. |
## Verse
|: <D | <G | <A | <Bm :|
## Chorus
| <E | A |
## Verse
## Chorus
```

- Each chord is written in the bar it belongs to. The push takes its time
  from **the slot played just before it, in play order**: the end of the
  bar before, the last bar before a `:|` when a repeat goes back, the end
  of the section before a replay, or the bar a jump leaves from. So the
  verse above pushes into D from the intro the first time and from Bm the
  second, and the replayed verse pushes from the chorus.
- A push mid-bar works the same way: `| C <G |` brings G in an eighth
  before beat 3.
- The push is an eighth or a sixteenth in every meter, 6/8 included.
- A chord, a note set, `N.C.` or `--` can be pushed (`<--` is a pushed
  stop). A push combines with an accent or a hit, the push first:
  `<^D` is a pushed hit.
- Writing the push out (`| C / / /_G | / |`, 2.2) still works and means
  what it says: G attacks on the "and" of 4 and the next bar holds it.
- Errors: a push with nothing played before it (the chart's first slot,
  or the first after `...`; write a pickup bar), a push longer than the
  slot it takes its time from, a push on `/`, `%` or `?`, a push inside a
  `_` group, three or more `<`, and a mark written before the push
  (`^<D`; the message suggests `<^D`).

## 3. Chord symbols

```
chord      = root quality? extension? sus? tones? bass?
root       = letter accidental?            letter = A–G (uppercase)
accidental = "#" | "b"                     (♯ ♭ accepted)
quality    = "m" | "dim" | "aug" | "5"
extension  = "6" | "6/9" | "7" | "maj7" | "9" | "maj9" | "11" | "13" | "maj13" | "7alt"
sus        = "sus2" | "sus4"
tones      = ( "(" tone ("," tone)* ")" )+  (groups in a row are one list)
tone       = accidental? ("2" | "4" | "5" | "6" | "7" | "9" | "11" | "13")
           | "no3" | "no5"
bass       = "/" root
```

`sus` follows the extension, the way musicians write it: `7sus4`, `9sus4`.

**The parentheses rule (Logic semantics).** The quality and extension
define the chord, and a parenthesis adds exactly the tones listed. An
altered tone (`b5`, `#5`, `b9`, `#9`, `#11`, `b13`) **replaces** the
natural tone of the same number if the chord has one; otherwise it adds.
`5` means no third: on a bare root, `(5)` is the power chord, so
`F#(5,7)` is `F#5(7)`; after a quality or an extension it is an
**error**. Groups in a row read as one list, as Logic Pro writes them:
`F#(5)(7)` is `F#5(7)` and `C7(b9)(#11)` is `C7(b9,#11)`.

| Symbol | Pitches |
|---|---|
| `G5(7)` | G D F |
| `C(9)` | C E G D |
| `Am7(b5)` | A C E♭ G (the ♭5 replaces the 5) |
| `C13(b9)` | C E G B♭ D♭ A (the ♭9 replaces the 9) |
| `D/F#` | D major over F♯ |

**Omissions.** `no3` and `no5` in the parentheses leave out the chord's
third or fifth: `C7(no3)` is C G B♭, `Cmaj9(no5)` is C E B D, and they go
with other tones, `C7(b9,no5)`. `(omit3)` and `(omit 3)` are accepted and
print as `(no3)`. A triad with no third is the power chord, so `C(no3)`
and `Cm(no3)` print as `C5`. Leaving out a tone the chord doesn't have
(`Csus4(no3)`, `C7alt(no5)`), one its own parentheses alter
(`C7(b5,no5)`), any other tone (`C7(no7)`) or the same one twice is an
**error**.

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

### 4.2 Voicings

A chord name followed directly by a note set gives the chord and **exactly
how it is voiced**:

```
| Cmaj7{E3 G3 B3 C4} | Dm7{F3 C4 E4} | G13{F2 B2 E3} |
```

- The name is what the chord is; the braces are the notes played, low to
  high, by the rules of note sets (octaves optional, every note or none).
- Every note must be in the chord, the slash bass included. A note that
  isn't is an **error** ("B♭ is not in Cmaj7"). A voicing may leave tones
  out, as voicings usually do.
- The name keeps its own meaning everywhere: its Harte label, its numeral,
  how it is drawn. Renderers draw the name and may speak or show the notes.

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
- First and second endings are bar lines of their own (5.1).

### 5.1 Endings

The bars a repeat plays on particular passes (first and second endings,
voltas):

```
## Verse
|: C | F | G | C |
|1 G | G7 :|
|2 G | C |
```

This plays `C F G C G G7`, then `C F G C G C`.

- A bar line that starts with pass numbers is an **ending**: `|1`, `|2`, a
  range `|1-3`, or a list `|1,3`. The ending is that one bar line. A long
  ending is a long line.
- Endings follow the bars of a `|: … :|` repeat, one after another; only
  text and credit lines may come between them. Every ending but the last closes with
  `:|`, which goes back to `|:`. The last does not: it plays and moves on.
- The repeat plays as many passes as its highest ending number. Each pass
  plays the bars from `|:` to the first ending, then that pass's ending:
  `|1-3 … :|` then `|4 …` plays four passes. Every pass from 1 to the
  highest has exactly one ending, the highest is at least 2, and its
  ending comes last. The endings give the count, so `x N` on an ending is
  an **error**.
- An ending mark anywhere but the start of a bar line is an **error**
  (`| C |1 D |`), and so is an ending that does not follow a repeat.
- A replay of the section plays its endings too. Machine output numbers
  the bars of every ending as written (A.7), as a printed score does: above,
  bars 1–4, then 5–6, then 7–8.

### 5.2 Directions

Lead sheets jump with words: *D.S. al Coda*, *D.C. al Fine*. barmark writes
them where the score does, each alone in a cell between two bars:

```
## Verse
| Segno | C | F | G | To Coda | C |
| Am | F | G | C | D.S. al Coda |
## Coda
| Coda | F | G | C | ... |
```

This plays the verse, goes back to the segno, plays `C F G`, goes on at
the coda at `To Coda`, and plays to the end.

| Cell | Meaning |
|---|---|
| `Segno` (`𝄋` accepted) | where `D.S.` goes back to |
| `Coda` (`𝄌` accepted) | where `al Coda` goes on |
| `To Coda` | after the jump: go on at `Coda` |
| `Fine` | after the jump: the end |
| `D.C.`, `D.C. al Fine`, `D.C. al Coda` | the jump: back to the chart's first bar, then play to the end, to `Fine`, or to `To Coda` |
| `D.S.`, `D.S. al Fine`, `D.S. al Coda` | the same, back to `Segno` |

- A direction is a mark between bars. It takes no time and is not counted
  as a bar, like `...`. It must be alone in its cell.
- The words match in any case, with spaces collapsed; the canonical
  spelling is the table's. A near miss (`D.S al Coda`) is an **error**
  that suggests the spelling.
- The jump is taken the first time it is reached, and only once. Until
  then, `To Coda` and `Fine` do nothing.
- **After the jump, every repeat plays once**: `|: :|` takes its last
  ending, and `x N` on a bar line or a heading plays one pass, as lead
  sheets mean. A chart that wants the repeats again writes them out.
- After the jump, bars keep their written numbers (A.7), and each section
  the return passes through is another occurrence of it.
- A chart has at most one jump (`D.C.` or `D.S.`), and at most one each of
  `Segno`, `Coda`, `To Coda` and `Fine`. `D.S.` needs a `Segno` before it,
  `al Fine` a `Fine`, and `al Coda` a `To Coda` and a `Coda` after it. A
  `Segno`, `Coda`, `To Coda` or `Fine` that no jump uses is an **error**.
- This is the one exception to "the written order is the play order"
  (section 6), and it stays visible: the jump is written where it happens.

## 6. Sections

- `## Name` begins a section. It continues until the next `##`.
- **A section with no bar lines replays the most recent section with that
  name.** A section is written once and referenced by name after that. A
  section holding only lyrics or notes (verse 2's words, for example)
  replays the changes.
- Names match case-insensitively with whitespace collapsed; otherwise the
  match is exact. `## Verse 2` does not match `## Verse`. An empty section
  that matches nothing is an **error**, and there is no intentionally empty
  section: write its bars under it, or leave the heading out. A replay looks
  only backward, so a heading whose bars are written later in the chart is
  the same error, and its message gives the line where they are written.
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
- The written order is the play order, except for the one jump a
  direction makes (5.2). A replay heading stands for the bars it replays, so a directive written under it takes effect after the replay,
  at the next section's first bar. To change the replay itself (the last
  chorus up a step), write the directive before its heading.

  ```
  key: E
  ## Chorus      (in E)
  key: F
  ## Outro       (in F)
  ```

## 7. Directives

```
key: D, time: 4/4, tempo: 145, feel: swing
```

| Directive | Values | Default |
|---|---|---|
| `key:` | a root plus optional `m` (`D`, `Bm`, `F#m`; `B minor` accepted), or a root and a mode: `A mixolydian`, `E dorian` | none (key unknown) |
| `time:` | `n/d` where d is 2, 4, 8 or 16 | `4/4` |
| `tempo:` | beats per minute from 1 to 999, counting the meter's beat (2.1): `145` (`145 bpm` accepted). In 6/8, `tempo: 60` is 60 dotted quarters a minute. Or a gradual change (7.2): `rit.`, `accel.`, either `to` a tempo, or `a tempo`. | none (tempo unknown) |
| `feel:` | `straight`, `swing`, `shuffle`, `swing 16`; the last three with an optional amount (`swing 58%`, 7.1) | `straight` |

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
  the right name. `part:` (7.3) and the credits (7.5) are lines of their
  own, not one of these.

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
- `feel:` names the groove, and may state how far it swings. The bare word
  means the triplet feel; a percentage, where the swung note lands, states
  another amount. Tools that hold a continuous swing should write the
  percentage rather than round to the word.

**Swing amounts.** `swing`, `shuffle` and `swing 16` may each take an
amount after one space: `feel: swing 58%`, `feel: shuffle 62.5%`,
`feel: swing 16 55%`.

- The amount is where the swung note lands, as a percentage of the pair it
  belongs to (the beat's two eighths, or for `swing 16` the eighth's two
  sixteenths): 50% is even, 66.7% is the triplet feel, 75% the dotted feel.
  This is the drum-machine convention (MPC) musicians already know.
- From 50% to 75%, inclusive; a whole number or one decimal place; the `%`
  is required. Anything else is an **error**: `swing 80%`, `swing 66.75%`,
  `swing 58`, an amount with no kind (`feel: 58%`), and an amount on
  `straight` (the message suggests `swing` with that amount).
- `swing 66.7%` means exactly `swing`, and prints as `swing`, so the bare
  word stays the canonical spelling of the classic feel. Every other
  amount prints as written (`58.0%` as `58%`); `swing 50%` stays as
  written rather than becoming `straight`, because the band wrote a groove
  name.
- A later `feel:` replaces the whole feel: `feel: shuffle` after
  `feel: swing 58%` means a shuffle at the triplet feel.

### 7.2 Gradual tempo changes

```
## Outro
| D5 | % | % | % | x5
tempo: rit. to 90
| D5 | % | % | % |
| D5 | ... |
```

| Written | Means |
|---|---|
| `tempo: rit.` | slowing down from the next bar; the end tempo is open |
| `tempo: rit. to 90` | slowing down, to arrive at 90 |
| `tempo: accel.`, `tempo: accel. to 160` | the same, speeding up |
| `tempo: a tempo` | back to the steady tempo the change started from |

- **Spellings.** `rit`, `ritardando`, `rall` and `rallentando` all mean
  `rit.`; `accelerando` means `accel.`. The period is optional, case
  doesn't matter, and `to 90 bpm` is accepted. Canonical: `rit.`,
  `accel.`, `a tempo`.
- **Extent.** A change runs from the next bar until the next `tempo:`
  line (a number, another change, or `a tempo`) or the end of the chart.
  A replayed section plays its change again.
- **Shape.** A chart says only which way and, optionally, where to. How
  the tempo moves inside the change (steadily, or slowing more and more,
  as a ritardando usually does) is the players' and is never written.
- **The steady tempo stays.** Bars inside a change keep `tempo:` as the
  steady tempo the change started from; `a tempo` returns to it.
- **Warnings.** `a tempo` with no change in force; `rit. to` a tempo that
  isn't slower than the steady one, or `accel. to` one that isn't faster.

### 7.3 Part

`part:` names the part a chart is written for: the staff a score was read
from, or the instrument a chart is for.

```
# Morning Song
part: Gtr = Electric Guitar 1
key: G
```

- `part: Electric Guitar 1` gives the name. `part: Gtr = Electric Guitar
  1` also gives a short **label**: no spaces, before the `=`.
- **A line of its own.** The name runs to the end of the line, so it may
  hold commas (`part: Guitar, rhythm`). Runs of spaces print as one.
- **Before the first bar.** A part names the whole chart, not the bars
  after it. A `part:` after a bar line is an **error**. A second `part:`
  makes a chart of several parts (7.4).
- A converter writes the name where its format names a part: MusicXML's
  `<part-name>` (the label, if any, as `<part-abbreviation>`) and a MIDI
  track name. Without `part:` it chooses its own.
- Errors: no name (`part:`, `part: Gtr =`), no label before `=`, another
  directive after it on the line (`part: Guitar, key: G`) or before it
  (`key: G, part: Guitar`). `instrument:` and `parts:` are near misses.

### 7.4 Several parts

A chart may carry several players, a guitar and a piano say, written as
**systems**: a row per part, sharing bars as a score's system does.

```
# Morning Song
part: Gtr = Electric Guitar 1
part: Pno = Piano
key: G

## Intro
| G | C | G | D |

## Verse
Gtr | G   | C | G  | D |
Pno | G/B | C | Em | D |
Gtr | G   | C | D  | G |

## Chorus
|: C | G | D | G :|
```

The intro and the chorus are **tutti**: an unlabelled bar line, which
every part plays. The verse's first system has both parts; in its second,
the piano is **tacet**: it isn't written, so it rests.

- **Declaring parts.** Two or more `part:` lines make a multi-part chart,
  in **score order** (the order of systems' rows and of machine output).
  Each needs a label: `part: Electric Guitar 1` beside another part is an
  **error** suggesting `part: Label = Electric Guitar 1`. Two parts may
  not share a label in any case; they may share a name (`Gtr1`, `Gtr2`,
  both Guitar). A label can't start with `|`, `#`, `@` or a digit, so a
  labelled line never reads as anything else.
- **Labelled bar lines.** A declared label, a space, then a bar line
  (`|`, `|:` or an ending `|1`) is that part's bar line. Labels match in
  any case and print as declared. `Gtr| G |` is an **error** suggesting
  the space. In a single-part chart a labelled line is the same as an
  unlabelled one. A line that reads as a bar line after a word that is not
  a declared label (`Bass | E | A |`) is text, with a **warning**; lyrics
  with a pipe that don't read as a bar line stay quiet.
- **Systems.** Consecutive labelled bar lines (blank lines ignored) in
  which no label repeats are one system. A label written again starts the
  next system; any other line (text, a heading, a directive, an
  unlabelled bar line) ends one. Lines within a system may come in any
  order; the canonical form sorts them into score order.
- **Tutti and tacet.** An unlabelled bar line in a multi-part chart is a
  system of its own that every part plays. A part not written in a system
  is tacet for its bars.
- **One timeline.** Bar numbers, keys, meters, tempi, feels, sections,
  replays, repeats, endings and the jump belong to the chart, so every
  part's bar 9 is the same bar. Directives stay on their own lines,
  between systems. A replay brings back every part, tacets included.
- **Structure is written on every line.** Repeat marks (`|:`, `:|`,
  `x N`, `x ...`), the ending, fermatas (`...`), rehearsal marks,
  directions and one-bar meters shape the timeline, so every line of a
  system writes the same ones in the same places, and each part's line
  reads correctly on its own. Every line also writes the same number of
  bars. A line that differs from the one most of the system's lines agree
  with (the first, when none has a majority) is an **error**, and its
  part is tacet for that system until it is fixed. A repeat may open in a system and close
  on a later system or a tutti line.
- **A part's own.** Chords, note sets, holds, `N.C.`, `--`, `?`, words,
  accents, hits and pushes belong to their part. `%` copies the bar
  written before it for the same part, and a leading `/` holds what that
  part played, both in written order as in 2.3; on a tutti line each part
  resolves its own (`| % |` after a system where the guitar played D and
  the piano Em repeats each). After a bar where the part was tacet, both
  are **errors**. A push borrows from the part's slot before it, in play
  order, tacet or not.
- **A labelled line with an error** stays in its system, with its own
  error only; its part is tacet there.
- **One part at a time.** A part extracted from the chart is an ordinary
  single-part chart: the tutti bars, its own bars, and each tacet stretch
  as bars of `N.C.` (not `--`: the rest of the band still plays).

### 7.5 Credits

Four lines name who wrote, set and owns a chart:

```
# Peaceful Dreams
composer: Kevin Peckham
lyricist: Kevin Peckham
arranger: Jane Doe
copyright: © 2026 Kevin Peckham
copyright: All rights reserved.
```

- **Names.** `composer:`, `lyricist:`, `arranger:` and `copyright:`, in
  any case. A closed set with no aliases.
- **A line of its own,** like `part:`. The value runs to the end of the
  line, so it may hold commas (`composer: Lennon, McCartney`); runs of
  spaces print as one. A directive later on the line is part of the
  value: `composer: A, key: G` credits "A, key: G", with a warning.
- **Anywhere.** A credit names the whole chart wherever it is written:
  before the bars, between sections or at the foot. It takes no time and
  changes no bar, directive, part or number. Between a system's lines it
  ends the system, as text does.
- **Repeatable.** Each line is one entry, in written order: two
  `composer:` lines are two composers, and two `copyright:` lines a
  copyright notice of two lines.
- **Text.** A credit is not parsed: names are not split and no © is
  added.
- A converter writes the credits where its format keeps them: MusicXML's
  `<creator type="composer">` (and `lyricist`, `arranger`) and `<rights>`.
- Errors: no value (`composer:`); the line stays text. Warnings: a text
  line starting with a near miss and a colon, with the right name
  suggested: `author:`, `writer:` and `music:` (composer), `words:` and
  `lyrics:` (lyricist), `arr:` and `arranged:` (arranger), `rights:` and
  `©:` (copyright).

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
- endings as `|1`, `|1-3`, `|1,3`: passes in order, runs of three or more
  as a range (`|1,2,3` prints as `|1-3`, `|1,2` as written)
- directions in the spelling of 5.2's table (`d.s. al coda` prints as
  `D.S. al Coda`, `𝄋` as `Segno`)
- omissions after the tones a chord adds (`C7(no5,b9)` prints as
  `C7(b9,no5)`), a voicing straight after its chord's name, and a slot's
  marks with the push first (`<^D`)
- rehearsal marks as written (`@B`), and words in straight quotes, each
  before the slot it precedes (`| “solo”  D |` prints as `| "solo" D |`);
  a cell keeps the slots that words are placed before, so words never
  move
- directives lowercased, comma-separated, in the order key, time, tempo,
  feel; `part:` as `part: Label = Name`, or `part: Name`; a credit as
  its name lowercased, one space after the colon, and its value with
  runs of spaces collapsed, where it was written
- a system's lines in score order, labels as declared and padded to the
  widest label, and cells padded so the system's pipes line up; tutti
  lines have no label column; a single-part chart's labelled lines print
  unlabelled. A system holding a line with an error is neither sorted nor
  padded

Canonicalizing changes spelling only. It never rewrites one chord as a
different chord with the same notes (`aug7` stays `aug7`; `7(#5)` stays
`7(#5)`).

Printing preserves meaning: the printed chart plays the same bars with the
same directives and sections and reports the same errors (formatting
warnings such as a missing `|` may disappear), and `print` is stable when
applied twice.

**Generators.** A tool that writes charts from timed chords writes one
slot per beat and canonicalizes (`printChart`). A beat the chord holds
through is `/`, and a chord that crosses a bar line continues as `/` in
the next bar. The printer reduces each cell to the fewest even slots and
keeps what cannot reduce:

| Written | Printed (4/4) |
|---|---|
| `\| C / / / \|` | `\| C \|` |
| `\| C / G / \|` | `\| C G \|` |
| `\| C / G D \|` | `\| C / G D \|` |
| `\| C / / / \| / / G / \|` | `\| C \| / G \|` |

- "Beat" is the beat of 2.1, so a 6/8 bar has 2 slots (`| C / |` prints as
  `| C |`). A grid of six eighths reduces correctly too:
  `| C / / G / / |` in 6/8 prints as `| C G |`.
- A length that is not a whole number of beats needs a finer even grid,
  one slot per eighth (`| C / / G / / / / |`: C for a beat and a half),
  or a `_` group (`| C /_G / / |`, G on the "and" of 2). Both print as
  written.
- A section with no bars is left out, heading and all: an empty `##`
  heading replays an earlier section (section 6), and one that matches
  nothing is an error.

## 9. Errors and warnings

| Kind | Situation |
|---|---|
| error | unknown or rejected chord symbol (with a suggestion where one exists) |
| error | empty cell `\| \|`, or empty note set `{}` |
| error | a lone `-` in a slot (suggests `--` for silence) |
| error | `%` or `...` sharing a cell with other slots or inside a group |
| error | unpaired `\|:` or `:\|` |
| error | an ending mark not at the start of a bar line, an ending that does not follow a `\|: … :\|` repeat, endings that miss or repeat a pass, a last ending that closes with `:\|` or an earlier one that does not, `x N` on an ending |
| error | a direction that is not alone in its cell, or a near miss of one (suggests the spelling) |
| error | a rehearsal mark that is not alone in its cell (suggests a cell of its own), `@` without a label of letters and digits, a meter on a mark, two marks with no bar between them, a mark with no bar after it |
| error | an unclosed quote, empty quotes, words with no bar to sit on |
| error | `no3` or `no5` that leaves out a tone the chord doesn't have or alters, any other omission, an omission written twice |
| error | a voicing note that is not in its chord |
| error | an accent or a hit on anything but a chord or a note set |
| error | a push with nothing played before it, longer than the slot before it, on `/`, `%` or `?`, inside a group, of three or more `<`, or after its accent (`^<D`) |
| error | a second `D.C.` or `D.S.`, or a second `Segno`, `Coda`, `To Coda` or `Fine`; `D.S.` with no `Segno` before it; `al Fine` with no `Fine`; `al Coda` without a `To Coda` and a `Coda` after it; a `Segno`, `Coda`, `To Coda` or `Fine` that no jump uses |
| error | empty section that references no earlier section (the message suggests writing its bars or removing the heading, or names the line where a later section of that name is written) |
| error | `->` anywhere but the end of a replay heading |
| error | `/` or `%` with nothing before it |
| error | `part:` with no name or no label before `=`, after the first bar, or sharing its line with another directive |
| error | a credit with no value (`composer:`) |
| error | a part without a label in a chart of several, two parts with one label, a label starting with `\|`, `#`, `@` or a digit, no space between a label and its `\|` |
| error | lines of a system with different bar counts or different structure (7.4); `%` or a leading `/` after the part was tacet; parts playing one bar in different meters (a `%` copying a one-bar meter) |
| error | invalid directive value (`time: 4/3`, `tempo: fast`, `rit. to fast`, `feel: lazy`, `feel: swing 80%`, `feel: swing 58`, `feel: straight 55%`) |
| error | `[n/d]` not at the start of a cell, or with an invalid meter |
| error | a note set mixing octave and no octave, or an octave outside 0–8 |
| error | more than one root mark `!` in a note set |
| warning | `?` (unknown harmony) |
| warning | `tempo: a tempo` with no rit. or accel. in force; `rit. to` a tempo not slower than the steady one, or `accel. to` one not faster |
| warning | missing trailing `\|` |
| warning | top-level slot count uneven for the meter |
| warning | `x N` with N > 8 |
| warning | note set with octaves out of ascending order; repeated note without octaves |
| warning | a natural tone in parentheses that the chord already has (`C7(7)`) |
| warning | a text line that looks like an old-style label (`Chorus:`, `[Chorus]`), an old bare chord line, a bar line written with escaped pipes (`D \\| A \\|`), a misnamed directive (`meter:`, `bpm:`) or a misnamed credit (`author:`, `words:`), with a suggested fix |
| warning | a credit with a directive after its value on the line (`composer: A, key: G`) |
| warning | a bar line after a word that is not a declared part label (`Bass \| E \|`), or after a chord, its leading `\|` left off (`G \| C \|`, suggesting `\| G \| C \|`) |
| warning | a chart with text but no bar line at all (reported once, at the first text line), so a chart in another format never reads as empty |

Every message gives the line number and quotes the offending token.

## 10. Migrating from stem-shovel charts

| Old | New |
|---|---|
| `\| Am7 Am7 Am7 G7 \|` | `\| Am7 / / G7 \|` (a converter rewrites old repeated names to `/`; in barmark a repeated name may read as a re-attack) |
| `\| G \| \| \|` (empty = hold) | `\| G \| / \| / \|` |
| `/` alone = repeat bar | `%` (`/` alone now means hold) |
| `D A Bm G` (bare line) | `\| D \| A \| Bm \| G \|` |
| `D \\| A \\| Bm \\| G` (pipes escaped by an editor) | `\| D \| A \| Bm \| G \|` |
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
| Pushes | v0.1 had no mark; pushes were written with groups (`/_G`). Superseded 2026-11-03, see "Push marks". |
| Root in a note set | `!` after the note: `{D E! G}`. Optional; the first note stays the bass. |
| Modes | `key:` accepts a mode name (`A mixolydian`). A bare root means major. |
| Elision | `->` at the end of a replay heading cuts its last bar. Written sections omit the bar. |
| Fades and vamps | `x ...`: an open repeat. Machine output records the count as open. |
| Canonical printing | Spelling and layout only. Lines with errors and text lines print as written; a repeated chord name is kept. |
| Repeat spellings | `x`, `X` and `×` all accepted; canonical `x`. |
| `%` after a one-bar meter | `%` repeats the previous bar exactly, its `[n/d]` included. |
| Appendix A's provisional calls | Approved by Kevin: `C2`/`C4` are rejected with `Csus2` or `C(9)` suggested, and a note set's Harte label uses the bass as root when none is marked. |
| Section form and chord parts | Machine output gains `form` on each section occurrence and `parts` on each chord (A.7), for renderers and hosts such as stem-shovel's section timeline. No change to what any chart means. |
| Charts with no bar lines | Decided by Kevin (2026-11-01, issue #1): a chart with text but no bar line warns once, at its first text line, and a text line with escaped pipes (`\\|`) that reads as a bar line once unescaped warns with that bar line as its fix. A legacy stem-shovel chart had parsed to 0 bars and 0 warnings, like an empty file. Empty charts and charts of only a title and directives stay silent. |
| Logic Pro's parentheses | Decided by Kevin (2026-11-01): groups in a row are one list (`C7(b9)(#11)` = `C7(b9,#11)`), and `(5)` on a bare root is the power chord (`F#(5)(7)` = `F#5(7)`, F♯ C♯ E). Both are aliases: the canonical form keeps one group and the `5` quality, and no chart that read before changes meaning. `(5)` after a quality or an extension stays an error. |
| Directives under a replay heading | Decided by Kevin: they take effect after the replay, because the heading stands for its bars (written order is play order). Before, the parser applied them to the replay. |
| Gradual tempo changes | Decided by Kevin (2026-11-01): `tempo:` also takes `rit.`, `accel.` (each optionally `to` a tempo) and `a tempo`. A change runs from the next bar to the next `tempo:` or the end; its shape is never written; machine output marks every bar inside one (7.2, A.7). |
| `(addN)` in parentheses | Decided by Kevin (2026-11-02, issue #62): `(add2)`, `(add4)`, `(add9)` and `(add11)` are aliases of `(2)`, `(4)`, `(9)` and `(11)`, alone or in a list (`C(b9,add11)` = `C(b9,11)`), because chord players and DAWs spell `Am(add9)` that way. Only the four tones `addN` already takes: `add13` and `add#11` stay errors, in or out of parentheses. |
| Custom swing ratios | Decided by Kevin (2026-11-02, issue #66): first not planned, then reopened the same day with the evidence of Stem Shovel's chart export, whose swing is a continuous amount that `swing` alone could only round to 2:1 or nothing. Decided: `swing`, `shuffle` and `swing 16` take an optional amount (`swing 58%`), where the swung note lands, from 50% to 75% inclusive (MPC style); `shuffle` takes one on the same scale; the `%` is required. The bare word is 66.7% and prints as the word, so no chart that read before changes meaning or form (7.1). |
| Endings | Decided by Kevin (2026-11-03, issue #70): an ending is a bar line that starts with its passes (`\|1`, `\|2`, `\|1-3`, `\|1,3`), following a `\|: … :\|` repeat; the highest pass gives the count (5.1). The ending is its line, as `x N` repeats its line. Rejected: inline marks as ABC writes them (`… \|1 G :\|2 C \|`), because nothing marks where the last ending ends; and no syntax, because a score's correction editor loses the printed bars and a renderer the brackets. An ending marks a line, not a bar or a slot, so accents are no longer decided with endings. |
| Directions | Decided by Kevin (2026-11-03, issue #70): `Segno`, `Coda`, `To Coda`, `Fine` and the jumps `D.C.`/`D.S.` (each alone or `al Fine`/`al Coda`) are cells, marks between bars that take no time (5.2). One jump per chart for now, taken once; after it every repeat plays once, `\|: :\|` taking its last ending. Rejected: direction lines (`jump: D.S. al Coda`), which cannot sit mid-line where scores put a segno; and no syntax with converters rewriting jumps as replays, which would split sections at arbitrary bars. The one exception to written order being play order. |
| Rehearsal marks | Decided by Kevin (2026-11-03, issue #70): `@` and a label of letters and digits, alone in a cell, marks the bar after it (2.5). Rejected: `[B]`, which reads too much like the one-bar meter `[2/4]` and could be taken as a chord; `@` is distinct from both. |
| Words on a bar | Decided by Kevin (2026-11-03, issue #70): quoted words in a cell sit before the slot they precede (2.6), with no musical meaning. Rejected: words as a cell of their own between bars, which loses the slot. |
| Omissions | Decided by Kevin (2026-11-03): `no3` and `no5` as tones in the parentheses, `(omit3)` accepted (3, A.5). A triad with no third prints as the power chord. Harte marks them with `*` (`C:7(*3)`). |
| Voicings | Decided by Kevin (2026-11-03): a chord name followed by a note set (4.2); every note must be in the chord. Rejected: no new syntax, where a bare note set loses the chord's name. |
| Accents and hits | Decided by Kevin (2026-11-03): `>` accents a chord or note set, `^` makes it a hit, short and accented (2.7). A short note without an accent stays a shorter slot. |
| Push marks | Decided by Kevin (2026-11-03): `<` an eighth early, `<<` a sixteenth, written on the chord in its own bar; the push takes its time from the slot played just before it in play order (2.8). This is what written-out pushes (`/_G`) could not do: a pushed downbeat inside a repeat, a replay or after a jump. Rejected: a tie into the next bar (`/_G~ \| G`), which writes every chord twice and still can't serve a replay; and a warning only. |
| Part | Decided by Kevin (2026-11-03, issue #70): `part:` names the chart's part, with an optional label (`part: Gtr = Electric Guitar 1`), once, before the first bar, on a line of its own (7.3). MusicXML requires a `<part-name>` on every part, so a converter otherwise invents one. The instrument (MusicXML's `<instrument-sound>`, a MIDI program) is separate and waits for the converters. The `Label = Name` form is chosen so several parts can follow. |
| Several parts | Decided by Kevin (2026-11-03): one `part: Label = Name` line per part; a bar line starting with a label belongs to that part, and consecutive labelled lines form a system sharing the timeline (7.4). A part missing from a system is tacet; an unlabelled line is tutti. A system's structure (repeats, endings, marks, directions, fermatas, one-bar meters) is written on every line and checked, so each part's line reads alone. A renderer draws a tutti line as one row and a tacet part as an empty row; an extracted part writes tacet as `N.C.`. Rejected: structure written once, which makes a part's line wrong read alone. |
| Credits | Decided by Kevin (2026-11-04): `composer:`, `lyricist:`, `arranger:` and `copyright:`, each a line of its own, allowed anywhere and repeatable, one entry per line (7.5). Before, credits were text, so a renderer or converter could not use them. Rejected: composition year, work number, opus, flow number and other information, which nothing reads (Dorico imports no Project Info from MusicXML but the title) and MusicXML has no standard place for; text still holds notes. |
| Written bar numbers | Machine output gains `written` on each played bar (A.7), the bar's number as written, so a host can speak a printed score's measure numbers (issue #70: a correction editor for a score read). No change to what any chart means. |

## Open questions

- More than one jump in a chart (5.2 allows one).
- Dynamics (`mf`, crescendos): note lines until real charts need them.
- Not planned as syntax (Kevin, 2026-11-01): a capo (a note line), ChordPro
  inline chords (barmark places chords in bars, not over words), and
  numerals as input. Transposition and a numerals view are tools: a
  library function and a renderer option, both reading `key:`.

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
| `(add2)`, `(add4)`, `(add9)`, `(add11)`, also in a list (`(b9,add11)`) | `(2)`, `(4)`, `(9)`, `(11)` (`(b9,11)`) |
| `7b9`, `m7b5` (alteration after an extension) | `7(b9)`, `m7(b5)` |
| groups in a row (`(b9)(#11)`, Logic Pro) | one group (`(b9,#11)`) |
| `(5)` on a bare root (`F#(5)`, `F#(5,7)`) | `5` (`F#5`, `F#5(7)`) |
| `(omit3)`, `(omit 3)`, `(omit5)`, `(omit 5)` | `(no3)`, `(no5)` |
| `(no3)` on a triad (`C(no3)`, `Cm(no3)`) | `5` (`C5`) |
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
| `tempo` | on a played bar: the steady tempo, or empty when unknown |
| `tempoChange` | on a played bar inside a rit. or accel.: its `kind` (`rit` or `accel`), `from` (the steady tempo) and `to` (the target, or empty when open); empty outside one |
| `swingPercent` | on a played bar and a directive: the swing amount in force (50 to 75), or empty for the bare word (66.7) and for `straight` |
| `written` | on a played bar: its number as written, counting each written bar once in written order (`%` included, `...` not). A repeat or replay plays its bars under the numbers they were written with, and a bar line dropped for an error still counts its bars, so the numbers after it hold |
| `rehearsal` | a cell in the parse tree that is a mark (2.5), with its `label`; on a played bar, the label of the mark just before it, or absent |
| `words` | on a cell and a played bar: each `text` with `at`, the slot it sits before (the slot count for after the last), or absent when none |
| `ending` | on a bar line in the parse tree: the passes an ending plays on (`[1]`, `[1, 2, 3]`), or empty |
| `direction` | a cell in the parse tree that is a mark between bars (5.2): `segno`, `coda`, `to coda`, `fine`, or a `jump` with `to` (`start` for `D.C.`, `segno` for `D.S.`) and `al` (`fine`, `coda`, or empty when it plays to the end) |
| `repeat` | on a bar line, section or repeat bracket in the parse tree: a count, or `open` for `x ...` |
| `harte` | the Harte label: `C:7(b9)`, `N` for N.C. and silence (`--`), `X` for `?`; a tone the chord leaves out is marked `*` (`C:7(*3)`) |
| `voicing` | on a chord slot: the note set written after its name (4.2), or absent |
| `articulation` | on a chord slot: `accent` (`>`) or `hit` (`^`), or absent |
| `push` | on a chord, `N.C.` or `--` slot: `eighth` (`<`) or `sixteenth` (`<<`), or absent |
| `part` | on the parse: the chart's one part, its `name` and `label` (absent when none), or empty when it names none or several (deprecated: use `parts`) |
| `credits` | on the parse: `composer`, `lyricist`, `arranger` and `copyright`, each a list of the credit lines' values in written order, empty when none is written |
| `parts` | on the parse: every declared part in score order; on a played bar of a multi-part chart, one entry per part (its `line`, `slots` and `words`), or empty where that part is tacet |
| `tacet` | on a played bar of a multi-part chart: true when the first part is tacet there (its slots then read `N.C.`) |
| `source` | the symbol as written |

The bass note counts among the chord's pitches: `C/Bb` contains B♭. For
note sets, the Harte label uses the marked root when there is one
(`{D E! G}` → `E:1(b3,b7)/b7`). Otherwise it uses the bass, because Harte
requires a root: `{C E F# B}` → `C:1(3,#4,7)`. That is a representation, not
a claim about the chord's name.
