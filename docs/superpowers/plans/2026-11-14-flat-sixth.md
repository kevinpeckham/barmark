# The flat sixth, `add` before any tone, and `Δ9`: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `F#m(b6)`, `F#maddb6`, `Cadd13`, `Cm7b6` and `DΔ9/F#` read, each printing one canonical form, and what stays refused says what to write.

**Architecture:** One new entry in the parser's tone list (`b6`); the `add` aliases generated from that list rather than written for four tones; suggestions carried by the tone error; two alias rows for the delta. Every other package reads chords through intervals and needs tests, not code.

**Tech Stack:** TypeScript, Bun (`bun test`), Biome, Fallow.

**Spec:** `docs/superpowers/specs/2026-11-14-flat-sixth-design.md`

## Global Constraints

- The grammar draft `docs/grammar-v0.1-draft.md` is the binding authority and changes in the same commit as the parser: section 3 (the parentheses rule, alterations without parentheses, stacked spellings), Appendix A.1, A.5, A.6, and three new rows at the end of the decisions log (the flat sixth, 2026-11-13; `add` before any tone, 2026-11-14, superseding the 2026-11-02 row, which stays as history with "superseded 2026-11-14" added; `Δ9` and `Δ13`, 2026-11-14), each "Decided by Kevin".
- No chart that reads today changes meaning: every existing test passes unchanged except the three named in Task 1 that held `add13` and `add#11` refused.
- Parsers never throw on user input; every problem is a diagnostic. An error's `suggestion` is offered only when the suggested symbol itself reads.
- `♭` and `♯` are accepted wherever `b` and `#` are (they already are, before parsing).
- The tones a parenthesis can add, in the list's order after this change: `2 4 6 7 9 11 13 b5 #5 b6 b9 #9 #11 b13`.
- Test first; `bun run fallow` stays clean without growing the baseline; a CHANGELOG entry under `[Unreleased]` for every user-visible change; conventional commits with no AI trailer.

## Review Focus

1. **A root's own accidental.** `Cb6` is the C♭ sixth chord and `Ab6`, `Bb6`, `Eb6`, `Gb6`, `Db6` are sixth chords on flat roots, today and after: never a flat sixth. `Cbadd9`, `Abaddb6` (A♭ with an added flat sixth) and `Bbadd#11` read with the root's flat.
2. **`add` beside its neighbours.** `Cadd9` and the other three still read exactly as before; `Cadd` alone, `Cadd5`, `Cadd3`, `Cadd14`, `Caddb2`, `Cadd9x` and `C(add)` are errors and never hang; `Csus4add9`, `Cm7add11`, `Cadd9add13` and `Cadd13(b9)` do what `add9` does in those positions today.
3. **Linear time.** A parenthesis of 5,000 run-together items (`addb6` repeated, `add#11` repeated, `b6` repeated) reads in time proportional to its length, as `stacked.test.ts`'s existing shapes do.
4. **Suggestions that would not read are not offered.** `C5(b2)` (a power chord takes no `b9`? check what reads), `C6(b7)`, `Cdim(#4)`: each either suggests a symbol that parses or suggests nothing.
5. **Names from notes are unchanged.** For every three- and four-note set in every key, `nameNotes` gives what it gave before (compare against the base commit, not only the existing assertions).

---

### Task 1: The parser and the grammar

**Files:**
- Modify: `packages/barmark/src/chords/vocabulary.ts` (`TONES` :63, `ALIASES` :138-151), `parse.ts` (`INLINE_ALTERATION` :29, `toneProblem` :90-97, `readParts` :100-105, `BARE_ADD` :152, the `(addN)` rewrite :172-173, `parseChord` :198-208), `stacked.ts` (`ITEM` :11, `ITEM_START` :13, and a suggestion beside `alteredFifth` :104-146), `name.ts` (`PLAIN_TONES` :97)
- Modify: `docs/grammar-v0.1-draft.md`, `packages/barmark/CHANGELOG.md`, `packages/barmark/README.md` only if it lists the tones or the `add` aliases
- Test: `packages/barmark/tests/chords/flat-sixth.test.ts` (new), `aliases.test.ts` (:104-121 turned over), `stacked.test.ts` (:122-125 turned over), `name.test.ts`

**Interfaces:**
- Consumes: `toneInterval(tone)` (`vocabulary.ts:69`), `parseInterval` (already reads `b6`), `Diagnostic = { message; token; suggestion? }` (`types.ts:5`).
- Produces: `TONES` with `b6`; `parseChord` and `harteToBarmark` reading the tables below. Task 2 relies on `parseChord("F#m(b6)")` giving `canonical: "F#m(b6)"`, `pitches: ["F#","A","C#","D"]`, `harte: "F#:min(b6)"`.

- [ ] **Step 1: Write the failing tests.** In `flat-sixth.test.ts`, one `test.each` per table. Reads (input, canonical, pitches, Harte label):

| Input | Canonical | Pitches | Harte |
|---|---|---|---|
| `F#m(b6)` | `F#m(b6)` | F# A C# D | `F#:min(b6)` |
| `F#m(♭6)` | `F#m(b6)` | F# A C# D | `F#:min(b6)` |
| `F#maddb6` | `F#m(b6)` | F# A C# D | `F#:min(b6)` |
| `F#m(addb6)` | `F#m(b6)` | F# A C# D | `F#:min(b6)` |
| `F#maddb13` | `F#m(b13)` | F# A C# D | `F#:min(b13)` |
| `F#m(addb13)` | `F#m(b13)` | F# A C# D | `F#:min(b13)` |
| `F#m7b6` | `F#m7(b6)` | F# A C# E D | `F#:min7(b6)` |
| `F#m7b13` | `F#m7(b13)` | F# A C# E D | `F#:min7(b13)` |
| `C(b6)` | `C(b6)` | C E G Ab | `C:maj(b6)` |
| `C6(b6)` | `C6(b6)` | C E G Ab | (whatever `toHarte` gives; assert it converts back to the same pitches) |
| `C13(b6)` | `C13(b6)` | C E G Bb D A Ab | (round trip, as above) |
| `C(9,b6)` | `C(b6,9)` | C E G Ab D | `C:maj(b6,9)` |
| `C(b6,#5)` | `C(#5,b6)` | C E G# Ab | (round trip) |
| `Abaddb6` | `Ab(b6)` | Ab C Eb Fb | (round trip) |
| `Cb6` | `Cb6` | Cb Eb Gb Ab | `Cb:maj6` |
| `Cadd13` | `C(13)` | C E G A | `C:maj6` |
| `C(add13)` | `C(13)` | C E G A | `C:maj6` |
| `Cadd#11` | `C(#11)` | C E G F# | `C:maj(#11)` |
| `C(add#11)` | `C(#11)` | C E G F# | `C:maj(#11)` |
| `Caddb9` | `C(b9)` | C E G Db | `C:maj(b9)` |
| `Cadd6` | `C(6)` | C E G A | `C:maj6` |
| `Cadd7` | `C(7)` | C E G Bb | `C:7` |
| `Am(b9,add13)` | `Am(b9,13)` | A C E Bb F# | (round trip) |
| `Cm7add13` | `Cm7(13)` | C Eb G Bb A | (round trip) |
| `Bbadd#11` | `Bb(#11)` | Bb D F E | (round trip) |
| `CΔ9` | `Cmaj9` | C E G B D | `C:maj9` |
| `CΔ13` | `Cmaj13` | C E G B D A | `C:maj13` |
| `DΔ9/F#` | `Dmaj9/F#` | D F# A C# E (bass F#) | `D:maj9/3` |
| `CΔ9(#11)` | `Cmaj9(#11)` | C E G B D F# | (round trip) |
| `CΔ9#11` | `Cmaj9(#11)` | C E G B D F# | (round trip) |
| `CΔ`, `CΔ7` | `Cmaj7` | C E G B | `C:maj7` (unchanged) |

  Where a pitch spelling in this table disagrees with what the parser's own spelling rule gives (the root's letter decides), the parser's rule wins: say so in the report and fix the table's row in the test, never the rule.

  Warnings: `C(b6,b13)` reads with pitches C E G Ab and one warning containing "already contains"; `D6(omit5addb6)` reads as `D6(b6,no5)` and `C(omit5add13)` as `C(13,no5)`, each with the stacked-spelling warning that `D6(omit5add9)` gives today.

  Refused (input, message contains, suggestion):

| Input | Message contains | Suggestion |
|---|---|---|
| `F#m(b2)` | `"b2" is not a tone a parenthesis can add` | `F#m(b9)` |
| `C(#2)` | `"#2" is not a tone` | `C(#9)` |
| `C(#4)` | `"#4" is not a tone` | `C(#11)` |
| `C(b7)` | `"b7" is not a tone` | `C(7)` |
| `C7(b2,#4)` | `"b2" is not a tone` | `C7(b9,#11)` |
| `C(b2,x)` | `is not a tone` | none (the rewritten symbol would not read) |
| `Cmb6` | (the existing "cannot read" form) | `Cm(b6)` |
| `Cmb13` | (existing) | `Cm(b13)` |
| `Cmb9` | (existing) | `Cm(b9)` |
| `CΔ11` | (existing) | none |
| `Cadd5`, `Cadd3`, `Cadd14`, `Caddb2`, `Cadd`, `C(add)`, `Cadd9x` | (existing forms) | none, except `Caddb2` → `C(b9)` if it falls out of the tone suggestion; assert what the design's rule gives |

  Harte in: `harteToBarmark("C:min(b6)")` is `"Cm(b6)"`; `"C:min(b13)"` is `"Cm(b13)"`; `"C:maj(b6)"` is `"C(b6)"`; `"C:min7(b6)"` is `"Cm7(b6)"`.

  Turn over, on purpose: `aliases.test.ts:104-121` (now `C(add13)`, `C(add#11)` and `Am(b9,add13)` read; keep `C(add9x)` refused; decide `Cm7(add13)add9` from the table above: a bare `add` after a parenthesis is what it was) and `stacked.test.ts:122-125`.

  Review Focus tests: the flat-root sixth chords (`Ab6`, `Bb6`, `Eb6`, `Gb6`, `Db6`, `Cb6` read as sixth chords, canonical unchanged); the `add` neighbours of Review Focus 2, each compared with what `add9` does in the same position today (run the base behaviour first and write the expectation from it); the 5,000-item parentheses in `stacked.test.ts`'s linear-time form; Review Focus 4's three symbols; and for Review Focus 5 a test that names every three- and four-note set in 16 keys with `nameNotes` and compares the whole result with a digest computed from the base commit (compute it once before touching `src/`, by running the same loop, and write the digest into the test with a comment naming the base commit; if the existing exhaustive tests in `name.test.ts` already pin every name, say so and add nothing).

- [ ] **Step 2: Run them and save the failing output.**

Run: `bun test packages/barmark/tests/chords/flat-sixth.test.ts`
Expected: FAIL, the first on `"b6" is not a tone a parenthesis can add`.

- [ ] **Step 3: Implement.**
  - `TONES` gains `"b6"` after `"#5"`. `INLINE_ALTERATION` gains `b6`.
  - The `add` aliases come from `TONES`: build the alternation once from the list, longest spelling first (so `#11` and `b13` win over `11` and `13`, and `13` over `1…`), and use it for `BARE_ADD`, for the `(addN)` rewrite, and in `stacked.ts`'s `ITEM`; `ITEM_START` must not split `addb6` or `add#11` after `add`.
  - `PLAIN_TONES` gains `"b6"`, so `nameNotes` still prefers `(b13)`.
  - `toneProblem` (or `readParts`) carries a suggestion: the symbol with each refused tone that has a counterpart replaced (`b2`→`b9`, `#2`→`#9`, `#4`→`#11`, `b7`→`7`), offered only if that symbol parses. An alteration straight after a quality with no extension (`Cmb6`): beside `alteredFifth`, suggest the symbol with the alteration moved into parentheses, only if it parses and only where the root's own accidental cannot be the one read (the rule `alteredFifth` already applies: read it and reuse it rather than writing a second one).
  - `ALIASES`: `Δ9` → `maj9` and `Δ13` → `maj13`, before the `Δ7?` row.
  - Keep each function under Fallow's thresholds: if `parseChord` or `readParts` crosses one, extract.

- [ ] **Step 4: The grammar draft and the CHANGELOG.** Section 3: the altered-tone sentence names `b6` and says what it does on a sixth chord; the alterations-without-parentheses paragraph names it; the stacked-spellings paragraph's examples stay true. A.1 gains `b6` after `#5`. A.5: the two `add` rows become "`add` before any tone a parenthesis can add (`add9`, `add13`, `addb6`, `add#11`), bare or in the parentheses, alone or in a list"; a row for `Δ9`, `Δ13`. A.6: rows for `(b2)`, `(#2)`, `(#4)`, `(b7)` and for an alteration after a bare quality (`Cmb6`). The decisions log: three rows, and "superseded 2026-11-14" on the 2026-11-02 row. `packages/barmark/CHANGELOG.md` `[Unreleased]`: `### Added` (the tone, the aliases, the delta, the suggestions) and `### Changed` (a Harte label with `b6` now converts to `(b6)`, where it became `(b13)`).

- [ ] **Step 5: Run the gates.**

Run: `bun test packages/barmark; echo "exit $?"`, `bun test; echo "exit $?"`, `bun run check; echo "exit $?"`, `bun run fallow; echo "exit $?"`, `bun run verify:package barmark; echo "exit $?"`
Expected: all exit 0. Report how long `packages/barmark/tests/chords/name.test.ts` takes before and after (its exhaustive tests have a 60 s timeout).

- [ ] **Step 6: Commit.**

```bash
git add packages/barmark docs/grammar-v0.1-draft.md
git commit -m "feat(barmark): the flat sixth, add before any tone, and Δ9"
```

---

### Task 2: The packages that read chords, held by tests

**Files:**
- Test: `packages/render/tests/speech.test.ts`, the chord typesetting test beside `packages/render/src/chord.ts`, `packages/musicxml/tests/harmony.test.ts` and the import chord tests (`packages/musicxml/tests/import/`), `packages/fretboard/tests/shapes.test.ts` (or the nearest), `packages/midi/tests/` (the import naming test), `packages/sync/tests/` (the spelling test for `build/spell.ts`)
- Modify: `packages/musicxml/CHANGELOG.md`, `packages/sync/CHANGELOG.md` and any other package's CHANGELOG where a user sees a difference; source files only if a test below fails

**Interfaces:**
- Consumes: Task 1's `parseChord` and `harteToBarmark`.
- Produces: nothing new.

- [ ] **Step 1: Write the tests** (each is expected to pass with no source change; one that fails is a finding to fix at its cause, test first):
  - render: `speakChord` of `F#m(b6)` is "F sharp minor flat six" (check the form against `F#m(b13)`'s today and match it); `typesetChord` of `F#m(b6)` sets `(♭6)` as `(♭13)` is set; a chart `| F#m(b6) | Cadd13 | CΔ9 |` renders the three canonical names, and with `chordDiagrams: "guitar"` gives three diagrams with shapes.
  - musicxml: `F#m(b6)` exports kind `minor` with one `<degree>` (value 6, alter −1, type add) and validates against the XSD as the file's other cases do; importing that harmony gives `F#m(b6)`; importing a `<degree>` of 13 flattened gives `F#m(b13)`, as before; `C6(b6)` and `Cadd13` export and import back to the same pitches.
  - fretboard: `shapeFor` of `F#m(b6)`, `Cm(b6)` and `C(b6)` is ok and `soundsChord(shape, chord)` is true (the flat sixth is in the shape); the shape for `Cm(b6)` equals the shape for `Cm(b13)`.
  - midi: a file whose notes are C E♭ G A♭ still imports as the name it imported as before this change (run the base first; write the expectation from it).
  - sync: a detection labelled `C:min(b6)` builds a chart with `Cm(b6)`; `C:min(b13)` with `Cm(b13)`.
- [ ] **Step 2: Run them.** `bun test packages/render packages/musicxml packages/fretboard packages/midi packages/sync packages/listen packages/score packages/cli; echo "exit $?"`. If the listen equivalence goldens or any snapshot changes because a printed chord changed, stop and report which (do not regenerate).
- [ ] **Step 3: CHANGELOGs.** `musicxml` `[Unreleased]` `### Changed`: a harmony with an added flat sixth imports as `(b6)` (it was `(b13)`); export writes degree 6 for `(b6)`. `sync` `### Changed`: a detection label with `b6` builds `(b6)`. Others: only where a user sees a difference.
- [ ] **Step 4: Run the gates.**

Run: `bun test; echo "exit $?"`, `bun run check; echo "exit $?"`, `bun run fallow; echo "exit $?"`
Expected: all exit 0.

- [ ] **Step 5: Commit.**

```bash
git commit -m "test: the flat sixth through render, MusicXML, the fretboard, MIDI and sync"
```

---

## After the plan

1. Release `barmark` 0.24.0 (a minor), then the caret dependants' patches, each "Requires `barmark` 0.24.0": `fretboard`, `render`, `musicxml`, `sync`, `midi`, `score`, `listen`; then the CLI, `kevinpeckham/songs`, and the site (pins, and the guide rows `altered`, `bare-alteration`, `chord-aliases`, `ambiguous-2` in `site/src/lib/guide/rows.ts`).
2. Reply to the user's notice through Kevin with the spellings that now read.
