# Voice Parts and Lyrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voice parts with syllables on their notes, lyric rows placed on the beats, numbered verses, drawn by the renderer and carried both ways through MusicXML without loss; plus the five grammar changes from the MusicXML import.

**Architecture:** The parser (`packages/barmark`) learns two things: a syllable after a note set (`{G4}:maz-`) and a new `lyrics` line kind. Play-order expansion attaches each verse's syllables to played bars with their onsets, so renderers and converters never re-read text. `@barmark/render` draws a voice line's pitches and syllables as rows; `@barmark/musicxml` writes `<lyric>` on notes and reads melodies and verses back.

**Tech Stack:** Bun workspace, TypeScript strict, Biome (tabs), `bun test`, linkedom (render tests), xmllint (musicxml tests), MuseScore 4 (`~/.local/bin/mscore`) for fixtures.

**Spec:** `docs/superpowers/specs/2026-11-06-voice-and-lyrics-design.md` (approved by Kevin, 2026-11-06). The grammar draft `docs/grammar-v0.1-draft.md` is binding; read the sections each task names.

## Global Constraints

- The grammar draft is binding: a grammar change updates the draft **and its decisions log** in the same commit (decisions dated 2026-11-06, "Decided by Kevin").
- Kevin decides grammar questions: a case the spec doesn't settle is surfaced as a ruling, not invented silently.
- Parsers never throw on user input; every problem is a diagnostic with a line number.
- Nothing that reads today changes meaning, except `---` lines and leading-`\` lines (spec section 8).
- `@barmark/render` never changes the music: what a syllable is and where it lands comes from the parser.
- Test first: a failing test before every change, failing for the expected reason.
- `bun run fallow` stays clean (no baseline growth); `bun run check` and `bun test` green.
- A CHANGELOG `[Unreleased]` entry in each changed package for every user-visible change; a FINDINGS.md entry for each surprise.
- Conventional commits, no `Co-Authored-By` or AI trailer.
- Syllable syntax: `:` then the syllable; it ends at whitespace, `_`, `|`, `{` or `"`; trailing `-` continues the word; `~` joins elided syllables; `:/` holds the syllable before over a new note; a dot after the brace is the rhythm's (`{C4}.:maz-`).
- Lyric rows: `lyrics:` or `lyrics N:` (N ≥ 1) then a bar line. Tokens: `/` hold, `--` breath, `_` split; every other token is a syllable.

## Review Focus

1. **Syllables with punctuation** (`{C4}:don't`, `{C4}:o'er`, `{C4}:yeah...`, `{C4}:¿qué?`, `{C4}:and/or`, `{C4}:x2`): each is read as that syllable verbatim, never as a mark, a hold or a repeat. Test in Task 3.
2. **Existing charts that hold `---` or a leading `\`**, and `lyrics:` used as a credit near miss: they print unchanged and keep reading as before, apart from the two decided changes. Test in Task 1 (the `examples/` charts and a credit-near-miss chart).
3. **Transposing and extracting a voice part**: `transposeChart` moves the melody's notes and keeps every syllable and lyric row; `extractPart(text, "Vox")` keeps its lines, syllables and lyric rows, and extracting another part leaves them out. Test in Task 5.
4. **A pickup, a `%` bar and an ending under a lyric row**: the row's cells match bars one to one (a `[1/4]` pickup cell included), `%` copies notes and not syllables, and a second ending carries only verse 2. Test in Task 5.
5. **A tie across a bar line carrying a syllable**: the export writes no `<extend>` for a tie, only for `:/`, and the import gives back `/` rather than `:/`. Test in Tasks 7 and 8.

---

### Task 1: The grammar riders in the parser (`---`, leading `\`, a bare replay of `## X x2`)

**Files:**
- Modify: `packages/barmark/src/chart/types.ts` (`Line` gains `{ kind: "break"; line: number }`), `document.ts` (`classify`), `print.ts`, `systems.ts` (if a break must end a system explicitly), `expand.ts` (only if the replay test fails)
- Modify: `docs/grammar-v0.1-draft.md` sections 1, 6, 7.4, 9 and the decisions log
- Modify: `packages/render/src/model.ts` (a break draws nothing; a `\` text line shows without the backslash)
- Test: `packages/barmark/tests/chart/riders.test.ts`, `packages/render/tests/model.test.ts`

**Interfaces:**
- Produces: `Line` kind `"break"`; a text line written `\…` is `{ kind: "text", text }` with `text` **without** the backslash and a new `escaped: true` field, so `printChart` writes the backslash back.

- [ ] **Step 1: Write the failing tests** in `riders.test.ts`:

```ts
test("--- ends a labelled system", () => {
	const chart = "part: G = Gtr\npart: P = Pno\nG | A | B |\n---\nP | C | D |\n";
	const p = parseChart(chart);
	expect(p.diagnostics).toEqual([]);
	expect(p.bars.length).toBe(4); // two systems, not one
	expect(printChart(chart)).toBe(chart);
});
test("three or more hyphens alone are a break; -- and --- with words are not", () => {
	expect(parseChart("| C |\n-----\n| D |\n").lines.map((l) => l.kind)).toEqual(["bars", "break", "bars"]);
	expect(parseChart("--- intro ---\n| C |\n").lines[0]?.kind).toBe("text");
});
test("a leading backslash makes a text line and isn't shown", () => {
	const p = parseChart("| C |\n\\| la la |\n\\key: G\n");
	expect(p.lines.slice(1)).toMatchObject([{ kind: "text", text: "| la la |", escaped: true }, { kind: "text", text: "key: G", escaped: true }]);
	expect(p.bars.length).toBe(1);
	expect(printChart("| C |\n\\| la la |\n")).toBe("| C |\n\\| la la |\n");
});
test("escaped pipes after the first still warn", () => {
	expect(parseChart("\\| D \\| A \\|\n").diagnostics.map((d) => d.severity)).toEqual(["warning"]);
});
test("a bare replay of a section written x2 plays once", () => {
	const p = parseChart("## A x2\n| C | D |\n## B\n| E |\n## A\n");
	expect(p.bars.map((b) => b.section)).toEqual(["A", "A", "A", "A", "B", "A", "A"]); // x2, then B, then A once
});
test("every example chart prints unchanged", () => { /* each file in examples/: printChart(text) === text */ });
```

and in `model.test.ts`: `test("a break draws nothing, and an escaped text line shows without its backslash")`.

- [ ] **Step 2: Run** `bun test packages/barmark/tests/chart/riders.test.ts` — Expected: FAIL (no `break` kind; backslash kept in `text`). The replay test may already pass: if so, keep it as the pin and say so in the report.
- [ ] **Step 3: Implement.** `classify` checks `/^-{3,}$/` before other lines and a leading `\` before bar lines; the escaped-pipes warning (grammar 9) applies when the text after the first character still contains `\|`. Edit the grammar: section 1's table gains both rows; 7.4's "any other line … ends one" names `---`; section 6 gains "A bare replay of a section written `## X xN` plays it once; `## X xN` again plays it N times."; decisions log rows dated 2026-11-06.
- [ ] **Step 4: Run** `bun test packages/barmark packages/render` — Expected: PASS. Then `bun run check && bun run fallow`.
- [ ] **Step 5: Commit** `feat(barmark): --- ends a system, a leading backslash escapes a text line` (CHANGELOGs of barmark and render).

### Task 2: The import riders (`---` for the cue lines, a melody in thirds)

**Files:**
- Modify: `packages/musicxml/src/import/write.ts` (`separator`), `packages/musicxml/src/import/parts.ts` (`actsAsChords`)
- Test: `packages/musicxml/tests/import/import.test.ts`, existing fixtures under `packages/musicxml/tests/fixtures/import/`

**Interfaces:**
- Consumes: Task 1's `---` line.

- [ ] **Step 1: Write the failing tests:** `test("systems that would join are separated by ---, with no cue words")` (the reviewer's trading-fours shape: expect `"G | A |…\n---\nP | E |…"` and no `tacet`/`enters` in the text; the timelines check still passes); `test("a melody doubled in thirds in a part that writes slashes is a melody, not voicings")` (a part with a slash intro, then two-note attacks on every eighth while chords change each bar: its notes are not written; the warning names the melody); `test("two-note attacks that land on each chord change stay voicings")`.
- [ ] **Step 2: Run** `bun test packages/musicxml/tests/import` — Expected: the three new tests FAIL.
- [ ] **Step 3: Implement.** `separator` returns `["---"]`. In `actsAsChords`, a bar's attacks count as voicings only when each attack starts on a chord change or on a beat the part writes as a slash; otherwise the bar is melody. Update the FINDINGS entry on the cue lines and the spec's "Claude's calls" item that described them.
- [ ] **Step 4: Run** `bun test packages/musicxml` — Expected: PASS (update the expected charts of fixtures whose output gains `---`, and say which in the report).
- [ ] **Step 5: Commit** `feat(musicxml): --- separates imported systems; a melody in thirds stays a melody`.

### Task 3: Syllables on notes

**Files:**
- Modify: `packages/barmark/src/chart/types.ts`, `barLine.ts` (reading a note-set member), `print.ts` (`printSimple`), `expand.ts` (`%` copies no syllables)
- Modify: `docs/grammar-v0.1-draft.md`: a new section **4.3 Syllables** and the decisions log
- Test: `packages/barmark/tests/chart/syllables.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** A syllable sung on a note (grammar 4.3). `held` is `:/`. `parts` holds elided syllables (`the~end`). */
  export type Syllable = { kind: "sung"; parts: string[]; continues: boolean } | { kind: "held" };
  // SimpleSlot of kind "chord" whose chord.kind === "notes" gains: syllable?: Syllable
  ```

- [ ] **Step 1: Write the failing tests:**

```ts
const slotsOf = (cell: string) => (parseChart(`part: V = Voice\nV | ${cell} |\n`).bars[0]?.slots ?? []);
test("a syllable follows its note after a colon", () => {
	expect(slotsOf("{G4}:maz- {B4}:ing")).toMatchObject([
		{ syllable: { kind: "sung", parts: ["maz"], continues: true } },
		{ syllable: { kind: "sung", parts: ["ing"], continues: false } },
	]);
});
test(":/ holds the syllable before over a new note", () => {
	expect(slotsOf("{B4}:ing_{G4}:/")[0]).toMatchObject({ kind: "group", members: [{ syllable: { kind: "sung" } }, { syllable: { kind: "held" } }] });
});
test("~ joins elided syllables on one note", () => {
	expect(slotsOf("{C4}:the~end")[0]).toMatchObject({ syllable: { parts: ["the", "end"] } });
});
test("a dotted note takes its dot before the syllable", () => {
	expect(slotsOf("{C4}.:maz-_{D4}:ing")[0]).toMatchObject({ kind: "group" });
});
test("punctuation inside a syllable is the syllable's", () => {
	for (const s of ["don't", "o'er", "yeah...", "¿qué?", "and/or", "x2", "%"])
		expect(slotsOf(`{C4}:${s}`)[0]).toMatchObject({ syllable: { kind: "sung", parts: [s] } });
});
test("a syllable on anything but a note set is an error", () => {
	for (const cell of ["G:la", "/:la", "--:la", "N.C.:la", "Cmaj7{E3 G3}:la"])
		expect(parseChart(`| ${cell} |\n`).diagnostics.some((d) => d.severity === "error")).toBe(true);
});
test("an empty syllable is an error", () => { /* `{C4}:` */ });
test("% copies a bar's notes, not its syllables", () => { /* `V | {C4}:la | % |`: bar 2 slots have no syllable */ });
test("syllables print back as written", () => { /* printChart round-trips each form above */ });
test("a repeat close straight after a syllable still closes", () => { /* `V |: {C4}:la :|` and `{C4}:la:|` both close */ });
```

- [ ] **Step 2: Run** `bun test packages/barmark/tests/chart/syllables.test.ts` — Expected: FAIL (`{G4}:maz-` is not a slot today).
- [ ] **Step 3: Implement.** Split a member at the first `:` after a closing `}` (after an optional dot); the rest is the syllable. A voicing (name before the brace) takes no syllable. Grammar 4.3 gives the rules in the spec's section 2, with MusicXML's `syllabic`, `<extend>` and `<elision>` named.
- [ ] **Step 4: Run** `bun test packages/barmark` — Expected: PASS; `bun run check && bun run fallow`.
- [ ] **Step 5: Commit** `feat(barmark): syllables on notes ({G4}:maz-)`.

### Task 4: Lyric rows (reading, attaching, printing)

**Files:**
- Modify: `packages/barmark/src/chart/types.ts`, `document.ts` (`classify`), `credits.ts` (the `lyrics:` near miss only when no bar line follows), `print.ts` (aligned like a bar line, under its bars)
- Create: `packages/barmark/src/chart/lyricRows.ts` (reading a row's cells; checking each row against the bars it covers)
- Modify: `docs/grammar-v0.1-draft.md`: a new section **7.7 Lyrics** and the decisions log
- Test: `packages/barmark/tests/chart/lyric-rows.test.ts`

**Interfaces:**
- Consumes: `Syllable` (Task 3).
- Produces:
  ```ts
  export type LyricSlot = { kind: "syllable"; syllable: Syllable } | { kind: "hold" } | { kind: "breath" } | { kind: "group"; members: LyricSlot[] };
  // Line gains:
  | { kind: "lyrics"; line: number; verse: number | null; cells: LyricSlot[][]; covers: number[] }
  // `covers`: the source line numbers of the bar lines it lies under, in order (one, a system's lines, or a replayed section's lines)
  export function readLyricRow(text: string, line: number): { row: Extract<Line, { kind: "lyrics" }> | null; diagnostics: ChartDiagnostic[] };
  ```

- [ ] **Step 1: Write the failing tests:**

```ts
test("a lyric row divides its bars like a chord row", () => {
	const p = parseChart("| Am7 | D9 |\nlyrics: | I_got roll-_in' on_the / | beat_and -- I_keep it_up |\n");
	expect(p.diagnostics).toEqual([]);
	expect(p.lines[1]).toMatchObject({ kind: "lyrics", verse: null, cells: [[{ kind: "group" }, { kind: "group" }, { kind: "group" }, { kind: "hold" }], expect.any(Array)] });
});
test("lyrics 2: is verse 2", () => { /* verse: 2 */ });
test("a row with a different bar count from the line above is an error", () => {});
test("a row covers a labelled system, and ends it", () => { /* G | … / P | … / lyrics: | … | : covers both lines' numbers; a following G | … starts a new system */ });
test("under a replay heading, rows cover the section's written lines in order", () => {
	const chart = "## V\n| C | D |\n| E |\n## V\nlyrics: | a | b |\nlyrics: | c |\n";
	expect(parseChart(chart).diagnostics).toEqual([]);
});
test("a replay's row with the wrong bar count for its line is an error", () => {});
test("Fine, x2 and @A in a lyric row are syllables", () => {});
test("lyrics: followed by text is still the lyricist near miss", () => {
	expect(parseChart("lyrics: Kevin\n| C |\n").diagnostics[0]).toMatchObject({ severity: "warning", suggestion: "lyricist: Kevin" });
});
test("a lyric row with no bar line above it is an error", () => {});
test("lyric rows print aligned under their bars", () => {
	const chart = "| Am7       | D9 |\nlyrics: | I_got / | la |\n";
	expect(printChart(chart)).toBe(/* cells padded to the bar line's columns */ printChart(printChart(chart)));
});
```

- [ ] **Step 2: Run** `bun test packages/barmark/tests/chart/lyric-rows.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** `classify` reads `/^lyrics(?:\s+(\d+))?:\s*(\|.*)$/i` before the labelled-line check. A lyric row is attached after systems are grouped: it covers the bar line just above (in a labelled chart, its system); under a replay heading, rows cover the replayed section's written bar lines one each. Canonical spacing: the printer pads a row's cells to the column widths of the bar line it covers (the widest of the two decides).
- [ ] **Step 4: Run** `bun test packages/barmark` — Expected: PASS; `bun run check && bun run fallow`.
- [ ] **Step 5: Commit** `feat(barmark): lyric rows on the beats (lyrics:, lyrics N:)`.

### Task 5: Verses in play order

**Files:**
- Modify: `packages/barmark/src/chart/types.ts` (`PlayedBar.lyrics`), `expand.ts` / `parse.ts` (attach), `transpose.ts`, `parse.ts` (`extractPart`)
- Create: `packages/barmark/src/chart/verses.ts`
- Test: `packages/barmark/tests/chart/verses.test.ts`

**Interfaces:**
- Consumes: `Syllable` (Task 3), the `lyrics` line (Task 4).
- Produces:
  ```ts
  /** A syllable as played: `at` is its onset in whole notes from the bar's start; `note` is true when a note of the singing line starts there. */
  export type PlayedSyllable = { at: number; syllable: Syllable; note: boolean };
  /** One verse's syllables in a played bar; `part` is the label of the part singing (absent in a chart with no voice part). */
  export type PlayedLyrics = { verse: number; part?: string; syllables: PlayedSyllable[] };
  // PlayedBar gains: lyrics?: PlayedLyrics[]
  // DeclaredPart gains: sings?: string  — the line name (or "" for the bare line) whose notes carry the lyrics
  ```

- [ ] **Step 1: Write the failing tests** (the spec's sections 3 and 4; Amazing Grace from the spec's section 1 as the main fixture):

```ts
test("syllables on notes are verse 1, at their notes' onsets", () => { /* bar 2 of Amazing Grace: [{at:0,maz},{at:1/2,ing},{at:5/8,held}] */ });
test("stacked verses outside a repeat don't change the play order", () => { /* lyrics 2: under the system: bars.length unchanged; each bar has verses 1 and 2 */ });
test("inside a repeat, verse N is sung on pass N", () => { /* |: … :| with lyrics 1: and lyrics 2: — pass 1 bars carry only verse 1, pass 2 only verse 2 */ });
test("a second ending carries only verse 2", () => {});
test("a jump's pass back is not a pass", () => { /* D.C. al Fine: bars after the jump carry verse 1 */ });
test("a replay with a lyric row sings its new words; without one, the words it was written with", () => {});
test("lyrics 1: over notes that carry syllables is an error", () => {});
test("an unnumbered row mixed with numbered rows over the same bars is an error", () => {});
test("syllables on notes and an unnumbered row over the same bars is an error", () => {});
test("a syllable where the singing line starts no note warns", () => {});
test("the lyrics belong to the first voice part, else the first part with syllables", () => {});
test("a chart with no voice part keeps a lyric row's words, with no part", () => {});
test("a pickup cell and a % bar under a lyric row", () => { /* [1/4] cell's syllable at 0; % bar takes the row's syllables, not the copied bar's */ });
test("transposing keeps every syllable and lyric row", () => { /* transposeChart(amazingGrace, { to: "A" }).text: notes move, `:maz-` and lyrics 2: unchanged */ });
test("extracting the voice part keeps its lines, syllables and lyric rows; another part's extract has none", () => {});
```

- [ ] **Step 2: Run** `bun test packages/barmark/tests/chart/verses.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `versesOf(lines, parts): Map<line, …>` in `verses.ts` and attach `lyrics` to played bars as `expand` produces them (each played bar knows its pass of the repeat and whether it comes after a jump). Onsets come from the same slot timing `expand.ts` uses for pushes.
- [ ] **Step 4: Run** `bun test packages/barmark` — Expected: PASS; `bun run check && bun run fallow`.
- [ ] **Step 5: Commit** `feat(barmark): verses in play order (PlayedBar.lyrics)`.

### Task 6: Drawing voice lines and lyrics

**Files:**
- Modify: `packages/render/src/types.ts`, `model.ts`, `html.ts`, `styles.ts`, `speech.ts`
- Test: `packages/render/tests/lyrics.test.ts`; `packages/render/browser/` (one Playwright check)

**Interfaces:**
- Consumes: `Syllable`, `PlayedLyrics`, `Line` kind `lyrics` (Tasks 3–5).
- Produces: a `RowItem` for a singing line gains `syllables: (string | null)[][]` per cell, aligned with its slots; a lyric row with no melody is a row of `kind: "lyrics"` with its verse.

- [ ] **Step 1: Write the failing tests:** `test("a voice line draws its pitch names and, under them, its syllables at their slots")` (Amazing Grace bar 2: pitch row "G B G", syllable row "maz –", "ing" and an extender on the held note); `test("a stacked verse draws as a second syllable row, numbered")`; `test("a lyric row with no melody draws its syllables spaced by beat")` (the spoken example: 8 eighths per bar, two empty); `test("syllables are text, never markup")` (`{C4}:<b>` escapes); `test("a screen reader hears each bar's words")` (speech: "maz-ing").
- [ ] **Step 2: Run** `bun test packages/render` — Expected: FAIL.
- [ ] **Step 3: Implement.** Pitch names come from the note set (the first note for a chord of notes); hyphens between syllables of a word; `held` draws an extender. CSS custom properties for the syllable row's font follow the existing naming (`--bm-…`); add any new `::part()` name to the README.
- [ ] **Step 4: Run** `bun test packages/render && bun run test:browser` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(render): voice lines and lyrics`.

### Task 7: MusicXML export of lyrics

**Files:**
- Modify: `packages/musicxml/src/events.ts` (`SoundEvent` carries its syllables per verse), `measure-xml.ts`/`notes.ts` (`<lyric>`), `score.ts` (a lyric row with no melody becomes a slash staff marked `<?barmark lyrics?>`)
- Test: `packages/musicxml/tests/lyrics.test.ts` (schema-validated, as the other export tests)

**Interfaces:**
- Consumes: `PlayedBar.lyrics` (Task 5).

- [ ] **Step 1: Write the failing tests:** `test("a syllable becomes <lyric number=1> on its note, with syllabic")` (`maz-` begin, `ing` end, a lone word single, a middle syllable middle); `test(":/ writes <extend/> and the held note carries no text")`; `test("a tie carries its syllable without <extend>")`; `test("~ writes <elision>")`; `test("a stacked verse is <lyric number=2> on the same notes")`; `test("verses by pass go on the passes' notes; a replay's lyric row on the written-out replay")`; `test("a lyric row with no melody is a slash staff carrying the syllables, marked <?barmark lyrics?>")`; `test("text-line lyrics keep their current export")`. Every output validates against the vendored XSD.
- [ ] **Step 2: Run** `bun test packages/musicxml/tests/lyrics.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** The marker is a processing instruction inside the part's first `<measure>`, as `<?barmark root?>` sits inside a `<note>`.
- [ ] **Step 4: Run** `bun test packages/musicxml` — Expected: PASS; MuseScore opens one exported file and re-exports its lyrics unchanged (add it to `scripts/musescore-fixtures.ts`'s checks).
- [ ] **Step 5: Commit** `feat(musicxml): export lyrics on notes, verses and lyric rows`.

### Task 8: MusicXML import of melodies and verses

**Files:**
- Modify: `packages/musicxml/src/import/parts.ts` (keep a singing part's melody), `cells.ts` (a melody line's cells with syllables), `lyrics.ts` (verses to numbered rows and replays; the text-line step and its placement warning go), `write.ts`/`rows.ts` (`Vox` + `Vox.Mel` lines, lyric rows), `replays.ts` (same notes, new words → a replay with a lyric row)
- Test: `packages/musicxml/tests/import/lyrics.test.ts` (rewrite), `programs.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5 (the chart it writes must parse with them), Task 7 (`<?barmark lyrics?>`).
- Produces: a singing part writes its harmony on its bare line and its melody on the line named `Mel`; a part with lyrics and no harmony writes its melody on its bare line.

- [ ] **Step 1: Write the failing tests:** `test("a lead sheet's melody comes in on Vox.Mel with its syllables")`; `test("two verses stacked on bars written once become lyrics 2:")` (the existing `lead-sheet` fixture: its expected chart changes from text lines to `Vox`/`Vox.Mel`/`lyrics 2:`); `test("a melisma comes back as :/, a tie as /")`; `test("an elision comes back as ~")`; `test("a section played again with new words is a replay with a lyric row")`; `test("a part marked <?barmark lyrics?> comes back as a lyric row")`; `test("a rhythm the grammar can't write snaps, with a loss naming the measures")`; `test("a horn melody with no lyrics is still left out, named in the warning")`.
- [ ] **Step 2: Run** `bun test packages/musicxml/tests/import` — Expected: FAIL.
- [ ] **Step 3: Implement.** A part sings when it has lyrics or its instrument sound is a voice (`voice.*` in `<instrument-sound>`). The self-check (selfcheck.ts) also compares each verse's played syllables with what the importer meant to write.
- [ ] **Step 4: Run** `bun test packages/musicxml` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(musicxml): import melodies and verses`.

### Task 9: Round trips in both directions (the acceptance test)

**Files:**
- Create: `packages/musicxml/tests/fixtures/import/hymn.mscx` (+ `.musicxml`, `.chart.md`) built with MuseScore: two verses, a melisma, a tie across a bar, a pickup, an elision; `packages/musicxml/tests/fixtures/import/spoken.chart.md` (a lyric row with no melody)
- Modify: `scripts/musescore-fixtures.ts`
- Test: `packages/musicxml/tests/import/round-trip-lyrics.test.ts`

- [ ] **Step 1: Write the failing tests:** `test("MusicXML → barmark → MusicXML keeps every note, rhythm and syllable")` (compare notes, durations, ties and each `<lyric>`'s number, syllabic, text, extend and elision between the MuseScore file and the re-export); `test("barmark → MusicXML → barmark gives the chart back")` (Amazing Grace from the spec and `spoken.chart.md`: `importMusicXml(exportMusicXml(chart).xml).text === printChart(chart)`).
- [ ] **Step 2: Run** — Expected: FAIL until the fixtures exist and Tasks 7–8 agree.
- [ ] **Step 3: Implement** the fixtures (`bun scripts/musescore-fixtures.ts`), and fix what the round trips find, each with its own failing test in the owning module.
- [ ] **Step 4: Run** `bun test` — Expected: PASS.
- [ ] **Step 5: Commit** `test(musicxml): voice and lyrics round trips`.

### Task 10: Documentation

**Files:**
- Modify: `README.md` (root: the package list gains `@barmark/musicxml`, export and import; the CLI line names `import` and `export --musicxml`), `packages/barmark/README.md`, `packages/render/README.md`, `packages/musicxml/README.md` ("What it writes" and "What it reads" gain lyrics), each package's CHANGELOG, `BRIEF.md` (roadmap item 5 done; ChordPro and MIDI as phases 2 and 3), `FINDINGS.md`, `examples/` (an example chart with a voice part and verses, which parses cleanly and prints unchanged)
- Test: the existing examples test picks up the new example

- [ ] **Step 1:** Add the example chart; run `bun test` — Expected: the examples test reads it (fails until it prints unchanged).
- [ ] **Step 2:** Write the docs; the spec's "Claude's calls" note anything built differently, marked "changed while building, for Kevin to confirm".
- [ ] **Step 3: Run** `bun test && bun run check && bun run fallow && bun run verify:package barmark && bun run verify:package render && bun run verify:package musicxml` — Expected: PASS.
- [ ] **Step 4: Commit** `docs: voice parts and lyrics`.
