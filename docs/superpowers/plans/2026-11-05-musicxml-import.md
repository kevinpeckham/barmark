# MusicXML Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `importMusicXml` and `readMxl` in `@barmark/musicxml`, `barmark import` in `@barmark/cli`, and the export's `<?barmark root?>` marker, as the approved design specifies.

**Architecture:** A pipeline of small modules in `packages/musicxml/src/import/`: an ordered XML tree → a read score (per part, per line, per measure: timed attacks, harmonies and marks, at exact fractions) → a decision per part (chord part, melody part, notes-only) → written bars on a slot grid → systems, sections and repeats → chart text, canonicalised by barmark's own printer and checked by its own parser. Every stage reports losses into one diagnostics collector that groups them by kind and part.

**Tech Stack:** TypeScript strict, Bun (tests, `bun test`), Biome (tabs), `fast-xml-parser` (one new dependency, pinned exactly), `barmark` (workspace), MuseScore 4.7.6 (`~/.local/bin/mscore` on the VM) for fixtures only.

**Spec:** `docs/superpowers/specs/2026-11-05-musicxml-import-design.md` (approved 2026-11-05). Grammar: `docs/grammar-v0.1-draft.md` (binding).

## Global Constraints

- Never throws: every failure is a diagnostic `{ severity: "error" | "warning", message, part?, measure? }`; `measure` is the file's measure `number` attribute.
- The chart text is canonical (`printChart(text) === text`) and `parseChart(text)` has no error diagnostics, for every input.
- Each kind of loss is reported once per part, with a count and at most the first three measures: `"<message> in N measures: 1, 2, 3, …"`.
- One new runtime dependency (`fast-xml-parser`, exact version); `.mxl` uses only `DecompressionStream("deflate-raw")`. Node ≥ 20.6, Bun, browsers: no `node:` imports in `packages/musicxml/src/`.
- The parser never fetches the DTD (no external entity resolution).
- Pitches are sounding pitch, through `<transpose>` (`chromatic`, `octave-change`).
- Notes never move to fit a grid; only chord symbols snap (to the nearest beat, with a warning).
- Conventional commits, no `Co-Authored-By` or AI trailer. Test first. `bun run fallow` stays clean.
- CHANGELOG `[Unreleased]` entries in `packages/musicxml` and `packages/cli`; a FINDINGS.md entry for any surprise.

## Review Focus

1. A lead sheet whose melody notes start on the chord changes (melody attacks coinciding with every `<harmony>`): must read as a melody part, never as voicings. Pinned in Task 5 (`lead sheet with attacks on every change`).
2. A file using `<backup>`/`<forward>` between voices with `divisions` changing mid-piece: onsets must stay exact. Pinned in Task 2 (`divisions change between measures`).
3. Pickup (anacrusis) measures (`implicit="yes"`, short first bar): must import as a one-bar meter, not a full bar with a hole. Pinned in Task 4 (`pickup bar`).
4. Multi-measure rests (`<multiple-rest>` with one `<measure>` per bar) and empty measures in a part: rests, not missing bars. Pinned in Task 2 (`empty measure is a rest`).
5. Chord symbols attached at `<offset>` with no following note (harmony at the end of a measure): placed by offset. Pinned in Task 4 (`harmony offset`).

## Ruling recorded while planning (Claude's call, refines the spec's call 1)

The spec's chord-part rule ("every chord's span holds slashes or one held attack") can't be applied to a span whose end is itself a note set: in `| C {E4} |`, C's span runs to the bar's end and holds `{E4}`. And a melody whose notes start on every change looks like voicings. So:

- **A file written by `@barmark/musicxml`:** every part is read structurally. A `<harmony>` over slash notes is a chord; a `<harmony>` with non-slash notes attacked at its onset is a voicing; non-slash notes attacked with no `<harmony>` at that onset are a note set; slash notes after an attack hold it; a rest is `--`.
- **Any other file:** the same reading, but only in a part that writes slash noteheads somewhere (a comping part), and whose every attack lands exactly on the grid. Any other part with `<harmony>` is a melody part (chords alone). This keeps a lead sheet's melody out whatever its rhythm.

The spec's call 1 is updated to this in Task 12.

---

### Task 1: XML tree and diagnostics collector

**Files:**
- Modify: `packages/musicxml/package.json` (add `"fast-xml-parser": "<exact latest 5.x>"` to `dependencies`), `bun.lock`
- Create: `packages/musicxml/src/import/tree.ts`, `packages/musicxml/src/import/losses.ts`, `packages/musicxml/src/import/frac.ts`
- Test: `packages/musicxml/tests/import/tree.test.ts`, `packages/musicxml/tests/import/losses.test.ts`, `packages/musicxml/tests/import/frac.test.ts`

**Interfaces:**
- Produces:
  - `type XNode = { name: string; attrs: Record<string, string>; children: XNode[]; text: string; pis: string[] }` (`pis`: processing instructions directly inside, e.g. `"barmark root"`)
  - `parseXml(xml: string): XNode | null` (null on malformed XML; never throws)
  - `child(n: XNode, name: string): XNode | undefined`, `children(n: XNode, name: string): XNode[]`, `textOf(n: XNode | undefined, name?: string): string`
  - `type ImportDiagnostic = { severity: "error" | "warning"; message: string; part?: string; measure?: string }`
  - `class Losses { add(kind: string, message: string, part?: string, measure?: string): void; note(d: ImportDiagnostic): void; list(): ImportDiagnostic[] }` (`add` groups by `kind`+`part`)
  - `type Frac = { n: number; d: number }` (reduced, `d > 0`); `frac(n, d)`, `add`, `sub`, `mul`, `div`, `cmp(a, b): -1 | 0 | 1`, `eq`, `ZERO`

- [ ] **Step 1: Write the failing tests**

```ts
test("keeps document order across element names", () => {
	const t = parseXml("<m><note/><backup/><note/></m>");
	expect(t?.children.map((c) => c.name)).toEqual(["note", "backup", "note"]);
});
test("reads a processing instruction inside an element", () => {
	const t = parseXml("<note><?barmark root?><pitch/></note>");
	expect(t?.pis).toEqual(["barmark root"]);
});
test("malformed XML is null, not a throw", () => {
	expect(parseXml("<a><b></a>")).toBeNull();
});
test("never resolves the DOCTYPE", () => {
	const t = parseXml('<!DOCTYPE score-partwise PUBLIC "x" "http://example.invalid/x.dtd"><score-partwise/>');
	expect(t?.name).toBe("score-partwise");
});
// losses.test.ts
test("one diagnostic per kind and part, three measures shown", () => {
	const l = new Losses();
	for (const m of ["1", "2", "3", "4"]) l.add("melody", "notes read as a melody and left out", "Lead", m);
	expect(l.list()).toEqual([{ severity: "warning", part: "Lead", measure: "1",
		message: "notes read as a melody and left out in 4 measures: 1, 2, 3, …" }]);
});
// frac.test.ts
test("reduces and compares", () => {
	expect(add(frac(1, 3), frac(1, 6))).toEqual(frac(1, 2));
	expect(cmp(frac(2, 4), frac(1, 2))).toBe(0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test packages/musicxml/tests/import`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** `tree.ts` over `fast-xml-parser`'s `XMLParser` with `preserveOrder: true`, `ignoreAttributes: false`, `processEntities: true`, `ignorePiTags: false`, `parseTagValue: false`, `trimValues: false`; validate first with its `XMLValidator.validate` and return null on failure. `losses.ts` and `frac.ts` as the interfaces say (`Losses.add` is `severity: "warning"`; `note` passes a diagnostic through unchanged).

- [ ] **Step 4: Run to verify they pass**

Run: `bun test packages/musicxml/tests/import`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/musicxml bun.lock
git commit -m "feat(musicxml): XML tree, exact fractions and grouped diagnostics for import"
```

### Task 2: Read a score

**Files:**
- Create: `packages/musicxml/src/import/read.ts`
- Test: `packages/musicxml/tests/import/read.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `type Attack = { at: Frac; length: Frac; kind: "notes" | "slash" | "rest"; pitches: { name: string; octave: number; root: boolean }[]; tieIn: boolean; tieOut: boolean; fermata: boolean; lyrics: { verse: number; syllabic: "single" | "begin" | "middle" | "end"; text: string; elision: boolean }[] }` (pitches sounding, spelled `C`, `F#`, `Bb`; `at` and `length` in quarter notes from the measure's start; `root` from the `barmark root` PI)
  - `type HarmonyMark = { at: Frac; node: XNode }`
  - `type Mark = { at: Frac; kind: "words" | "rehearsal" | "segno" | "coda" | "metronome" | "sound" | "swing"; placement: "above" | "below" | null; bold: boolean; text: string; node: XNode }`
  - `type ReadMeasure = { number: string; length: Frac; implicit: boolean; time: Meter | null; key: Key | null; repeatStart: boolean; repeatEnd: { times: number } | null; ending: { numbers: number[]; type: "start" | "stop" | "discontinue" } | null; fermataEnd: boolean; marks: Mark[]; harmonies: HarmonyMark[]; lines: Attack[][] }` (`lines[i]` per the design's staff/voice table, filled with a rest where a voice is silent)
  - `type ReadPart = { id: string; name: string; abbreviation: string | null; instrumentName: string | null; midiProgram: number | null; staves: number; transpose: { chromatic: number; octave: number }; measures: ReadMeasure[] }`
  - `type ReadScore = { title: string | null; credits: Credits; software: string | null; parts: ReadPart[] }`
  - `readScore(root: XNode, losses: Losses): ReadScore | null` (null with an error when the root isn't `score-partwise`; a `score-timewise` file is an error "score-timewise isn't supported; save as partwise")

- [ ] **Step 1: Write the failing tests** (build inputs with a small `xml\`` helper in `tests/import/helpers.ts` that wraps measures in a one-part `score-partwise`)

```ts
test("onsets from durations, backup and forward", () => { /* two voices on one staff; voice 2 starts after <backup>; expect lines[1][0].at = frac(0,1), lines[0][1].at = frac(2,1) in 4/4 with divisions 2 */ });
test("divisions change between measures", () => { /* divisions 1 then 6: second measure's triplet onsets are 0, 1/3, 2/3 */ });
test("sounding pitch through transpose", () => { /* B-flat trumpet (chromatic -2): written D5 sounds C5 */ });
test("barmark root PI marks the pitch", () => { /* <note><?barmark root?>…E3…</note> in a chord: pitches[1].root === true */ });
test("empty measure is a rest", () => { /* a measure with only <attributes>: one rest attack of the bar's length */ });
test("harmony offset", () => { /* <harmony><offset>2</offset> after the last note: at = 2 beats */ });
test("staff 2 and second voices map to lines 2–4", () => { /* voices 1,5,2,6 on staves 1,2,1,2 → lines 0..3, as voicesFor writes them */ });
test("credits and title", () => { /* work-title, creator types, rights → title and Credits */ });
test("score-timewise is an error", () => { /* readScore returns null, losses has the error */ });
```

Each test asserts the exact `Attack`/`ReadMeasure` fields named in its comment; write them as `expect(...)toEqual(...)` with `frac` values.

- [ ] **Step 2: Run to verify they fail** — `bun test packages/musicxml/tests/import/read.test.ts`; Expected: FAIL.
- [ ] **Step 3: Implement `readScore`** in `read.ts`. Walk each `<measure>` in order with a cursor in divisions; `<chord/>` notes join the previous attack; grace notes are skipped; `<tie>` sets `tieIn`/`tieOut`; a voice's line index comes from the first (staff, voice) pairs seen, mapped through the design's table (two staves: staff 1 first voice → 0, staff 2 first voice → 1, staff 1 second → 2, staff 2 second → 3; one staff: voices in first-seen order); a fifth voice is recorded so Task 5 can reject the part. Measure length is the time signature's, except `implicit="yes"` measures, whose length is their longest voice.
- [ ] **Step 4: Run to verify they pass** — same command; Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(musicxml): read a MusicXML score's parts, lines and marks at exact positions"`

### Task 3: Chord symbols

**Files:**
- Create: `packages/musicxml/src/import/chords.ts`
- Test: `packages/musicxml/tests/import/chords.test.ts`

**Interfaces:**
- Consumes: `XNode`; `intervalsOf(kind, degrees)` and `type Degree` from `../harmony.js`; `harteToBarmark`, `parseChord` from `barmark`.
- Produces: `readHarmony(node: XNode, transpose: { chromatic: number; octave: number }): { slot: string; original: string | null }` where `slot` is a barmark slot symbol (`"Cmaj7"`, `"N.C."`, `"?"`) and `original` is the program's display text when `slot` is `"?"`, else null.

- [ ] **Step 1: Write the failing tests**

```ts
test.each([
	["major", [], "C", "C"],
	["minor-seventh", [], "D", "Dm7"],
	["dominant", [{ value: 9, alter: -1, type: "add" }], "G", "G7(b9)"],
])("meaning: %s", (kind, degrees, root, slot) => { /* build <harmony> XML; expect readHarmony(...).slot toBe slot */ });
test("display text when the kind is other", () => { /* <root>C</root><kind text="7alt">other</kind> → "C7alt" */ });
test("Tristan is ? with its text kept", () => { /* <kind text="Tristan">Tristan</kind> → { slot: "?", original: "CTristan" } */ });
test("none is N.C.", () => {});
test("bass", () => { /* C with <bass>E</bass> → "C/E" */ });
test("concert pitch through transpose", () => { /* chromatic -2: written D → "C" */ });
test("round trips every harmony the export writes", () => { /* for every chord symbol in tests/charts.ts corpus: export, read each <harmony>, expect printChord(parseChord(slot)) to equal the original's canonical */ });
```

Use the barmark spellings the existing export tests expect; take each expected `slot` from `parseChord(x).value.canonical`, not by hand.

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** in the spec's order: (1) meaning: `intervalsOf(kind, degrees)` → Harte label `root:(intervals)/bass` → `harteToBarmark`; accept only a named chord (not a `{…}` note set) that `parseChord` accepts; (2) display text: `root + kind@text + (bass ? "/" + bass : "")` through `parseChord`; (3) `"?"` with `original` = that same display string. Roots and basses move by `transpose` with barmark's own note spelling (reuse `written.ts`'s interval arithmetic in reverse).
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** — `feat(musicxml): read chord symbols by meaning, then display text, else ?`

### Task 4: Placing attacks on a slot grid

**Files:**
- Create: `packages/musicxml/src/import/grid.ts`
- Test: `packages/musicxml/tests/import/grid.test.ts`

**Interfaces:**
- Consumes: `Frac`; `beatsOf(meter)` from `barmark`.
- Produces:
  - `type Event = { at: Frac; symbol: string }` (`symbol` already a barmark slot symbol: a chord, `{…}`, a voicing, `--`, `N.C.`, `?`)
  - `placeBar(events: Event[], length: Frac, beats: number, exact: boolean): { cell: string; moved: boolean } | null` → the cell's slots as text (`"C / / D_E_F"`), `moved` when a chord symbol snapped; `null` when `exact` and an event is off every grid.

- [ ] **Step 1: Write the failing tests**

```ts
test.each([
	[[["0", "C"]], "4/4", "C"],
	[[["0", "C"], ["2", "G"]], "4/4", "C G"],
	[[["0", "Am7"], ["3", "G7"]], "4/4", "Am7 / / G7"],
	[[["0", "C"], ["2", "D"], ["8/3", "E"], ["10/3", "F"]], "4/4", "C D_E_F"],
	[[["0", "C"], ["3/4", "D"]], "4/4", "C._D / / /"],
	[[["0", "D"], ["7/2", "G"]], "4/4", "D / / /_G"],
	[[["0", "C"]], "6/8", "C"],
])("places %j in %s as %s", (events, meter, cell) => {});
test("a chord off every grid snaps to the nearest beat", () => { /* at 1/8 of a beat: moved true */ });
test("a note off every grid is null when exact", () => {});
test("pickup bar", () => { /* length 1 in 4/4 (implicit): cell "C" over a one-bar meter [1/4]; placeBar returns cell "[1/4] C" */ });
test("an empty start is a hold", () => { /* first event at beat 2: "/ C" after the caller passed the held symbol "/" */ });
```

`"8/3"` etc. are quarter-note fractions; parse them in the test with `frac`.

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the design's rule: try slot counts n in `[1, 2, beats]` (distinct, each dividing the bar evenly); a count fits when every onset is a slot start, or, inside one slot, at its ½, ⅓/⅔, or ¾ (dotted first) or ¼ (dotted second) point; use the smallest n that fits; an unfilled slot is `/`. A bar whose length differs from the meter's writes a one-bar meter (`[n/d]`, grammar 2.4). With `exact` false, move an off-grid chord to the nearest beat (ties go earlier) and set `moved`.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** — `feat(musicxml): place imported attacks on barmark's slot grid`

### Task 5: Deciding what a part's notes are

**Files:**
- Create: `packages/musicxml/src/import/parts.ts`
- Test: `packages/musicxml/tests/import/parts.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `type LineBars = { name: string | null; bars: (string | null)[] }` (one cell text per measure, `null` where the line rests the whole bar)
  - `type ImportedPart = { name: string; label: string; instrument: InstrumentName | null; lines: LineBars[]; lyrics: ReadPart["measures"]; hasChords: boolean }` (`lines[0]` carries the chords; `lines.length === 1` and `name === null` for a part written bare)
  - `importPart(part: ReadPart, from: { barmark: boolean; forced: boolean }, losses: Losses): ImportedPart | null` (null for a notes-only part neither from barmark nor forced; Task 9 lists those)

- [ ] **Step 1: Write the failing tests**

```ts
test("barmark's own file: chord, voicing, note set, silence", () => { /* export of "| C | Cmaj7{E3 G3 B3} | C {E4} | -- G |" read back: lines[0].bars equals ["C", "Cmaj7{E3 G3 B3}", "C {E4}", "-- G"] */ });
test("a lead sheet is a melody part", () => { /* other software, harmony over melody notes, no slashes: bars are the chords only, losses has "notes read as a melody and left out" */ });
test("lead sheet with attacks on every change", () => { /* each harmony coincides with a melody note: still chords only */ });
test("a comping part with slashes and a voiced hit reads its notes", () => { /* other software, slash notes plus one voiced chord: the voicing comes in */ });
test("a voicing note outside its chord drops the voicing", () => { /* Cmaj7 over C# : "Cmaj7" with a warning */ });
test("marked root comes back as !", () => { /* pitches with root: "{D3 E3! G3 B3}" */ });
test("piano lines named RH and LH", () => { /* two-staff barmark export: lines named RH, LH */ });
test("a one-staff part's lines are 1 and 2", () => {});
test("a part with five voices gives chords alone", () => {});
test("an off-grid note in a line gives chords alone", () => {});
test("notes-only part: barmark file reads it, another file needs --part", () => {});
test("label and instrument", () => { /* part-name "Electric Guitar 1", abbreviation "Gtr." → label "Gtr", instrument "electric guitar" from instrument-name or MIDI program 28 */ });
```

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** with the planning ruling above (structural reading for barmark's files; slash-notated parts only for others; every attack exact). A note tied over a slot or bar line is `/`; slash notes hold; a rest attack is `--`; a line resting a whole bar is `null`. Labels: abbreviation stripped to letters and digits, else the name's initials; Task 9 numbers duplicates. Instrument: match `instrumentName` case-insensitively against `INSTRUMENTS` names, else the GM program in `instrumentInfo`.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** — `feat(musicxml): read a part's notes as voicings, note sets and lines only where they act as chords`

### Task 6: Lyrics

**Files:**
- Create: `packages/musicxml/src/import/lyrics.ts`
- Test: `packages/musicxml/tests/import/lyrics.test.ts`

**Interfaces:**
- Consumes: `Attack["lyrics"]` from Task 2.
- Produces: `lyricLines(measures: ReadMeasure[], line: number): Map<number, string[]>` → for the given measures (one system), verse number → the words sung in them; and `verseText(verses: Map<number, string[]>): string[]` → the text lines (`"1. …"` prefixes when more than one verse).

- [ ] **Step 1: Write the failing tests**

```ts
test("syllables join into words", () => { /* hap(begin) py(end) birth(begin) day(end) → ["happy birthday"] */ });
test("two verses get numbers", () => { /* → ["1. happy birthday", "2. merry christmas"] */ });
test("one verse has no number", () => {});
test("an elision joins with a space", () => {});
test("a word split across the system's end stays whole in the system where it starts", () => {});
```

- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement.** **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** — `feat(musicxml): import lyrics as text lines, whole words per verse`

### Task 7: Marks, sections and repeats

**Files:**
- Create: `packages/musicxml/src/import/structure.ts`
- Test: `packages/musicxml/tests/import/structure.test.ts`

**Interfaces:**
- Consumes: Task 2's `ReadMeasure`.
- Produces:
  - `type BarInfo = { measure: string; heading: string | null; rehearsal: string | null; directives: string | null; textLines: string[]; words: { text: string; at: number }[]; before: string[]; after: string[]; opens: boolean; closes: number | "open" | null; ending: number[] | null }` (`before`/`after` are cells between bars: `Segno`, `Coda`, `To Coda`, `Fine`, `D.S. al Coda`, `...`; `directives` is a directive line such as `"key: G, tempo: 120"`)
  - `readStructure(score: ReadScore, losses: Losses): { bars: BarInfo[]; writtenOut: boolean }` (`writtenOut` when repeats can't be held and bars are in played order instead)

- [ ] **Step 1: Write the failing tests**, one per row of the design's "What it reads" table that isn't a chord or note, and one per entry of "The export's own marks": bold words above → heading; words below → text line; `?` words alone → (consumed; Task 8 writes `?`); "×3" beside `times="3"` → `closes: 3` with no words; `times="1"` + "repeat as needed" → `closes: "open"`; no-break space after "A" → plain space; `<rehearsal>B</rehearsal>` → `rehearsal: "B"`; segno/coda/`<sound dalsegno>` → direction cells; metronome 120 → `tempo: 120`; `<swing>` → `feel:`; key and time changes → directive lines; a fermata at the bar's end → `after: ["..."]`; endings 1 and 2 → `ending`; a repeat crossing a heading → `writtenOut: true` with the warning; marks read once when two parts carry the same heading.
- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement** (score-wide marks from every part, deduplicated by measure and text; `writtenOut` follows the parser's own pairing rules: build the candidate `|:`/`:|`/ending lines and, if `parseChart` reports a repeat error on them, fall back to played order via the file's repeat semantics). **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** — `feat(musicxml): import sections, repeats, endings, jumps and directives`

### Task 8: Writing the chart

**Files:**
- Create: `packages/musicxml/src/import/write.ts`
- Test: `packages/musicxml/tests/import/write.test.ts`

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces: `writeChart(score: ReadScore, parts: ImportedPart[], structure: ReturnType<typeof readStructure>, losses: Losses): string` (canonical text)

- [ ] **Step 1: Write the failing tests**

```ts
test("Morning Song: tutti intro, labelled verse", () => { /* import(export(examples/morning-song)) has the intro as one unlabelled line and the verse as Gtr and Pno lines */ });
test("a replayed section comes back as a replay", () => { /* "## Chorus\n| C | G |\n## Verse\n| D |\n## Chorus" round trips with an empty ## Chorus */ });
test("a replay with new lyrics keeps its words", () => {});
test("a repeated bar is %", () => {});
test("one part throughout has no part: lines", () => {});
test("a resting part is left out of the system", () => {});
test("an LH-only intro writes Pno.LH alone", () => {});
test("systems break at a heading, a repeat, an ending, a direction, ..., a text line, a directive and a change of agreement", () => {});
test("an unreadable chord: ? with its original as words", () => {});
test("duplicate labels are numbered", () => {});
test("the output is canonical and parses without errors", () => { /* every test above: printChart(t) === t, no error diagnostics */ });
```

- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement**: group bars into systems of up to four (the design's "Systems"); per system, write one tutti line where every playing part's `lines[0]` cells are equal and no part carries notes, else each part's lines labelled (`Gtr`, `Pno.RH`); `%` for a cell equal to the previous in its line; replays per the design; credits, title, `part:` declarations (with `instrument:`) first; lyric text lines after each system's rows; then `printChart` and `parseChart` the result, reporting any error as `"importer bug: <message> (line N)"`. **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** — `feat(musicxml): write imported charts in systems, tutti where parts agree`

### Task 9: `importMusicXml` and `readMxl`

**Files:**
- Create: `packages/musicxml/src/import/index.ts`, `packages/musicxml/src/import/mxl.ts`
- Modify: `packages/musicxml/src/index.ts` (export `importMusicXml`, `readMxl`, `type ImportResult`, `type ImportOptions`, `type ImportDiagnostic`)
- Test: `packages/musicxml/tests/import/import.test.ts`, `packages/musicxml/tests/import/mxl.test.ts`, `packages/musicxml/tests/import/roundtrip.test.ts`

**Interfaces:**
- Produces:
  - `type ImportOptions = { part?: string }`; `type ImportResult = { text: string; diagnostics: ImportDiagnostic[] }`
  - `importMusicXml(xml: string, options?: ImportOptions): ImportResult`
  - `readMxl(bytes: Uint8Array): Promise<string>` (throws never: a bad archive rejects with an `Error` whose message names the problem; the CLI turns it into one line)

- [ ] **Step 1: Write the failing tests**

```ts
test("bad XML is an error, not a throw", () => { expect(importMusicXml("<a>").text).toBe(""); });
test("no harmony from another program names the parts and --part", () => {
	expect(importMusicXml(pianoAndBassNoHarmony).diagnostics[0]?.message).toBe(
		"no chord symbols; these parts have notes: Piano, Bass. Import one as note sets with --part");
});
test("--part imports one part alone", () => {});
test("words that look like chord symbols", () => { /* <words>Cmaj7</words> in 12 measures: one warning "text that looks like chord symbols in 12 measures; the program exported them as text" and the words kept */ });
// mxl.test.ts: a stored and a deflated .mxl (build with Bun's zlib in the test), container.xml routing, fallback to the first .musicxml, rootless and truncated archives reject.
// roundtrip.test.ts — the yardstick:
const inScope = corpus().filter(([, t]) => !/[>^+*]|!/.test(...)); // charts with no accents, hits, pushes or pedal; see Step 3
test.each(inScope)("%s plays the same after export and import", (_name, text) => {
	const back = importMusicXml(exportMusicXml(text).xml).text;
	expect(played(back)).toEqual(played(text));
	expect(printChart(back)).toBe(back);
});
```

Define `played(text)` in `tests/import/played.ts`: `parseChart(text).bars` mapped to `[meter, key, tempo, feel, section, rehearsal, words, timeline(slots), parts?.map(p => p && [timeline(p.slots), p.lines?.map(l => timeline(l.slots))])]`, with `timeline` as in `packages/barmark/tests/chart/fixtures.ts` (copy it; the corpus filter excludes charts whose parse has any `articulation`, `push` or `pedal` slot, checked on the parse, not by regex).

- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement** `importMusicXml` as the pipeline (parseXml → readScore → importPart per part, honouring `options.part` → readStructure → writeChart), returning `{ text: "", diagnostics }` on any error. `readMxl`: parse the zip's central directory, inflate with `DecompressionStream("deflate-raw")`, follow `META-INF/container.xml`'s first `rootfile`, else the first `.musicxml`/`.xml`. **Step 4: Run to verify they pass**, fixing what the round trip finds in the module that owns it (each fix a failing unit test first in that module's test file).
- [ ] **Step 5: Commit** — `feat(musicxml): importMusicXml and readMxl`

### Task 10: The export marks a note set's root

**Files:**
- Modify: `packages/musicxml/src/notes.ts` (where a note set's pitches are written)
- Test: `packages/musicxml/tests/notes.test.ts`

**Interfaces:**
- Consumes: `ChordRecord` with a marked root (`record.root` set on a note set).
- Produces: `<note><?barmark root?>…` on the root's note; nothing else changes.

- [ ] **Step 1: Write the failing test**

```ts
test("a marked root is a processing instruction on its note", () => {
	const { xml } = exportMusicXml("# R\n\n| {D3 E3! G3 B3} |\n");
	expect(xml).toContain("<note><chord/><?barmark root?>"); // E3 is the second note
	expect(xml.match(/<\?barmark root\?>/g)?.length).toBe(1);
	expect(validate(xml)).toEqual([]);
});
test("no marker without a marked root", () => { expect(exportMusicXml("# R\n\n| {D3 E3 G3 B3} |\n").xml).not.toContain("<?barmark"); });
```

Check the exact element order MusicXML's schema allows (`<chord/>` first, then the PI is fine anywhere: PIs aren't schema content); adjust the expected string to what the schema-valid output is.

- [ ] **Step 2: Run to verify it fails.** **Step 3: Implement.** **Step 4: Run** `bun test packages/musicxml` — all pass, including the sounding snapshot (`tests/fixtures/sounding.json` is unchanged: a PI sounds nothing).
- [ ] **Step 5: Commit** — `feat(musicxml): mark a note set's root with <?barmark root?>`

Note: Task 9's round trip already covers `!`; run it after this task to see `!` come back.

### Task 11: `barmark import`

**Files:**
- Create: `packages/cli/src/import.ts`
- Modify: `packages/cli/src/main.ts` (`COMMANDS.import`), `packages/cli/src/help.ts` (HELP line and `COMMAND_HELP.import`)
- Test: `packages/cli/tests/import.test.ts`

**Interfaces:**
- Consumes: `importMusicXml`, `readMxl`; the CLI's `parseFlags`, `Io`, `UsageError`, `writeOutput`.
- Produces: `importCommand(args: string[], io: Io): Promise<number>`; usage `barmark import <file.musicxml|file.mxl> [--out file.chart.md] [--part name]`.

- [ ] **Step 1: Write the failing tests** (in-process with the test `Io`, as `export.test.ts` does): a `.musicxml` file prints the chart to stdout, exit 0; `--out` writes the file; `.mxl` is read as bytes and unpacked; diagnostics go to stderr as `file: measure N (Part): message` (without `(Part)` when there's no part, without `measure N` when there's no measure); an import that produced nothing exits 1 and writes no `--out` file; no file → usage error exit 2; `--help import` prints the command help.
- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement** (add a bytes read to `Io` only if it has none; read `.mxl` by extension). **Step 4: Run** `bun test packages/cli` — pass, including the built-bin and binary tests.
- [ ] **Step 5: Commit** — `feat(cli): barmark import`

### Task 12: Real files, docs and records

**Files:**
- Create: `scripts/musescore-fixtures.ts`, `packages/musicxml/tests/fixtures/import/*.mscx` (sources we write), `*.musicxml`, one `*.mxl`, and each `*.chart.md` (expected), `packages/musicxml/tests/import/programs.test.ts`
- Modify: `packages/musicxml/README.md` (an "Import" section; "What it writes" gains the marked root), `packages/musicxml/CHANGELOG.md`, `packages/cli/CHANGELOG.md`, `packages/cli/README.md` (the command), `FINDINGS.md`, `CLAUDE.md` (the `import` command and `src/import/`), `docs/superpowers/specs/2026-11-05-musicxml-import-design.md` (Claude's call 1 to the planning ruling)

- [ ] **Step 1: Write the fixtures' sources** as MuseScore files we author (small, clear licence): a lead sheet with two verses of lyrics and a melody whose notes start on every change; a comping guitar part in slashes with a voiced hit; a piano part with real piano writing; a band score where guitar and piano agree in the intro and differ in the verse.
- [ ] **Step 2: Write `scripts/musescore-fixtures.ts`**: for each source, `mscore -o <name>.musicxml <name>.mscx` (and `-o <name>.mxl` for the lead sheet); it runs on the VM only (`~/.local/bin/mscore`), never in CI.
- [ ] **Step 3: Write the failing tests** in `programs.test.ts`: each MuseScore file imports to its checked-in `.chart.md`, with the design's diagnostics (melody left out; lyrics as text lines; Tristan as `?`).
- [ ] **Step 4: Run** `bun scripts/musescore-fixtures.ts && bun test packages/musicxml/tests/import/programs.test.ts`; fix through the owning module's unit tests until they pass; check each expected chart by reading it against the MuseScore score.
- [ ] **Step 5: Docs and records**: README sections, CHANGELOG `[Unreleased]` entries (musicxml: import, `readMxl`, the root marker; cli: `barmark import`), FINDINGS entries for anything surprising (MuseScore's AppImage needs `xvfb-run` and ignores `QT_QPA_PLATFORM=offscreen` is one), the spec's call 1.
- [ ] **Step 6: Full checks** — `bun test && bun run check && bun run fallow` all pass; `bun run verify:package musicxml && bun run verify:package cli` pass.
- [ ] **Step 7: Commit** — `test(musicxml): MuseScore files for import` and `docs: MusicXML import`

### Task 13: Dorico files (spike, then fixtures)

**Files:**
- Create (if the spike works): `packages/musicxml/tests/fixtures/import/dorico-*.musicxml` and their `.chart.md`; `packages/musicxml/tests/import/dorico-roundtrip.test.ts` (skipped unless `MAC_BENCH_URL` answers)
- Modify: `FINDINGS.md`

- [ ] **Step 1: Spike** in the scratchpad: through mac-bench's Remote Control session, open a barmark export and send `File.Export?FilterID=<MusicXML filter id>` (find the id in the command list mac-bench recorded); see whether a file appears without a dialog.
- [ ] **Step 2a (it works):** export the four Task 12 charts through Dorico, check them in with expected charts; write the round-trip test (barmark → export → Dorico → MusicXML → import → `played` equal, skipped without mac-bench).
- [ ] **Step 2b (it needs a dialog):** record it in FINDINGS and ask Kevin to export the four files from Dorico once; check them in when they arrive.
- [ ] **Step 3: Run** `bun test packages/musicxml` — pass. **Commit** — `test(musicxml): Dorico files for import`.

## After the plan

Merge by pull request with green CI, then release per RELEASING.md (`/release`): `@barmark/musicxml` 0.5.0, `@barmark/cli` 0.6.0, the site's Get Started import line and version bump, the songs bump. Then the next project: structured lyric lines (Kevin, 2026-11-05).
