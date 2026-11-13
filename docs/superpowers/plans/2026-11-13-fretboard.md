# @barmark/fretboard 0.1: guitar chord shapes: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new package, `@barmark/fretboard`: the guitar fingering for a barmark chord, from a hand-written table, a shape finder and exact voicings, with a mechanical check that every shape sounds its chord.

**Architecture:** A pure TypeScript library that depends only on `barmark` (for `ChordRecord`). It draws nothing. `shapeFor` looks a chord up in the table (open shapes, then movable shapes transposed), and falls back to the finder; note sets and voicings are placed exactly, one written pitch a string. Plan B (a later plan) adds the strip to `@barmark/render`, then score, the CLI and the site.

**Tech Stack:** TypeScript (strict), Bun test, Biome (tabs), Fallow. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-10-chord-diagrams-design.md` ("the spec"; approved by Kevin 2026-11-10). This plan builds §2.3, §2.4, §3, §4, §6.1 and the package's share of §8. §5, §6.2 to §6.4 and §7 are Plan B's and lyricsheet's.

## Global Constraints

- **MIT only, and ours.** No shape, table or file is copied from ChordPro or any other chord book or library. The table is written from the instrument. ChordPro's tables are read only by `scripts/chordpro-shapes.ts`, on the VM, into a temporary directory, never committed and never imported by `packages/`.
- Runtime dependency: `barmark` only, `workspace:^`. No DOM or Node global in `src/` (`tsconfig.build.json` has `"types": []`, `"lib": ["ESNext"]`).
- Standard guitar tuning only: MIDI `[40, 45, 50, 55, 59, 64]` (E2 A2 D3 G3 B3 E4), low string first. Octaves are sounding pitch.
- A `Shape`'s `frets` are absolute, low string first: `-1` muted, `0` open.
- **Never throws.** `shapeFor` returns a result or a reason for any `ChordRecord`.
- **Every shape the package returns for a named chord passes `soundsChord`** and the limits: at most a 3-fret span between fretted notes, at most 4 fingers (a barre counts as one), frets 0 to 15, the bass on the lowest sounding string, no muted string inside the voicing, at least 3 strings (2 for a power chord).
- **Deterministic.** The same chord always gets the same shape; ties break on the fret string.
- The package's own minified, gzipped entry (with `barmark` external) is at most 4.5 KB, enforced by a test. (The spec's +5 KB budget is on render's element; this keeps the package inside its share.)
- `bun test packages/fretboard`, `bun run check`, `bun run fallow` are clean at the end of every task, each read by its exit code. Refactor rather than grow Fallow's baseline.
- Commits are conventional commits with **no** `Co-Authored-By` or other AI trailer.
- Version `0.1.0` from the first commit; the release is a separate step (`RELEASING.md`, "A new package's first release").

## Review Focus

1. **A chord the vocabulary does not list** (`C7(b9,b13)`, `Cmaj9(#11)`, `C13sus4/G`): the finder may find nothing. Expected: `{ ok: false, reason: "not-playable" }`, not a throw and not a shape that fails `soundsChord`. Test in Task 5.
2. **Enharmonic and respelled names** (`F#` and `Gb`, `Cb`, `E#`, `Fbb`-style double accidentals the parser accepts): the same pitch classes get the same shape. Test in Task 4.
3. **A voicing below or above the guitar** (`{E1}`, `Cmaj7{C7 E7}`), and a voicing with two notes that need the same string (`{E2 F2}`): not playable, with the right result for a note set and for a named chord. Test in Task 5.
4. **A note set of one pitch class in two octaves** (`{E2 E3}`), and one with a repeated pitch (`{C3 C3}`): two strings for the first; the second is not playable. Test in Task 5.
5. **A `ChordRecord` that is not well formed** (a hand-built object with an empty `pitches`, or a `root` of `null` on kind `"chord"`): a reason, never a throw. Test in Task 5.

---

### Task 1: The package and its place in the repository

**Files:**
- Create: `packages/fretboard/package.json`, `tsconfig.build.json`, `LICENSE`, `CHANGELOG.md`, `README.md`, `src/index.ts`, `src/types.ts`, `tests/package.test.ts`
- Create: `scripts/smoke-fretboard.mjs`
- Modify: `tsconfig.json` (paths), `bun.lock` (by `bun install`), `scripts/lib.ts`, `scripts/package-contents.ts`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `extensions/behaviors/barmark_checks.ts`, `workflows/workflow-release-check.yaml`, `RELEASING.md`, `CLAUDE.md`, `.claude/skills/release/SKILL.md`

`packages/sync` is the model for every scaffold file; `@barmark/listen`'s wiring (commits `f99d8b1` and `47abb90`) is the model for the rest. Mirror each `listen` entry with a `fretboard` one.

**Interfaces:**
- Produces, `src/types.ts`:
  ```ts
  /** An instrument's open strings as MIDI notes, low to high. */
  export type Tuning = { name: "guitar"; strings: readonly number[] };
  /** Standard guitar tuning: E2 A2 D3 G3 B3 E4. */
  export const GUITAR: Tuning;
  /** A barre: one finger across strings `from` to `to` (indexes, low string 0) at `fret`. */
  export type Barre = { fret: number; from: number; to: number };
  /** A fingering. `frets`: absolute, low string first, -1 muted, 0 open. `base`: the first fret a diagram draws. */
  export type Shape = { frets: number[]; base: number; barre?: Barre };
  ```
- Produces: the root entry `src/index.ts` exports `GUITAR` and the types (later tasks add to it).

- [ ] **Step 1: Write the failing test** `tests/package.test.ts`:

```ts
test("standard tuning, low string first", () => {
	expect(GUITAR).toEqual({ name: "guitar", strings: [40, 45, 50, 55, 59, 64] });
	expect(Object.isFrozen(GUITAR)).toBe(true);
	expect(Object.isFrozen(GUITAR.strings)).toBe(true);
});

test("the package depends on barmark alone, with a caret", () => {
	const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"));
	expect(pkg.name).toBe("@barmark/fretboard");
	expect(pkg.version).toBe("0.1.0");
	expect(pkg.dependencies).toEqual({ barmark: "workspace:^" });
	expect(pkg.sideEffects).toBe(false);
	expect(pkg.license).toBe("MIT");
});
```

Run: `bun test packages/fretboard` — Expected: FAIL (no module).

- [ ] **Step 2: Scaffold the package.** `package.json` as sync's, with one export (`.`), `"version": "0.1.0"`, a description ("Guitar chord shapes for barmark chords: a table, a shape finder and exact voicings.") and keywords. `tsconfig.build.json`, `LICENSE` and the CHANGELOG header as sync's, with `## [Unreleased]` and an `### Added` line for the package. A short README (what it is; "under construction until 0.1.0"; Task 6 writes the real one). Add `"@barmark/fretboard": ["./packages/fretboard/src/index.ts"]` to the root `tsconfig.json` paths. Run `bun install` so `bun.lock` gains the workspace entry.

- [ ] **Step 3: Wire the repository.** One entry each, mirroring listen's:
  - `scripts/lib.ts` `PACKAGES`: `fretboard: { dir, name: "@barmark/fretboard", tagPrefix: "fretboard-v", smoke: "scripts/smoke-fretboard.mjs" }`.
  - `scripts/package-contents.ts` `CONTENTS`: as musicxml's one-entry form.
  - `scripts/smoke-fretboard.mjs`: `node scripts/smoke-fretboard.mjs <module> <chart>`; works with a built entry path and with a bare package name; in this task it imports the module, checks `GUITAR.strings.length === 6`, prints JSON, exits 1 on a difference (Task 6 extends it to read the chart).
  - `.github/workflows/ci.yml`: add `fretboard` to the `package` matrix's `pkg` list.
  - `.github/workflows/release.yml`: the `fretboard-v*)` case and the error list.
  - `extensions/behaviors/barmark_checks.ts` (the enum and its description) and `workflows/workflow-release-check.yaml` (the enum). Follow the swamp rules in CLAUDE.md: this edits an existing extension, and its version string is bumped as earlier edits bumped it.
  - `RELEASING.md`: ten packages; the table row; the tag ruleset list; the `<pkg>` lists; the first-release patterns; a paragraph: "**`@barmark/fretboard`** depends on `barmark` with a caret, so after a `barmark` minor a `fretboard` patch raises the dependency. The CLI does not bundle it; `@barmark/render` will import it (then a fretboard release is followed by a render patch)."
  - `CLAUDE.md`: a `packages/fretboard/` line in the layout (filled out in Task 6), the `<pkg>` list, the tag list.
  - `.claude/skills/release/SKILL.md`: the description list, the package line, a per-package note.
  Do not touch `scripts/verify-release.ts`'s `RELEASED_CODE`, `release.yml`'s CLI dependency loop, or the site: the CLI does not bundle fretboard and the site does not install it yet.

- [ ] **Step 4: Run the gates**

Run: `bun test packages/fretboard && bun run check && bun run fallow && bun run verify:package fretboard`
Expected: all exit 0; `verify:package` prints the packed file list (`LICENSE`, `dist/index.js`, `dist/index.d.ts`, …) and the Node import.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(fretboard): the package, standard tuning and its place in CI and the release"
```

---

### Task 2: Pitches, shapes and the mechanical check

**Files:**
- Create: `packages/fretboard/src/pitch.ts`, `src/shape.ts`, `src/sounds.ts`
- Test: `packages/fretboard/tests/shape.test.ts`, `tests/sounds.test.ts`

**Interfaces:**
- Consumes: `ChordRecord` from `barmark`; Task 1's types.
- Produces, `pitch.ts`:
  ```ts
  /** A note name's pitch class, 0 to 11 ("C" 0, "F#" 6, "Bb" 10, "Cb" 11, "E#" 5, double accidentals too); the octave, if any, is ignored. */
  export function pitchClass(note: string): number;
  /** A note with an octave as MIDI ("E2" 40, "C4" 60); null without an octave. */
  export function midiOf(note: string): number | null;
  ```
- Produces, `shape.ts`:
  ```ts
  /** A shape from six characters, low string first: `x` muted, `0` to `9` a fret. "x32010" is C. */
  export function shapeOf(text: string): Shape;
  /** The shape's text when every fret is under 10, else the frets joined by spaces ("x 10 12 12 11 10"). */
  export function shapeText(shape: Shape): string;
  /** A shape from absolute frets: `base` and `barre` worked out. */
  export function shapeFrom(frets: readonly number[]): Shape;
  /** The MIDI notes a shape sounds, low string first. */
  export function sounding(shape: Shape, tuning?: Tuning): number[];
  /** The fingers a shape needs: its fretted strings, or 1 + the strings above the lowest fret when a barre holds it; 99 when no hand can. */
  export function fingersNeeded(frets: readonly number[]): number;
  ```
  `base` is 1 when the highest fret is 5 or lower, else the lowest fretted fret. `barre` is set when more than four strings are fretted and a barre can hold the lowest fret: every string from the first one at that fret to the highest sounding string is fretted at or above it; `from` is that first string, `to` the highest sounding string.
- Produces, `sounds.ts`:
  ```ts
  /** The tones a chord needs and may leave out (spec §4.1), as pitch classes. */
  export type Want = { required: ReadonlySet<number>; optional: ReadonlySet<number>; bass: number; root: number; minStrings: 2 | 3; shell: boolean };
  /** Null for a note set, or a record with no root. */
  export function wantOf(chord: ChordRecord): Want | null;
  /** Whether a shape sounds a named chord: the bass lowest, every required tone, nothing outside the chord (spec §8). */
  export function soundsChord(shape: Shape, chord: ChordRecord, tuning?: Tuning): boolean;
  /** Whether a shape is inside the hand's limits for a named chord: span, fingers, frets 0 to 15, no muted string inside, enough strings. */
  export function withinLimits(shape: Shape, minStrings?: number): boolean;
  ```
  `wantOf`, from spec §4.1: the bass is the slash bass, else the root, and is required. The perfect fifth is optional in a chord of four or more tones; the natural 9th and 11th are optional under a 13th. `7alt` (`alteredOpen`) is a shell: root, third and ♭7 required, nothing optional, `shell: true`. A power chord (no third: `5`, `5(7)`) has `minStrings: 2`. Add no other omission. If Task 3's vocabulary test finds a chord with no shape under these rules, stop and report it; do not add a rule.

- [ ] **Step 1: Write the failing tests.**

```ts
test("shapeOf and shapeText read and write the six strings", () => {
	expect(shapeOf("x32010")).toEqual({ frets: [-1, 3, 2, 0, 1, 0], base: 1 });
	expect(shapeText(shapeOf("x32010"))).toBe("x32010");
	expect(shapeText(shapeFrom([-1, 10, 12, 12, 11, 10]))).toBe("x 10 12 12 11 10");
});

test("base: 1 through the fifth fret, else the lowest fretted fret", () => {
	expect(shapeFrom([-1, 3, 5, 5, 5, 3]).base).toBe(1);
	expect(shapeFrom([-1, 5, 7, 7, 7, 5]).base).toBe(5);
});

test("a barre only when more than four strings are fretted", () => {
	expect(shapeOf("133211").barre).toEqual({ fret: 1, from: 0, to: 5 }); // F
	expect(shapeOf("x24432").barre).toEqual({ fret: 2, from: 1, to: 5 }); // Bm
	expect(shapeOf("xx0232").barre).toBeUndefined(); // D: three fingers
	expect(shapeOf("x02220").barre).toBeUndefined(); // A: three fingers
});

test("fingersNeeded: a barre counts as one; an open string under it is impossible", () => {
	expect(fingersNeeded([1, 3, 3, 2, 1, 1])).toBe(4);
	expect(fingersNeeded([-1, 3, 2, 0, 1, 0])).toBe(3);
	expect(fingersNeeded([2, 2, 2, 0, 2, 2])).toBe(99);
});

test("sounding: C from x32010", () => {
	expect(sounding(shapeOf("x32010"))).toEqual([48, 52, 55, 60, 64]);
});
```

and for `sounds.ts`, with `chord(name)` a helper that returns `parseChord(name)`'s record or throws:

```ts
test("soundsChord: the open chords sound their names", () => {
	for (const [name, text] of [["C", "x32010"], ["Am", "x02210"], ["G", "320003"], ["E7", "020100"], ["Dm", "xx0231"], ["G/B", "x20003"]])
		expect(soundsChord(shapeOf(text), chord(name))).toBe(true);
});

test("soundsChord refuses a wrong note, a missing tone and a wrong bass", () => {
	expect(soundsChord(shapeOf("x35353"), chord("Bb7"))).toBe(false); // a C7: the error ChordPro's table has
	expect(soundsChord(shapeOf("x3201x"), chord("C7"))).toBe(false); // no flat seventh
	expect(soundsChord(shapeOf("x32010"), chord("C/E"))).toBe(false); // C in the bass
	expect(soundsChord(shapeOf("032010"), chord("C/E"))).toBe(true);
});

test("the fifth may go in a seventh chord, never in a triad", () => {
	// x3x310 sounds C, B flat, C, E: no G. The tones are right; the muted string inside is the limits' matter.
	expect(soundsChord(shapeOf("x3x310"), chord("C7"))).toBe(true);
	expect(withinLimits(shapeOf("x3x310"))).toBe(false);
	expect(wantOf(chord("C7"))?.optional.has(7)).toBe(true);
	expect(wantOf(chord("C"))?.optional.size).toBe(0);
});

test("a thirteenth may leave out the fifth, the ninth and the eleventh", () => {
	const w = wantOf(chord("C13"));
	expect([...(w?.required ?? [])].sort((a, b) => a - b)).toEqual([0, 4, 9, 10]); // C E A Bb
});

test("7alt is a shell: root, third and flat seventh", () => {
	const w = wantOf(chord("C7alt"));
	expect(w?.shell).toBe(true);
	expect([...(w?.required ?? [])].sort((a, b) => a - b)).toEqual([0, 4, 10]);
	expect(w?.optional.size).toBe(0);
});

test("a power chord needs two strings; a note set wants nothing", () => {
	expect(wantOf(chord("C5"))?.minStrings).toBe(2);
	expect(wantOf(chord("{C3 G3 E4}"))).toBeNull();
});

test("withinLimits: span, fingers, interior mutes and string count", () => {
	expect(withinLimits(shapeOf("x32010"))).toBe(true);
	expect(withinLimits(shapeOf("x3x010"))).toBe(false); // a muted string inside
	expect(withinLimits(shapeOf("1x5xxx"))).toBe(false);
	expect(withinLimits(shapeOf("xxxx13"))).toBe(false); // two strings
	expect(withinLimits(shapeOf("xxxx13"), 2)).toBe(true);
});
```

Run: `bun test packages/fretboard` — Expected: FAIL (modules not found).

- [ ] **Step 2: Implement** the three modules and export `shapeOf`, `shapeText`, `shapeFrom`, `sounding`, `soundsChord` from the root. `wantOf`, `withinLimits`, `fingersNeeded`, `pitchClass` and `midiOf` stay internal unless a later task says otherwise.

- [ ] **Step 3: Run the gates**

Run: `bun test packages/fretboard && bun run check && bun run fallow`
Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/fretboard
git commit -m "feat(fretboard): shapes, the notes they sound, and the check that a shape sounds its chord"
```

---

### Task 3: The shape finder

**Files:**
- Create: `packages/fretboard/src/finder.ts`, `tests/helpers/vocabulary.ts`
- Test: `packages/fretboard/tests/finder.test.ts`, `tests/finder-scale.test.ts`

**Interfaces:**
- Consumes: `Want`, `wantOf`, `soundsChord`, `withinLimits`, `fingersNeeded`, `shapeFrom`, `sounding` (Task 2).
- Produces, `finder.ts`:
  ```ts
  /** Standard-tuning fingerings for the wanted tones, best first, at most `limit` (10). Memoised by the tones and bass in `cache` (the module's own by default). */
  export function findShapes(want: Want, limit?: number, cache?: Map<string, Shape[]>): Shape[];
  ```
- Produces, `tests/helpers/vocabulary.ts`: `FORMS` (the spec's §2.2 families: triads `""`, `m`, `dim`, `aug`, `sus2`, `sus4`; power `5`, `5(7)`; sixths `6`, `m6`, `6/9`, `m6/9`; sevenths `7`, `maj7`, `m7`, `mmaj7`, `dim7`, `m7(b5)`, `aug7`, `augmaj7`, `7sus4`, `7sus2`; extensions `9`, `maj9`, `m9`, `11`, `m11`, `13`, `maj13`, `m13`, `9sus4`, `13sus4`, `mmaj9`, `(9)`, `m(9)`, `(11)`; alterations `7(b9)`, `7(#9)`, `7(#11)`, `7(b13)`, `7(b5)`, `7(#5)`, `7alt`, `9(#11)`, `13(b9)`, `7(b9,#11)`, `maj7(#11)`; slash, written here on C: `C/E`, `C/G`, `Cm/Eb`, `Cm/G`, `C/Bb`, `C7/E`, `Cm7/Bb`, `C/D`), `ROOTS` (`C Db D Eb E F F# G Ab A Bb B`), `vocabulary(): { name: string; family: string; chord: ChordRecord }[]` (every form on every root that `parseChord` reads; slash basses spelled from the chord's own `pitches`), and `chord(name): ChordRecord`.

The algorithm (spec §2.3), measured in the design's spike:
- For each window `base` 1 to 12: each string may be muted, open (when the open note is wanted), or fretted at `base` to `base + 3` (when that note is wanted). Enumerate the combinations and keep those that sound the chord and are within limits.
- Cost, lower is better: `1.0 × lowest fretted fret + 0.8 × (6 − strings sounding) + 1.5 × optional tones left out + 1.0 × span − 0.3 when the top note is the root`. Ties break on `shapeText`, ascending.
- It must be much faster than the spike's 4.4 ms a chord: prune a branch as soon as a muted string would fall inside the voicing or the bass is wrong, and cache by the wanted tones and bass.

- [ ] **Step 1: Write the failing tests.**

```ts
test("every chord of the vocabulary has a shape, and each sounds its chord within limits", () => {
	const all = vocabulary();
	expect(all.length).toBeGreaterThanOrEqual(600);
	for (const { name, chord } of all) {
		const want = wantOf(chord);
		if (!want) throw new Error(`${name}: no want`);
		const [first] = findShapes(want);
		if (!first) throw new Error(`${name}: no shape`);
		if (!soundsChord(first, chord)) throw new Error(`${name}: ${shapeText(first)} does not sound it`);
		if (!withinLimits(first, want.minStrings)) throw new Error(`${name}: ${shapeText(first)} is outside the limits`);
	}
});

test("the finder is deterministic and best first", () => {
	const want = wantOf(chord("Am7"))!;
	expect(findShapes(want).map(shapeText)).toEqual(findShapes(want).map(shapeText));
	expect(findShapes(want, 3)).toHaveLength(3);
});

test("a slash chord puts its bass on the lowest string that sounds", () => {
	const [first] = findShapes(wantOf(chord("C/G"))!);
	expect(sounding(first!)[0]! % 12).toBe(7);
});

test("a power chord may be two strings; a triad never is", () => {
	expect(findShapes(wantOf(chord("C5"))!)[0]!.frets.filter((f) => f >= 0).length).toBeGreaterThanOrEqual(2);
	for (const s of findShapes(wantOf(chord("C"))!)) expect(s.frets.filter((f) => f >= 0).length).toBeGreaterThanOrEqual(3);
});

test("7alt is found as a shell of three tones", () => {
	const [first] = findShapes(wantOf(chord("C7alt"))!);
	expect(new Set(sounding(first!).map((n) => n % 12))).toEqual(new Set([0, 4, 10]));
});

test("a set of tones no hand can hold gives no shape", () => {
	const want = { required: new Set([0, 1, 2, 3, 4, 5, 6]), optional: new Set<number>(), bass: 0, root: 0, minStrings: 3 as const, shell: false };
	expect(findShapes(want)).toEqual([]);
});
```

Print the vocabulary's exact size in the report (the spec measured 648: 54 forms on 12 roots); pin that number in the first test once known, in place of `600`.

`tests/finder-scale.test.ts`: the finder alone over the whole vocabulary, each run with a fresh `Map` as its cache, best of three, in under 2,000 ms (the spike's unpruned finder takes about 2,900 ms), with a 60 s test timeout; and a second pass over the same chords with the same `Map` in under a tenth of the first.

Run: `bun test packages/fretboard` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement `finder.ts`.**

- [ ] **Step 3: Run the gates**

Run: `bun test packages/fretboard && bun run check && bun run fallow`
Expected: all exit 0. If a vocabulary chord has no shape under Task 2's omission rules, stop and report its name and tones (status DONE_WITH_CONCERNS); do not loosen a rule or a limit.

- [ ] **Step 4: Commit**

```bash
git add packages/fretboard
git commit -m "feat(fretboard): the shape finder, over the whole chord vocabulary"
```

---

### Task 4: The table

**Files:**
- Create: `packages/fretboard/src/table.ts`, `src/lookup.ts`
- Test: `packages/fretboard/tests/table.test.ts`

**Interfaces:**
- Consumes: `shapeOf`, `shapeFrom`, `soundsChord`, `withinLimits`, `wantOf`, `pitchClass`; `parseChord` from `barmark`.
- Produces, `table.ts`:
  ```ts
  /** Shapes for first position: a chord name and its six strings. Open strings allowed. */
  export const OPEN: readonly (readonly [name: string, frets: string])[];
  /** Shapes with no open string, written on one root and moved along the neck to any other. */
  export const MOVABLE: readonly (readonly [name: string, frets: string])[];
  ```
- Produces, `lookup.ts`:
  ```ts
  /** The table's shape for a named chord: its open shape, else the lowest movable shape of its form moved to its root; null when the table has neither. */
  export function tableShape(chord: ChordRecord): Shape | null;
  ```

**The table is written by hand, from the instrument (spec §3).** Do not open, search for or copy any chord chart, chord database or other library's table, ChordPro's included. Write each row from what the strings sound: the open strings are E A D G B E, and a fret raises a string a semitone. The tests check every row by machine.

- `OPEN`: about 120 rows, the shapes a guitarist plays in first position, for the roots that have them (the `C`, `A`, `G`, `E`, `D` families, and `F`, `B`-family shapes where a first-position shape is standard): each root's major, `m`, `7`, `maj7`, `m7`, `sus2`, `sus4`, `6`, `(9)` and `/3` forms where a familiar first-position shape exists, and the common extras (`G/B`, `D/F#`, `C/G`, `Am/G`, `E5`, `A5`, `D5`, `Dsus2`, `Asus4`, `Em7`, `Cmaj7`, `Fmaj7`, `B7`, `Cadd9` written as barmark spells it, `C(9)`). Prefer the shape most players learn first.
- `MOVABLE`: for each of the vocabulary's forms, two shapes where the hand allows, one with the root on the 6th string and one on the 5th (the E-shape and A-shape barres and their seventh-chord cousins), written at the lowest fret that has no open string (root on fret 1: `F…` for the 6th string, `Bb…` for the 5th). About 130 rows. A form with no comfortable movable shape may have one or none; the finder covers the rest.
- Lookup: a chord's identity is its pitch classes and bass. An `OPEN` row matches a chord with the same pitch classes and bass. A `MOVABLE` row matches a chord whose tones and bass, measured from the root, equal the row's; it is moved up by the semitones from the row's root to the chord's (0 to 11), and rejected if any fret passes 15. Of several movable matches, the one whose lowest fret is lowest wins; ties break on `shapeText`. An open match always wins.
- The table is parsed once, on first use, not at import (the package is `sideEffects: false`).

- [ ] **Step 1: Write the failing tests.**

```ts
test("every row sounds its name, within the limits, and reads back", () => {
	for (const [name, frets] of [...OPEN, ...MOVABLE]) {
		const c = chord(name);
		const shape = shapeOf(frets);
		if (!soundsChord(shape, c)) throw new Error(`${name} ${frets} does not sound its name`);
		if (!withinLimits(shape, wantOf(c)?.minStrings)) throw new Error(`${name} ${frets} is outside the limits`);
	}
});

test("no row is written twice, and no two open rows name one chord", () => { /* by name+frets, and by pitch classes+bass among OPEN */ });

test("a movable row has no open string", () => {
	for (const [, frets] of MOVABLE) expect(frets).not.toContain("0");
});

test("the table is at least the size the design asks for", () => {
	expect(OPEN.length).toBeGreaterThanOrEqual(100);
	expect(MOVABLE.length).toBeGreaterThanOrEqual(100);
});

test("the shapes most players learn first", () => {
	const first = (n: string) => shapeText(tableShape(chord(n))!);
	expect(first("C")).toBe("x32010");
	expect(first("G")).toBe("320003");
	expect(first("D")).toBe("xx0232");
	expect(first("A")).toBe("x02220");
	expect(first("E")).toBe("022100");
	expect(first("Am")).toBe("x02210");
	expect(first("Em")).toBe("022000");
	expect(first("Dm")).toBe("xx0231");
	expect(first("F")).toBe("133211");
	expect(first("Bm")).toBe("x24432");
	expect(first("B7")).toBe("x21202");
	expect(first("G/B")).toBe("x20003");
	// Many players mute the A string here (2x0232). The limits forbid a muted string inside a named
	// chord's shape, and the open A is in the chord, so the table's row lets it ring.
	expect(first("D/F#")).toBe("200232");
});
```

```ts
test("a movable shape follows its root along the neck", () => {
	expect(shapeText(tableShape(chord("F#"))!)).toBe("244322");
	expect(shapeText(tableShape(chord("Bb"))!)).toBe("x13331");
	expect(shapeText(tableShape(chord("C#m"))!)).toBe("x46654");
	expect(tableShape(chord("C#m"))!.base).toBe(4);
});

test("enharmonic and respelled names get one shape", () => {
	for (const [a, b] of [["F#", "Gb"], ["C#m7", "Dbm7"], ["B", "Cb"], ["F", "E#"]])
		expect(tableShape(chord(a))).toEqual(tableShape(chord(b)));
});

test("every table answer across the vocabulary sounds its chord within limits", () => {
	let hits = 0;
	for (const { name, chord: c } of vocabulary()) {
		const shape = tableShape(c);
		if (!shape) continue;
		hits++;
		if (!soundsChord(shape, c) || !withinLimits(shape, wantOf(c)?.minStrings)) throw new Error(`${name}: ${shapeText(shape)}`);
	}
	expect(hits / vocabulary().length).toBeGreaterThan(0.6);
});

test("a note set, and a chord the table lacks, get null", () => {
	expect(tableShape(chord("{C3 G3 E4}"))).toBeNull();
});
```

Report the share of the vocabulary the table answers.

Run: `bun test packages/fretboard` — Expected: FAIL (modules not found).

- [ ] **Step 2: Write the table and the lookup.** Run the row test often: a row that fails is a wrong row; fix the row from the strings, never the check.

- [ ] **Step 3: Run the gates**

Run: `bun test packages/fretboard && bun run check && bun run fallow`
Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/fretboard
git commit -m "feat(fretboard): the table of open and movable shapes"
```

---

### Task 5: `shapeFor`: names, note sets and voicings

**Files:**
- Create: `packages/fretboard/src/exact.ts`, `src/shapes.ts`
- Modify: `packages/fretboard/src/index.ts`
- Test: `packages/fretboard/tests/exact.test.ts`, `tests/shapes.test.ts`, `tests/corpus.test.ts`, `tests/size.test.ts`

**Interfaces:**
- Consumes: `tableShape` (Task 4), `findShapes` (Task 3), `wantOf`, `midiOf`, `pitchClass`, `shapeFrom`, `fingersNeeded`.
- Produces, `exact.ts`:
  ```ts
  /** Fingerings that sound exactly these MIDI notes, one a string, strings ascending; muted strings between them allowed. Best first. */
  export function exactShapes(notes: readonly number[]): Shape[];
  /** Fingerings that sound these pitch classes in this order, low to high, one a string, octaves free. Best first. */
  export function orderedShapes(pitchClasses: readonly number[]): Shape[];
  ```
  Limits: the 3-fret span, 4 fingers, frets 0 to 15. Best: the lowest highest-fret, then the fewest muted strings inside, then `shapeText`.
- Produces, `shapes.ts` and the root entry:
  ```ts
  export type ShapeResult =
  	| { ok: true; shape: Shape; notes: "shell" | "voicing-replaced" | null }
  	| { ok: false; reason: "single-note" | "not-playable" };
  /** The shape a diagram shows for a slot: a chord name, a note set, or a name with a written voicing (spec §4). Never throws. */
  export function shapeFor(slot: ChordRecord, voicing?: ChordRecord, tuning?: Tuning): ShapeResult;
  /** Ranked alternatives for a named chord: the table's, then the finder's, without repeats. [] for a note set. */
  export function shapesFor(slot: ChordRecord, tuning?: Tuning): Shape[];
  ```
  Rules, from spec §4:
  - A named chord, no voicing: the table's shape, else the finder's first; `notes` is `"shell"` for `7alt`, else `null`; `not-playable` when neither has one.
  - A note set (kind `"notes"`): one pitch is `single-note`. With octaves on every note: `exactShapes`. With none: `orderedShapes`. Mixed (some notes with an octave, some without): `not-playable` **(the grammar decides whether this can be written; read `docs/grammar-v0.1-draft.md` §4.1 and report what the parser gives)**. No fingering: `not-playable`.
  - A name with a voicing: the voicing's notes placed as a note set's are; `notes: null`. When the voicing has one note or does not fit: the name's own shape with `notes: "voicing-replaced"` (or `not-playable` when the name has none).
  - `tuning` other than standard guitar: the table is skipped (it is standard tuning); the finder and the exact search use the tuning given. Only `GUITAR` is exported in 0.1.

- [ ] **Step 1: Write the failing tests.** The spec's §2.4 table, as measured:

```ts
test("the design's voicings", () => {
	const fit = (text: string) => shapeFor(chord(text));
	expect(shapeFor(chord("Cmaj7"), chord("{E3 G3 B3 C4}"))).toMatchObject({ ok: true, notes: "voicing-replaced" });
	expect(shapeText((shapeFor(chord("Dm7"), chord("{F3 C4 E4}")) as { shape: Shape }).shape)).toBe("xx3x10");
	expect(shapeText((shapeFor(chord("G13"), chord("{F2 B2 E3}")) as { shape: Shape }).shape)).toBe("122xxx");
	expect(shapeText((fit("{C3 G3 E4}") as { shape: Shape }).shape)).toBe("x3x0x0");
	expect(shapeText((fit("{B2 F#3 D4}") as { shape: Shape }).shape)).toBe("x24x3x");
	expect(fit("{E1}")).toEqual({ ok: false, reason: "single-note" });
});
```

How a voicing reaches `shapeFor`: read `packages/barmark/src/chart/types.ts` (a slot's `chord` and optional `voicing`, both `ChordRecord`s) and build the test's second argument the way the parser does (`parseChart` on a one-bar chart, or `parseChord` on the braces), then correct these snippets to it.

More, each asserted exactly:
- Named chords: `shapeFor(chord("C"))` is `{ ok: true, shape: x32010's, notes: null }`; `C7alt` has `notes: "shell"`; a chord the table lacks (`C13(b9)`) comes from the finder and sounds its chord.
- The plan's Review Focus 1 to 5: `C7(b9,b13)`, `Cmaj9(#11)` and `C13sus4/G` each give a shape that passes `soundsChord` and `withinLimits`, or `not-playable`, never a throw; `{E1}`-style and out-of-range voicings; `{E2 F2}`; `{E2 E3}` (two strings) and `{C3 C3}` (`not-playable`); hand-built records with an empty `pitches`, a `null` root on kind `"chord"`, non-string pitches, and getters that throw: a reason, never a throw.
- Note sets without octaves: `{C E G}` gives a shape whose notes ascend C, E, G; `{C E F# B}` (the spec's example) a shape or `not-playable`, asserted as found.
- `shapesFor(chord("Am7"))`: starts with `shapeFor`'s shape, has no repeats, every entry sounds the chord.
- Determinism: two calls give equal results for 50 vocabulary chords.

`tests/corpus.test.ts`: every chord slot of every chart in `examples/` (walk `parseChart`'s result for slots with a `chord`; pass a slot's `voicing` when it has one; skip voice-line note sets as spec §4.2 says) gets `ok: true` with a shape that sounds it, or a `not-playable`/`single-note` reason for a note set or voicing; print the count of each outcome in the report.

`tests/size.test.ts`: `Bun.build` the entry (`minify: true`, `external: ["barmark"]`), gzip it, and expect at most 4,500 bytes; also run the built bundle and call `shapeFor` from it (FINDINGS: a `sideEffects: false` bundle can be emptied, so a size check must run what it measured).

Run: `bun test packages/fretboard` — Expected: FAIL (modules not found).

- [ ] **Step 2: Implement `exact.ts` and `shapes.ts`; export `shapeFor`, `shapesFor` and `ShapeResult`.** If the size test fails, shorten the table's encoding or the code, not the budget; report the number.

- [ ] **Step 3: Run the gates**

Run: `bun test packages/fretboard && bun run check && bun run fallow && bun run verify:package fretboard`
Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/fretboard
git commit -m "feat(fretboard): shapeFor, for chord names, note sets and written voicings"
```

---

### Task 6: The ChordPro comparison, the smoke check and the documents

**Files:**
- Create: `scripts/chordpro-shapes.ts`
- Modify: `scripts/smoke-fretboard.mjs`, `packages/fretboard/README.md`, `packages/fretboard/CHANGELOG.md`, `CLAUDE.md`, `FINDINGS.md` (only if something surprised)

**Interfaces:**
- Consumes: the package's public API.

- [ ] **Step 1: The smoke check.** `scripts/smoke-fretboard.mjs <module> <chart>` reads the chart with `barmark` (the sibling build locally, the installed dependency from npm, as `smoke-sync.mjs` does), asks `shapeFor` for every chord slot, and checks: at least five named chords got a shape; each passes `soundsChord`; `shapeText` of C is `x32010`. It prints the counts as JSON and exits 1 on a difference. Run `bun run verify:package fretboard`: exit 0.

- [ ] **Step 2: The comparison script (VM only, never in CI, never imported by a package or a test).** `bun scripts/chordpro-shapes.ts [--json]`: downloads ChordPro's `lib/ChordPro/res/config/guitar.json` at commit `4b25408` from GitHub into a fresh temporary directory (`mkdtemp`), reads it there, and deletes the directory at the end. It writes nothing into the repository. It prints: how many names barmark reads; of those, how many of ChordPro's own shapes pass `soundsChord` and which fail (name and frets); for the names our table or finder answers, how many of our first choices equal ChordPro's shape, and the differences side by side (name, ours, theirs), grouped by family; and the share of ChordPro's shape found anywhere in `shapesFor`. Run it once and put the totals (not the lists) in the report. It is advice for a person; it fails on nothing but a download or parse error.

- [ ] **Step 3: The documents.**
  - `packages/fretboard/README.md`: what the package is and is not (shapes, no drawing); install; `shapeFor` with a named chord, a note set and a voicing (each example run before it is written, with its real output); `ShapeResult`'s notes and reasons; `shapesFor`; `soundsChord`; the `Shape` type with `base` and `barre`; the limits (span, fingers, frets, strings); what is left out of a chord and why (spec §4.1); octaves are sounding pitch, so a guitar part written at guitar pitch is an octave off (spec §9); standard tuning only; where the shapes come from (our own table, written from the instrument and checked by machine; a finder for the rest; MIT). Plain words, short sentences, as the other packages' READMEs.
  - `CHANGELOG.md`: `[Unreleased]` → `### Added`, one entry a public name, and the limits.
  - `CLAUDE.md`: the `packages/fretboard/` layout line in full (`src/`: `types.ts`, `pitch.ts`, `shape.ts`, `sounds.ts`, `finder.ts`, `table.ts`, `lookup.ts`, `exact.ts`, `shapes.ts`; `tests/`; the VM-only script and what it never does).

- [ ] **Step 4: Run every gate**

Run: `bun test packages/fretboard && bun run check && bun run fallow && bun run verify:package fretboard`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(fretboard): the README, the smoke check and the ChordPro comparison"
```

---

## After the plan

1. Kevin: add `package (20, fretboard)`, `package (22, fretboard)` and `package (24, fretboard)` to the "main" ruleset's required checks, and confirm `@barmark/fretboard` is public on npm with its trusted publisher (RELEASING.md, "A new package's first release").
2. Release `@barmark/fretboard` 0.1.0.
3. Plan B: `@barmark/render`'s `chord-diagrams` strip, then score, the CLI and barmark.dev (the Try It switch).
