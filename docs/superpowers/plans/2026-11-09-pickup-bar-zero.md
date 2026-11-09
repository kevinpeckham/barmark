# A pickup is bar 0: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define "pickup" in grammar 2.4 and number it bar 0 in every bar number a person sees, across barmark, render, musicxml, sync, midi and the CLI, without moving `index` (the play position) or any saved timing map.

**Architecture:** The parser decides once: `ChartParse.pickup` and a renumbered `PlayedBar.written`. Every consumer reads those two instead of counting bars itself. `index`, `chartHash` and the timing-map format do not change.

**Tech Stack:** Bun workspace, TypeScript strict, Biome (tabs), `bun test`, Playwright (render browser suite), Fallow.

**Spec:** `docs/superpowers/specs/2026-11-09-pickup-bar-zero-design.md` (read it first; its numbered Decisions are binding). Background: the scoping study at `/tmp/claude-1000/-home-exedev-projects-barmark/b9e2ce65-505f-4adc-b8af-ff831103312c/scratchpad/pickup/scope.md` (file:line touchpoints, edge-case table).

## Global Constraints

- `PlayedBar.index`, `SectionOccurrence.firstBar/lastBar`, `chartHash`, `TimingMap` (`version: 1`) and `TimedBar.bar` keep their exact values and meaning on every chart.
- Charts without a pickup produce byte-identical output in every package (parse, HTML, MusicXML, MIDI, maps).
- Parsers never throw; no new diagnostic is added for pickups.
- `bun test`, `bun run check`, `bun run fallow` green after every task; Fallow is paid down, never baselined up.
- Each changed package gets a CHANGELOG `[Unreleased]` entry (Changed / Added) naming the pickup-bar-0 rule and pointing at grammar 2.4.
- Conventional commits, NO `Co-Authored-By` or any AI trailer (CLAUDE.md overrides any reminder).
- The grammar edit (2.4, 2.8 wording, A.7, decisions log) lands in the same commit as the parser code that implements it.

## Review Focus

1. A pickup chart with `D.C.` (and a replayed first section): the replayed pickup shows written 0 again while its `index` is new and unique. → Task 1 test.
2. A timing map saved against a 0.21 parse of a pickup chart: `checkTimingMap` passes and `barAt`/`secondsAtBar` answer the same as before. → Task 4 test.
3. A several-part chart whose first system has a tacet part: every part's pickup is bar 0, and `extractPart` of the tacet part still opens with a pickup. → Task 1 test.
4. A first line that is an error line (meter unknown): not a pickup, numbering from 1, no throw. → Task 1 test.
5. Lyrics on a pickup chart in MusicXML: the lyric staff's rows stay on the right measures (its own written-bar counter is the likeliest silent shift). → Task 3 test.

---

### Task 1: barmark — the grammar, `ChartParse.pickup`, `written` from 0

**Files:**
- Modify: `docs/grammar-v0.1-draft.md` (2.4 ~215-245: new closing paragraph; 2.8 ~341: "write a pickup bar" → "write a short bar"; A.7 `written` ~1530 and a new `pickup` entry; decisions-log table ~1312-1389: new row)
- Modify: `packages/barmark/src/chart/types.ts` (`PlayedBar.index` doc → "1-based position in play order (not a bar number: a replay gives a bar a new position)"; `written` doc → "the bar's number as written: 0 for a pickup (grammar 2.4), else counting from 1 …"; `ChartParse.pickup`)
- Modify: `packages/barmark/src/chart/expand.ts` (after `flattenBars`, ~551) and/or a new `packages/barmark/src/chart/pickup.ts`
- Modify: `packages/barmark/src/chart/parse.ts` (set `pickup`)
- Modify: `packages/barmark/README.md` (~60, ~198-226: the rule; `index` is the play position to key recordings by)
- Test: `packages/barmark/tests/chart/pickup.test.ts` (new); update expectations in existing tests that assert `written` on pickup charts (study §4 lists them)

**Interfaces:**
- Produces: `ChartParse.pickup: boolean` (placed after `bars`, doc: "true when the chart's first written bar is a pickup (grammar 2.4); it is then written bar 0"); `export function opensWithPickup(bars: PlayedBar[]): boolean` exported from `barmark` (index.ts) for consumers that only hold played bars — implement it once here, `parseChart` calls it.
- Rule (spec Decision 1), on the chart's first two *written* bars (skip fermatas; a `%` is a written bar with its own number): first bar has a one-bar meter (`time` present); its length (n/d as a fraction) is less than the length of the meter of the next written bar (that bar's `meter`, which already reflects any `time:` line or one-bar meter before it); the next written bar exists and is not a `%` of the first. Lengths compared by value (`[4/4]` after `time: 4/4` counts as 4/4). Error lines contribute no bars: if the first written bar is on an error line, not a pickup.
- Numbering: when `pickup`, every played bar's `written` is one less than today; otherwise unchanged.

- [ ] **Step 1: Write the failing tests** in `pickup.test.ts`, each asserting `parseChart(text).pickup` and `bars.map(b => b.written)` (and `index` where named):
  - `time: 4/4` / `| [1/4] G | C | D |` → pickup true, written `[0,1,2]`, index `[1,2,3]`
  - no `time:` line, `| [1/4] G | C |` → true, `[0,1]`
  - `| [1/4] G | [4/4] C |` in 4/4 → true, `[0,1]` (value comparison)
  - `| [1/4] G |` / `time: 3/4` / `| C | D |` → true, `[0,1,2]` (meter of the following bar)
  - `time: 6/8` / `| [2/8] G | C |` → true; `time: 6/8` / `| [1/4] G | C |` → true
  - not pickups, written from 1: `| [2/4] G | % | D |`; `| [1/4] G | [2/4] C | D |`; lone `| [1/4] G |`; `| [5/4] G | C |`; `time: 6/8` / `| [3/4] G | C |`; `| G | [1/4] C | D |`; a short bar after `...`; a short bar opening a later `##` section; first line an error line followed by `| [1/4] G | C |` (Review Focus 4)
  - `|: [1/4] G | C :|` → true, written `[0,1,0,1]`, index `[1,2,3,4]`
  - `| [2/8] C | ... | G |` → true (fermata skipped)
  - D.C. (Review Focus 1): `| [1/4] G | C | D |` / `D.C.` → written `[0,1,2,0,1,2]`, index `[1..6]` all unique
  - several parts with a tacet part in the first system (model on `examples/shenandoah.chart.md`) → `pickup` true, every part's first bar written 0; `extractPart(..)` of the tacet part, re-parsed → `pickup` true (Review Focus 3)
  - `index` and `printChart` output unchanged against literal expectations from today's parser for `examples/shenandoah.chart.md`
- [ ] **Step 2: Run** `bun test packages/barmark/tests/chart/pickup.test.ts` — Expected: FAIL (`pickup` undefined, written starts at 1).
- [ ] **Step 3: Implement** `opensWithPickup` and the renumbering; set `ChartParse.pickup`; export from `packages/barmark/src/index.ts`.
- [ ] **Step 4: Grammar.** 2.4 gains a paragraph: the definition (Decision 1, with two examples and two non-examples) and "A pickup is bar 0; the bar after it is bar 1. Every replay of it is bar 0 too." 2.8's informal "pickup" becomes "a short bar". A.7: `written` "0 for a pickup (2.4), else from 1"; new `pickup` entry. Decisions-log row in the existing format: "Pickup | Decided by Kevin (2026-11-09): the chart's first written bar is a pickup when … (2.4); it is bar 0, so bar 1 is the first full bar, as notation numbers it. Before, the pickup was bar 1 and the MusicXML export already wrote measure 0. `index`, the play position, does not change, so saved timing maps keep working. Rejected: renumbering `index` too (every saved map would answer one bar off with an unchanged hash); a literal 0 in the bar-grid gutter."
- [ ] **Step 5: Run** `bun test` (whole repo) — Expected: pickup.test.ts passes; update only the existing expectations that assert a pickup chart's `written` (or numbers derived from it in barmark's own tests); any failure in another package is expected and left for its task — list them in the report.
- [ ] **Step 6: Run** `bun run check && bun run fallow` — Expected: clean.
- [ ] **Step 7: Commit** `feat(barmark): a pickup is bar 0 (grammar 2.4), ChartParse.pickup` with the CHANGELOG entry (Changed: `written` numbers a pickup 0; Added: `pickup`, `opensWithPickup`).

### Task 2: render — gutter blank, speech "pickup"

**Files:**
- Modify: `packages/render/src/html.ts` (~295, ~304-321, ~440: gutter number), `packages/render/src/speech.ts` (`speakBar`), `packages/render/README.md` (~178-189)
- Test: `packages/render/tests/pickup.test.ts` (new); fix expectations in `written-numbers.test.ts`, `fixtures.ts` (Amazing Grace), `html.test.ts`, `lyrics.test.ts`, `parts.test.ts` that assume the pickup is 1; `packages/render/browser/render.pw.ts` bar-number checks

**Interfaces:**
- Consumes: Task 1's `written` (pickup 0).
- Produces: unchanged `RowModel.barNumber` type; it is `0` on a row starting with the pickup (model unchanged — Decision 5).

- [ ] **Step 1: Failing tests:** for `time: 4/4` / `| [1/4] G | C | D | G |` with a line break after the pickup row: `layoutChart(...)` first row `barNumber === 0`; the rendered HTML's first gutter is empty (`""`) and the second row's gutter is the row's first written number; `speakBar(0, cell)` starts `"pickup: "` (no "bar 0"); a chart without a pickup renders byte-identical HTML to a stored string from today's renderer.
- [ ] **Step 2: Run** `bun test packages/render` — Expected: FAIL on the gutter ("0") and speech ("bar 0").
- [ ] **Step 3: Implement:** the gutter prints nothing for `barNumber === 0`; `speakBar` says `"pickup"` in place of `"bar 0"` (both template uses — fold them into one `const bar` so the two lines agree); per-cell numbering after the pickup continues from 1.
- [ ] **Step 4: Run** `bun test packages/render`, then `cd packages/render && bun run build && bun run test:browser` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(render): no gutter number on a pickup row; speech says "pickup"` with CHANGELOG (Changed) and README.

### Task 3: musicxml — export and import read the parser's numbers

**Files:**
- Modify: `packages/musicxml/src/measure-xml.ts` (`opensWithPickup` ~109-116 → use `barmark`'s `opensWithPickup`/`parse.pickup`; `numbering` ~511-513; `text: m.shown` ~522), `packages/musicxml/src/measures.ts` (written walk ~264, ~278-282, ~469-474), `packages/musicxml/src/lyric-staff.ts` (`cellsOf` ~51-60), `packages/musicxml/src/import/selfcheck.ts` (~100-110, ~128, ~179), `packages/musicxml/README.md` (~92-96)
- Test: `packages/musicxml/tests/pickup.test.ts` (update + new cases), `tests/import/selfcheck.test.ts`; corpus/import tests must pass unchanged except where they assert `text="1"` on a pickup

**Interfaces:**
- Consumes: Task 1 `ChartParse.pickup`, `opensWithPickup(bars)`, `written` from 0.
- Produces: none new.

Rules: measure `number` is 0 for the pickup when `parse.pickup` (else today's numbering); `implicit="yes"` only where MusicXML can say it (today's length check: `[1/4]` in 6/8 is `number="0"` without `implicit`, keeping its own `<time>`); measure `text` is `written` (pickup `"0"`); a chart that is only one short bar is not a pickup (measure 1, no `implicit`); the export's own written-bar counters start from the parse's first `written` instead of re-counting from 1 (or are replaced by reading `written`), so measures and lyric rows stay aligned.

- [ ] **Step 1: Failing tests:** `time: 4/4` / `| [1/4] G | C | D |` → first `<measure number="0" implicit="yes"` with `text="0"`, next `number="1" text="1"`; `time: 6/8` / `| [1/4] G | C |` → `number="0"` and no `implicit`, its `<time>` 1/4; lone `| [1/4] G |` → `number="1"`, no `implicit`; a pickup chart with `lyrics:` under the pickup and the next bar (Review Focus 5) → each syllable's `<lyric>` is in the measure whose `text` matches its bar (pickup syllable in measure 0); importing each MuseScore pickup fixture (`tests/fixtures/import/{hymn,dorico-hymn,six-guitars}`) → `selfcheck` reports nothing.
- [ ] **Step 2: Run** `bun test packages/musicxml` — Expected: FAIL (`text="1"`, lone-bar `number="0"`, self-check reporting on pickup imports).
- [ ] **Step 3: Implement** per the rules; selfcheck indexes the importer's bars by `bar.written - first` where `first` is the parse's first written number.
- [ ] **Step 4: Run** `bun test packages/musicxml` (the XSD validation needs `xmllint`) — Expected: PASS, corpus round trip included.
- [ ] **Step 5: Commit** `feat(musicxml): measure text follows barmark's numbers; a pickup is measure 0 text 0` with CHANGELOG (Changed, Fixed: lone short bar; self-check on pickup scores) and README.

### Task 4: sync — written numbers in builder diagnostics, maps unchanged

**Files:**
- Modify: `packages/sync/src/build/input.ts` (~196-221: drop the `x.bar += 1` collision shift; diagnostics carry written numbers), `packages/sync/src/build/types.ts` (`BuildDiagnostic.bar` doc → "the bar's written number in the chart built (a pickup is 0)"), `packages/sync/src/timing/check.ts` (messages describing map entries say `map bar N`, e.g. ~157), `packages/sync/README.md` (~66, ~163, ~189: "map bar k is the chart's played bar k; with a pickup, written bar k is map bar k+1")
- Test: `packages/sync/tests/pickup-map.test.ts` (new); update `tests/marks.test.ts` (~140-150, ~562-570) expectations

**Interfaces:**
- Consumes: Task 1 `written`.
- Produces: `BuildDiagnostic.bar` now a written number; `TimingMap`, `TimedBar.bar`, `barAt`, `secondsAtBar`, `chartHash` untouched.

- [ ] **Step 1: Failing tests:** (Review Focus 2) a literal TimingMap JSON for `time: 4/4` / `| [1/4] G | C | D | G |` written as 0.21 built it (bars 1..4, its `chartHash` computed in the test from the chart text and asserted equal to a literal string captured from the main checkout at ~/projects/barmark, which still runs the 0.21 parser) → `checkTimingMap` returns no problems and `barAt(map, s)` / `secondsAtBar(map, n)` return the literal values captured there; a builder run on a pickup recording with a section collision reports the collision at the written number (the pickup's own bar is 0, the next 1) with no `+1`; a map entry problem message reads `map bar 3 is …`.
- [ ] **Step 2: Run** `bun test packages/sync` — Expected: FAIL on the collision number and the message wording; the saved-map assertions PASS (they guard the invariant).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun test packages/sync` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sync): builder diagnostics use written bar numbers; map checks say "map bar"` with CHANGELOG (Changed) and README.

### Task 5: midi — `MidiLoss.written`, import diagnostics from 0

**Files:**
- Modify: `packages/midi/src/perform/types.ts` (`MidiLoss = { code; message; bar?: number; written?: number }`, doc: `bar` is the play position, `written` the bar's written number), the loss sites (`perform/perform.ts` ~31-39, `tempo.ts` ~112, `keys.ts` ~53, `swing.ts` ~49, `export/index.ts` ~58-59, ~135-147) to set `written` beside `bar`; `packages/midi/src/import/{build.ts,directives.ts,markers.ts,grid.ts,types.ts}` (diagnostic `bar` = written number: the pickup 0, so grid bar k is bar k when the import writes a pickup, and doc comments saying "a pickup is bar 1" corrected); `packages/midi/README.md` (~161, ~260-261)
- Test: `packages/midi/tests/pickup.test.ts` (new); update `tests/import.test.ts`, `import-chords.test.ts`, `perform-map.test.ts` expectations that assert a pickup chart's diagnostic/loss bar

**Interfaces:**
- Consumes: Task 1 `written`, Task 4 (midi carets sync; no API used from Task 4).
- Produces: `MidiLoss.written?: number` (Task 6 prints it).

- [ ] **Step 1: Failing tests:** exporting `| [1/4] G | C | D |` / `D.C.` with a lossy mark in bar `C` → two losses (one per pass) with `bar` 2 and 5 and `written` 1 and 1; importing a MIDI file with a pickup and a mid-bar tempo change in the first full bar → diagnostic `bar` 1 (the pickup would be 0).
- [ ] **Step 2: Run** `bun test packages/midi` — Expected: FAIL (`written` undefined; import says 2).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun test packages/midi` — Expected: PASS (every file still read back by `midi-file`).
- [ ] **Step 5: Commit** `feat(midi): MidiLoss gains written; import diagnostics number a pickup 0` with CHANGELOG (Added, Changed) and README.

### Task 6: cli — print the written numbers

**Files:**
- Modify: `packages/cli/src/export.ts` (~12-14: print `loss.written ?? loss.bar`), `packages/cli/src/import.ts` (~35-39: already prints `d.bar`, now a written number — doc comment only), `packages/cli/README.md` if it shows a bar-numbered example
- Test: `packages/cli/tests/` export and import command tests (add a pickup case to each)

**Interfaces:**
- Consumes: Task 5 `MidiLoss.written`; Task 3, 4 behaviour.

- [ ] **Step 1: Failing test:** `barmark export --midi` on a pickup chart with a lossy mark in the first full bar prints `chart.md: bar 1: warning: …`; with `D.C.` it prints `bar 1` twice.
- [ ] **Step 2: Run** `bun test packages/cli` — Expected: FAIL (`bar 2`).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun test` (whole repo), `bun run check`, `bun run fallow` — Expected: all green.
- [ ] **Step 5: Commit** `feat(cli): bar numbers in export and import messages follow the chart` with CHANGELOG (Changed).

## After the plan (controller, not a task)

Final whole-branch review on Fable 5.1, PR, merge; then the releases in the spec's order via RELEASING.md (barmark 0.22.0 → render 0.18.0, musicxml 0.8.0 → sync 0.3.0 → midi 0.3.0 → score patch → CLI minor → songs → site, the site also citing 2.4 in its `[2/4]` guide row, `site/src/lib/guide/rows.ts` ~149-169).
