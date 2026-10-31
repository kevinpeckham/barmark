# barmark chart parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `parseChart(text)` reads a whole `.chart.md` file into a document tree and the bars in play order. Every bar carries its key, meter, tempo, feel and section. Errors and warnings carry line numbers, and the parser never throws.

**Architecture:** Two stages.
1. **Read.** Each line is classified by its first characters into a typed document. A bar line with any error is left out of the document, and its diagnostics are kept.
2. **Expand.** The document is walked in written order: sections, replays, repeats and directives are applied, and the result is a flat sequence of events (bars, fermatas, open repeats).

Chords and note sets come from the existing `src/chords` module.

**Tech Stack:** Bun 1.3, TypeScript strict, `bun test`, Biome (tabs). No runtime dependencies.

**Spec:** `docs/grammar-v0.1-draft.md`, sections 1, 2, 5, 6, 7 and 9. The canonical printer (section 8) and timed output are later plans.

## Global Constraints

- The same toolchain and gates as the chord module: `bunx biome check .`, `bunx tsc` and `bun test` must all pass before every commit.
- No runtime dependencies. The published npm package (`index.js`, `package.json` `files`) is not changed.
- Parsers never throw on user input. Every problem is a `ChartDiagnostic` with a 1-based `line`.
- Conventional commits with **no attribution trailer**.
- Reuse `parseChord` and `parseNoteSet` from `src/chords/index.ts`. Never re-implement chord parsing.
- **Expansion is capped at `MAX_EXPANDED_BARS = 10_000` bars.** Past that, expansion stops with an error, because nested `x N` could otherwise multiply without bound.

## Decisions this plan makes (the spec is silent)

These are mine. Each one is tested.
1. **`%` copies the previous bar in written order, at the point where its section is defined.** A section therefore has fixed content wherever it's replayed. A `%` or `/` with no earlier bar anywhere in the written chart is an error.
2. **A repeat replays everything inside it, including directive lines.** Each pass re-reads them, and that applies to `x N`, brackets, replays and `## … x N` alike. A replay heading's own directive lines (for example `key: E` under `## Chorus`) apply first, then the replayed content.
3. **A bar line with any error is dropped whole**, as spec section 3 already says for unknown chords. Warnings never drop anything.
4. **A second `# ` title becomes text, with a warning.**
5. **`x1`, `x0` and a non-number are errors** (the spec says N ≥ 2). N above 8 is a warning.
6. **An open repeat inside another open repeat is an error.**
7. **Elision (`->`) removes the last bar of the replay's last pass.** If that pass ends in a fermata, the fermata stays and the bar before it goes.
8. **Directive values:**
   - `feel` values are matched case-insensitively, but `swing 16` must have exactly one space.
   - `key` accepts a root with one optional accidental, plus `m`, or plus a space and a mode word. Mode words are case-insensitive.
   - `tempo` is a positive number with an optional ` bpm`.
   - `time` is `n/d` with n from 1 to 32 and d in {2, 4, 8, 16}.
9. **Old-format warnings fire on text lines only.** The three kinds are:
   - `[Chorus]`, or `Chorus:` with nothing after the colon, suggests `## Chorus`.
   - A line of two or more whitespace-separated tokens that all parse as chords suggests the `| … |` form.
   - `meter:`, `bpm:`, `groove:` or `signature:` suggests the right directive.

## Review Focus

1. **Windows line endings, tabs and a leading byte-order mark** (`﻿`) must give the same result as clean LF text. Test in Task 3.
2. **A markdown table inside a `.chart.md` file** (`| Name | Part |`) is a bar line by spec. It should produce a clear error naming the first token that isn't a chord, not a crash or a silent drop. Test in Task 2.
3. **Repeat explosion:** `## A x 99999` holding `| D | x 99999` must return quickly with the cap error, not hang. Test in Task 4.
4. **An empty file, or a file of only text,** returns no bars and no errors. Test in Task 6.
5. **Unicode substitutes in structural marks:** `x …`, `→`, and `–`/`—` as silence, both inside groups and as whole cells. Test in Tasks 2 and 4.

---

## File structure

| File | Responsibility |
|---|---|
| `src/chart/types.ts` | all chart types (below) |
| `src/chart/directives.ts` | `parseDirectiveLine`, `parseMeter`, `beatsOf` |
| `src/chart/barLine.ts` | `parseBarLine`: cells, slots, groups, one-bar meter, marks, `x N` tail |
| `src/chart/document.ts` | `readDocument`: line classification, title, sections, text-line warnings |
| `src/chart/expand.ts` | `expand`: replays, repeats, directive state, `%`, elision, open repeats, fermatas, slot-count warnings, the cap |
| `src/chart/index.ts` | `parseChart` plus re-exports |
| `src/index.ts` | re-exports `src/chords` and `src/chart` |
| `tests/chart/*.test.ts` | one test file per source file, plus `parseChart.test.ts` |

## Types (`src/chart/types.ts`, written in Task 1, used by every task)

```ts
export type Severity = "error" | "warning";
export type ChartDiagnostic = { line: number; severity: Severity; message: string; token: string; suggestion?: string };

export type Meter = { n: number; d: number };
export type Mode = "major" | "minor" | "ionian" | "dorian" | "phrygian" | "lydian" | "mixolydian" | "aeolian" | "locrian";
export type Key = { tonic: string; mode: Mode };            // tonic spelled with ASCII #/b
export type Feel = "straight" | "swing" | "shuffle" | "swing 16";
export type Directives = { key?: Key; time?: Meter; tempo?: number; feel?: Feel };

export type SimpleSlot =
	| { kind: "chord"; chord: ChordRecord }               // chord symbol or note set (chord.kind tells)
	| { kind: "hold" } | { kind: "nc" } | { kind: "silence" } | { kind: "unknown" };
export type Slot = SimpleSlot | { kind: "group"; members: SimpleSlot[] };
export type Cell =
	| { kind: "slots"; meter: Meter | null; slots: Slot[] }   // meter = a [n/d] override
	| { kind: "simile" }                                      // %
	| { kind: "fermata" };                                    // ...
export type Repeat = number | "open" | null;

export type Line =
	| { kind: "title"; line: number; text: string }
	| { kind: "section"; line: number; name: string; repeat: Repeat; elided: boolean }
	| { kind: "directive"; line: number; set: Directives }
	| { kind: "bars"; line: number; opens: boolean; closes: boolean; cells: Cell[]; repeat: Repeat }
	| { kind: "text"; line: number; text: string };

export type PlayedBar = {
	index: number;              // 1-based measure number in play order; fermatas are not counted
	line: number;               // source line of the bar
	section: string | null;     // heading text of the section occurrence, as written
	meter: Meter; key: Key | null; tempo: number | null; feel: Feel;
	slots: Slot[];              // % resolved to the copied slots; holds stay holds
};
export type ChartEvent =
	| { kind: "bar"; bar: PlayedBar }
	| { kind: "fermata"; line: number }
	| { kind: "open"; line: number; events: ChartEvent[] };   // one pass shown; the number of passes is unknown
export type SectionOccurrence = { name: string; line: number; replayOf: number | null; firstBar: number; lastBar: number; elided: boolean };

export type ChartParse = {
	title: string | null;
	lines: Line[];
	events: ChartEvent[];
	bars: PlayedBar[];          // events flattened, with an open repeat's pass included once
	sections: SectionOccurrence[];
	diagnostics: ChartDiagnostic[];   // sorted by line, then errors before warnings
};
```

---

### Task 1: Types, meters and directive lines

**Files:**
- Create: `src/chart/types.ts`, `src/chart/directives.ts`, `tests/chart/directives.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `parseMeter(text: string): Meter | null`
  - `beatsOf(m: Meter): number`. When d = 8 and n is 6, 9 or 12 (compound), the result is n/3. Otherwise it's n.
  - `parseDirectiveLine(text: string, line: number): { set: Directives; diagnostics: ChartDiagnostic[] } | null`. It returns null when the text doesn't start with one of the four names followed by `:`, matched case-insensitively.
  - `DIRECTIVE_NAMES = ["key","time","tempo","feel"]`

- [ ] **Step 1: Write the failing tests:**
  - `parseMeter("4/4")` → `{n:4,d:4}`. `parseMeter("4/3")`, `("0/4")` and `("33/4")` → null.
  - `beatsOf` gives 4/4 → 4, 6/8 → 2, 12/8 → 4, 9/8 → 3, 7/8 → 7, 3/4 → 3.
  - `parseDirectiveLine("key: D, time: 4/4, tempo: 145, feel: swing", 3)` sets all four. The key is `{tonic:"D",mode:"major"}`, and there are no diagnostics.
  - Key forms:
    - `Bm` → B minor
    - `F#m` → F# minor
    - `B minor` → B minor
    - `A Mixolydian` → A mixolydian
    - `E♭` → Eb major
  - Tempo: `145 bpm` → 145. `TEMPO: 90` is accepted, because names are case-insensitive.
  - Errors, each with `line: 3` and `severity: "error"`: `time: 4/3`, `tempo: fast`, `feel: lazy`, `key: H`, and `key: D, bpm: 120` (the second part has an unknown name).
  - `parseDirectiveLine("Keys are hard", 1)` → null, because there's no colon after the name.
- [ ] **Step 2: Run** `bun test tests/chart/directives.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `types.ts` (exactly as above) and `directives.ts`.
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat(chart): types, meters and directive lines`.

### Task 2: Bar lines

**Files:**
- Create: `src/chart/barLine.ts`, `tests/chart/barLine.test.ts`

**Interfaces:**
- Consumes: `parseChord`, `parseNoteSet`, `parseMeter`, and the types.
- Produces: `parseBarLine(text: string, line: number): { bars: Extract<Line,{kind:"bars"}> | null; diagnostics: ChartDiagnostic[] }`. `bars` is null when there's any error.

Reading order:
1. Strip a tail matching `/\s*x\s*(\d+|\.\.\.|…)\s*$/` after the last `|`. A count must be ≥ 2, otherwise it's an error. `...` and `…` mean `"open"`, and a count above 8 is a warning.
2. Record a leading `|:` and a trailing `:|`. A `|:` or `:|` anywhere else, or `|` directly followed by a digit (`|1`, the endings syntax), is an error. The endings error message contains `"endings are not supported in v0.1"`.
3. If text remains after the last `|`, treat it as a final cell and warn `"missing trailing |"`.
4. Split cells on `|`. An all-whitespace cell is an error.
5. Inside a cell:
   - An optional `[n/d]` at the very start sets that bar's meter. A `[` anywhere else is an error.
   - Tokens split on whitespace, except inside `{…}`.
   - `%` alone, or `...`/`…` alone, becomes the simile or fermata cell. Either one next to other tokens is an error.
   - A token containing `_` is a group whose members split on `_`. A member can't be `%` or `...`, and an empty member is an error.
6. Each slot token:
   - `/` → hold.
   - `--`, `–` or `—` → silence. A lone `-` is an error with `suggestion: "--"`.
   - `?` → unknown, with a warning.
   - `/^n\.?c\.?$/i` → nc.
   - `{…}` → `parseNoteSet`.
   - Anything else → `parseChord`. A chord error becomes a chart error that keeps the chord diagnostic's `suggestion`, and chord warnings become chart warnings.

- [ ] **Step 1: Write the failing tests:**
  - `| D | A | Bm | G |` gives 4 cells of one chord slot each, with no marks and no repeat.
  - `| Am7 / / G7 |` gives slots chord, hold, hold, chord.
  - `| C / / D_E_F |` has a group with 3 chord members as its 4th slot.
  - `| [2/4] G |` → meter `{2,4}`. `| G [2/4] |` → error.
  - `| C G | % |` → cell 2 is the simile.
  - `| D | ... |` and `| D | … |` → cell 2 is the fermata. `| D ... |` → error.
  - `|: D | A :| x3` → opens, closes, repeat 3.
  - `| E7 | / | x ...` and `x …` → repeat `"open"`.
  - `| D | x1` → error. `| D | x9` → warning.
  - `| G -- -- -- |` → slots chord, then silence ×3. `– ` and `—` also give silence, and `G_–` gives a group with a silence member.
  - `| G - |` → error with suggestion `"--"`.
  - `| N.C. | NC | n.c. |` → nc ×3.
  - `| ? |` → a warning, and the bars aren't null.
  - `| {D E! G} |` → a chord slot whose `chord.kind === "notes"`.
  - `| D | | A |` → error, null.
  - `| D :| A |` → error.
  - `|1 D | A |` → error mentioning endings.
  - `| D | A` → a warning containing `"missing trailing |"`, with 2 cells.
  - `| D | Hm |` → error with `token: "Hm"`.
  - `| CM7 |` → error with `suggestion: "Cmaj7"`.
  - Review Focus 2: `| Name | Part |` → error with `token: "Name"`, and bars null.
- [ ] **Step 2: Run** `bun test tests/chart/barLine.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `parseBarLine`.
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat(chart): bar-line reader — cells, slots, groups, marks, repeats`.

### Task 3: Reading a document

**Files:**
- Create: `src/chart/document.ts`, `tests/chart/document.test.ts`

**Interfaces:**
- Consumes: `parseBarLine`, `parseDirectiveLine`, and `parseChord` (for the bare-chord-line warning).
- Produces: `readDocument(text: string): { title: string | null; lines: Line[]; diagnostics: ChartDiagnostic[] }`.

Rules:
1. Remove a leading `﻿` and split on `/\r?\n/`. Line numbers are 1-based and count every physical line.
2. Trim each line. Skip blank lines and lines starting with three backticks.
3. Classify each line in this order:
   - a line starting with `|` is a bar line
   - `# ` → the title. A second one becomes text with a warning.
   - `## ` → a section heading
   - `###` and deeper → text
   - `parseDirectiveLine` returning non-null → a directive line
   - anything else → text, run through the three old-format checks in Decisions 9
4. A heading's tail is read in this order:
   - an optional final `->` or `→`, which sets `elided`
   - then an optional ` x N` or ` x ...`, using the same rules as bar lines
   - the name is what remains, trimmed. An empty name is an error.

- [ ] **Step 1: Write the failing tests:**
  - The spec's "At a glance" example (copy it verbatim from the spec) reads to a title `"Example Song"`.
    - The sequence of `Line.kind` values matches the example line by line.
    - The diagnostics are exactly 1 warning: the `?` on the Bridge line.
  - `## Chorus x2 ->` → name `"Chorus"`, repeat 2, `elided` true. `## Chorus →` → elided. `## x2` → error.
  - Text-line warnings, with suggestions:
    - `[Chorus]` and `Chorus:` → `"## Chorus"`
    - `D A Bm G` → `"| D | A | Bm | G |"`
    - `bpm: 120` → `"tempo: 120"`
    - `Watch for the cutoff` → no warning
  - `### Notes` → text.
  - A second `# Title` → text plus a warning.
  - Review Focus 1: `"﻿# T\r\n\tkey: D\r\n| D |\r\n"` gives the same `lines` and diagnostics as `"# T\nkey: D\n| D |\n"`, and the line numbers match.
  - A fenced chart (a ```` ```barmark ```` fence around bar lines) reads the bars inside and ignores the fence lines.
- [ ] **Step 2: Run** `bun test tests/chart/document.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `readDocument`.
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat(chart): document reader — line classification, headings, text-line warnings`.

### Task 4: Expansion — sections, replays, repeats, directives, simile, elision

**Files:**
- Create: `src/chart/expand.ts`, `tests/chart/expand.test.ts`

**Interfaces:**
- Consumes: `Line[]` from Task 3, and `beatsOf`.
- Produces: `expand(lines: Line[]): { events: ChartEvent[]; sections: SectionOccurrence[]; diagnostics: ChartDiagnostic[] }`, plus `MAX_EXPANDED_BARS = 10_000`.

Algorithm (it isn't obvious, so here it is):
1. **Group lines into sections.** Each `## ` heading starts a section, and lines before the first heading form an unnamed section (name null). A section with at least one bar line is a **definition**.
2. **Handle replays.** A section with no bar lines is a **replay**: find the most recent earlier definition whose normalized name matches (lowercased, whitespace collapsed). If there isn't one, that's an error and the section contributes nothing. A `->` on a definition is an error.
3. **Resolve `%`** inside each definition, in written order (Decision 1). The slots are copied from the previous written bar, and a `%` that follows a fermata copies the bar before the fermata.
4. **Play each occurrence.**
   - A replay plays its own directive lines first, then the definition's lines.
   - The occurrence is played `repeat` times, or once inside an `open` event for `"open"`.
   - The lines are played in order, with a running directive state. A directive sets values for the next bar onward.
   - A bar line plays its cells, then repeats per its `repeat`.
   - `|:` marks a start, and `:|` replays from that start `repeat ?? 2` times in total, or as an open event.
   - An unpaired `:|`, or a `|:` still open when the section ends, is an error. The section's bars still play once.
5. **Emit bars.** Each cell becomes a `PlayedBar`, using the cell's `[n/d]` override or else the state's meter. A fermata cell becomes a fermata event.
6. **Elision** applies after the occurrence's passes (Decision 7).
7. **The cap.** Stop as soon as the next bar would exceed `MAX_EXPANDED_BARS`. Add an error with `token: "x"` and return what has been emitted so far.
8. `index` numbers bars 1..n in play order. A section occurrence records `firstBar` and `lastBar`.

- [ ] **Step 1: Write the failing tests** (in Task 4 the helper reads text with `readDocument`, expands it, and maps bars to compact strings such as `"D"` or `"C G"`):
  - **Replays:** `## V` / `| D | A |` / `## C` / `| G |` / `## V` plays `D A G D A`. The sections are V, C and V, and the last has `replayOf` set to the first V's line.
  - **Matching:** `## verse` replays `## Verse`. `## Verse 2` with no bars and no earlier `Verse 2` → error.
  - **Line repeat:** `| D | A | x2` → `D A D A`.
  - **Section repeat:** `## C x2` / `| G |` → `G G`.
  - **Brackets:** `|: D |` / `| A :| x3` → `D A D A D A`. A lone `| A :|` → error, and it plays `A` once.
  - **Directives:** `time: 4/4` / `| D |` / `time: 2/4` / `| G |` → the meters are 4/4 then 2/4. A `| D | [2/4] A | G |` line → 4/4, 2/4, 4/4.
  - **Replayed directives:** a replay heading followed by `key: E` sets key E on the replayed bars, while the earlier occurrence keeps key D (Decision 2).
  - **Simile:** `| C G | % |` → the second bar's slots are a copy of the first. A `%` on the first bar of a chart → error.
  - **Elision:** `## C` / `| G | D |` / `## C ->` / `## O` / `| A |` → `G D G A`, with the second C occurrence `elided: true`.
  - **Review Focus 3:** `## A x 99999` / `| D | x 99999` returns in under one second, with one error and exactly `MAX_EXPANDED_BARS` bars.
  - **Review Focus 5:** `## Out x …` is an open repeat.
- [ ] **Step 2: Run** `bun test tests/chart/expand.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `expand`, without open repeats, fermatas or slot warnings. Those are Task 5, so their tests come later.
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat(chart): play-order expansion — replays, repeats, directives, simile, elision`.

### Task 5: Open repeats, fermatas and slot-count warnings

**Files:**
- Modify: `src/chart/expand.ts`
- Test: `tests/chart/expand-open.test.ts`

**Interfaces:**
- Consumes and produces what Task 4 defined. `ChartEvent` `"open"` and `"fermata"` are now emitted.

Rules:
- `x ...` on a bar line, on `:|` or on a heading wraps one pass of its content in `{kind:"open"}`. An open inside an open is an error (Decision 6), and the inner one plays once.
- A fermata cell becomes a `fermata` event. It gets no `index`, and bars after it continue the count.
- The slot-count warning is emitted once per written cell, at the definition rather than once per pass. Let k be the number of top-level slots and b = `beatsOf(meter in force)`. Warn when `b % k !== 0 && k % b !== 0`, with a message containing `"uneven"`.

- [ ] **Step 1: Write the failing tests:**
  - `| D | A | x ...` → one open event holding 2 bars, and `bars` (flattened) has length 2.
  - `## Out x ...` holding `| D |` and `| D | x2` → one open event containing 3 bars.
  - An open inside an open (a section `x ...` holding a line `x ...`) → error.
  - `| D | ... |` → events bar, then fermata. The next bar's `index` is 2.
  - Peaceful Dreams outro: the last event is a fermata, and the bar count excludes it.
  - Slot warnings:
    - `| C D E |` in 4/4 → one warning containing `"uneven"`
    - `| C_D_E |` → none
    - `| C D E |` in 6/8 → warning (hemiola: 3 slots against 2 beats)
    - `| C D |` in 6/8 → none
    - `| C D E F G F |` in 6/8 → none
  - A line repeated `x4` with an uneven cell warns once, not four times.
- [ ] **Step 2: Run** `bun test tests/chart/expand-open.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat(chart): open repeats, fermatas and slot-count warnings`.

### Task 6: `parseChart` and whole-chart conformance

**Files:**
- Create: `src/chart/index.ts`, `src/index.ts`, `tests/chart/parseChart.test.ts`

**Interfaces:**
- Consumes: `readDocument`, `expand`.
- Produces:
  - `parseChart(text: string): ChartParse`. It merges the two stages' diagnostics, sorted by line and then errors before warnings. `bars` flattens `events`, including an open repeat's pass once.
  - `src/index.ts` re-exports everything from `./chords/index.js` and `./chart/index.js`.

- [ ] **Step 1: Write the failing tests:**
  - **`examples/peaceful-dreams.chart.md`:**
    - `title` is `"Peaceful Dreams"`, with no diagnostics.
    - `bars.length === 152`, from section bar counts of 20, 20, 8, 20, 8, 8, 20, 20, 8, 20.
    - The last event is a fermata.
    - Every bar has key D major, tempo 145, meter 4/4 and feel straight.
    - The `sections` names in order are `I Intro, II Verse, III Chorus, II Verse, III Chorus, IV Bridge, V Verse (Triads), II Verse, VI Interlude, VII Outro`. Their `firstBar` values, as `(firstBar − 1) × 240/145` seconds, land on the stem-bench start times within 0.01 s: 0, 33.10, 66.21, 79.45, 112.55, 125.79, 139.03, 172.14, 205.24, 218.48.
  - **The spec's "At a glance" example:**
    - The swing bridge has feel swing, and the outro is back to straight.
    - The `[2/4]` bar has meter 2/4.
    - The chorus's last bar holds G after the push.
    - There's exactly one diagnostic: the `?` warning.
  - **Review Focus 4:** `parseChart("")` and `parseChart("just words\nmore words")` → `bars: []`, `diagnostics: []`.
  - **Error isolation:** a chart with `| D | Hm |` on line 4 keeps every other bar. Its single error has `line: 4`, and `bars` doesn't contain line 4.
  - **No throw on fuzz:** 2,000 random strings from the alphabet `"|:x%/.-_{}[]!? \nABCDEFGm7#b259()N"`, with lengths up to 200. Every call returns a value, and each diagnostic's line is within 1 and the input's line count.
- [ ] **Step 2: Run** `bun test tests/chart/parseChart.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `parseChart` and both index files.
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat(chart): parseChart — whole-chart parse with Peaceful Dreams conformance`.
