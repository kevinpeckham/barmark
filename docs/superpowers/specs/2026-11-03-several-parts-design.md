# Several parts in one chart: design

Status: Q1–Q3 decided by Kevin (2026-11-03); builder check done, its points settled as marked "my call". Awaiting Kevin's approval of the whole document before an implementation plan. Grammar authority stays
`docs/grammar-v0.1-draft.md`; this document argues the change it will make
there (a new section 7.4, with 7.3 and the line-kinds table amended).

## Intent

A band chart often carries more than one player: guitar and piano, or a
rhythm section reading together. Today a barmark chart is one part
(`part:` names it, grammar 7.3), so two players need two files that drift
apart. Kevin wants one chart where **each row becomes a stacked system**,
one row per part, sharing bars the way a score's system does.

Success: a chart like this reads naturally in plain text, parses into one
timeline that every part shares, prints with its columns lined up, renders
as stacked rows, and splits back into one chart per part for a converter
(MusicXML writes one `<part>` per staff).

```
# Morning Song
part: Gtr = Electric Guitar 1
part: Pno = Piano
key: G

## Intro
| G | C | G | D |

## Verse
Gtr | G     | C  | G  | D  |
Pno | G/B   | C  | Em | D  |
Gtr | G     | C  | D  | G  |

## Chorus
|: C | G | D | G :|
```

Reading it: the intro is **tutti** (an unlabelled line: both parts play
it). The verse's first system has both parts; in its second, piano is
**tacet** (it isn't written, so it rests). The chorus is tutti again.

## Goals

- Several `part:` lines declare the chart's parts, in order.
- A bar line may start with a part's label; consecutive labelled lines form
  a **system** whose lines share the same bars.
- One timeline: bar numbers, meters, keys, tempi, feels, sections,
  replays, repeats, endings and the one jump are the chart's, not a part's.
- Every existing chart means exactly what it means today.
- Each part can be extracted as a single-part chart that a converter or a
  single player reads unchanged.

## Non-goals

- Per-part keys, transposing instruments, or written-vs-concert pitch.
  Every part is written at concert pitch in the chart's key.
- Per-part meters, tempi or feels (polymeter). The system shares them.
- Notation beyond chords and note sets (rhythm slashes, melodies, drums).
- Dynamics (still an open question in the grammar).
- Labels inside a cell (`| Gtr: D Pno: G |`). One line is one part.

## Anti-goals

- A labelled line that silently becomes text, or text that silently
  becomes a part. Every near miss gets a diagnostic.
- Parts drifting out of step: a system whose lines disagree on how many
  bars it has is an error, never a guess.
- Breaking the "a line is chords only if it starts with `|`" guarantee for
  charts that declare no parts.

## Decided by Kevin

- One `part: Label = Name` line per part (2026-11-03).
- A bar line starting with a label belongs to that part; consecutive
  labelled lines form a system sharing bars, meters, repeats, endings and
  directions (2026-11-03).
- A part missing from a system is **tacet** there (2026-11-03).
- An unlabelled bar line in a multi-part chart is **tutti**: every part
  plays it (2026-11-03).

## The grammar change (proposed 7.4)

### Declaring parts

- A chart with two or more `part:` lines is a **multi-part chart**. Every
  `part:` line must come before the first bar line (as 7.3 already says),
  and in a multi-part chart **every part needs a label**:
  `part: Electric Guitar 1` beside another part is an error suggesting
  `part: Label = Electric Guitar 1`.
- Labels follow 7.3 (no spaces, no `=`) and additionally must not start
  with `|`, `#`, `@` or a digit, so a labelled line can never be read as
  anything else. Labels match **case-insensitively**, like section names;
  the canonical form prints the declared spelling.
- Two parts with the same label (in any case) is an error. Two parts with
  the same name and different labels is allowed (`Gtr1`, `Gtr2`, both
  "Guitar").
- The order of the `part:` lines is the score order: systems, the
  renderer's rows and the machine output all use it.
- The error "a chart names one part; several parts are not supported yet"
  goes away.

### Labelled bar lines

- A line whose first word is a declared label, followed by whitespace and
  a bar line (`|`, `|:` or an ending `|1`), is that part's bar line. The
  label is case-insensitive and needs at least one space before the pipe
  (`Gtr | D |`; `Gtr| D |` is an error suggesting the space).
- A single-part chart may label its lines with its one label; such a line
  is the same as an unlabelled one.
- **Near misses.** A line that would read as a bar line after a first word
  that is not a declared label (`Bass | E | A |` in a chart without Bass)
  is a warning on a text line: "Bass is not a part of this chart; declare
  it with `part: Bass = …`". Detection reuses the "would it parse cleanly"
  test that `escapedBarLine` already uses, so lyrics with a pipe stay
  quiet. This applies in single-part and partless charts too, which is the
  one change those charts see: a new warning, never a new meaning.

### Systems

- A **system** is a run of consecutive labelled bar lines (blank lines
  ignored) in which no label appears twice. A label that appears again
  starts the next system; any other line (text, a heading, a directive, an
  unlabelled bar line) ends the system.
- An unlabelled bar line in a multi-part chart is a system of its own:
  **tutti**, every part playing the same bars.
- **A labelled line with an error** (an `invalid` line) still belongs to
  its system (my call): its own error is reported, its part is tacet for
  that system, and it is left out of the bar-count and structure checks,
  so one typo yields one error, not a cascade. The printer writes it
  exactly as written (section 8) and aligns the system's other lines
  without it.
- Every line in a system must have the same number of **bars** (cells that
  take time: slots and `%`; not `...`, marks or directions). A mismatch is
  an error on the shorter line; the reader then treats the missing bars of
  that line as tacet so the rest of the chart still reads.
- A part not written in a system is **tacet** for that system's bars.
- Lines in a system appear in any order; the canonical form sorts them
  into score order.

### What a system shares (structure)

The marks that shape the timeline belong to the system, not to a line:
`|:`, `:|`, `x N`, `x ...`, endings (`|1`), `...` fermatas, rehearsal
marks (`@B`), directions (`Segno`, `To Coda`, `D.S. al Coda`, …) and
one-bar meters (`[2/4]`).

**Decided (Kevin, Q1, 2026-11-03):** every line in a system writes the
same structure, and the reader checks it: the same repeat marks and count,
the same ending, and the same fermatas, marks, directions and one-bar
meters at the same positions. A mismatch is an error naming both lines.
Each part's line then reads correctly on its own (and extracts unchanged),
and the columns line up for the eye the way a score's barlines run down a
system. The alternative, structure written once on any line, saves typing
but makes a part's line wrong when read alone.

A tutti line carries structure the ordinary way. A `|: … :|` repeat that
opens on one system may close on a later system or on a tutti line, as
long as every line in each system agrees.

### Per-part content

Everything else is the part's own: chords, note sets, holds, `N.C.`, `--`,
`?`, words on a bar, accents, hits and pushes.

- `%` copies the bar **written** before it **for the same part**, in
  written order as today (2.3: a section plays the same wherever it is
  replayed): after a tutti bar that is the tutti bar; after a bar where
  the part was tacet it is an error ("Pno was tacet in the bar before; `%`
  has nothing to copy").
- `/` at the start of a part's bar holds what that part last played, by
  the same written-order rule; after a tacet bar it is an error, as at the
  start of a chart.
- **On a tutti line, `%` and `/` resolve per part** (my call): `| % |`
  after a system where Gtr played `D` and Pno `Em` repeats D for Gtr and Em
  for Pno, and is an error for a part that was tacet there. "Tutti" means
  every part plays the line, not that every part plays the same chords.
- A push (`<D`) borrows from the previous slot of the same part; pushing
  into a bar after the part was tacet borrows from its tacet bar, which is
  allowed (the player comes in early).
- Words on a bar are the part's.

### Sections, replays and directives

- Sections contain systems and tutti lines in any mix. A replay heading
  replays every part's bars, so a replayed verse brings back its tacets.
- Directives remain chart-wide and stay on their own lines, between
  systems. They take effect at the next bar, as now.
- Bar numbers (`index`, `written`) count the timeline's bars, so every
  part's bar 9 is the same bar.

### Canonical form

- `part:` lines in declared order, one per line, before the directives.
- A system's lines in score order, labels padded to the widest declared
  label, and cells padded so that the pipes of a system line up
  column by column. Tutti lines are not padded to the labels (they have no
  label column). (Builder's call: the exact padding rule, as long as it is
  stable when printed twice.)
- A single-part chart's labelled lines print unlabelled.

### Errors and warnings to add

| Problem | Severity |
|---|---|
| a part without a label in a multi-part chart | error |
| two parts with the same label | error |
| a label starting with `\|`, `#`, `@` or a digit | error |
| no space between the label and the pipe | error |
| a label that isn't declared, before a line that reads as a bar line | warning (the line is text) |
| lines of a system with different bar counts | error |
| lines of a system with different structure (Q1) | error |
| `%` or a leading `/` after the part was tacet | error |

## Machine output (the library)

- `ChartParse.parts: Part[]`: the declared parts in score order (empty
  when none). `ChartParse.part` stays, as `parts[0]` when there is exactly
  one part and `null` otherwise, and is marked deprecated in the README.
- `PlayedBar.parts?: Array<{ slots: Slot[]; words?: Words[] } | null>`,
  aligned with `ChartParse.parts`; `null` is tacet. Present only in a
  multi-part chart. A tutti bar's entries hold the same slots unless a
  `%` or `/` on it resolved per part (above).
- In a multi-part chart the top-level `slots` and `words` of a played bar
  are those of the **first part**, with a tacet bar as `[{ kind: "nc" }]`
  plus `tacet: true`, so a single-part consumer (Stem Shovel today) reading
  a multi-part chart sees the first part. (My call, cheap to change before
  release: the alternative is an empty `slots`, which existing consumers
  would read as a broken bar.)
- `Line` gains `part?: string` (the declared label) on `bars` and
  `invalid` lines, and `system?: number` so the printer and the renderer
  group lines without re-deriving systems.
- `extractPart(parse, label): ChartParse` and `printPart(text, label):
  string`: one part's chart, with tutti bars, the part's own bars and the
  system's structure; a tacet stretch is written as bars of `N.C.` (Q3).
- Harte labels (A.7) are per part: the existing label functions take a
  played bar's slots, so callers map over `parts`.

## The renderer

Kevin's picture: each row becomes a stacked system, one row per part.

- A system draws its parts as stacked rows, sharing bar positions, with
  the label in a left gutter and a bracket joining the rows. Margin bar
  numbers sit once, on the top row.
- **Decided (Kevin, Q2):** a tutti line is drawn as **one row** spanning
  the stack, with no label: it is shorter and says "everyone" by its shape.
- **Decided (Kevin, Q3):** a tacet part inside a system is drawn as an
  **empty row** with "tacet" in its first bar, so the stack keeps its
  shape and a player's eye finds their row in the same place.
- `<barmark-chart part="Pno">` (and a `part` option to `renderChart`)
  draws one part only, as a single-part chart: tutti bars, the part's own
  bars, and its tacet stretches as "tacet" bars. This is the player's view.
- The header lists the parts ("Electric Guitar 1, Piano · G major") in a
  multi-part chart; with `part="…"` it shows that part's name, as today.
- Speech: a system speaks part by part, bar by bar ("Guitar: G, C. Piano:
  G over B, C."); the builder may refine it, keeping one announcement of
  the part name per system.

## The CLI

- `barmark check` and `format` need no new flags.
- `barmark render --part <label>` mirrors the element attribute.
- `barmark part <label> <file>` prints one part's chart (`printPart`).

## The site

- A guide row for parts, systems, tacet and tutti, with the Morning Song
  example rendered, and the try page accepting multi-part charts.

## Delivery

Four PRs, each releasable, following RELEASING.md:

1. Grammar 7.4 and the decisions log, with the barmark reader, play order,
   printer and `extractPart` (barmark minor).
2. Renderer systems, the `part` option and attribute (render minor).
3. CLI `--part` and `part` (cli patch), then the songs bump.
4. Site guide row and example.

## Decisions (Kevin, 2026-11-03)

- **Q1.** Is a system's structure (repeats, endings, marks, directions,
  fermatas, one-bar meters) written on every line and checked, or written
  once? **Every line, checked.**
- **Q2.** Is a tutti line rendered as one row, or repeated per part?
  **One row.**
- **Q3.** Is a tacet part drawn as an empty "tacet" row in its system, or
  left out? And, in an extracted part, is a tacet stretch written as bars
  of `--`, or as a count (`| -- | % | % | % |` vs a note line "tacet 4")?
  **An empty "tacet" row in the renderer; bars of `N.C.` in an extracted
  part**, since `--` claims the whole band stopped (2.3) and the rest of
  the band is still playing.

## Left to the builder

- The canonical padding rule (stable, pipes aligned within a system).
- Internal representation of systems in `expand.ts`, so long as Fallow
  stays within the baseline.
- Speech wording beyond one part announcement per system.
- Exact diagnostic wording, following the existing style.
