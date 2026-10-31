# barmark chord module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested TypeScript module that turns one barmark chord symbol or note set into a record of root, intervals, spelled pitches, bass, canonical spelling and Harte label. It also converts Harte labels back to barmark, proven by a round trip over the CC0 McGill Billboard corpus.

**Architecture:** Appendix A lives as one data module (`vocabulary.ts`) that the parser, the printer and the Harte converter all read. Interval arithmetic and pitch spelling sit in their own module. Parsing a symbol returns a result type, never throws, and carries diagnostics that later tasks reuse for the chart parser.

**Tech Stack:** Bun 1.3, TypeScript strict, `bun test`, Biome (tabs). No runtime dependencies.

**Spec:** `docs/grammar-v0.1-draft.md`, sections 3 and 4 and Appendix A. Read them before starting. Every value below comes from there.

## Global Constraints

- Bun + TypeScript strict. Copy the tsconfig options verbatim from `../stem-bench/tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noEmit`), with `include: ["src", "scripts", "tests"]`.
- Biome with tab indentation. Commits must pass `bunx biome check .`, `bunx tsc`, and `bun test`.
- No runtime dependencies. Dev dependencies only: `typescript`, `@biomejs/biome`, `@types/bun`.
- **Do not change the published npm package in this plan.** `package.json` `files`, `main` and `index.js` stay as they are. The new code lives in `src/` and is not shipped yet.
- Parsers never throw on user input. They return `{ ok: false, error }`.
- Canonical spellings use ASCII `#` and `b`. The output never contains ♯, ♭ or 𝄫.
- The Beatles annotations have no license. Never commit them or anything derived from them. Billboard is CC0, so a derived fixture may be committed.
- Conventional commits with no attribution trailer.

## Review Focus

1. **Unicode input** from phones and editors (`C♯m7♭5`, `CΔ7`, `C°7`, `Cø`) is normalized, not rejected. Test in Task 3.
2. **A root's accidental versus an alteration:** `Ab5` is the A♭ power chord, `Bb7b9` is B♭7(♭9), and `Cb9` is C♭9. Test in Task 2.
3. **Slash ambiguity:** `C6/9` is a chord, `Cm6/9/E` is a 6/9 chord with E in the bass, and `C/E/G` is an error. Test in Task 2.
4. **Deep accidentals in spelling:** `Cbdim7` spells its ♭♭7 as `Bbbb`, and `B#aug` spells its ♯5 as `F###`. Spelling must not wrap or collapse to an enharmonic. Test in Task 1.
5. **Near-miss input gets a suggestion, not a bare error:** `cm7` → `Cm7`, `CM7` → `Cmaj7`, `C2` → `Csus2 or C(9)`. Test in Task 3.

---

## File structure

| File | Responsibility |
|---|---|
| `src/chords/types.ts` | `Interval`, `ChordRecord`, `Diagnostic`, `ParseResult` |
| `src/chords/intervals.ts` | parsing interval strings, transposing spelled notes, interval keys |
| `src/chords/vocabulary.ts` | Appendix A as data: qualities, extensions, valid combinations, tones, aliases, rejections, Harte shorthands, `enumerateSuffixes()` |
| `src/chords/parse.ts` | `parseChord(symbol)` |
| `src/chords/print.ts` | `printChord(parts)` canonical form |
| `src/chords/noteSet.ts` | `parseNoteSet(text)` for `{...}` |
| `src/chords/harte.ts` | `toHarte(record)`, `parseHarte(label)`, `harteToBarmark(label)` |
| `src/chords/index.ts` | re-exports |
| `scripts/extract-billboard-labels.ts` | builds the committed CC0 fixture from a local Billboard download |
| `scripts/corpus-roundtrip.ts` | report-only run over a local Isophonics download (nothing committed) |
| `tests/chords/*.test.ts` | one test file per source module |
| `tests/fixtures/billboard-labels.json` | `{ label: count }` from Billboard (CC0) |

---

### Task 1: Scaffolding, types and interval arithmetic

**Files:**
- Create: `tsconfig.json`, `biome.json`, `src/chords/types.ts`, `src/chords/intervals.ts`, `tests/chords/intervals.test.ts`
- Modify: `package.json` (add `devDependencies`, plus scripts `"test": "bun test"`, `"check": "biome check . && tsc"`)

**Interfaces:**
- Produces:
  - `type Interval = { degree: number; alter: number }`. `degree` is 1–13 as written (2 and 9 stay distinct). `alter` is semitones from the major/perfect degree: `b3` is `{3,-1}`, `bb7` is `{7,-2}`.
  - `parseInterval(s: string): Interval | null` and `formatInterval(i: Interval): string`, which use Harte-style strings (`"1"`, `"b3"`, `"#11"`, `"bb7"`).
  - `transpose(root: string, i: Interval): string`. It spells the note on the letter `degree - 1` steps above the root's letter, with as many `#` or `b` as needed.
  - `intervalKey(i: Interval): string`, the spelled pitch class relative to the root: `` `${(degree-1)%7}:${semitones mod 12}` ``, so `2` and `9` share a key while `b3` and `#9` differ.
  - `noteSemitone(note: string): number` (C = 0) and `intervalBetween(from: string, to: string): Interval`. Both are needed by note sets and Harte.
  - `type Diagnostic = { message: string; token: string; suggestion?: string }`
  - `type ChordRecord = { kind: "chord" | "notes"; source: string; canonical: string; root: string | null; intervals: Interval[]; pitches: string[]; bass: string; alteredOpen: boolean; harte: string }`. `pitches` is spelled with octaves for note sets that have them. `bass` is spelled without an octave.
  - `type ParseResult = { ok: true; value: ChordRecord; warnings: Diagnostic[] } | { ok: false; error: Diagnostic }`

- [ ] **Step 1: Scaffold.** Run `bun add -d typescript @biomejs/biome @types/bun`. Write `tsconfig.json` as the Global Constraints describe, and `biome.json` with `formatter.indentStyle: "tab"`. Expected: `bunx tsc` exits 0 on an empty `src/`.
- [ ] **Step 2: Write the failing tests** in `tests/chords/intervals.test.ts`:
  - `parseInterval("b3")` → `{degree:3, alter:-1}`. `parseInterval("#11")` → `{11,1}`. `parseInterval("bb7")` → `{7,-2}`. `parseInterval("x")` → `null`. Round trip: `formatInterval(parseInterval(s)!) === s` for each of `["1","b3","3","#5","bb7","b9","#11","13"]`.
  - `transpose("C", b3)` = `"Eb"`. `transpose("Bb", b3)` = `"Db"` (not `C#`). `transpose("F#", 3)` = `"A#"`. `transpose("Cb", bb7)` = `"Bbbb"`. `transpose("B#", #5)` = `"F###"`. `transpose("D", 9)` = `"E"`.
  - `intervalKey(9) === intervalKey(2)`. `intervalKey(b3) !== intervalKey(#9)`.
  - `intervalBetween("C", "F#")` → `{4,1}` (#4).
- [ ] **Step 3: Run** `bun test tests/chords/intervals.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 4: Implement `src/chords/types.ts` and `src/chords/intervals.ts`.** The major/perfect semitones per step are `[0,2,4,5,7,9,11]`.
- [ ] **Step 5: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 6: Commit** with `chore: TypeScript/Biome scaffolding and chord interval arithmetic`.

### Task 2: Vocabulary and core chord parsing

**Files:**
- Create: `src/chords/vocabulary.ts`, `src/chords/parse.ts`, `src/chords/print.ts`, `tests/chords/parse.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `parseInterval`, `transpose`.
- Produces:
  - `vocabulary.ts` exports:
    - `QUALITIES` (`"" "m" "dim" "aug" "5"` → base intervals)
    - `EXTENSIONS` (`6 6/9 7 maj7 9 maj9 11 13 maj13 7alt` → added intervals)
    - `VALID_EXTENSIONS: Record<quality, extension[]>` and `SUS_ALLOWED_WITH` (Appendix A.3)
    - `TONES` = `["2","4","6","7","9","11","13","b5","#5","b9","#9","#11","b13"]`, where tone `7` means interval `b7`
    - `chordIntervals(parts: ChordParts): { intervals: Interval[]; warnings: Diagnostic[] } | Diagnostic`
  - `type ChordParts = { root: string; quality: string; extension: string | null; sus: "sus2" | "sus4" | null; tones: string[]; bass: string | null }`
  - `parseChord(symbol: string): ParseResult` in `parse.ts`
  - `printChord(parts: ChordParts): string` in `print.ts`. It prints root + quality + extension + sus + `(tones)` + `/bass`, with tones sorted by degree and then alteration (`b` before natural before `#`).

`chordIntervals` applies these rules in this order. They are all in Appendix A.2:
1. Start from the quality's base.
2. Add the extension's intervals. `7` on `dim` adds `bb7`. `7alt` adds `b7` and removes `5`, and the record gets `alteredOpen: true`.
3. The eleventh rule: `11` on the major quality removes the `3`, and `13` on `m` also adds `11`.
4. `sus2`/`sus4` replaces the third with `2`/`4`.
5. Tones: an altered tone replaces the natural tone of the same number if present, otherwise it adds. A natural tone the chord already has is a warning: `"C7(7) already contains 7"`.

The tokenizer reads, after the root: `"6/9"` before any `/bass` split. Then `maj`-prefixed extensions before the quality `m`, so `Cmaj7` is never m + aj7. Then an inline alteration run (`[b#](5|9|11|13)`, repeated), but only directly after an extension. Then `sus`. Then a parenthesis. Then `/root`. A second `/` is an error.

- [ ] **Step 1: Write the failing tests.** In `tests/chords/parse.test.ts`, write a table test over every row of Appendix A.4, asserting `pitches` and `canonical`. Copy the spec's exact values, for example:
  - `["Cdim7", ["C","Eb","Gb","Bbb"]]`
  - `["C11", ["C","G","Bb","D","F"]]`
  - `["C13", ["C","E","G","Bb","D","A"]]`
  - `["Cm13", ["C","Eb","G","Bb","D","F","A"]]`
  - `["C7alt", ["C","E","Bb"]]` with `alteredOpen === true`
  - `["C/Bb", ["C","E","G","Bb"]]` with `bass === "Bb"`

  Order `pitches` as root first, then by interval degree, with a slash bass not already present appended last. Add these separate tests:
  - `Ab5` → root `Ab`, pitches `["Ab","Eb"]`
  - `Bb7b9` → canonical `Bb7(b9)`
  - `Cb9` → root `Cb`, a ninth chord
  - `Am7(b5)` → `["A","C","Eb","G"]`, with no natural 5
  - `C13(b9)` → no natural 9
  - `C6/9` → pitches `["C","E","G","A","D"]` and no bass
  - `Cm6/9/E` → bass `E`
  - `C/E/G` → error
  - `Cdim9` → error naming the combination
  - `Cm7sus4` → error
  - `C7(7)` → ok, with one warning
- [ ] **Step 2: Run** `bun test tests/chords/parse.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `vocabulary.ts`, then `parseChord` and `printChord`. Fill `harte: ""` for now (Task 5 fills it) and `kind: "chord"`.
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat(chords): Appendix A vocabulary and chord-symbol parser`.

### Task 3: Aliases, rejections and Unicode

**Files:**
- Modify: `src/chords/vocabulary.ts` (add `ALIASES` and `REJECTIONS`), `src/chords/parse.ts` (normalize before tokenizing)
- Test: `tests/chords/aliases.test.ts`

**Interfaces:**
- Consumes: `parseChord` from Task 2.
- Produces: `normalizeSymbol(symbol: string): { text: string } | Diagnostic` in `parse.ts`, which `parseChord` calls first.

The normalization order is fixed, because later rules depend on earlier ones:
1. `♯`→`#` and `♭`→`b`.
2. `Δ7`/`Δ`→`maj7`, `ø7`/`ø`→`m7(b5)`, `°7`→`dim7`, `°`→`dim`, `+7`→`aug7`, `+`→`aug`.
3. `minmaj7`/`m(maj7)`→`mmaj7`, `Maj7`/`ma7`→`maj7`, `min`→`m`.
4. `-` directly after the root → `m`.
5. A bare `maj` at the end → nothing.
6. `sus` not followed by `2`/`4` → `sus4`.
7. `add(2|4|9|11)` → `(n)`, merged into any existing parenthesis.

Rejections are checked before aliases:
- A lowercase root letter → suggestion: the same symbol with the root uppercased.
- `H` as root → suggestion `B…`.
- A doubled accidental on the root (`Cbb`, `F##`) → suggestion: the enharmonic single-accidental root.
- `M` directly after the root and not followed by `aj` → suggestion `maj7` (`CM7`→`Cmaj7`, `CM`→`C`).
- `2` or `4` directly after the root/quality with no extension → suggestion `"Csus2 or C(9)"` or `"Csus4 or C(11)"`.

- [ ] **Step 1: Write the failing tests:**
  - Every row of A.5 maps to its canonical, for example `C-7`→`Cm7`, `Cmaj`→`C`, `C°7`→`Cdim7`, `Cø`→`Cm7(b5)`, `Cadd9`→`C(9)`, `Cm(maj7)`→`Cmmaj7`, `C7b9`→`C7(b9)`.
  - `C♯m7♭5`→`C#m7(b5)` and `CΔ7`→`Cmaj7`.
  - Every row of A.6 returns `ok:false` with the exact suggestion above, for example `cm7`→`"Cm7"`, `CM7`→`"Cmaj7"`, `Cbb`→`"Bb"`, `H7`→`"B7"`, `C2`→`"Csus2 or C(9)"`.
  - Idempotence: `parseChord(r.value.canonical).value.canonical === r.value.canonical` for all A.4 and A.5 symbols.
- [ ] **Step 2: Run** `bun test tests/chords/aliases.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `ALIASES`, `REJECTIONS` and `normalizeSymbol`.
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat(chords): aliases, Unicode normalization, rejections with suggestions`.

### Task 4: Note sets

**Files:**
- Create: `src/chords/noteSet.ts`, `tests/chords/noteSet.test.ts`

**Interfaces:**
- Consumes: `noteSemitone`, `intervalBetween`, `Diagnostic`, `ParseResult`.
- Produces: `parseNoteSet(text: string): ParseResult`. `text` includes the braces. The result has `kind: "notes"`, `root` set to the `!` note or `null`, `bass` set to the first note, `pitches` as written (octaves kept), and `intervals` measured from `root ?? bass`.

Rules, from spec section 4:
- Notes are separated by spaces. Each note is `[A-G](#|b)*` plus an optional octave 0–8 plus an optional `!`. ♯ and ♭ are accepted.
- At most one `!`.
- Either every note has an octave or none does.
- With octaves: if the notes are out of ascending pitch order, warn. Canonical prints them ascending, and pitch is `noteSemitone + 12*octave`, with the octave belonging to the letter.
- Without octaves: a repeated note is a warning.
- Canonical form: `{` + notes joined by single spaces + `}`.

- [ ] **Step 1: Write the failing tests:**
  - `{E}` → `bass "E"`, `root null`.
  - `{D E! G}` → `root "E"`, `bass "D"`, intervals from E = `["1","b3","b7"]`.
  - `{C3 G3 E4}` → ok with no warnings. `{E4 C3}` → warning, and canonical `{C3 E4}`.
  - `B#3` sorts as C4: `{B#3 C#4}` → no warning.
  - Errors: `{}`, `{E2 B}` (mixed octaves), `{E9}` (out of range), `{D! E!}` (two roots), `{X}`.
  - Warning: `{E E}`.
- [ ] **Step 2: Run** `bun test tests/chords/noteSet.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `parseNoteSet`.
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat(chords): brace note sets with octaves and root mark`.

### Task 5: Harte output

**Files:**
- Create: `src/chords/harte.ts`, `tests/chords/harte.test.ts`
- Modify: `src/chords/parse.ts` and `src/chords/noteSet.ts` to fill `harte` via `toHarte`, and `src/chords/vocabulary.ts` to add `HARTE_SHORTHANDS`
- Modify: `docs/grammar-v0.1-draft.md` Appendix A.7, changing the example `C:(3,#4,7)` to `C:1(3,#4,7)` (the corpus convention for rootless lists)

**Interfaces:**
- Consumes: `ChordRecord`, interval helpers.
- Produces:
  - `HARTE_SHORTHANDS`: an ordered list of `[name, intervals]` with Harte's own definitions: `maj`, `min`, `dim`, `aug`, `maj7`, `min7`, `7`, `dim7`, `hdim7`, `minmaj7`, `maj6`, `min6`, `9`, `maj9`, `min9`, `sus2`, `sus4`, `11` (1 3 5 b7 9 11), `min11`, `13` (1 3 5 b7 9 11 13), `min13`, `maj13` (1 3 5 7 9 11 13), `5` (1 5), `1` (1).
  - `toHarte(r: ChordRecord): string`.

Algorithm (the tests fix it, but it isn't obvious):
1. The Harte root is `r.root ?? r.bass`.
2. Choose the shorthand with the most intervals whose interval keys are all in the chord. Break ties by list order.
3. The rest become the parenthesized additions, sorted by degree.
4. Append `/<interval of the bass from the root>` when the bass is not the root.
5. Always write the shorthand explicitly (`C:maj`, never a bare `C`).

- [ ] **Step 1: Write the failing tests:**
  - `C`→`C:maj`, `Am7`→`A:min7`, `Bm7(b5)`→`B:hdim7`, `C7(b9)`→`C:7(b9)`
  - `C/E`→`C:maj/3`, `C13`→`C:9(13)` (barmark's 13 has no 11), `C7alt`→`C:1(3,b7)`
  - `{E}`→`E:1`, `{D E! G}`→`E:1(b3,b7)/b7`, `{C E F# B}`→`C:1(3,#4,7)`
- [ ] **Step 2: Run** `bun test tests/chords/harte.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `toHarte` and wire it into both parsers. Edit the spec line.
- [ ] **Step 4: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass, including every earlier test.
- [ ] **Step 5: Commit** with `feat(chords): Harte label output`.

### Task 6: Harte input, converter and the corpus round trip

**Files:**
- Modify: `src/chords/harte.ts`, `src/chords/vocabulary.ts` (add `enumerateSuffixes()`)
- Create: `src/chords/index.ts`, `scripts/extract-billboard-labels.ts`, `scripts/corpus-roundtrip.ts`, `tests/fixtures/billboard-labels.json`, `tests/chords/roundtrip.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `parseHarte(label: string): { root: string; intervals: Interval[]; bass: string } | "N" | "X" | null`. It parses `root(:shorthand)?(\(list\))?(/bass)?`, where a list item `*x` omits `x`.
    - A shorthand takes its **barmark-intended** meaning, so annotators' `13` means barmark `13`. The map is: maj→``, min→`m`, dim, aug, maj7, min7→`m7`, 7, dim7, hdim7→`m7(b5)`, minmaj7→`mmaj7`, maj6→`6`, min6→`m6`, 9, maj9, min9→`m9`, sus2, sus4, 11, min11→`m11`, 13, min13→`m13`, maj13, 5. `1` is the root alone, and an empty shorthand means nothing but the list.
  - `enumerateSuffixes(): Map<string, string>`. It maps a sorted, `|`-joined `intervalKey` set to the shortest canonical suffix, breaking ties lexicographically. It covers every valid quality × extension × sus combination, with up to 3 tones from `TONES`, skipping combinations with warnings. Compute it once and cache it.
  - `harteToBarmark(label: string): string`:
    - `N` → `N.C.` and `X` → `?`.
    - If the root sounds and the spelled set is in `enumerateSuffixes()`, return `root + suffix`, plus `/bass` when the bass differs from the root.
    - Otherwise return a note set: the bass first, then the other notes in interval-degree order, with `!` on the root only when the root sounds and isn't the bass.
    - Never respell enharmonically.
  - `src/chords/index.ts` re-exports `parseChord`, `parseNoteSet`, `printChord`, `toHarte`, `parseHarte`, `harteToBarmark` and the types.

- [ ] **Step 1: Build the fixture.** `scripts/extract-billboard-labels.ts <billboard-dir>` reads every `*/salami_chords.txt`. For each `|`-delimited cell it keeps the tokens that match `^([A-G][#b]*(:[^\s/]*)?(/[#b]*\d+)?|N|X)$`, and writes `tests/fixtures/billboard-labels.json` as `{ "source": "McGill Billboard 2.0 salami_chords (CC0)", "labels": { label: count } }`. Run it against `/tmp/claude-1000/-home-exedev-projects-barmark/b9e2ce65-505f-4adc-b8af-ff831103312c/scratchpad/dl/billboard/x/McGill-Billboard`, or a fresh download from the mirdata URL with MD5 `6954a6fad962a111e69c9c80cb87d3a5`. Expected: about 1,000 distinct labels totalling 113,780.
- [ ] **Step 2: Write the failing tests** in `tests/chords/roundtrip.test.ts`:
  - Unit cases:
    - `harteToBarmark("A:sus4(b7,9)")` → `A9sus4`
    - `("E:1")` → `{E}`
    - `("E:1(b3,b7)/b7")` → `{D E! G}`
    - `("D:maj(*1)/#1")` → a note set with no `!`
    - `("Eb:maj7(#5)")` → a note set containing both `Bb` and `B`
    - `("N")` → `N.C.`
  - Corpus, for every label in the fixture:
    - The output parses as `ok` with `parseChord` or `parseNoteSet`.
    - The parsed pitches' spelled pitch classes equal the `parseHarte` set transposed from its root. Assert 100%.
    - The named-chord share, weighted by count and excluding `N`/`X`, is at least `0.96`. The survey measured 96.65%.
- [ ] **Step 3: Run** `bun test tests/chords/roundtrip.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `parseHarte`, `enumerateSuffixes`, `harteToBarmark` and `index.ts`.
- [ ] **Step 5: Run** `bun test && bunx tsc && bunx biome check .`. Expected: all pass. Print the measured share in the test name or output, and note it in the commit body.
- [ ] **Step 6: Write the report-only script.** `scripts/corpus-roundtrip.ts <isophonics-dir>` reads `chordlab/**/*.lab` (third column) and prints the same two measures for the Beatles. Run it against the scratchpad copy. Expected: 100% pitch equality, and a named share of about 96%, measured as 96.32% including N. Commit the script only, never the output data.
- [ ] **Step 7: Commit** with `feat(chords): Harte input and converter; Billboard round trip at 100% pitch fidelity`.
