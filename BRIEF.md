# barmark — founding brief

For the agent building this repository. Written 2026-10-30 by the
stem-bench agent at Kevin Peckham's direction; Kevin is the decision
maker on everything marked his.

## What barmark is

**barmark** (bar + markdown) is an open plain-text notation for chord
charts: the bar-grid convention musicians already write (`| D | A |`),
specified precisely enough for machines. It was extracted from working
software — the stem-shovel app's chart parser and its chart-to-audio
alignment — and every rule below was validated by a research bench
(stem-bench, Studies 12–15) against real recordings with the band's
own declared truth as ground truth. The pitch, in one line: *chord
charts bands and machines can both read.*

- Repository description: "Markdown-inspired plain-text notation for
  chord charts."
- Domains: barmark.dev (docs and tooling), barmark.music (alias).
- File extension: **`.chart.md`** — a barmark file IS a markdown file,
  so every markdown toolchain renders it acceptably on day one. (A
  bare `.chart` extension belongs to the Clone Hero rhythm-game
  format; do not use it.)
- Licensing (Kevin's stated posture, following ChordPro): the SPEC is
  CC-BY 4.0; reference CODE is MIT. The reference parser may begin as
  an extraction of stem-shovel's `chordChartBars` (Kevin holds the
  copyright on both sides, so relicensing is his one-line decision).
- npm: `barmark` was free at naming time — claiming it early is
  prudent (the neighboring "chartdown" name was claimed by another
  project mid-decision).

## The grammar, v0 draft

Every rule here is bench-verified against the shipped stem-shovel
parser unless marked PROPOSED. The spec pages should present them in
roughly this order, each with a tiny example and, where noted, the
trap.

1. **Bars are cells between pipes.** `| D | A |` is two bars. A row is
   a line of cells; rows group visually into phrases (four bars a row
   reads best).
2. **N symbols in a cell divide the bar into N equal parts.** Two
   symbols halve it (`| F#5 Esus4 |`); beat-level placement is the
   chord repeated per beat — `| Am7 Am7 Am7 G7 |` is three beats of
   Am7, one of G7. State plainly: three symbols in 4/4 are thirds,
   not beats; use 1, 2 or 4 symbols per cell in 4/4 (1, 2, 3, 6 in
   6/8). TRAP: the jazz slash (`| Am7 / / G7 |`) does not mean
   beat-holds; a lone `/` or `%` in a cell means the previous BAR.
3. **`%` (or `/`) alone in a cell repeats the previous bar.**
4. **An empty cell holds the previous harmony.** This is the let-ring
   tool (`| Em | | |`) and also the trap: `| G | | | G |` is four
   bars of G, silently. Document both faces.
5. **`x N` at the end of a line plays that whole LINE N times**
   (clamped at 8). The scope is always the line, never the last
   chord — this exact ambiguity made a real chart unreadable.
6. **`|:` … `:|` around lines plays them twice.**
7. **`## Heading` begins a section.** Headings may carry numerals
   (`## I - Intro`) tying chart sections to external section data.
8. **Key, meter and tempo are stated in the text** (`Key: D · 4/4 ·
   145 bpm`; `bpm 132` and `132 bpm` both read). A bare meter line
   mid-chart (`2/4`) changes the meter in force — the partial-bar
   tool: a song ending on beat three ends with a `2/4` line and a
   two-beat bar.
9. **`N.C.` means no HARMONY, not no sound** (`NC`, `n.c.`
   normalize). A drums-only break is `| N.C. | N.C. |`.
10. **Chord symbols**: letter + accidental + quality; `♯`/`♭`
    normalize from `#`/`b`; slash bass `D/F#`; `6/9` keeps its
    slash. **Logic-style parentheticals** (PROPOSED, stem-shovel
    deliverable 4): the base quality defines the triad — and `5`
    means no third — then parenthesized tones add: `G5(7)` is
    G·D·F. (The current shipped parser reads `G5(7)` as a full G7;
    the spec should state the Logic semantics as normative and note
    the migration.)
11. **Define-once + Structure** (PROPOSED, deliverable 3; semantics
    proven by a mechanical prototype): sections defined once under
    numbered headings, a `Structure:` line expanding play order
    (`Structure: I II III II III IV V II VI VII`), per-token `x N`,
    tolerant token matching ("Outro" matches "Out"). A chart without
    a Structure line is linear. Unknown tokens warn; the outline is
    never half-applied.
12. **The unmeasured ring-out** (PROPOSED, deliverable 5): `let ring`
    (or `ring out`, `l.v.`) on a words line after the final bar, or
    an ellipsis on the final chord (`| Em... |`): the final harmony
    continues for an unmeasured span, excluded from bar arithmetic;
    the recording's own fade defines the end.
13. **Lyric and prose lines are legal and skipped** by parsers;
    warnings are line-numbered and specific.

## Prior art (the site should carry this page; be generous)

- **ChordPro** (chordpro.org): the established standard for
  lyrics-with-chords files; lyric-anchored where barmark is
  bar-anchored. ChordPro 6's `{start_of_grid}` is the closest prior
  art to the bar grid.
- **ChartDown** (github.com/ChartDown/parser): an active plain-text
  chart notation for the Nashville Number System with play-order
  expansion. Complementary, not rival: Nashville is key-relative
  numbers; barmark is absolute chord symbols. A barmark↔Nashville
  converter is a natural future package.
- **iReal Pro**: the de-facto digital bar-grid format, app-bound.
- **Harte syntax** (ISMIR 2005): the academic standard for chord
  LABELS; the right vocabulary for barmark's machine output, not its
  authoring surface.
- Engraved conventions (simile `%`, repeat barlines, D.S./segno) are
  the ancestors; barmark names what practice always did.

## The site (this repo's first deliverable)

A simple SvelteKit site (Kevin's stack conventions: Bun, TypeScript
strict, UnoCSS; look to lightning-jar/lj-website for page structure
and feel — read its repo if attached). Static-first; no database.

Pages:
1. **Home**: the pitch, a hero example chart rendered side-by-side
   (plain text → clean grid), the one-paragraph story (extracted from
   working software, validated against real recordings).
2. **Spec**: the grammar above, one rule per section, each with a
   valid example, the trap where one exists, and a SHIPPED/PROPOSED
   status chip. Versioned (start at "v0.1 draft"); PROPOSED rules
   may change as stem-shovel's deliverables 3–5 land.
3. **Try it** (the validator): a textarea, parse on input in the
   browser, render the bar grid + sections + warnings live. Start by
   extracting stem-shovel's `chordChartBars` (plus
   `chartStatedValues`, `chartSectionName`, `chordPitchClasses`) as
   the reference parser package; the stem-bench repo holds verbatim
   ports with tests (src/study14, src/study15) that double as a
   starting conformance suite.
4. **Prior art** and **About** (licensing, the stem-bench validation
   story, contribution notes).

The renderer (the site's quiet showpiece, also a package): takes
parsed bars and renders a CLEAN, EVENLY SPACED grid — aligned pipe
columns, phrase-per-row — with smart typography: `#`→♯, `b`→♭ in
chord names, qualities as superscripts (G7 → G⁷, Am7 → Am⁷,
maj7 → ᵐᵃʲ⁷ or a styled <sup>), `N.C.` small-capped. Two outputs:
HTML (the site) and plain-text canonical form (re-serialization —
parse then print should round-trip).

## Package roadmap (after the site)

1. `barmark` (npm): parser → AST (bars, sections, stated values,
   warnings) + canonical printer.
2. `@barmark/render`: the grid renderer (HTML + text).
3. `@barmark/cli`: validate, render, canonicalize `.chart.md` files.
4. Later: the Nashville converter; a conformance-test runner the
   bench can point at any implementation.

## What the bench contributes (standing offer, already promised)

The conformance corpus (the stem-bench round-trip fixtures — three
real songs with band-declared ground truth, plus the synthetic set)
and a registered validation of this repo's reference parser against
stem-shovel's shipped one, the same discipline every stem-shovel
feature got. Coordinate through the stem-bench agent when the parser
package exists.

## Open decisions (Kevin's)

- Spec version/numbering cadence; when "v0.1 draft" becomes "1.0".
- Whether real MMKK charts appear as site examples (he holds the
  rights; one real chart beside a generic example would be
  persuasive).
- The npm claim timing, and scoped (`@barmark/*`) vs unscoped.
