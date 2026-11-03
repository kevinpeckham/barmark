# Several Parts in One Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charts with several parts (systems, tacet, tutti) read, play, print, render, extract and appear on barmark.dev, plus a syntax-coverage backfill for the site.

**Architecture:** The reader labels bar lines with their part and groups them into systems (`systems.ts`). Every part is then **projected** to an ordinary single-part line list (`parts.ts`: its own lines, the tutti lines, and tacet stand-ins built from the system's structure), and the existing `expand` runs once per projection. Because Q1 makes every line in a system carry the same structure, the projections share one timeline, and `parseChart` zips them into one `PlayedBar` list with a `parts` array. Printing, extraction (`printPart`) and the renderer's one-part view all reuse the projection.

**Tech Stack:** Bun workspace, TypeScript strict, Biome, Fallow, linkedom/Playwright (render), SvelteKit + UnoCSS (site).

**Spec:** `docs/superpowers/specs/2026-11-03-several-parts-design.md` (approved by Kevin 2026-11-03). Grammar authority: `docs/grammar-v0.1-draft.md`.

## Global Constraints

- Every existing chart means exactly what it means today; the only new thing a single-part or partless chart can see is the undeclared-label warning.
- Parsers never throw on user input; every problem is a diagnostic with a line number.
- A grammar change updates the draft and its decisions log in the same commit as the code.
- Test first; `bun test`, `bun run check`, `bun run fallow` green before every commit (refactor rather than grow the Fallow baseline; prune it only after paying complexity down, and say so).
- CHANGELOG entry under `[Unreleased]` in each changed package; FINDINGS.md entry for any surprise.
- Conventional commits, **no** `Co-Authored-By` or AI trailer. PR bodies end with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
- `main` is protected: one PR per delivery stage, green CI, merged as `gh pr merge N --merge --delete-branch -R kevinpeckham/barmark`. Kevin has authorised merging, releasing and approving npm publishes.
- `@barmark/render` never changes the music: tacet, tutti and per-part slots come from the parser.
- Tacet stand-ins and extracted tacet bars are `N.C.`, never `--` (spec Q3).
- Labels match case-insensitively; output always uses the declared spelling.

## Plan rulings (against the spec)

- A system line whose **bar count** differs is treated as tacet for the whole system (with its error), not padded with tacet bars: one rule for every mismatch keeps the projections on one timeline. Cost if wrong: a shorter line's bars vanish from the output until the error is fixed.
- Score-order sorting and alignment skip a system that holds an errored line, so errored lines print exactly as written (grammar §8).

## Review Focus

1. A replayed section containing systems: every part's bars and tacets come back, and bar numbers match the first time (test in Task 5).
2. `|: … :|` opening in a system and closing on a tutti line, with endings: one timeline, no "unpaired" error (Task 5).
3. A lyric line containing pipes after a word (`Oh | yeah | baby |`) in a partless chart stays text with no warning unless it parses cleanly as a bar line (Task 2).
4. A system whose lines differ only in case of label (`gtr` vs declared `Gtr`) prints with the declared spelling and counts as the same part (Task 2, Task 6).
5. `printChart` is stable when applied twice to a multi-part chart, including one with an errored system line (Task 6).

---

## Stage A: barmark (one PR, then barmark 0.14.0)

Branch `feat/several-parts` from main.

### Task 1: Declaring several parts (grammar 7.4 begins)

**Files:**
- Modify: `packages/barmark/src/chart/types.ts`, `document.ts`, `parse.ts`
- Modify: `docs/grammar-v0.1-draft.md` (line-kinds table, 7.3, new 7.4 "Several parts", §9 errors, decisions log entry "Several parts (Kevin, 2026-11-03)", remove the item from Open questions; 7.4 text is the spec's "The grammar change" section, with the decided Q1 and the three builder-check calls)
- Test: `packages/barmark/tests/chart/parts.test.ts`

**Interfaces:**
- Produces: `ChartParse.parts: Part[]` (score order; `[]` when none). `ChartParse.part` = `parts[0]` when `parts.length === 1`, else `null`, with a `@deprecated use parts` JSDoc. `readDocument(text)` returns `parts: Part[]` alongside `part`.

- [ ] **Step 1: Write failing tests** in `parts.test.ts`:
  - `"part: Gtr = Guitar\npart: Pno = Piano\n| G |"` → `parts` equals `[{label:"Gtr",name:"Guitar"},{label:"Pno",name:"Piano"}]`, `part` is `null`, no diagnostics.
  - one `part:` → `parts.length === 1`, `part` equals `parts[0]`.
  - `"part: Gtr = Guitar\npart: Piano\n| G |"` → error containing `"a chart with several parts labels each one"` on line 2, suggestion `"part: Label = Piano"`.
  - `"part: Gtr = A\npart: gtr = B\n| G |"` → error containing `"two parts share the label Gtr"` on line 2.
  - `"part: 2nd = A\n| G |"` and labels starting `|`, `#`, `@` → error containing `"a part label can't start with"`.
  - The old message `"several parts are not supported yet"` never appears.
- [ ] **Step 2: Run** `bun test packages/barmark/tests/chart/parts.test.ts` — Expected: FAIL (`parts` undefined).
- [ ] **Step 3: Implement** in `document.ts`: `partLine` collects into `parts: Part[]`; label checks live in `readPart` (first-character rule) and a new `checkParts(parts, diagnostics)` run after reading (unlabelled-in-multi, duplicate labels, case-insensitive). A part line with an error is text, as today. Update the grammar draft in this commit.
- [ ] **Step 4: Run** `bun test` and `bun run check` — Expected: PASS (the old `part.test.ts` case expecting "not supported yet" is updated to the new behaviour).
- [ ] **Step 5: Commit** `feat(barmark): declare several parts (grammar 7.4)`.

### Task 2: Labelled bar lines

**Files:**
- Modify: `types.ts` (`bars` and `invalid` lines gain `part?: string`), `document.ts`
- Test: `parts.test.ts`

**Interfaces:**
- Produces: `Line` `bars | invalid` with `part?: string` = the **declared** label spelling; absent on unlabelled lines and in single-part charts (a single-part chart's labelled line is stored unlabelled).

- [ ] **Step 1: Failing tests:**
  - multi-part chart: `"Gtr | G | C |"` → a `bars` line with `part: "Gtr"`; `"gtr |: G :|"` → `part: "Gtr"`, `opens: true`; `"Pno |1 G :|"` (after a repeat) → ending read.
  - `"Gtr| G |"` → error containing `"a space goes between the label and |"`, suggestion `"Gtr | G |"`.
  - single-part chart `part: Gtr = Guitar` with `"Gtr | G |"` → `bars` line without `part`, parses like `"| G |"`.
  - `"Bass | E | A |"` with Bass undeclared (in a multi-part, a single-part and a partless chart) → text line plus warning containing `"Bass is not a part of this chart"`.
  - `"Oh | yeah | baby"` in a partless chart → text, **no** diagnostic (Review Focus 3).
- [ ] **Step 2: Run** the file — Expected: FAIL.
- [ ] **Step 3: Implement** in `document.ts`: in `classify`, before `otherLine`, `labelledLine(t, line)`: match `/^(\S+?)(\s*)(\|.*)$/`; if the word (case-insensitive) is a declared label, parse the rest with `parseBarLine`, set `part` (multi-part only), and report the missing-space error when group 2 is empty. Undeclared words go to `oldFormat`, which warns only when the rest reads cleanly as a bar line (reuse the `escapedBarLine` approach). Keep each function under Fallow's thresholds.
- [ ] **Step 4: Run** `bun test && bun run check && bun run fallow` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(barmark): bar lines labelled with their part`.

### Task 3: Systems

**Files:**
- Create: `packages/barmark/src/chart/systems.ts`
- Modify: `types.ts` (`bars`/`invalid` gain `system?: number`; `bars` gains `dropped?: true`), `document.ts` (call it last)
- Test: `packages/barmark/tests/chart/systems.test.ts`

**Interfaces:**
- Produces: `groupSystems(lines: Line[], parts: Part[]): { lines: Line[]; diagnostics: ChartDiagnostic[] }`. Sets `system` (0-based, chart order) on every labelled `bars`/`invalid` line; sets `dropped: true` on a labelled `bars` line whose bar count or structure differs from the system's **first valid line in written order** (its part is then tacet for that system). Exported helper `structureOf(l: BarsLine): string`.

- [ ] **Step 1: Failing tests:**
  - Gtr, Pno, Gtr, Pno (blank lines between allowed) → systems 0, 0, 1, 1. A repeated label starts a new system; a text line, heading, directive or unlabelled bar line ends one.
  - Gtr 4 bars, Pno 3 bars → error on the Pno line containing `"this system's lines have 4 bars"` (message names the other line number), Pno line `dropped`.
  - Gtr `|: G | C :|` vs Pno `| G | C |` → error containing `"the same repeat marks"`; Gtr `| @B G | C |` vs Pno `| G | C |` → error containing `"the same marks"`; same for `...`, directions, `[2/4]`, `x2`, endings.
  - `structureOf`: `|: [2/4] G | % | ... | @B C | D.S. al Coda :| x2` ↔ cells as `B[2/4]`, `B`, `...`, `@B`, `B`, `jump`, plus opens/closes/repeat/ending; `%` and a slots cell without meter both give `B`.
  - An `invalid` labelled line gets `system` but is ignored by the checks (one error only: its own).
- [ ] **Step 2: Run** — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `systems.ts`.
- [ ] **Step 4: Run** `bun test && bun run check && bun run fallow` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(barmark): group labelled bar lines into systems`.

### Task 4: Projecting a part

**Files:**
- Create: `packages/barmark/src/chart/parts.ts`
- Modify: `types.ts` (`Cell` `slots` gains `tacet?: true`), `expand.ts` (`%` and leading `/` after a tacet bar)
- Test: `packages/barmark/tests/chart/project.test.ts`

**Interfaces:**
- Consumes: `groupSystems` output (Task 3).
- Produces: `projectPart(lines: Line[], parts: Part[], label: string): Line[]` — a single-part line list: no `part` lines except that part's; tutti lines as they are; the part's own non-`dropped` system lines with `part`/`system` removed; for every system where the part is absent, `dropped` or `invalid`, **one** stand-in `bars` line at the system's first line number, copying the reference line's opens/closes/repeat/ending and non-bar cells, with every bar cell replaced by `{ kind: "slots", meter: <the reference cell's meter or null>, slots: [{ kind: "nc" }], tacet: true }`. Headings, directives and text pass through; other parts' lines are removed.

- [ ] **Step 1: Failing tests:**
  - spec's Morning Song: `projectPart(…, "Pno")` holds the intro tutti line, the verse's Pno line, a stand-in for the second verse system (4 `tacet` N.C. bars, line number of that system's Gtr line), and the chorus tutti line.
  - expand on a projection: `Pno | % |` right after a Pno tacet stand-in → error containing `"Pno was tacet in the bar before"`; `Pno | / G |` there → error containing `"was tacet"`; a push `<G` there is fine.
  - tutti `| % |` after a system with Gtr `D`, Pno `Em` → Gtr projection copies D, Pno projection copies Em.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `parts.ts`; in `expand.ts`, `previous` remembers `tacet`, and `simile`/`ownBar` report `"<label> was tacet in the bar before; % has nothing to copy"` / `"… / has nothing to hold"`. `expand` gets an optional `label?: string` argument for the message.
- [ ] **Step 4: Run** `bun test && bun run check && bun run fallow` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(barmark): project one part of a multi-part chart`.

### Task 5: One timeline (parseChart) and extractPart

**Files:**
- Modify: `types.ts`, `parse.ts`, `index.ts` (export `projectPart`, `extractPart`, `PartBar`)
- Test: `packages/barmark/tests/chart/timeline.test.ts`

**Interfaces:**
- Produces: `type PartBar = { line: number; slots: Slot[]; words?: Words[] } | null`; `PlayedBar.parts?: PartBar[]` (aligned with `ChartParse.parts`, multi-part charts only); `PlayedBar.tacet?: true` (top level: the first part is tacet). `extractPart(text: string, label: string): ChartParse | null` (null for an undeclared label) — `parseChart` of the projection, with `parts`/`part` set to that one part.

- [ ] **Step 1: Failing tests:**
  - Morning Song: `bars.length` is 4 + 4 + 4 + 8; verse bar 5 has `parts[0].slots` G, `parts[1].slots` G/B; bars 9–12 have `parts[1] === null`; top-level `slots` equal `parts[0].slots`; a bar where Gtr (first part) is tacet has top-level `slots: [{kind:"nc"}]` and `tacet: true`.
  - a single-part chart's played bars have no `parts` key (deep-equal to today's output for `examples/peaceful-dreams.chart.md`).
  - Review Focus 1: a section of systems replayed (`## Verse` empty) → its bars' `parts` equal the first occurrence's, `written` numbers repeat.
  - Review Focus 2: `Gtr |: G | C |` / `Pno |: Em | C |` then tutti `|1 D :|` and `|2 G |` → no diagnostics, 2 + 1 + 2 + 1 bars.
  - Diagnostics are deduplicated by line, severity and message.
  - Two non-tacet parts disagreeing on a played bar's meter → one error containing `"the parts disagree on this bar's meter"`.
  - `extractPart(text, "pno")` → `parts` = `[Piano]`, bar count equals the full chart's, tacet bars are N.C.; `extractPart(text, "Bass")` → `null`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** in `parse.ts`: when `parts.length > 1`, project each part, `expand` each, and zip events in lockstep. Shared fields from the first part; `meter` from the first part not tacet in that bar. Otherwise unchanged. Extract the zip into its own function (Fallow).
- [ ] **Step 4: Run** `bun test && bun run check && bun run fallow` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(barmark): one timeline for every part; extractPart`.

### Task 6: Printing systems; printPart; transpose

**Files:**
- Modify: `print.ts`, `transpose.ts` (keep `part`/`system`/`dropped` through the mapper), `index.ts` (export `printPart`)
- Test: `packages/barmark/tests/chart/print-systems.test.ts`

**Interfaces:**
- Produces: `printPart(text: string, label: string): string | null` — the projection printed as a single-part chart (`part:` line for that part only, tacet stand-ins as `| N.C. | N.C. |` bars), `null` for an undeclared label.

- [ ] **Step 1: Failing tests:**
  - A system written Pno then Gtr prints Gtr then Pno (score order), labels padded to the widest declared label plus one space, and every `|` of the system's lines in the same column:
    ```
    Gtr | G   | C | G  | D |
    Pno | G/B | C | Em | D |
    ```
  - Tutti lines print with no label column. `gtr | G |` prints `Gtr | G |`.
  - A system with an errored line: that line prints as written and is not moved; the others align among themselves and score-order sorting is skipped for that system.
  - Stability: `printChart(printChart(x)) === printChart(x)` for the Morning Song and the errored case (Review Focus 5).
  - `printPart(morningSong, "Pno")` equals a fixed expected text (write it in the test) whose `parseChart` has no errors; `printPart(x, "Bass")` is `null`.
  - `transposeChart` on a multi-part chart moves every part and keeps labels and alignment.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**: `printParsed` buffers a system's lines, prints each with `printLine`, then pads per column (split on the cell boundaries `printLine` produced, so `|:`, `:|`, endings and `x2` stay attached). Padding rule: each cell padded to its column's widest cell.
- [ ] **Step 4: Run** `bun test && bun run check && bun run fallow` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(barmark): print systems aligned; printPart`.

### Task 7: README, CHANGELOG, PR, release barmark 0.14.0

- [ ] README: a "Several parts" section (`parts`, `PlayedBar.parts`, `tacet`, `extractPart`, `printPart`, `part` deprecated). CHANGELOG `[Unreleased]` entries.
- [ ] Gates: `bun test`, `bun run check`, `bun run fallow`, `bun run test:browser`. Open the PR, wait for CI with `gh pr checks --watch`, merge.
- [ ] Release per RELEASING.md / `/release` skill: barmark 0.14.0 (bump `bun.lock` too), release check on a **clean** main, publish via the scratchpad `publish.sh`, approve the npm deployment with a comment, confirm with `npm view`.

## Stage B: renderer, CLI, songs

Branch `feat/render-parts` after barmark 0.14.0 is on npm.

### Task 8: Systems in the renderer model and HTML

**Files:**
- Modify: `packages/render/src/types.ts`, `model.ts`, `html.ts`, `styles.ts`, `speech.ts`
- Test: `packages/render/tests/parts.test.ts`, `packages/render/browser/render.pw.ts`

**Interfaces:**
- Produces: `ChartModel.parts: Part[]` (`part` kept as today). `BlockItem` gains `{ kind: "system"; line: number; barNumber: number | null; rows: Array<{ label: string; name: string; row: Extract<BlockItem, { kind: "row" | "error" }> | null }> }` — one entry per declared part in score order, `null` = tacet. Tutti lines stay `row` items. `layoutRow` takes the played bars to number and fill from (the part's view: `bars.map(b => ({...b, ...b.parts[i]}))`, filtered by line).

- [ ] **Step 1: Failing tests** (linkedom): Morning Song renders the verse's first system as one `.bm-system` with two `.bm-part-row`s labelled "Gtr" and "Pno" and one margin number (5); the second system's Pno row has class `bm-tacet`, the same cell count as the Gtr row, and the text "tacet" in its first bar; the intro (tutti) is a single ordinary row with no label; the header reads "Electric Guitar 1, Piano · G major"; speech for the system contains "Gtr" once and "Pno" once (part announced once per system, by name: "Electric Guitar 1:" … "Piano:"). Browser test: the rows of a system share bar x-positions (left edges equal within 1px) at 400px and 1200px widths.
- [ ] **Step 2: Run** `bun test packages/render` — Expected: FAIL.
- [ ] **Step 3: Implement**: model groups lines by `system`; html draws a system as a stacked grid with a label gutter and a left bracket (styles in `styles.ts`, honouring existing tokens and contrast tests).
- [ ] **Step 4: Run** `bun test && bun run check && bun run fallow && bun run test:browser` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(render): draw systems, tacet rows and tutti lines`.

### Task 9: One part's view

**Files:**
- Modify: `types.ts` (`LayoutOptions.part?: string`), `model.ts`, `element.ts` (observed attribute `part`)
- Test: `parts.test.ts`, `element.test.ts`

- [ ] **Step 1: Failing tests:** `renderChart(morningSong, { part: "pno" })` has no `.bm-system`, its header shows "Piano · G major", and its verse shows four bars reading "N.C." styled as tacet (`.bm-tacet`); `<barmark-chart part="Pno">` re-renders when the attribute changes; an undeclared label renders the whole chart plus a diagnostic `"no part labelled Bass"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**: `layoutChart` with `part` lays out `printPart(text, part)` (Ruling recorded in the README: diagnostics in this view carry the extracted chart's line numbers). Tacet stand-ins are recognised by `PlayedBar`'s source cell `tacet`.
- [ ] **Step 4: Run** all render gates — Expected: PASS.
- [ ] **Step 5: Commit** `feat(render): part option and attribute`.

### Task 10: CLI, releases, songs

**Files:**
- Modify: `packages/cli/src/render.ts`, `args.ts`, `help.ts`, `main.ts`; Create: `packages/cli/src/part.ts`
- Test: `packages/cli/tests/render.test.ts`, Create `packages/cli/tests/part.test.ts`

- [ ] **Step 1: Failing tests:** `barmark render --part Pno song.chart.md` output has no `bm-system`; `barmark part Pno song.chart.md` prints `printPart` output and exits 0; an undeclared label exits 1 with `"no part labelled Bass"` on stderr; `barmark help` lists `part`.
- [ ] **Step 2–4:** implement as `(args, io) => Promise<number>` like the other commands; run `bun test && bun run check && bun run fallow`.
- [ ] **Step 5: Commit** `feat(cli): render --part and part`.
- [ ] Renderer README and CHANGELOGs; PR, CI, merge; release render 0.11.0, then cli 0.1.7 (pinned exactly), approve both; `npm view`. Then `kevinpeckham/songs`: bump README and `.github/workflows/check.yml` to cli 0.1.7, PR, merge.

## Stage C: barmark.dev

Branch `chore/site-parts` after the releases.

### Task 11: Guide, Try It, coverage backfill

**Files:**
- Modify: `site/package.json`, `site/bun.lock`, `site/tests/build.test.ts` (pins), `site/src/lib/guide/rows.ts`, `site/src/lib/try/read.ts`, `site/src/routes/try/+page.svelte`, `site/tests/guide.test.ts`, `site/tests/try.test.ts`
- Create: `site/tests/coverage.test.ts`

- [ ] **Step 1: Failing tests:**
  - `guide.test.ts`: rows `several-parts` (syntax `part: Gtr = …` ×2, §7.4, example a two-part system, `expect.bars`), `labelled-line` (`Gtr | … |`, §7.4), `tacet` (§7.4, terms "tacet", "rest", "doesn't play"), `tutti` (§7.4, terms "tutti", "all", "everyone"); searching "piano", "system", "score", "tacet", "tutti" finds them; the `part` row's meaning no longer says "once".
  - `try.test.ts`: `read` of a two-part system returns `kind: "chart"`; `EXAMPLES` includes a parts example whose chip shows a short label ("Gtr + Pno") rather than the multi-line text.
  - `coverage.test.ts`: every grammar subsection that defines syntax (§1, §2–§2.8, §3, §4–§4.2, §5–§5.2, §6, §7–§7.4; read the headings from `../docs/grammar-v0.1-draft.md`, excluding §8, §9, §10) is the `ref` of at least one row. Plus a fixed checklist of accepted spellings each findable by search: `B minor`, `145 bpm`, `@17`, curly quotes in words, `(omit3)`, `×2`, `…`, en dash for `--`, `→`.
- [ ] **Step 2: Run** `cd site && bun run build && bun test` — Expected: FAIL (new rows, coverage gaps).
- [ ] **Step 3: Implement**: bump to barmark 0.14.0 / render 0.11.0; add the rows; change `EXAMPLES` to `{ label: string; text: string }[]` (update the page and tests); fill every gap the coverage test reports with a row or with `terms` on the right row (backfill).
- [ ] **Step 4: Run** `cd site && bun run build && bun test && bun run test:browser && bun run check` — Expected: PASS. Check the try page and the syntax page by eye at `barmark.bench.lj.dev` (desktop and 400px).
- [ ] **Step 5: Commit** `chore(site): barmark 0.14.0, render 0.11.0; guide rows for several parts; syntax coverage`, PR, CI, merge.

## Finish

Memory: mark "Several parts" done in `barmark-backlog.md`. Report to Kevin: releases, PRs, rulings, deferred minors.
