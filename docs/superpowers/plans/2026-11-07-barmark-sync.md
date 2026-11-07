# @barmark/sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new package, `@barmark/sync` 0.1.0, with three parts. `chartFromDetections` turns Stem Shovel's timed detections into a canonical barmark chart. The timing map keys that chart's played bars to seconds. The confidence record is experimental. `barmark` gains four small key and spelling exports.

**Architecture:**
- `barmark` gets `src/chart/keys.ts`, with `keyFromText`, `conventionalKey`, `printKey` and `spellPitch`. `print.ts` and `transpose.ts` use it.
- `packages/sync` has two entries:
  - `src/timing/` is the subpath `@barmark/sync/timing`. It holds the map's types, `chartHash`, `checkTimingMap`, `barAt` and `secondsAtBar`, and imports nothing from the builder.
  - `src/index.ts` re-exports the timing module and adds the builder.
- The builder works in stages:
  1. Read the input into `Input`: bar spans, symbol runs, directives and sections.
  2. Vote one symbol per slot.
  3. Write chart text, with holds, `%` and the layout.
  4. Print it with `printChart` and parse it once.
  5. Make the timing map and the confidence record from that parse.

**Tech Stack:** Bun workspace, TypeScript strict, Biome (tabs), Fallow, `bun test`. No new runtime dependency: `@barmark/sync` depends only on `barmark` (`workspace:^`).

**Spec:** `docs/superpowers/specs/2026-11-07-detections-to-chart-design.md` (approved by Kevin, 2026-11-07). It is binding; every task reads the sections it names. The grammar draft is not changed.

## Global Constraints

- The package is `packages/sync`, published as `@barmark/sync`, version `0.1.0`. It has `engines: node >=20` and the MIT licence, and its only dependency is `"barmark": "workspace:^"`. Its exports are `"."` and `"./timing"`. The tag prefix is `sync-v`.
- `chartFromDetections(d: Detections, o?: BuildOptions): BuildResult` **never throws**, whatever `d` is. Its `chart` is `printChart` output that parses with **no errors**. `timing` and `confidence` are null exactly when `chart` is `""`.
- The types in spec sections 2–5 are copied **verbatim**: `Detections`, `BuildOptions`, `BuildCode` (exactly the 20 codes), `BuildDiagnostic`, `BuildResult`, `TimingMap`, `TimedBar`, `TimingDiagnostic` and `ConfidenceRecord`.
- The timing map has `format: "barmark-timing"` and `version: 1`. The confidence record has `format: "barmark-confidence"` and `version: 1`, and the README and its doc comment mark it **experimental**.
- `chart.hash` is FNV-1a 64 over the UTF-8 bytes of the chart's `printChart` output, written as 16 lowercase hex digits.
- Every tempo counts grammar 2.1's beat: `beatsOf(meter)` beats a bar, so 6/8 has 2.
- Seconds and confidence never enter the chart text. The grammar does not change.
- The builder writes no repeats, endings, jumps or same-name replays (Kevin's decision: every section is written out in full). `%` is the one shorthand.
- `@barmark/sync/timing` imports nothing from `src/build/`.
- The `barmark` additions are a **minor** change. Each goes under `[Unreleased]` in `packages/barmark/CHANGELOG.md`, and `key:` keeps its current rules.
- Repo rules apply:
  - Test first.
  - `bun test`, `bun run check` and `bun run fallow` stay green, and the Fallow baseline doesn't grow.
  - Each user-visible change gets a CHANGELOG `[Unreleased]` entry.
  - Each surprise gets a FINDINGS.md entry.
  - Commits are conventional, with **no** `Co-Authored-By` or AI trailer.
  - Changes reach `main` only by pull request with green CI.

## Review Focus

1. **Hostile text in titles, section names and `symbol`s**, such as `"Intro\n| C |"`, `"## Coda"`, `"key: G"`, `"%"`, `"Am7 | D7"`, or a name that is only `x2`. The chart keeps its shape:
   - the title is one title line;
   - a section is one heading with its bars;
   - a symbol is one slot or `?`;
   - the played-bar count is the grid's.

   Tests in Tasks 3 and 5.
2. **A long recording:** 1,000 bars and 50,000 frame runs, about what ChordMini gives for a 30-minute file. The build stays linear: ten times the input takes at most 20 times as long. Test in Task 7.
3. **Every key spelling a detector can produce:** each of the 12 pitch classes in each of the 9 modes, plus tonics such as `Cb`, `E#` and `B#`. `conventionalKey` never gives more than 6 accidentals, and `spellPitch` never returns `##` or `bb`. Test in Task 1.
4. **Hand-written or damaged JSON**, such as `null`, an array, `version: "1"`, `bar: 2.5`, a start written as a string, or an entry whose `end` equals its start:
   - `checkTimingMap` returns `map: null` with a diagnostic naming the path, and never throws.
   - `chartFromDetections` given `null`, `{}`, or strings where numbers go reports `grid-unusable`, or skips the bad entry with its warning. It never throws.

   Tests in Tasks 2 and 4.
5. **SS's own objects as stored:** `ChordminiRuns` with `frames` and other extra fields; frame runs whose last `end` passes the grid's end; `SongChange[]` with `confidence`. They read with no complaint beyond `outside-bars`, and extra fields are ignored. Test in Task 4.

## Claude's calls made in this plan

The spec leaves these open. Each is marked where it applies.

- **Where barmark's exports live.** They go in a new `packages/barmark/src/chart/keys.ts`. The key-signature count (`signature`, `MODE_FIFTHS`) moves there from `transpose.ts`, so that `conventionalKey` and `transposeChart` count signatures the same way.
- **What moves onto `spellPitch`.** Only `transposeChart`'s keyless path. A keyed transposition still moves notes by interval, which is unchanged.
- **What `keyFromText` reads.** The tonic letter may be any case. The suffix `m` (lowercase only) means minor. Words (`maj`, `min`, `major`, `minor` and the mode names) may be any case. Whitespace is trimmed and collapsed. Anything else gives `null`, double accidentals included.
- **How `spellPitch` treats modes.** A note in the mode's own scale takes the mode's degree, so locrian's offset 6 is b5. Any other note follows the major-scale map (offsets 1, 3, 6, 8, 10 are b2, b3, #4, b6, b7). A double-accidental result falls back to the sharps or flats table, on the same side as the accidental.
- **An assumed or unreadable meter writes no `time:` line.** The grammar's default is 4/4. A meter that is given is always written.
- **When a detected tempo is dropped, nothing replaces it.** A given tempo that is unreadable writes no `tempo:` line rather than one derived from the grid. `tempo: null` drops only the starting line; tempo changes are still written.
- **Changes snap before runs are spelled.** Key, meter and tempo changes snap to bars first. The key that spells a run is the one in force at the run's start under those snapped changes, so the spelling agrees with the `key:` line the chart shows.
- **Key changes are respelled** with `conventionalKey`, like the starting key. Each respelled change gets its own `key-respelled` info.
- **Overlaps.** The later-starting run wins while it sounds. An earlier run that outlasts it resumes after it ends. With equal starts the longer run wins, and with equal lengths the later in input order. `run-overlap` counts the runs that overlapped an earlier one.
- **`symbol` input.** It must read as exactly one chord, note set, `N.C.` or `?` slot, with no errors. Anything else becomes `?` with `label-unknown`: `/`, `%`, `--`, a group, several slots, or text containing `|` or a newline. An `X` label gives `?` with no build diagnostic; the chart's own `?` warning says it.
- **`frameSec`.** When present but not a positive finite number, there is one `run-invalid` warning at `chords.frameSec` and every run is dropped.
- **Run `confidence`.** A finite value is clamped to 0..1. A non-finite value counts as not given.
- **`%` and directive lines.** `%` is refused on a bar that has any directive line before it, not only a meter change. A directive starts a new line, and `%` stays shorthand inside one passage.
- **Headings and directives on one bar.** The heading comes first, then the directive line.
- **A section snapped to grid bar 1 when there is a pickup.** The heading goes before the pickup, so the section starts at played bar 1. A lead-in belongs to its section.
- **Collisions.** "The later" means the later `start`, with input order breaking ties. A section name that is empty after its marks are stripped (`"x2"`) is `section-unnamed`.
- **`barsPerLine`.** A value that is not a finite number ≥ 1 is taken as 4. Otherwise it is floored. There is no diagnostic, because `BuildCode` is closed.
- **The builder's own timing map** omits `beats`: they would be assumed, not detected. Its `source` is `"detected"`. It never sets `chart.ref` or an entry's `end`.
- **`checkTimingMap`'s returned map.** It returns the value itself, typed, whenever there is no error. Warnings don't null it. With a chart given, a played bar the map never names is a **warning** (coverage), and `chart.bars` differing from the parse's bar count is an error.
- **`barAt`.** A time equal to an entry's start belongs to that entry. `map.end` and later, times before the first start, and non-finite times all give `null`.
- **`@barmark/sync` re-exports `@barmark/sync/timing`,** so SS needs one import.
- **A `@barmark/sync` release needs no CLI release or `songs` bump.** The CLI doesn't bundle it.
- **The real-data script** takes key and meter from the song's chart in stem-bench's `corpus/fixture-mmkk.json` (the first `key:` and `time:` its parse finds), and passes no tempo.

---

### Task 1: barmark: keys, spelling, and `transposeChart` on `spellPitch`

**Files:**
- Create: `packages/barmark/src/chart/keys.ts`, `packages/barmark/tests/chart/keys.test.ts`
- Modify:
  - `packages/barmark/src/chart/index.ts`: export the four functions
  - `src/chart/print.ts`: import `printKey` and delete the private copy
  - `src/chart/transpose.ts`: `TABLE`, `signature` and `MODE_FIFTHS` come from `keys.ts`; the keyless `moveBy` path calls `spellPitch(pc, null)`
  - `src/chart/directives.ts`: `parseKey` is unchanged in behaviour, and may share `MODES` with `keys.ts`
  - `packages/barmark/README.md` ("Use": one line each), `tests/readme.test.ts`, `packages/barmark/CHANGELOG.md` (`[Unreleased]` → `### Added`, plus a `### Technical` line for the shared table)

**Interfaces:**
- Produces, all exported from `barmark`:
  - `keyFromText(text: string): Key | null`
  - `conventionalKey(key: Key): Key`
  - `printKey(key: Key): string`
  - `spellPitch(pitchClass: number, key: Key | null): string` (the pitch class is taken mod 12)
- Internal to barmark: `signature(tonic: string, mode: Mode): number` (sharps positive, flats negative).

- [ ] **Step 1: Write the failing tests** in `keys.test.ts`.
  - `"keyFromText reads key: values and detector forms"`. Each input maps to a key:
    - `"F♯ minor"` → `{F#, minor}`
    - `"D major"` → `{D, major}`
    - `"Bb Maj"` → `{Bb, major}`
    - `"E♭ min"` → `{Eb, minor}`
    - `"C#m"` → `{C#, minor}`
    - `"f# MINOR"` → `{F#, minor}`
    - `"A Mixolydian"` → `{A, mixolydian}`
    - `"  G  "` → `{G, major}`
  - `"keyFromText rejects what isn't a key"`: `"H"`, `"C##"`, `"Cm7"`, `""`, `"C sharp"` and `"CM"` all give `null`.
  - `"key: keeps its rules"`: `parseChart("key: Bb Maj\n| C |\n")` still reports the error it reports today.
  - `"conventionalKey takes the fewest accidentals"`:
    - `Ab minor` → `G# minor`
    - `C# major` → `Db major`
    - `Cb major` → `B major`
    - `A# minor` → `Bb minor`
    - `B# major` → `C major`
    - `G# mixolydian` → `Ab mixolydian`
  - `"a tie keeps the spelling given"`: `Eb minor`, `D# minor`, `F# major` and `Gb major` are each unchanged.
  - `"printKey is the canonical key: value"`: `{F#, minor}` → `"F#m"`, `{A, mixolydian}` → `"A mixolydian"`, `{D, major}` → `"D"`.
  - `"spellPitch: the key's own notes take its signature"`: with D major, 1 → `"C#"` and 6 → `"F#"`. With F# major, 5 → `"E#"`.
  - `"spellPitch: other notes by degree, bIII bVI bVII flat in sharp keys"`: with D major, 10 → `"Bb"` and 0 → `"C"`. With E major, 7 → `"G"`. With Bb major, 3 → `"Eb"`. With A minor, 8 → `"G#"`.
  - `"spellPitch: a double accidental falls back"`: 2 in `G# minor` → `"D"` (not `C##`).
  - `"spellPitch with no key is transpose's table"`: pitch classes 0..11 give `C C# D Eb E F F# G Ab A Bb B`.
  - `"every pitch class and mode"` (Review Focus 3): for every pc 0..11, every mode, and the tonics `SHARPS[pc]`, `FLATS[pc]`, `Cb`, `Fb`, `E#` and `B#`:
    - `Math.abs(signature(conventionalKey(k)))` is ≤ 6;
    - `spellPitch(q, k)` matches `/^[A-G][#b]?$/` for every q.
  - The existing `transpose.test.ts` stays green unchanged, as the pin that keyless transposition didn't move.
- [ ] **Step 2: Run** `bun test packages/barmark/tests/chart/keys.test.ts`. Expected: FAIL (no `keys.js`).
- [ ] **Step 3: Implement** `keys.ts` as the Claude's calls above describe. `spellPitch(pc, key)`:
  1. Take `s = mod(pc − pc(tonic), 12)`.
  2. Find the interval: the mode's scale degree when `s` is in the mode's scale, else the major-scale map `{0:1, 1:b2, 2:2, 3:b3, 4:3, 5:4, 6:#4, 7:5, 8:b6, 9:6, 10:b7, 11:7}`.
  3. Spell it with `transpose(tonic, interval)`.
  4. Pass the result through transpose.ts's `plain` (move it to `keys.ts` too).

  `conventionalKey` takes candidates in the order [given, `SHARPS[pc]`, `FLATS[pc]`] and the first with the least `|signature|`.
- [ ] **Step 4: Run** `bun test packages/barmark`, then `bun run check` and `bun run fallow`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(barmark): keyFromText, conventionalKey, printKey and spellPitch`.

### Task 2: The `@barmark/sync` package and the timing map

**Files:**
- Create in `packages/sync/`:
  - `package.json`: as musicxml's, with exports `"."` → `./dist/index.{d.ts,js}` and `"./timing"` → `./dist/timing/index.{d.ts,js}`, `"sideEffects": false`, version `0.1.0`
  - `tsconfig.build.json` (musicxml's), `LICENSE`, `CHANGELOG.md` (an empty `[Unreleased]` with `### Added`), `README.md`
  - `src/index.ts` (for now `export * from "./timing/index.js"`)
  - `src/timing/index.ts`, `types.ts`, `hash.ts`, `check.ts` and `lookup.ts`
  - `tests/timing.test.ts` and `tests/hash.test.ts`
- Create: `scripts/smoke-sync.mjs`
- Modify:
  - `tsconfig.json`: paths `@barmark/sync` and `@barmark/sync/timing`
  - `scripts/lib.ts`: `PACKAGES.sync` (`tagPrefix: "sync-v"`, `smoke: "scripts/smoke-sync.mjs"`)
  - `scripts/verify-package.ts`: `CONTENTS.sync`, which requires `dist/index.js`, `dist/index.d.ts`, `dist/timing/index.js` and `dist/timing/index.d.ts`, and allows `/^dist\/.+\.(js|d\.ts)$/`
  - `.github/workflows/ci.yml`: matrix `pkg` adds `sync`
  - `.github/workflows/release.yml`: a `sync-v*)` case, and the error text names it
  - `extensions/behaviors/barmark_checks.ts` (`PkgArg` enum and description) and `workflows/workflow-release-check.yaml` (enum)
  - `RELEASING.md`: the table, and the "`<pkg>` is …" lines; a line saying a sync release needs no CLI release (Claude's call)
  - `.claude/skills/release/SKILL.md` (the package list), `CLAUDE.md` (Layout: `packages/sync/`)
  - `bun.lock`: via `bun install`

**Interfaces:**
- Produces, from `@barmark/sync/timing` and `@barmark/sync`:
  - the types `Seconds`, `TimingMap`, `TimedBar` and `TimingDiagnostic`, verbatim from spec section 4
  - `fnv1a64(text: string): string` (internal to `hash.ts`)
  - `chartHash(text: string, parse?: ChartParse): string`, which is `fnv1a64(printParsed(text, parse ?? parseChart(text)))`
  - `checkTimingMap(value: unknown, chart?: { text: string; parse?: ChartParse }): { map: TimingMap | null; diagnostics: TimingDiagnostic[] }`
  - `barAt(map: TimingMap, t: Seconds): { entry: number; bar: number; fraction: number; paused?: true } | null`
  - `secondsAtBar(map: TimingMap, bar: number, pass?: number): Seconds | null`

- [ ] **Step 1: Write the failing tests.**
  - `hash.test.ts`, `"FNV-1a 64 test vectors"`:
    - `""` → `"cbf29ce484222325"`
    - `"a"` → `"af63dc4c8601ec8c"`
    - `"foobar"` → `"85944171f73967e8"`
    - `"| C |\n"` → `"c69999f63a2ad360"`
    - `"# Café\n| C |\n"` → `"8b0d0da57b7bd60b"` (UTF-8 bytes)
  - `hash.test.ts`, `"chartHash hashes the printed chart"`: `chartHash("|C|")` equals `chartHash("| C |\n")`.
  - `timing.test.ts` uses `ok = { format: "barmark-timing", version: 1, chart: { bars: 3, hash }, bars: [{bar:1,start:0},{bar:2,start:2,end:3.5},{bar:3,start:4,beats:[4.5,5,5.5]}], end: 6 }`, where `hash = chartHash("| C | D | E |")`. Its tests:
    - `"a valid map passes, with and without its chart"`: no diagnostics, and `map` is the same object.
    - `"unknown fields are kept"`: `{...ok, extra: 1}` passes, and `map.extra` is still there.
    - `"each rule has its error, with a path"`, one case each:
      - starts not increasing (`bars[1].start = 0`, path `"bars[1].start"`)
      - `end` ≤ last start (`"end"`)
      - an entry `end` ≤ its start, or after the next start (`"bars[1].end"`)
      - `bar` 0, 4 (> `chart.bars`) or 2.5 (`"bars[0].bar"`)
      - `beats` not increasing, at or before `start`, or at or after the entry's end (`"bars[2].beats"`)
      - `format` wrong (`"format"`)
      - `version: 2` and `version: "1"` (`"version"`, message names the version)
      - `chart.hash` not 16 lowercase hex digits (`"chart.hash"`)
    - `"junk never throws"` (Review Focus 4): `null`, `[]`, `"map"`, `{}`, and `ok` with `bars[0].start = "0"`. Each gives `map: null` and at least one error.
    - `"a recurring bar and missing bars are fine"`: bars 1, 2, 2, 3, then the same with bar 2 left out. Both pass without a chart.
    - `"with the chart: hash mismatch"`: `checkTimingMap(ok, { text: "| C | D | F |" })` gives one error with `code: "chart-hash-mismatch"` and path `"chart.hash"`.
    - `"with the chart: beat counts"`: in 4/4, bar 3's `beats` of length 2 is an error. A 6/8 chart wants 1 beat.
    - `"with the chart: chart.bars must match, and coverage is a warning"`: `chart.bars: 4` against a 3-bar chart is an error. A map with no bar 2 gives one warning, and `map` is not null.
    - `"barAt"`:
      - `barAt(ok, 0)` → `{entry:0, bar:1, fraction:0}`
      - `barAt(ok, 1)` → fraction `0.5`
      - `barAt(ok, 3)` → `{entry:1, bar:2, fraction:2/3}`
      - `barAt(ok, 3.75)` → `{entry:1, bar:2, fraction:1, paused:true}`
      - `barAt(ok, 4)` → entry 2
      - `barAt(ok, 6)`, `barAt(ok, -1)` and `barAt(ok, NaN)` → `null`
    - `"secondsAtBar"`: on a map whose bars run 1, 2, 2, 3:
      - `secondsAtBar(m, 2)` is the first 2's start, and `secondsAtBar(m, 2, 2)` the second's;
      - `secondsAtBar(m, 2, 3)`, `secondsAtBar(m, 9)` and `secondsAtBar(m, 2, 0)` are `null`.
- [ ] **Step 2: Run** `bun test packages/sync`. Expected: FAIL (modules not found).
- [ ] **Step 3: Implement** in `src/timing/`.
  - `fnv1a64` uses BigInt over `new TextEncoder().encode(text)`. The offset basis is `0xcbf29ce484222325n` and the prime is `0x100000001b3n`; mask to 64 bits each step and pad to 16 digits.
  - `barAt` binary-searches the starts.
  - `checkTimingMap` is hand-written (no schema library) and collects every problem rather than stopping at the first.
- [ ] **Step 4: Write `scripts/smoke-sync.mjs`**, following smoke-musicxml's shape (`node scripts/smoke-sync.mjs <module> <chart>`).
  - It imports the entry. It imports the timing subpath one of two ways:
    - locally, by reading `exports["./timing"].import` from the package.json beside `dist/` and importing that file, so a wrong exports map fails;
    - from npm (a bare specifier), as `` `${spec}/timing` ``, so Node's own exports resolution is used.
  - It checks that `chartHash(chart)` is 16 hex digits.
  - It checks that `checkTimingMap` of a one-entry map with that hash and the chart reports nothing.
  - It checks that the timing module's export names are exactly `barAt`, `chartHash`, `checkTimingMap` and `secondsAtBar`.
  - It prints JSON and exits 1 on any miss.
- [ ] **Step 5: Write the README:**
  - what the package is;
  - a "The timing map" section with the types and **every rule** of spec section 4 as bullets;
  - the versioning promise from spec section 1: an optional field keeps the version, anything a v1 reader would misread bumps it, and readers reject an unknown version;
  - the API of `@barmark/sync/timing`.

  Add a FINDINGS.md entry "A path import never reads `exports`": the symptom (verify-package imports `dist/index.js` by path, which can't catch a wrong `./timing` map), the fix (the smoke reads the map locally, and the release's `confirm` job imports by name) and where it lives.
- [ ] **Step 6: Run** `bun install`, `bun test packages/sync`, `bun run check`, `bun run fallow`, `bun run verify:package sync` and `bun run verify:release sync --allow-dirty`. Expected: all pass. verify:release reports nothing, because 0.1.0 is untagged and not on npm, and `barmark` 0.17.1 is on npm.
- [ ] **Step 7: Commit** `feat(sync): the package and the timing map`.

### Task 3: Reading detections: grid, meter, key and chord runs

**Files:**
- Create in `packages/sync/`:
  - `src/build/types.ts`: the spec section 2–3 types, verbatim
  - `src/build/report.ts`, `src/build/input.ts`, `src/build/spell.ts`, `src/build/runs.ts`
  - `tests/input.test.ts`, `tests/runs.test.ts`

**Interfaces:**
- Consumes: `keyFromText`, `conventionalKey`, `spellPitch`, `parseMeter`, `beatsOf`, `harteToBarmark` and `parseChart` from `barmark`.
- Produces:
  - `type Where = { path?: string; at?: Seconds; bar?: number }`
  - `type Report = { error(code: BuildCode, message: string, where?: Where): void; warning(…): void; info(…): void; readonly list: BuildDiagnostic[] }`, and `createReport(): Report`
  - `type BarSpan = { start: Seconds; end: Seconds; meter: Meter; beats: number; pickup?: true }`. `beats` is the bar's slot count.
  - `type SymbolRun = { start: Seconds; end: Seconds; symbol: string; confidence?: number }`. `symbol` is canonical slot text: a chord's `canonical`, `"N.C."` or `"?"`. Runs are sorted and never overlap.
  - `type BarChange = { key?: Key; meter?: Meter; tempo?: number }`
  - `type Input = { title: string | null; bars: BarSpan[]; key: Key | null; meter: Meter; meterWritten: boolean; tempo: number | null; changes: Map<number, BarChange>; sections: Map<number, string>; runs: SymbolRun[]; confidence: { key?: number; meter?: number; tempo?: number; sections: Map<number, number> } }`. The maps are keyed by index into `bars`.
  - `readInput(d: unknown, report: Report): Input | null`. It returns null when the grid is unusable. In this task `title` is null, `tempo` is null, and `changes` and `sections` are empty; Task 5 fills them.
  - `detected<T>(v: unknown, ok: (x: unknown) => x is T): { value: T; confidence?: number } | null`
  - `labelSymbol(label: string, key: Key | null): string | null` and `slotSymbol(symbol: string): string | null` (both cached by input)
  - `symbolRuns(chords: unknown, keyAt: (t: Seconds) => Key | null, report: Report): SymbolRun[]`
  - `cutRuns(runs: SymbolRun[], bars: BarSpan[], report: Report): SymbolRun[]`

- [ ] **Step 1: Write the failing tests.**
  - `input.test.ts`:
    - `"fewer than two finite bar starts is grid-unusable"`: `{bars:[1]}`, `{bars:[NaN, 2]}`, `{}`, `null` and `"x"` each give `null` and one error `grid-unusable` at path `"grid.bars"`.
    - `"unsorted and duplicate starts are mended once"`: `[4, 0, 2, 2.0005, Infinity]` gives starts `0, 2, 4` (two bars) and one `grid-unsorted` warning.
    - `"meter"`:
      - none gives 4/4, `meterWritten: false` and `meter-assumed` (info);
      - `"7/7"` gives 4/4 and `meter-unreadable` (warning);
      - `{ value: "6/8", confidence: 0.7 }` gives 2 beats a bar, `meterWritten: true` and `confidence.meter` 0.7.
    - `"bar spans divide into beats"`: grid `[0, 3, 6]` in 6/8 gives `[{start:0,end:3,beats:2},{start:3,end:6,beats:2}]`.
    - `"key"`:
      - `"F♯ minor"` gives `{F#, minor}`;
      - `"Ab minor"` gives `{G#, minor}` with `key-respelled` (info);
      - `"H dur"` gives `null` with `key-unreadable`;
      - omitted or `null` gives `null` with no diagnostic.
  - `runs.test.ts`:
    - `"labels are respelled for the key"`:
      - `labelSymbol("D#:min", Bb)` = `"Ebm"`;
      - `labelSymbol("A#:maj", D)` = `"Bb"`;
      - `labelSymbol("A:min6", null)` = `"Am6"`;
      - `labelSymbol("C:hdim7", null)` = `"Cm7(b5)"`;
      - `"N"` gives `"N.C."` and `"X"` gives `"?"`.
    - `"a double accidental retries the enharmonic root"`: `labelSymbol("D#:maj/3", E major)` = `"Eb/G"`.
    - `"unreadable labels"`: `labelSymbol("H:maj", null)` and `labelSymbol("C:constructor", null)` are `null`.
    - `"symbols are read as one slot"` (Review Focus 1):
      - `slotSymbol` of `"Am7"`, `"{C E G}"`, `"N.C."` and `"?"` gives each back canonical;
      - `"| C | D"`, `"C\nD"`, `"H7"`, `"/"`, `"%"`, `"--"`, `"C_D"` and `"C D"` are `null`.
    - `"frames convert by frameSec"`: `{runs:[{start:0,end:22,label:"C:maj"}], frameSec: 0.5}` gives a run from 0 to 11 s.
    - `"invalid runs: one warning each, capped at ten"`:
      - 12 runs with `end <= start` give 11 `run-invalid` warnings, the last saying "2 more";
      - each of the first ten has path `"chords.runs[i]"`;
      - a run with both `label` and `symbol`, or neither, is invalid;
      - `frameSec: 0` drops every run with one warning at `"chords.frameSec"`.
    - `"overlaps: the later onset wins, the earlier resumes"`. `C` 0–10 and `G` 2–3 give `C` 0–2, `G` 2–3 and `C` 3–10, with one `run-overlap` warning naming 1. Two runs at an equal start keep the longer.
    - `"label-unknown once per distinct label"`: three runs of `"Q:maj"` and one of `"Z"` give two warnings. Their symbols are `"?"`.
    - `"runs are cut at the bars, with outside-bars per side"`, on bars 0–8 (4/4, beat 0.5):
      - runs from −3 to 1 and 7 to 9.4 give two `outside-bars` warnings, saying 3 s and 1.4 s;
      - an `N` run before bar 1 loses time silently;
      - under a beat lost gives no warning.
- [ ] **Step 2: Run** `bun test packages/sync/tests/input.test.ts packages/sync/tests/runs.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The order of reads inside `readInput` is the spec's: grid, meter, key, then runs.
  - The grid's dedupe tolerance is 1 ms.
  - `slotSymbol` parses `` `| ${s} |` `` with `parseChart` after rejecting `|` and newlines. It accepts one simple chord, `nc` or `unknown` slot, with no diagnostics other than the `?` warning.
  - The overlap sweep and the cut are O(n log n) for the sort and linear after it.
  - Respelling replaces the label's root (`/^[A-G][#b]*/`) with `spellPitch(pc(root), key)`. When the result of `harteToBarmark` contains `##` or `bb`, it retries with the other entry of a local sharps/flats table. If the retry is no better, it keeps the first result.
- [ ] **Step 4: Run** the tests, `bun run check` and `bun run fallow`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(sync): read grids, meters, keys and chord runs`.

### Task 4: Slots, holds and `%`; `chartFromDetections` with its timing map

**Files:**
- Create in `packages/sync/`:
  - `src/build/vote.ts`, `src/build/write.ts`, `src/build/timing.ts`, `src/build/build.ts`
  - `tests/vote.test.ts`, `tests/build.test.ts`
- Modify:
  - `src/index.ts`: export `chartFromDetections` and the build types
  - `scripts/smoke-sync.mjs`: also build a four-bar chart, and check that it parses cleanly and that `checkTimingMap(timing, {text: chart})` is clean
  - `README.md`: a "Build a chart" section with one example
  - `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 3's `Input`, `BarSpan`, `SymbolRun`, `Report` and `readInput`; Task 2's `chartHash` and `TimingMap`.
- Produces:
  - `voteSlots(bars: BarSpan[], runs: SymbolRun[], report: Report): string[][]`: one symbol per slot per bar, `"?"` where under half covered.
  - `writeChart(input: Input, symbols: string[][], options: { simile: boolean; barsPerLine: number }): string`: chart text before printing.
  - `timingOf(parse: ChartParse, input: Input, chart: string, recording: unknown): TimingMap`.
  - `chartFromDetections(d: Detections, o?: BuildOptions): BuildResult`. In this task `confidence` is `null`; Task 6 fills it.

All examples use `meter: "4/4"`, `tempo: null` and no key, so beats are 0.5 s on a grid of 2-second bars.

- [ ] **Step 1: Write the failing tests.**
  - `vote.test.ts`, one test per rule of spec 6.3:
    - `"plurality of covered time"`: grid `[0,2,4,6,8]` with `C` 0–4, `G` 4–6, `F` 6–7 and `C` 7–8 gives `time: 4/4\n| C | / | G | F C |\n`.
    - `"a change just off the beat lands on it"`: `C` 0–4.2 and `G` 4.2–8 give `| C | / | G | / |`.
    - `"a tie goes to the chord at the slot's start"`: slot 0–0.5 with `C` 0–0.25 and `G` 0.25–0.5 gives `C`.
    - `"then to the earlier-starting run"`: with nothing at 0, `C` 0.1–0.3 and `G` 0.3–0.5 give `C`.
    - `"under half covered is ?, warned once per stretch"`: grid `[0,2]` with `C` 0–1 gives `| C ? |` and one `no-chord-detected` with `bar: 1` and `at: 1`.
    - `"a short chord between long ones is outvoted"`: `C` 0–0.9, `D` 0.9–1.1 and `C` 1.1–2 give `| C |`.
  - `build.test.ts`:
    - `"holds across bar lines; the first slot is named"`: a `?` first bar is written `?`, not `/`.
    - `"N.C. and ? hold too"`: two bars of `N` give `| N.C. | / |`.
    - `"% for a repeated multi-chord bar"`: `C G` three times gives `| C G | % | % |`, and with `simile: false` gives `| C G | C G | C G |`. A held one-chord bar stays `/`.
    - `"barsPerLine"`: 6 bars at the default give lines of 4 and 2. With 2 they give 3 lines. With `0` or `NaN` they give 4.
    - `"the timing map"`: grid `[0,2,4]` with `recording: {id:"r1", duration:4.5}` gives `bars` `[{bar:1,start:0},{bar:2,start:2}]`, `end: 4`, `chart.bars: 2`, `chart.hash === chartHash(chart)`, `source: "detected"`, the recording copied, and no `beats`. `checkTimingMap(timing, {text: chart})` reports nothing.
    - `"an unusable grid"`: the result is `{ chart: "", timing: null, confidence: null }` with the error.
    - `"junk never throws"` (Review Focus 4): `null`, `{}`, `{grid:{bars:"0,2"}}`, `{grid:{bars:[0,2]}, chords:null}` and `{grid:{bars:[0,"2",4]}, chords:{runs:"x"}}` each return without throwing. Each has a chart that parses with no errors, or `""` with `grid-unusable`.
    - `"SS's stored shapes read as they are"` (Review Focus 5): `ChordminiRuns` has `{frameSec, frames, vocab, runs:[{start,end,label,extra}]}`, its last run ending 30 frames past the grid's end, plus `changes` of `SongChange` shape with `confidence`. The only diagnostics are `outside-bars` and `meter-assumed`.
- [ ] **Step 2: Run** `bun test packages/sync`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - `voteSlots` sweeps the sorted runs once with a moving index. It is linear in slots plus runs, with no per-slot scan of all runs.
  - `writeChart`:
    1. Applies holds (spec 6.3.5).
    2. Applies `%` (6.3.6), comparing the held slot arrays.
    3. Lays out (6.5 "Layout"). A pickup is an extra bar on the first line (Task 5).
  - `chartFromDetections`:
    1. Clamps the options.
    2. Calls `readInput`, `voteSlots` and `writeChart`, then `printChart`, then `parseChart` once, then `timingOf`.

    "Never throws" comes from reading every input field defensively, not from a catch-all `try`. A throw would be a bug, so it must surface; the Task 7 fuzz pins its absence.
- [ ] **Step 4: Run** `bun test packages/sync`, `bun run check`, `bun run fallow` and `bun run verify:package sync`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(sync): chartFromDetections, slots, holds and simile`.

### Task 5: Title, sections, directives, tempo and the pickup

**Files:**
- Create in `packages/sync/`: `src/build/marks.ts` (title, sections, changes, tempo, pickup), `tests/marks.test.ts`
- Modify: `src/build/input.ts` (`readInput` fills `title`, `tempo`, `changes`, `sections`, a pickup `BarSpan`, and a `keyAt` that follows key changes), `src/build/write.ts` (headings, directive lines, restating at a section's first bar, `%` refusals), `README.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 3's `Input`, `BarSpan`, `BarChange` and `Report`; Task 4's `writeChart` and `chartFromDetections`.
- Produces:
  - `snapToBar(t: Seconds, bars: BarSpan[]): number | "after"`: the index into `bars`. The pickup is never a target. A tie goes to the later bar, and before bar 1 means the first grid bar. `"after"` means the grid's end.
  - `cleanTitle(t: unknown): string | null`
  - `sectionName(name: unknown, report: Report, path: string): string | null`
  - `gridTempo(bars: BarSpan[]): number`: 60 ÷ the median beat length.

Examples use grid `[0,2,4,6,8]` and 4/4 unless they say otherwise.

- [ ] **Step 1: Write the failing tests** in `marks.test.ts`.
  - `"title whitespace collapses; an empty title is left out"`: `"  Morning\n Song  "` gives `# Morning Song`, and `"  "` gives no title line.
  - `"hostile titles and names keep the chart's shape"` (Review Focus 1). Titles `"Intro\n| C |"` and `"## Coda"`, and section names `"key: G"`, `"| C |"` and `"%"`:
    - the parse has one `title` or heading per input;
    - `bars.length` equals the grid's bar count;
    - there are no errors.
  - `"sections snap to the nearest bar start"`: starts 0.1, 4.9, 5.0 and −3 land on bars 1, 3, 4 and 1.
  - `"a section's first bar restates a held chord"`: `C` throughout, with `Chorus` at 4, gives `## Chorus\n| C |`.
  - `"repeat and elision marks are stripped"`:
    - `"Chorus x2"`, `"Chorus X 2"`, `"Outro x ..."` and `"Bridge ->"` become `Chorus`, `Chorus`, `Outro` and `Bridge`, each with `section-marks-stripped`;
    - `"x2"` and `"  "` are dropped with `section-unnamed`.
  - `"two sections on one bar: the later wins"`, with `section-collision`.
  - `"a section at the grid's end is after-last-bar"`: start 7.9.
  - `"a name may recur, written out in full"`: `Chorus` twice gives two headings with their bars, and no replay.
  - `"% is refused on a section's first bar and after a directive"`: `C G` bars around a `Chorus` start, and around a `meter`, `key` or `tempo` change, show no `%` on the bar after.
  - `"tempo"`:
    - `87.5` gives `tempo: 87.5`;
    - omitted gives `tempo: 120`;
    - bars of 2, 2 and 2.2 s still give `120` (the median);
    - `null` gives no line;
    - `60` gives `tempo-grid-disagree`, and `130` gives nothing;
    - `0`, `1000`, `NaN` and `"fast"` give `tempo-unreadable` and no line.
  - `"a 6/8 tempo in eighths disagrees"`: grid bars of 3 s in 6/8 with `tempo: 120` give `tempo-grid-disagree`.
  - `"changes"`:
    - a key change at 4.1 gives a `key: D` line before bar 3;
    - a key change to `"Ab minor"` is written `key: G#m`, with `key-respelled` (info) at path `"changes[0]"`;
    - one already in force is dropped silently;
    - two key changes on bar 3 keep the later, with `change-collision`;
    - a change at bar 1 replaces the starting value;
    - `meter` `"3/4"` gives three slots a bar from there;
    - key, meter and tempo on one bar give `key: D, time: 3/4, tempo: 90`;
    - `"7/7"` and `kind: "feel"` give `change-unreadable`;
    - a change at 7.9 gives `after-last-bar`.
  - `"a run across a key change keeps the spelling of its start"`: key E, a key change to D at 4, and `A#:maj` 2–8 give `| A# | / |\nkey: D\n| / | / |`, before printing reduces it.
  - `"a run after a key change is spelled in the new key"`: `A#:maj` at 4–6 after `key: D` gives `Bb`.
  - `"pickup"`:
    - grid `[1,3,5]` with `pickup.start` 0.5 gives `| [1/4] G | …` on the first line, and timing bar 1 starts at 0.5, with grid bar 1 as map bar 2;
    - in 6/8 (bars of 3 s) a pickup 1.5 s long gives `[3/8]`;
    - a pickup of 0.1 s, or one of four beats or more, gives `pickup-ignored` (info) and no pickup bar;
    - a section snapped to grid bar 1 is written before the pickup.
  - `"outside-bars is measured from the pickup"`: runs from 0 to 1 with a pickup at 0.5 lose only 0.5 s, so there is no warning.
- [ ] **Step 2: Run** `bun test packages/sync/tests/marks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The strip pattern is `/\s*(?:x\s*\d+|x\s*\.\.\.|->)\s*$/i`, applied once.
  - Tempo disagreement compares each given tempo with `gridTempo` over the bars where it is in force. The threshold is |given − grid| / grid > 0.15.
  - The pickup length is `k = Math.round((bars[0].start − pickup.start) / beatLength(bar 1))`. A one-bar meter of `k` beats is `[k/d]` in a simple meter and `[3k/8]` in a compound one.
- [ ] **Step 4: Run** `bun test packages/sync`, `bun run check` and `bun run fallow`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(sync): titles, sections, directives, tempo and pickups`.

### Task 6: The confidence record

**Files:**
- Create in `packages/sync/`: `src/build/confidence.ts`, `tests/confidence.test.ts`
- Modify: `src/build/build.ts` (set `confidence`), `src/index.ts` (export `ConfidenceRecord`), `README.md` ("The confidence record (experimental)"), `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 3's `Input` and `SymbolRun`; Task 4's `chartFromDetections`.
- Produces: `ConfidenceRecord`, verbatim from spec section 5, with a doc comment that says "Experimental", and `confidenceOf(parse: ChartParse, input: Input): ConfidenceRecord`.

- [ ] **Step 1: Write the failing tests.**
  - `"agreement times detector confidence"`: grid `[0,2]` in 4/4 with `C` 0–1 at confidence 0.8 and `G` 1–2 with none gives `| C G |`, slots `[0.8, 1]` and bar confidence `0.9`.
  - `"disagreement lowers agreement"`: in 2/4 on grid `[0,2]`, `C` 0–1.3 and `G` 1.3–2 give slots `[1, 0.7]` and bar `0.85`.
  - `"a slot the printer merged takes its span"`: 4/4 with `C` 0–0.9 and `G` 0.9–2 gives `| C G |` and slots `[0.9, 1]`.
  - `"a hold counts as the chord it holds"`: `| C | / |` gives bar 2 slots `[1]`.
  - `"? is 0"`, and `"a % bar has its own values"`.
  - `"key, meter, tempo and sections from their wrappers"`:
    - `key: {value:"D major", confidence:0.6}` gives `key: 0.6`;
    - a section `{name, start, confidence:0.5}` gives `sections: [{bar, confidence:0.5}]`;
    - a bare value gives no field.
  - `"run confidence is clamped"`: 1.5 counts as 1, −1 as 0, and `NaN` as not given.
  - `"one entry per played bar, slots line up"`: for a mixed chart with a pickup, `confidence.bars.length === parse.bars.length`, and each `slots.length` equals that bar's `slots.length`.
  - `"null exactly when the chart is empty"`.
- [ ] **Step 2: Run** `bun test packages/sync/tests/confidence.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `confidenceOf`.
  - Slot j of n in a played bar spans `start + j/n·len` to `start + (j+1)/n·len`. Bar i's span is `input.bars[i]`; played bars match `input.bars` one to one, because the builder writes no repeats.
  - A hold's symbol is the last named slot's.
  - It reuses Task 4's sweep over runs; there is no second O(slots × runs) pass.
- [ ] **Step 4: Run** `bun test packages/sync`, `bun run check` and `bun run fallow`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(sync): the confidence record (experimental)`.

### Task 7: The yardsticks: round trip, robustness, fuzz and scale

**Files:**
- Create in `packages/sync/`:
  - `tests/helpers/fromChart.ts` (`runsFromChart`)
  - `tests/helpers/fuzz.ts` (a seeded generator)
  - `tests/roundtrip.test.ts`, `tests/fuzz.test.ts`, `tests/scale.test.ts`

**Interfaces:**
- Consumes: `chartFromDetections`, `checkTimingMap`, and `parseChart`, `printChart` and `toHarte` from barmark. The grammar's example comes through `AT_A_GLANCE` in `packages/barmark/tests/chart/fixtures.ts`.
- Produces (test-only):
  - `runsFromChart(parse: ChartParse, o: { startAt: Seconds; tempo: number; jitter?: number; drift?: number; seed?: number }): Detections`. It renders the played bars:
    - each slot's chord becomes a run of `toHarte(chord)`, with holds extending it and `N.C.` as `N`;
    - bar starts follow the tempo;
    - `key`, `meter` and `tempo` come from bar 1;
    - `changes` are where a bar's key, meter or tempo differs from the bar before, and `sections` are where `bar.section` changes;
    - `jitter` is a fraction of a beat, and `drift` a fraction of each bar.
  - `soundingByBeat(parse: ChartParse): string[]`: for each beat, the pitch-class set of the chord covering most of it, holds resolved, empty for `N.C.`, `?`, `--` and gaps.
  - `mulberry32(seed: number): () => number` and `fuzzDetections(rand: () => number): Detections`.

- [ ] **Step 1: Write the tests.**
  - `"generator-form charts come back exactly"`. Four charts written in generator form, each built from `runsFromChart(parseChart(c), {startAt: 1, tempo})`, give back `printChart(c)` exactly:
    - `key: D, time: 4/4, tempo: 120` with `| D | / | G A | Bm |` and `| G | A | D | / |`;
    - 3/4 with `## Verse` and `## Chorus` headings;
    - 6/8 with a `key:` change before a bar;
    - `| C G | % |`.
  - `"every example sounds the same on every beat"`: for each `examples/*.chart.md` and `AT_A_GLANCE`, `soundingByBeat` of the built chart equals `soundingByBeat` of the original.
  - `"jitter and drift change nothing"`: seeds 1–50 with `jitter: 0.2` and `drift: 0.03` on the generator-form charts give the same chart as with neither.
  - `fuzz.test.ts`, `"2,000 seeded cases keep every invariant"`. Each case has random grids (unsorted, duplicate, NaN); runs (overlapping, gapped, empty, frame-based, garbage labels); sections (at the grid's end, colliding); changes; and pickups. Assert:
    - no throw;
    - `parseChart(chart).diagnostics` has no error;
    - `printChart(chart) === chart`;
    - the first slot is not `/`;
    - every heading has at least one bar;
    - `checkTimingMap(timing, {text: chart}).diagnostics` is `[]`;
    - `timing.bars.length` and `confidence.bars.length` equal `parse.bars.length`;
    - each confidence `slots.length` matches its bar.

    On failure, report the seed.
  - `scale.test.ts`, `"the build is linear"` (Review Focus 2): 100 bars with 5,000 frame runs, then 1,000 bars with 50,000. The larger takes at most 20 times as long, with the best of three runs each.
- [ ] **Step 2: Run** `bun test packages/sync`. Expected: these test the code of Tasks 3–6. Any failure is a real bug: fix it in the owning module with a focused test there first, and say so in the report.
- [ ] **Step 3: Run** `bun run check` and `bun run fallow`. Expected: all pass.
- [ ] **Step 4: Commit** `test(sync): round trip, robustness, fuzz and scale`.

### Task 8: Real-data fixtures, docs and the final gates

**Files:**
- Create:
  - `scripts/detection-fixtures.ts`
  - `packages/sync/tests/fixtures/{letter-lands,eat-all-the-clocks}.detections.json` (frame-level ChordMini runs)
  - `{letter-lands,eat-all-the-clocks}.symbols.detections.json` (one `symbol` run a bar, from `appPerBar`)
  - each one's `.chart.md`
  - `packages/sync/tests/real.test.ts`
- Modify: `packages/sync/README.md` (finished: install, build, diagnostics table of the 20 codes with severities, timing map, confidence record, what it doesn't do), `packages/sync/CHANGELOG.md`, `FINDINGS.md`

**Interfaces:**
- Consumes: `chartFromDetections`, `checkTimingMap`, and stem-bench on the VM (`~/projects/stem-bench`).

- [ ] **Step 1: Write the script**, VM-only, following `scripts/musescore-fixtures.ts`'s header and shape.
  - It imports SS's ChordMini port from stem-bench's pinned worktree `.worktrees/stem-shovel-2256d489`, as `scripts/run-study19.ts` does (`chordminiFeatures`, `chordminiLogits`, `chordminiIndices`, `chordminiRunsOf`, with `config.json`'s vocabulary). It reads `corpus-mmkk/<song>/mix.mp3.22050.f32le.raw`.
  - Runs are in frames, with `frameSec: 2048 / 22050`. The grid is `results/study19.json`'s `barStarts`. Key and meter come from `corpus/fixture-mmkk.json`'s chart (Claude's call).
  - It writes numbers and labels only, no audio, plus the symbol variant from `appPerBar`, and each built `.chart.md`. CI never runs it.
- [ ] **Step 2: Run** `bun scripts/detection-fixtures.ts`. Read the four charts over by hand against the songs' corpus charts. In the report, note bar counts, `?` stretches, `%` use and anything odd. Kevin reviews them in the PR.
- [ ] **Step 3: Write `real.test.ts`.** Each fixture builds to its checked-in `.chart.md` exactly. Each has no chart errors, and its timing map passes `checkTimingMap` against its chart.
- [ ] **Step 4: Finish the docs.**
  - Finish the README.
  - Write CHANGELOG `[Unreleased]` → `### Added` entries: the builder, the timing map and its helpers, and the confidence record (experimental), with bold lead phrases.
  - Add a FINDINGS.md entry for anything the real data or the fuzz surprised us with: the symptom, the cause, the fix and where it lives. If nothing did, say so in the report.
- [ ] **Step 5: Run the final gates:** `bun test`, `bun run check`, `bun run fallow`, `bun run verify:package sync` and `bun run verify:package barmark`. Expected: all pass.
- [ ] **Step 6: Commit** `test(sync): real ChordMini fixtures; docs`.

---

## After the plan

Separate follow-ups, not in this plan:

1. **Release `barmark` as a minor** (0.19.0) with the four exports, and `@barmark/render` as a patch (0.16.2) "Requires `barmark` 0.19.0" (RELEASING.md). Then do the CLI release and the `songs` bump (steps 13–14). `@barmark/sync` needs the new `barmark` on npm first: `verify:release sync` fails until it is.
2. **The first npm publish of `@barmark/sync`** needs Kevin's one-time setup (RELEASING.md "A new package's first release"):
   - a placeholder 0.0.0;
   - the trusted publisher;
   - `sync-v*` added to the "release tags" ruleset and to the `npm` environment;
   - the `package (N, sync)` checks added to the "main" ruleset.

   Then it is released as `sync-v0.1.0`.
3. **Stem Shovel's adoption**, spec section 9 steps 1–7, in the SS repository.
