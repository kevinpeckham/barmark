# Guitar chord diagrams in the renderer: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@barmark/render` draws a strip of guitar chord diagrams at the top of a chart (`chordDiagrams: "guitar"`, attribute `chord-diagrams="guitar"`), right- or left-handed; `@barmark/score`'s grid and the CLI's `render` follow.

**Architecture:** `layoutChart` collects one entry per distinct chord from the model it already builds, asking `@barmark/fretboard`'s `shapeFor` for each shape. `html.ts` draws each entry as a small inline SVG between the header and the first section. The option travels the path `numerals` travels: `RenderOptions`, the element's attributes, score's inherited attribute reader, the CLI's grid flags. Nothing changes when the option is off.

**Tech Stack:** TypeScript (strict), Bun test with linkedom, Playwright (browser suites), Biome (tabs), Fallow. One new dependency: `@barmark/fretboard` (`workspace:^`) in `@barmark/render`.

**Spec:** `docs/superpowers/specs/2026-11-10-chord-diagrams-design.md` ("the spec"; approved by Kevin 2026-11-10, amended 2026-11-13). This plan builds §4.3, §5, §6.2, §6.4 (score and CLI) and render's share of §8. The site (§6.4) and the ChordPro export (§7) are later plans.

## Global Constraints

- **Render never changes the music.** A diagram is a view: the grid, the bar numbers, the bars' speech and the chart's text are the same with the option on or off.
- **Off by default, and inert when off.** With no `chordDiagrams`, `renderChart`'s markup after its `<style>` element is byte-identical to before this plan, and `layoutChart(...).diagrams` is `[]`.
- Shapes come only from `@barmark/fretboard`'s `shapeFor(slot, voicing?)`. Render holds no shape, table or fingering rule of its own.
- Option names: `chordDiagrams?: "guitar"` and `diagramHand?: "right" | "left"` (default right). Attributes: `chord-diagrams="guitar"` and `diagram-hand="left"`. CLI flags: `--diagrams guitar` and `--left-handed`. Any other value of the option or attribute is ignored, as an unknown `numerals` value is.
- New `::part()` names: `diagrams` (the strip) and `diagram` (each one). No new custom property: colours come from `--bm-ink`, `--bm-rule` and `--bm-muted`; the name is set in `--barmark-font` by the grid's own chord markup.
- Every string in the strip's markup goes through `escapeHtml`. No `id` attributes.
- **Size:** the element entry, bundled and minified with `barmark` and `@barmark/fretboard` inside, gzipped, is at most 6,750 bytes above its size at this plan's base commit, enforced by a test (Kevin's budget: 5,500 when this plan was written, raised on 2026-11-13 after the build measured 6,539).
- `bun test packages/render packages/score packages/cli`, `bun run check`, `bun run fallow` are clean at the end of every task, each read by its exit code. Refactor rather than grow Fallow's baseline.
- Commits are conventional commits with **no** `Co-Authored-By` or other AI trailer.
- No version bumps; the releases follow the merge (`RELEASING.md`).

## Review Focus

1. **A chart with no chord that gets a diagram** (only `N.C.`, `/`, `?`, single notes, or a voice line): no strip at all, not an empty section. Test in Task 1 and Task 2.
2. **Names with markup in them** cannot occur (the parser canonicalises), but a note set's or voicing's written text and a chart title can sit beside the strip: a chart whose title holds `<script>` and whose chords carry voicings renders with no injection. Test in Task 2.
3. **`show-part` with diagrams:** only the shown part's chords; a part whose only line is a voice line gets no strip. Test in Task 1.
4. **The same chord under two keys** (before and after a key change): one diagram, its numeral from the first appearance's key. `F#` and `Gb` in one chart: two diagrams with the same shape. Test in Task 1.
5. **A server-rendered chart with no source** (`<barmark-chart>` holding only a declarative shadow root): setting `chord-diagrams` on it later changes nothing and throws nothing, as `numerals` does. Test in Task 3.

---

### Task 1: The entries: which chords get a diagram

**Files:**
- Modify: `packages/render/package.json` (the dependency), `bun.lock` (by `bun install`), `packages/render/src/types.ts`, `packages/render/src/model.ts`
- Create: `packages/render/src/diagrams.ts`
- Test: `packages/render/tests/diagrams.test.ts`

**Interfaces:**
- Consumes: `shapeFor`, `Shape` from `@barmark/fretboard`; `ChordRecord`, `Key` from `barmark`; the model's blocks, items, cells and slots (`packages/render/src/types.ts`).
- Produces, in `types.ts`:
  ```ts
  /** One chord of the chart as a diagram shows it (design §4 and §5.2). */
  export type DiagramEntry = {
  	/** The chord as written: a name, or a note set. */
  	chord: ChordRecord;
  	/** The notes written after a name (`Cmaj7{E3 G3}`), else null. */
  	voicing: ChordRecord | null;
  	/** The key in force where the chord first appears, for a numeral; null when the chart has none there. */
  	key: Key | null;
  	/** The fingering; null when the written notes cannot be played in standard tuning. */
  	shape: Shape | null;
  	/** "shell": a 7alt's root, third and flat seventh. "voicing-replaced": the written voicing did not fit, so the name's own shape is shown. */
  	caveat: "shell" | "voicing-replaced" | null;
  };
  export type LayoutOptions = { rehearsalLetters?: boolean; part?: string; chordDiagrams?: "guitar" };
  // ChartModel gains: diagrams: DiagramEntry[];
  ```
- Produces, in `diagrams.ts`: `chartDiagrams(blocks: SectionBlock[], singing: (row) => boolean): DiagramEntry[]` (the exact second parameter is the implementer's: it must let the function skip a part's voice line; see below).

Rules (spec §4.2, §4.3, §5.2):
- Walk the model in written order: blocks, their items (`row`, and each row of a `system`), cells of kind `slots`, slots (a group's members in order), and take slots of kind `chord`.
- One entry per distinct chord: the identity is the chord's `canonical` text plus the voicing's `canonical` text when there is one. `Cmaj7` and `Cmaj7{E3 G3}` are two entries; `F#` and `Gb` are two entries. A replay, a `%` and a later appearance add nothing.
- `key` is the cell's `key` at the first appearance.
- A named chord: `shapeFor(chord, voicing)`. `ok` gives `shape` and `caveat`; `not-playable` gives `shape: null`.
- A note set on a chord line: `single-note` gives no entry; `not-playable` gives an entry with `shape: null`; `ok` gives its shape.
- Nothing from: `/`, `N.C.`, `--`, `?` and unreadable slots, error lines, and **a part's voice line** (grammar 7.7: its note sets are melody). `RowItem.sings` marks a voice line with words; a voice line without words is found the way `verses.ts`'s `singerOf` finds it. Decide how `chartDiagrams` learns it from what `layoutChart` has in hand, and say so in the report.
- With `part` set, the model already holds only that part.
- `layoutChart` fills `diagrams` only when `chordDiagrams === "guitar"`; otherwise `[]`, and `shapeFor` is never called.

- [ ] **Step 1: Write the failing tests** in `tests/diagrams.test.ts`. With `const entries = (text: string, o = {}) => layoutChart(text, { chordDiagrams: "guitar", ...o }).diagrams` and `const names = (text, o?) => entries(text, o).map((e) => e.chord.canonical + (e.voicing?.canonical ?? ""))`:

```ts
test("off by default: no entries, and the shapes are never asked for", () => {
	expect(layoutChart("| C | F | G | C |").diagrams).toEqual([]);
});

test("one entry a distinct chord, in written order", () => {
	expect(names("| C | Am | F | G |\n| C | Am | F | G7 |")).toEqual(["C", "Am", "F", "G", "G7"]);
});

test("a replay, a % and a hold add nothing", () => {
	expect(names("## Verse\n| C | % | F / | G |\n## Verse ->")).toEqual(["C", "F", "G"]);
});

test("nothing from N.C., silence, unknown slots or an error line", () => {
	expect(names("| N.C. | -- | ? | C |\n| C | oops( | G |")).toEqual(["C"]);
});

test("a name and the same name with a voicing are two entries", () => {
	const e = entries("| Cmaj7 | Cmaj7{E3 G3} |");
	expect(e.map((x) => x.voicing?.canonical ?? null)).toEqual([null, "{E3 G3}"]);
	expect(shapeText(e[1]!.shape!)).toBe("xx20xx");
	expect(e[1]!.caveat).toBeNull();
});

test("a voicing that does not fit shows the name's shape, and says so", () => {
	const [e] = entries("| Cmaj7{E3 G3 B3 C4} |");
	expect(shapeText(e!.shape!)).toBe("x32000");
	expect(e!.caveat).toBe("voicing-replaced");
});

test("a note set on a chord line: placed, or not playable; a single note is nothing", () => {
	const e = entries("| {C3 G3 E4} | {E1} | {C3 C3} |");
	expect(e).toHaveLength(2);
	expect(shapeText(e[0]!.shape!)).toBe("x3x0x0");
	expect(e[1]!.shape).toBeNull();
});

test("7alt is a shell", () => {
	expect(entries("| G7alt |")[0]!.caveat).toBe("shell");
});

test("enharmonic names are two entries with one shape", () => {
	const e = entries("| F# | Gb |");
	expect(e).toHaveLength(2);
	expect(e[0]!.shape).toEqual(e[1]!.shape);
});

test("the key is the one in force at the first appearance", () => {
	const e = entries("key: C\n| C | G |\n| [key: G] G | D |");
	expect(e.map((x) => [x.chord.canonical, x.key?.tonic])).toEqual([["C", "C"], ["G", "C"], ["D", "G"]]);
});
```

Check each snippet against the parser before relying on it (how a key change, a replay and a voicing are written is in `docs/grammar-v0.1-draft.md` and the tests beside this one; `Cmaj7{E3 G3}`'s shape and the key change's syntax above are to be confirmed and corrected), keeping what each test checks. Then, from the examples (`packages/render/tests/fixtures`, `morning-song.ts`): a chart with several parts gives every part's chords; with `part` set, only that part's; a voice line with words and one without (`Vox.Mel`-style) give nothing; a chart whose only line is a voice line gives `[]`.

Run: `bun test packages/render/tests/diagrams.test.ts` — Expected: FAIL (`diagrams` is undefined).

- [ ] **Step 2: Implement.** Add `"@barmark/fretboard": "workspace:^"` to render's dependencies and run `bun install`. Write `diagrams.ts`; have `layoutChart` call it.

- [ ] **Step 3: Run the gates**

Run: `bun test packages/render && bun run check && bun run fallow && bun run verify:package render`
Expected: all exit 0; every existing render test passes unchanged (`shared-columns` among them).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(render): the chords of a chart as diagram entries, from @barmark/fretboard"
```

---

### Task 2: Drawing the strip

**Files:**
- Create: `packages/render/src/diagram.ts`
- Modify: `packages/render/src/html.ts`, `packages/render/src/styles.ts`, `packages/render/src/speech.ts`
- Test: `packages/render/tests/diagram-svg.test.ts`, `packages/render/tests/diagram-strip.test.ts`, `packages/render/tests/contrast.test.ts` (if it lists the stylesheet's colours)

**Interfaces:**
- Consumes: `DiagramEntry` (Task 1); `typesetChord`, `typesetNumeral`, `piecesHtml`, `speakChord`, `escapeHtml`; the `numerals` setting.
- Produces, `diagram.ts`: `diagramSvg(shape: Shape, hand: "right" | "left", label: string): string` — one `<svg class="bm-diagram-svg" role="img" aria-label="…" viewBox="…">`.
- Produces, `speech.ts`: `speakDiagram(entry: DiagramEntry): string`.
- Produces, `html.ts`: `RenderOptions` gains `chordDiagrams?: "guitar"` and `diagramHand?: "right" | "left"`; the strip is emitted between `headerHtml(model)` and the blocks when the model has entries.

The drawing (spec §5.3, §5.5):
- Six vertical strings and five fret spaces. A dot on each fretted string, in the fret space `fret − base + 1`. A barre is one rounded bar across its strings at its fret, with no separate dots under it for the strings fretted exactly there. Above the nut line, `×` over each muted string and `○` over each open one. When `base` is 1 the nut is a thick line; otherwise a plain line with the starting fret written at the left as `5fr` (`${base}fr`).
- Strokes and fills are set by class in the stylesheet, not by attributes: strings and frets `var(--bm-rule)`; dots, the barre and the nut `var(--bm-ink)`; `×`, `○` and the fret number `var(--bm-muted)`. Under `forced-colors: active` everything is `CanvasText` (as the grid's marks are).
- Sizes are in `em` from `--barmark-size`: the SVG has a `viewBox` and the stylesheet gives it a width of about `3.5em`; it scales with the text.
- `hand: "left"` mirrors the strings only: the low string is drawn on the right. The fret number stays at the left, and the name and the spoken order do not change.
- Coordinates are whole numbers or one decimal, so golden strings are stable.

The strip (spec §5.1, §5.2, §5.4):
```html
<section class="bm-diagrams" part="diagrams" aria-label="Guitar chords"><ul>
<li class="bm-diagram" part="diagram">[svg]<span class="bm-diagram-name" aria-hidden="true">[the chord, as the grid marks it up]</span>[numeral][note]</li>
…</ul></section>
```
- The name is the chord's own markup (`piecesHtml(typesetChord(parts))`, so it reads as the grid's chords do). A note set's name is its written text (`{C3 G3 E4}`); a name with a voicing shows the name, then the voicing's text smaller.
- With `numerals` on, a line under the name holds the chord's numeral in the entry's `key` (`typesetNumeral`), when there is a key and the entry is a named chord. The strip's names stay letters.
- `shape: null`: no SVG; a frame of the same size holding the words `not playable in standard tuning`, with `role="img"` and the spoken label.
- `caveat: "voicing-replaced"`: a visible note under the name, `written voicing doesn't fit standard tuning`. `caveat: "shell"`: no visible note; the speech adds it.
- Print: each `li` has `break-inside: avoid`; print already uses the light palette.

Speech (`speakDiagram`, spec §5.4): the chord as `speakChord` says it, a colon, then the strings low to high in words: `muted`, `open`, or the fret number. "A minor: muted, open, 2, 2, 1, open". A shell adds ", altered tones not shown". A replaced voicing adds ", written voicing doesn't fit standard tuning". No shape: "C major seven, written voicing: not playable in standard tuning" for a voicing with no name shape, and for a note set its notes then ": not playable in standard tuning". Left-handed changes nothing here.

- [ ] **Step 1: Write the failing tests.**

`tests/diagram-svg.test.ts`: golden strings (`toBe` on the whole SVG, kept in the test file) for: `x02210` (an open chord), `x57755`-style barre at fret 5 (`shapeOf("577655")`… use shapes from `@barmark/fretboard`'s `shapeOf`), a muted bass (`xx0232`), a shape with a muted string inside (`x3x0x0`), and `x02210` left-handed. And structural assertions with linkedom that do not depend on coordinates: an open chord has two `○`, one `×`, three dots, a nut, no fret number; the barre shape has one barre element, a `5fr` label, no nut; left-handed has the same counts and the `×` on the right half.

`tests/diagram-strip.test.ts`:

```ts
test("no option, no strip", () => {
	const plain = renderChart(EXAMPLE);
	expect(plain).not.toContain("bm-diagram");
});

test("the strip sits after the header and before the first section", () => {
	const d = shadow(doc(renderChart("# Song\n## Verse\n| C | Am | F | G |", { chordDiagrams: "guitar" })));
	const strip = d.querySelector("section.bm-diagrams");
	expect(strip?.getAttribute("aria-label")).toBe("Guitar chords");
	expect(strip?.getAttribute("part")).toBe("diagrams");
	expect(strip?.previousElementSibling?.className).toBe("bm-header");
	expect(strip?.nextElementSibling?.className).toBe("bm-section");
	expect(strip?.querySelectorAll('li[part="diagram"]')).toHaveLength(4);
});

test("each diagram is an image with a spoken label and a visible name", () => {
	const d = shadow(doc(renderChart("| Am |", { chordDiagrams: "guitar" })));
	const svg = d.querySelector(".bm-diagram svg");
	expect(svg?.getAttribute("role")).toBe("img");
	expect(svg?.getAttribute("aria-label")).toBe("A minor: muted, open, 2, 2, 1, open");
	expect(d.querySelector(".bm-diagram-name")?.textContent).toBe("Am");
});

test("no chord that gets a diagram, no strip", () => {
	for (const text of ["| N.C. | / | ? |", "| {E1} |"])
		expect(renderChart(text, { chordDiagrams: "guitar" })).not.toContain("bm-diagrams");
});

test("no ids, and nothing unescaped", () => {
	const html = renderChart('# <script>alert(1)</script>\n| Cmaj7{E3 G3} | {C3 G3 E4} |', { chordDiagrams: "guitar" });
	expect(html).not.toContain("<script>alert");
	expect(html).not.toMatch(/\sid="/);
});
```

Also: the numeral line appears only with `numerals` and shows the degree from the first appearance's key; the not-playable frame and its label; the replaced-voicing note; `7alt`'s label ends "altered tones not shown"; `diagramHand: "left"` changes the SVG and not the label; the grid's own markup (every `section.bm-section`) is identical with the option on and off; a chart of 1,000 bars with 200 distinct chords renders in linear time (`growth` from `test-support/growth.ts`, as `tests/scale.test.ts` does).

That the default output is otherwise unchanged is Step 3's proof, not a test here.

Run: `bun test packages/render/tests/diagram-svg.test.ts packages/render/tests/diagram-strip.test.ts` — Expected: FAIL (module not found; option unknown).

- [ ] **Step 2: Implement** `diagram.ts`, `speakDiagram`, the strip in `html.ts`, and the styles.

- [ ] **Step 3: The stylesheet and the snapshot.** The strip's CSS joins `stylesheet` in `styles.ts` (one stylesheet, so score's grid and the server's markup get it too). That changes the `<style>` text of every rendered chart, so `tests/shared-columns.snapshot.json` (hashes of whole outputs) must be regenerated. Before regenerating, prove the change is the stylesheet alone: for each chart and option set the snapshot covers, the output with its `<style>…</style>` element removed is identical at this commit and at the task's base commit (a throwaway script inside the worktree, deleted afterwards; put its result in the report). Then regenerate the snapshot the way its test file documents, and say so in the commit body.

- [ ] **Step 4: Run the gates**

Run: `bun test packages/render && bun run check && bun run fallow`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(render): chord diagrams drawn as a strip at the top of the chart"
```

---

### Task 3: The element, the size budget, the browser suite and the documents

**Files:**
- Modify: `packages/render/src/html.ts` (`elementAttributes`), `packages/render/src/element.ts`, `packages/render/browser/server.ts`, `packages/render/browser/render.pw.ts`, `packages/render/README.md`, `packages/render/CHANGELOG.md`
- Test: `packages/render/tests/element.test.ts`, `packages/render/tests/html.test.ts`, `packages/render/tests/size.test.ts` (new)

**Interfaces:**
- Consumes: Task 2's options.
- Produces: `observedAttributes` gains `"chord-diagrams"` and `"diagram-hand"`; `optionsFromAttributes` reads them (`chord-diagrams="guitar"` only; `diagram-hand="left"` or `"right"`; anything else is not set); property accessors `chordDiagrams` and `diagramHand` in the form of `numerals` and `showPart`; `elementAttributes` writes both back on `<barmark-chart>` so a server-rendered chart upgrades with them.

- [ ] **Step 1: Write the failing tests.** In `tests/element.test.ts`, with the file's fake `el()`: each attribute alone and both together give the options; an unknown value gives none; no attribute, no key in the options object. In `tests/html.test.ts`: `renderChart(text, { chordDiagrams: "guitar", diagramHand: "left" })` starts `<barmark-chart chord-diagrams="guitar" diagram-hand="left">`; the default right hand writes no `diagram-hand`. The server-rendered case of Review Focus 5, the way the file tests `numerals` on a sourceless element (or, if the element cannot run under linkedom, in the browser suite).

`tests/size.test.ts`, modelled on `packages/fretboard/tests/size.test.ts` (an entry file under the system temp dir, outside the package, importing render's element source; `Bun.build` with `minify: true`, `target: "browser"`, nothing external; gzip level 9; then load and run the bundle far enough to render one chart with diagrams, so the test measures what works):

```ts
/** The element's gzipped size at this plan's base commit, measured with this same build. */
const BEFORE_DIAGRAMS = /* measured: see below */;
const BUDGET = 5_500; // Kevin's decision, amended 2026-11-13 (design §6.2)
test("chord diagrams cost the element at most 5.5 KB gzipped", () => {
	expect(size).toBeLessThanOrEqual(BEFORE_DIAGRAMS + BUDGET);
});
```

Measure `BEFORE_DIAGRAMS` first, with the test's own build function, on render's and barmark's sources as they were at this plan's base commit: unpack them into a directory under the system temp dir (`git archive <base> packages/render/src packages/barmark/src | tar -x -C <tmp>`) and build the element entry from there. Record the base number, the commit it was measured at and today's number in a comment above the constant and in the report. If today's number is over the budget, do not raise either constant: report the bytes and what the biggest parts are.

- [ ] **Step 2: Implement** the attributes, accessors and `elementAttributes`.

- [ ] **Step 3: The browser suite.** `packages/render/browser/server.ts`: `chartPage()` reads `diagrams=guitar` and `hand=left` from the query; the element page's import map gains `@barmark/fretboard` and the static routes serve its `dist` (`/fretboard/`), beside `barmark`'s. In `render.pw.ts`, new tests in the file's existing patterns: with diagrams on, in light and dark, the dot and string colours meet the contrast the file already asserts for ink and rule; at 320px and at 360px with large text the page does not scroll sideways and the strip wraps; under `emulateMedia({ media: "print" })` the strip uses the light palette; under `forcedColors: "active"` the dots and strings take the system text colour; the element page shows the strip when `chord-diagrams` is set after load and removes it when the attribute is removed. Run `bun run test:browser` (it builds first): exit 0.

- [ ] **Step 4: The documents.** `packages/render/README.md`: the two options in the options table and the attributes table, a short section "Chord diagrams" (what the strip shows; where the shapes come from, one sentence pointing at `@barmark/fretboard`'s README for the limits; left-handed; that the strip shows letter names, with a numeral under each when `numerals` is on; that written voicings are shown exactly or replaced with a note; the two `::part()` names; that a server-rendered chart needs its source to change the option), each example's output real. `CHANGELOG.md`: `[Unreleased]`, `### Added`: the options and attributes, the parts, `layoutChart`'s `diagrams`, the dependency ("Requires `@barmark/fretboard` 0.1.0"), and the measured size.

- [ ] **Step 5: Run the gates**

Run: `bun test packages/render && bun run check && bun run fallow && bun run verify:package render && bun run test:browser`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(render): chord-diagrams and diagram-hand on the element, within the size budget"
```

---

### Task 4: Score and the CLI

**Files:**
- Modify: `packages/score/src/element.ts`, `packages/score/browser/server.ts`, `packages/score/README.md`, `packages/score/CHANGELOG.md`
- Modify: `packages/cli/src/render.ts`, `packages/cli/src/help.ts`, `packages/cli/README.md`, `packages/cli/CHANGELOG.md`
- Test: `packages/score/tests/element.test.ts`, `packages/score/tests/server.test.ts`, `packages/cli/tests/render.test.ts`, `packages/cli/tests/render-score.test.ts`, `packages/cli/tests/main.test.ts`

**Interfaces:**
- Consumes: render's options and `optionsFromAttributes` (Task 3).
- Produces: `<barmark-score>` observes `chord-diagrams` and `diagram-hand` and its grid view shows the strip (it reads them through render's `optionsFromAttributes`, so only `OBSERVED` changes); the score view ignores them. `renderScoreHtml(text, { chordDiagrams: "guitar" })` writes the attribute and the strip in its grid markup.
- Produces: `barmark render --diagrams guitar [--left-handed]`. `--diagrams` takes a value (`guitar`; anything else is a usage error naming the allowed value, as `--numerals` does). `--left-handed` is a boolean; without `--diagrams` it is a usage error: `--left-handed needs --diagrams`. Both are grid-only: with `--score`, `barmark: --diagrams does not apply to --score`, exit 2, as `--numerals`.

- [ ] **Step 1: Write the failing tests.**
  - Score: in `tests/element.test.ts`, beside "the grid follows a columns attribute": the grid follows `chord-diagrams` (the strip is in the grid's markup; removing the attribute removes it), and the score view's markup has no strip. In `tests/server.test.ts`: `renderScoreHtml` with the option carries the attribute and the strip.
  - CLI: in `tests/render.test.ts`, `--diagrams guitar` gives exactly `renderChart(PD, { chordDiagrams: "guitar" })` and with `--left-handed` exactly `renderChart(PD, { chordDiagrams: "guitar", diagramHand: "left" })`; `--diagrams ukulele` and `--left-handed` alone are usage errors (exit 2) with the messages above. In `tests/render-score.test.ts`, add both flags to the loop of grid flags refused with `--score`. In `tests/main.test.ts`, the help's flag list.

Run: `bun test packages/score packages/cli` — Expected: the new tests FAIL.

- [ ] **Step 2: Implement.** Score: add the two names to `OBSERVED`'s grid group; `packages/score/browser/server.ts`'s import map and static routes gain `@barmark/fretboard`, as render's did. CLI: the two flags in `FLAGS`, in `GRID_ONLY`, in `gridOptions()`, and under "The grid only:" in the help.

- [ ] **Step 3: The documents.** Score's README (the two attributes in its table; the score view ignores them) and CHANGELOG (`### Added`). The CLI's README (the two flags, an example) and CHANGELOG (`### Added`).

- [ ] **Step 4: Run the gates**

Run: `bun test packages/score packages/cli && bun run check && bun run fallow && bun run verify:package score && bun run verify:package cli && bun run test:browser`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(score, cli): chord diagrams on the score element's grid and in barmark render"
```

---

### Task 5: The release's wiring, and the repository's documents

**Files:**
- Modify: `scripts/verify-release.ts`, `.github/workflows/release.yml`, `RELEASING.md`, `CLAUDE.md`, `.claude/skills/release/SKILL.md`, `docs/superpowers/specs/2026-11-10-chord-diagrams-design.md` (only if the build departed from it), `FINDINGS.md` (only if something surprised)
- Test: the scripts' own tests, if `scripts/` has any for `verify-release`

`@barmark/render` now depends on `@barmark/fretboard`, and the CLI bundles render, so fretboard's code ships in the CLI and its binaries.

- [ ] **Step 1:** `scripts/verify-release.ts`: add `fretboard: ["src"]` to `RELEASED_CODE` (the libraries whose code the CLI ships; `sync` is the precedent for one that arrives through another library), so a CLI release is refused while fretboard has changed since its own tag. Read how the check uses the table, and how a library that is not a direct CLI dependency resolves its version, before adding the row. If a test covers the table, extend it first.
- [ ] **Step 2:** `.github/workflows/release.yml`: the CLI job's `for dep in barmark render musicxml sync midi` loop gains `fretboard`. Read what the loop does with each name (it checks the published versions the binary embeds) and confirm fretboard fits it.
- [ ] **Step 3:** `RELEASING.md`: fretboard's paragraph now says render imports it ("after a fretboard release, a render patch raises the dependency when its range needs it, then the CLI"), the CLI-bundled list names it, and steps 13 to 14 name it among the releases a CLI release follows. `CLAUDE.md`: render's layout (`diagrams.ts`, `diagram.ts`, the dependency), score's and the CLI's lines, and the working agreement's release paragraph (a fretboard release is followed by a CLI release, as sync's is). `.claude/skills/release/SKILL.md`: the same note.
- [ ] **Step 4: Run the gates**

Run: `bun test && bun run check && bun run fallow && bun run verify:package render && bun run verify:package cli`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "build: fretboard among the libraries the CLI ships"
```

---

## After the plan

1. Release in order (`RELEASING.md`): `@barmark/render` minor ("Requires `@barmark/fretboard` 0.1.0"), `@barmark/score` patch (raising its render dependency), `@barmark/cli` minor, then `kevinpeckham/songs`.
2. The site plan: the "Guitar diagrams" switch (home playground and the Try It page), the guide's renderer options, an example with diagrams, and ten packages.
3. `@barmark/lyricsheet`: `{define}` from the same shapes (spec §7).
