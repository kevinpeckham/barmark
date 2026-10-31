# barmark canonical printer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `printChart(text)` rewrites a barmark chart in its canonical form (spec §8): every accepted variant becomes its standard spelling, cells use the fewest slots, and directives and headings are normalized. Printing is stable, and the printed chart means exactly what the original did.

**Architecture:** The printer parses with `parseChart`, then walks the **physical source lines**:
- Blank lines and code fences are layout, and they're kept.
- Every other line maps to its parsed `Line`. A line with an error prints verbatim, so the error survives a re-parse. All other lines print canonically.

Slot reduction is a pure function shared by the printer and the round-trip test.

**Tech Stack:** Bun 1.3, TypeScript strict, `bun test`, Biome (tabs). No runtime dependencies.

**Spec:** `docs/grammar-v0.1-draft.md` §8, which builds on §§1–7 and on Appendix A for chord spellings.

## Global Constraints

- The same gates as before: `bunx biome check .`, `bunx tsc` and `bun test` must all pass before every commit.
- No runtime dependencies. The published npm package is not changed by this plan.
- `printChart` never throws on any input.
- Conventional commits, with **no attribution trailer**.
- Chord and note-set spellings come from `ChordRecord.canonical`. The printer never re-spells a chord itself, so `aug7` stays `aug7` (§8).

## Decisions this plan makes (the spec is silent or can't be met literally)

1. **A line with an error prints exactly as written** (trailing whitespace trimmed). Canonicalizing it could drop the error, for example by printing only the valid parts of `key: D, tempo: fast`.
2. **Text lines print verbatim**, indentation included, with trailing whitespace trimmed. The printer never applies the old-format suggestions; those are for a converter.
3. **Blank lines are the author's.**
   - A run of blank lines becomes one.
   - Exactly one blank line comes before each `##`, except at the very start.
   - There are no blank lines at the start or end, and the file ends with one `\n`.
   - A stanza break in lyrics survives.
4. **Code-fence lines are kept as written**, so a fenced chart stays fenced for markdown previews.
5. **The fewest slots** (§8) treats a slot as a continuation of the one before it when it is:
   - `/`
   - or the same symbol again: the same chord canonical, `--` after `--`, or `N.C.` after `N.C.`

   So `| G G |` prints `| G |`, matching the §10 row `| Am7 Am7 Am7 G7 |` = `| Am7 / / G7 |`. Two exceptions: `?` is never a continuation, because two unknown chords may differ, and a group is never one either.
6. **`%` and `...` stay as written.** Simile is notation, so `%` isn't expanded into the bar it copies.
7. **Heading names have their whitespace runs collapsed to single spaces.** Names already match that way.
8. **Separate directive lines stay separate lines.** Each line's parts print in the order key, time, tempo, feel.
9. **What "parse(print(parse(x))) equals parse(x)" means here.** The parse tree records line numbers and slots as written, so literal equality can't hold. The plan tests same **meaning** instead, defined in Task 3:
   - the title, the sections and the shape of the events are the same
   - every bar has the same meter, key, tempo, feel, section and reduced slots
   - the same errors are reported, and warnings may only disappear (the formatting ones: missing `|`, uneven slots fixed by the reduction)

   The plan also amends §8 to say this.

## Review Focus

1. **Every accepted variant prints in its standard spelling:**
   - `♯ ♭` → `# b`
   - `X2` and `×2` → `x2`
   - `→` → `->`
   - `…` → `...`
   - `–` and `—` → `--`
   - `NC`, `n.c.` and `N.C` → `N.C.`
   - `key: E♭` → `key: Eb`
   - `KEY:` → `key:`

   Test in Tasks 1, 2 and 3.
2. **A chart with errors prints with every error intact**, so a re-parse reports the same errors. Test in Task 3.
3. **Fuzzed input:** `printChart` never throws, `printChart(printChart(x)) === printChart(x)`, and the meaning is preserved, all over 2,000 random inputs. Test in Task 3.
4. **Lyrics and indented text survive byte for byte**, apart from trailing whitespace. Test in Task 3.
5. **CRLF and BOM input prints as LF with no BOM**, and the output is identical to the clean input's. Test in Task 3.

---

## File structure

| File | Responsibility |
|---|---|
| `src/chart/print.ts` | `reduceSlots`, `printSlot`, `printCell`, `printLine`, `printChart` |
| `src/chart/index.ts` | re-export the printer |
| `tests/chart/print-slots.test.ts`, `print-lines.test.ts`, `printChart.test.ts` | one per task |
| `docs/grammar-v0.1-draft.md` | §8 amended with Decisions 1–5 and 9, plus a decisions-log row (Task 3) |

---

### Task 1: Slots and cells

**Files:**
- Create: `src/chart/print.ts`, `tests/chart/print-slots.test.ts`

**Interfaces:**
- Consumes: `Slot`, `SimpleSlot` and `Cell` from `src/chart/types.ts`.
- Produces:
  - `reduceSlots(slots: Slot[]): Slot[]`. It returns the fewest slots with the same timeline.
    - With k slots, try each divisor m of k, ascending. For each m, split the slots into m blocks of size k/m.
    - m works when every slot except the first in each block is a continuation (Decision 5) of the slot sounding before it. The sounding slot is the last slot that isn't `/`, or a group's last member.
    - Return the first slot of each block for the smallest m that works.
  - `printSlot(s: Slot): string`. Members of a group are joined with `_`.
  - `printCell(c: Cell): string`. It gives `%`, `...`, or an optional `[n/d] ` followed by the reduced slots joined with spaces.

- [ ] **Step 1: Write the failing tests:**
  - Reduction:
    - `G / D /` → `G D`
    - `-- --` → `--`
    - `G G` → `G`
    - `N.C. N.C. N.C. N.C.` → `N.C.`
    - `/ /` → `/`
    - `Am7 Am7 Am7 G7` stays: no block split works, and the printer doesn't rewrite a repeated chord as `/` (that would turn the spec's `G -- -- --` into `G -- / /`)
    - `C / / D` stays
    - `G -- -- --` stays
    - `? ?` stays
    - `D / / /_G` stays
    - `C / D / E / F /` → `C D E F`
    - `D_E D_E` stays (groups)
  - Spellings:
    - `F♯m` → `F#m`
    - `– —` → `--`
    - `NC`, `n.c.` and `N.C` → `N.C.`
    - `{E4 C3}` → `{C3 E4}`
    - `{F♯ B♭}` → `{F# Bb}`
    - `Bb7b9` → `Bb7(b9)`
    - `Caug7` stays `Caug7` (never re-spelled as `C7(#5)`)
  - Cells: `[2/4] G / / /` → `[2/4] G`. `%` → `%`. `…` → `...`.
  - Tests build cells with `parseBarLine(\`| ${x} |\`, 1).bars.cells[0]`.
- [ ] **Step 2: Run** `bun test tests/chart/print-slots.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `reduceSlots`, `printSlot` and `printCell` in `src/chart/print.ts`.
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat(chart): canonical slots and cells with fewest-slot reduction`.

### Task 2: Lines

**Files:**
- Modify: `src/chart/print.ts`
- Test: `tests/chart/print-lines.test.ts`

**Interfaces:**
- Consumes: `printCell`, and `Line`, `Directives`, `Key` and `Repeat`.
- Produces: `printLine(l: Line): string`, for every `Line` kind:
  - **title** → `# <text>`
  - **section** → `## <name>`, with whitespace runs collapsed. It's followed by ` x<N>` or ` x ...`, then ` ->` when elided.
  - **directive** → `name: value` parts joined with `, `, in the order key, time, tempo, feel.
    - A key prints as `<tonic>` for major, `<tonic>m` for minor, or `<tonic> <mode>` for any other mode.
    - Time prints as `n/d`, and tempo as `String(n)`.
  - **bars** → `| ` + the cells joined with ` | ` + ` |`.
    - When the line opens, the leading `|` is written `|:`. When it closes, the trailing `|` is written `:|`.
    - Then ` x<N>` or ` x ...`.
  - **text** and **invalid** → the text as stored.

- [ ] **Step 1: Write the failing tests** (each one parses with `readDocument` and prints `lines[0]`):
  - `|:D|A:|X3` → `|: D | A :| x3`
  - `| E7 | / | × …` → `| E7 | / | x ...`
  - `| D | A` → `| D | A |` (the missing pipe is fixed)
  - `##   Chorus   Two  x2 →` → `## Chorus Two x2 ->`
  - `## Out x …` → `## Out x ...`
  - `FEEL: Swing 16, Key: E♭` → `key: Eb, feel: swing 16`
  - `key: B minor` → `key: Bm`. `key: A Mixolydian` → `key: A mixolydian`
  - `tempo: 145 bpm` → `tempo: 145`
  - `#  Example Song ` → `# Example Song`
- [ ] **Step 2: Run** `bun test tests/chart/print-lines.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `printLine`.
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat(chart): canonical line printing`.

### Task 3: `printChart`, round trip, and the spec text

**Files:**
- Modify: `src/chart/print.ts`, `src/chart/index.ts`, `docs/grammar-v0.1-draft.md`
- Test: `tests/chart/printChart.test.ts`. Add `meaning(p: ChartParse)` to `tests/chart/fixtures.ts`.

**Interfaces:**
- Consumes: `parseChart` and `printLine`.
- Produces: `printChart(text: string): string`.
  - Strip a BOM, then split on `/\r?\n/`. Each physical line i is handled by the first rule that matches:
    1. It's blank (layout).
    2. It's a fence (kept as written, trimmed).
    3. Its line number has an error diagnostic, so it prints as `raw.trimEnd()`.
    4. It's a text line, so it prints as `raw.trimEnd()`.
    5. Otherwise it prints as `printLine` of the parsed line.
  - Then apply Decision 3's blank-line rules.
- Test helper: `meaning(p)` returns a structure with:
  - the title
  - the sections, as `[name, replayOf === null ? null : <index of the replayed occurrence>, firstBar, lastBar, elided]`
  - the event shape, as nested kinds
  - the bars, as `[meter, key, tempo, feel, section, reduced slots printed]`
  - the errors, as `[severity, message, token]`
  - the warnings, as a separate set of `[message, token]`

  Line numbers are left out.

- [ ] **Step 1: Write the failing tests:**
  - **Conformance:** `printChart(PEACEFUL_DREAMS) === PEACEFUL_DREAMS`, since the example is already canonical.
  - **At a glance:** `printChart(AT_A_GLANCE)` is stable, and its meaning equals the original's.
  - **Variants (Review Focus 1):** a chart using every variant prints with none of `♯ ♭ X × → … – — NC n.c.` left, and its meaning is unchanged.
  - **Errors survive (Review Focus 2):** `# T\nkey: D, tempo: fast\n| D | Hm |\n## Verse 2` prints lines 2–4 verbatim, and a re-parse gives the same three errors.
  - **Layout (Review Focus 4 and Decision 3):**
    - `"# T\n\n\n\n## A\n| D |\nla la\n\n  la la indented   \n## B\n| E |"` → `"# T\n\n## A\n| D |\nla la\n\n  la la indented\n\n## B\n| E |\n"`
    - fences are kept
    - an empty input prints `""`
  - **Line endings (Review Focus 5):** `printChart("﻿# T\r\n| D |\r\n") === printChart("# T\n| D |\n")`.
  - **Fuzz (Review Focus 3):** 2,000 random inputs, using the alphabet from `parseChart.test.ts` plus `#`, `\n## `, `key: ` and `x ...`. For each one:
    - `printChart` doesn't throw
    - printing is stable
    - `meaning(parseChart(printChart(x)))` has the same title, sections, events, bars and errors as `meaning(parseChart(x))`
    - its warnings are a subset of the original's
- [ ] **Step 2: Run** `bun test tests/chart/printChart.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `printChart` and export the printer from `src/chart/index.ts`.
- [ ] **Step 4: Amend spec §8:**
  - Add Decisions 1 to 5 as bullets.
  - Replace the round-trip sentence with: "Printing preserves meaning: the printed chart plays the same bars with the same directives and sections and reports the same errors (formatting warnings such as a missing `|` may disappear), and `print` is stable when applied twice."
  - Add a decisions-log row, "Canonical printing | spelling and layout only; lines with errors and text lines print as written".
- [ ] **Step 5: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 6: Commit** with `feat(chart): printChart — canonical form with meaning-preserving round trip`.
