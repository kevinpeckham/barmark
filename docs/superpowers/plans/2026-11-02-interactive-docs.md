# barmark.dev interactive docs (`/try`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/try` page on barmark.dev with one box that reads what you type (chart snippet, note set, Harte label or chord symbol) and shows the matching guide rows.

**Architecture:** `@barmark/render` 0.5.0 exports `speakChord`. In the site, a pure module (`src/lib/try/read.ts`) classifies the input and builds a plain-data reading from the packages' own output; the page and two small components draw it, reusing `ChartRender` and `GuideTable`.

**Tech Stack:** Bun, TypeScript strict, Biome (tabs), SvelteKit (Svelte 5 runes), UnoCSS, linkedom (unit tests), Playwright (browser tests).

**Spec:** `docs/superpowers/specs/2026-11-02-interactive-docs-design.md`

## Global Constraints

- No music theory in the site: every spelling, name, label, note and diagnostic comes from `barmark` or `@barmark/render`.
- The site installs both packages from npm at exact versions; `site/` is not a workspace member.
- Styling with UnoCSS utilities only, as the existing pages do; no `<style>` blocks or inline styles.
- Test first; Fallow clean (packages); CHANGELOG `[Unreleased]` entry for the render change; commits are conventional with **no** `Co-Authored-By` trailer.
- `main` is protected: each part lands by PR with green CI. Kevin approves the npm publish.
- Route `/try`, nav label "Try it", between Syntax and GitHub.
- Example chips, in order: `Cø`, `C7b9/E`, `{C E G}`, `C:maj7`, `| D | % | x2`.
- `/try` uses only `?q=`; `/syntax`'s URL handling is unchanged.

## Review Focus

1. Text that is no chord at all (`repeat`, `bass`, `N`): no crash; a word not starting A–H or `{` shows only matching guide rows, no parser error (Task 4 test `plain words show rows, not an error`).
2. Whitespace around the input (` Cø `, `Cø\n`): read as `Cø`, not a two-line chart (Task 4 test `trims the input`).
3. A huge pasted chart: the preview stops past `ChartRender`'s 50,000 characters, the page stays responsive (Task 6 browser test `a long paste does not freeze the page`).
4. A `?q=` that is a chart with newlines (`%0A`): opens with the chart reading (Task 6 browser test `a shared link opens with its reading`, using a two-line chart).
5. The suggestion button with text that has no suggestion: no button appears (Task 4 test `an error without a suggestion has none`).

---

### Task 1: `@barmark/render` exports `speakChord`

**Files:**
- Modify: `packages/render/src/index.ts`
- Modify: `packages/render/README.md` (a short "Spoken names" section after "Numerals"), `packages/render/CHANGELOG.md` (`[Unreleased]`: "Added: `speakChord(record, key?)`, the spoken name the chart gives a chord, for screen readers and other tools.")
- Test: `packages/render/tests/speech.test.ts`

**Interfaces:**
- Produces: `import { speakChord } from "@barmark/render"`: `speakChord(record: ChordRecord, key?: Key): string` (existing function, now public).

- [ ] **Step 1: Write the failing test** in `tests/speech.test.ts`:

```ts
import * as render from "../src/index.ts";
test("speakChord is public and speaks as the chart does", () => {
	const r = parseChord("Cø");
	if (!r.ok) throw new Error("Cø");
	expect(render.speakChord(r.value)).toBe("C minor seven flat five");
	expect(renderChart("| Cø |")).toContain("C minor seven flat five");
});
```

- [ ] **Step 2: Run it.** `bun test packages/render/tests/speech.test.ts`. Expected: FAIL, `render.speakChord is not a function`.
- [ ] **Step 3: Export it** from `src/index.ts` (`export { speakChord } from "./speech.js";`); README section and CHANGELOG entry as above. If `tests/readme.test.ts`-style checks exist for render's README, keep them green.
- [ ] **Step 4: Gates.** `bun test`, `bun run check`, `bun run fallow`, `bun run verify:package render`. Expected: all clean.
- [ ] **Step 5: Commit** `feat(render): export speakChord`, push branch `feat/render-speak-chord`, open the PR (`gh pr create -R kevinpeckham/barmark`).

### Task 2: Release `@barmark/render` 0.5.0 (human gate)

Follow `RELEASING.md` (the `release` skill): release PR bumping `packages/render` to 0.5.0 and dating its CHANGELOG section; after merge, the release check on `main`, tag `render-v0.5.0`, `gh release create -R kevinpeckham/barmark`. **Stop: Kevin approves the publish in the `npm` environment.** Done when `npm view @barmark/render version` prints `0.5.0`. Tasks 3–6 can't start before this.

### Task 3: The site installs `@barmark/render` 0.5.0

**Files:** `site/package.json`, `site/bun.lock`, `site/tests/site.test.ts` (the pinned-versions test).

- [ ] **Step 1:** Change the pinned-versions test's expectation to `{ barmark: "0.6.0", "@barmark/render": "0.5.0" }`. Run `cd site && bun test tests/site.test.ts`. Expected: FAIL on the render version.
- [ ] **Step 2:** `bun add --exact @barmark/render@0.5.0`. Run the same test. Expected: PASS.
- [ ] **Step 3:** Commit `chore(site): @barmark/render 0.5.0` on branch `feat/site-try` (Tasks 4–6 continue on it).

### Task 4: Reading the input (`src/lib/try/read.ts`)

**Files:**
- Create: `site/src/lib/try/read.ts`
- Test: `site/tests/try.test.ts`

**Interfaces:**
- Consumes: `speakChord` (Task 1); from `barmark`: `parseChord`, `parseNoteSet`, `harteToBarmark`, `parseChart`, `printChart`, `DIRECTIVE_NAMES`; `GuideQuery` from `#lib/guide/query`.
- Produces:

```ts
export const EXAMPLES: readonly string[]; // the five chips, in the order above
export type Kind = "empty" | "chart" | "notes" | "harte" | "chord";
export function classify(input: string): Kind;
export type ChordReading = {
	typed: string;            // what was read (the spelling, for a Harte label)
	canonical: string;        // record.canonical
	spoken: string;           // speakChord(record)
	harte: string;            // record.harte
	notes: string[];          // record.pitches
	degrees: string[];        // record.intervals as "1", "♭3", "♯11"…
	bass: string | null;      // record.bass when it isn't record.root, else null
	warnings: string[];       // warning messages
};
export type Reading =
	| { kind: "empty" }
	| { kind: "text" }        // reads as nothing; only guide rows
	| { kind: "chart"; canonical: string; diagnostics: { line: number; severity: "error" | "warning"; message: string }[] }
	| { kind: "chord" | "notes"; chord: ChordReading }
	| { kind: "harte"; label: string; chord: ChordReading }
	| { kind: "error"; message: string; suggestion: string | null };
export function read(input: string): Reading;
/** Which guide rows to show under a reading; null: none (a chart). */
export function guideQuery(reading: Reading, input: string): GuideQuery | null;
```

Rules (the spec's order, plus the rulings below): trim the input first; empty → `empty`. `chart` if it has a newline or `|`, starts with `#`, or matches `^(key|time|tempo|feel)\s*:` built from `DIRECTIVE_NAMES` (case-insensitive). `notes` if it starts with `{`. `harte` if it contains `:` and `harteToBarmark` returns a spelling. Otherwise `chord`. A failed parse of a `chord` or `notes` input is `error` when the input starts with `{` or a capital letter A–H (a chord attempt), else `text`. `guideQuery`: chord/notes/harte/error → `{ q: "", cat: "chords", sort: "category" }`; text and empty → `{ q: input, cat: null, sort: "category" }`; chart → `null`.

- [ ] **Step 1: Write the failing tests** (`describe("reading what's typed")`), each with these exact values:
  - `classify`: `""`→empty, `"  "`→empty, `"key: D"`→chart, `"Key:D"`→chart, `"| D |"`→chart, `"## Verse"`→chart, `"C\nG"`→chart, `"{C E G}"`→notes, `"C:maj7"`→harte, `"C"`→chord, `"Cø"`→chord, `"C:foo"`→chord.
  - `trims the input`: `read(" Cø\n")` is a chord reading with `canonical` `"Cm7(b5)"`.
  - `a chord`: `read("Cø").chord` equals `{ typed: "Cø", canonical: "Cm7(b5)", spoken: "C minor seven flat five", harte: "C:hdim7", notes: ["C","Eb","Gb","Bb"], degrees: ["1","♭3","♭5","♭7"], bass: null, warnings: [] }`.
  - `a slash chord`: `read("C7b9/E").chord` has `spoken` `"C seven flat nine over E"`, `bass` `"E"`, `degrees` `["1","3","5","♭7","♭9"]`.
  - `a note set`: `read("{C E G}")` is kind `notes` with `spoken` `"notes C, E, G"`.
  - `a Harte label`: `read("C:maj7")` is kind `harte`, `label` `"C:maj7"`, `chord.canonical` `"Cmaj7"`.
  - `an error with a suggestion`: `read("H7")` equals `{ kind: "error", message: 'H7: German "H" is ambiguous; write B', suggestion: "B7" }`.
  - `an error without a suggestion has none`: `read("C:foo")` is kind `error` with `suggestion` `null`.
  - `plain words show rows, not an error`: `read("repeat")`, `read("bass")` and `read("N")` each equal `{ kind: "text" }` (none starts with `{` or a capital A–H); `read("Bass")` is kind `error` (a chord attempt).
  - `a chart`: `read("| D | % |x2")` has `canonical` `"| D | % | x2\n"` and no diagnostics; `read("## Verse").diagnostics[0].message` is `'no earlier section named "Verse" to replay'`.
  - `every example chip reads without an error`: for each of `EXAMPLES`, `read(x).kind` is not `error`, and no chart diagnostics.
  - `guideQuery`: chord → `cat` `"chords"`; `"repeat"` → `q` `"repeat"`, `cat` null; chart → `null`.
- [ ] **Step 2: Run.** `cd site && bun test tests/try.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `read.ts` per the Interfaces block. Degrees: degree number, prefixed by `♭` or `♯` repeated `|alter|` times.
- [ ] **Step 4: Run** the same. Expected: all pass. Then `bun run check`.
- [ ] **Step 5: Commit** `feat(site): read a chord, note set, Harte label or chart for /try`.

### Task 5: Charts without bar numbers

**Files:** `site/src/lib/chart.ts`, `site/src/lib/components/ChartRender.svelte`, `site/tests/chart.test.ts`.

**Interfaces:**
- Produces: `chartHtml(text: string, barNumbers = true): string`; `ChartRender` gains prop `barNumbers?: boolean` (default `true`), passed to `chartHtml`.

- [ ] **Step 1:** Test `chartHtml("| C |", false)` starts with `<barmark-chart` and contains `bar-numbers="off"`; `chartHtml("| C |")` doesn't. Run `bun test tests/chart.test.ts`. Expected: FAIL.
- [ ] **Step 2:** Implement; run; expected PASS. Commit `feat(site): a chart can leave out bar numbers`.

### Task 6: The `/try` page

**Files:**
- Create: `site/src/routes/try/+page.svelte`, `site/src/lib/components/TryReading.svelte` (draws one `Reading`), `site/tests/try-page.test.ts`
- Modify: `site/src/lib/components/SiteNav.svelte` (the "Try it" link), `site/browser/site.pw.ts`

**Interfaces:**
- Consumes: `read`, `guideQuery`, `EXAMPLES`, `Reading` (Task 4); `ChartRender` with `barNumbers` (Task 5); `GuideTable` (`{ query: GuideQuery }`).

Page, top to bottom: `<h1>` "Try it"; one intro sentence *(builder's wording; Kevin may edit)*; the box (an `<input>` that becomes a `<textarea>` once the text has a newline, labelled "barmark to read"); the chips as buttons that fill the box; `TryReading`; then `GuideTable` with `guideQuery(...)` (not drawn when null; for a chart, a link "See the whole syntax" to `/syntax`). The query syncs to `?q=` the way `/syntax` does (read in `onMount`, `replaceState` after), with only `q`. `svelte:head` as `/syntax`'s, with `/try` URLs and the description "Type a chord, a Harte label or a bit of chart and see how barmark reads it."

`TryReading` shows: for a chord/notes/harte reading, the drawing (`ChartRender` of `| <canonical> |`, `barNumbers={false}`), then a `<dl>` with "Canonical" (plus "you wrote X" when `typed` ≠ `canonical`), "Spoken", "Harte label", "Notes" (notes with degrees under them), "Bass" (only when set), warnings; for harte, a line "Harte label `C:maj7` → `Cmaj7`" above. For a chart: `ChartRender` of the input, the canonical text in a `<pre>`, diagnostics as "line N: message". For an error: the message, and a button "Try B7" when there is a suggestion. The reading region is `aria-live="polite"`.

- [ ] **Step 1: Prerender test** `tests/try-page.test.ts` (with `page("try.html")` from `built.ts`): the box's value is `Cø`; the page contains `C minor seven flat five`, `C:hdim7`, and a `barmark-chart` with `template[shadowrootmode=open]` and `bar-numbers="off"`; the chords rows are present (`[data-row]` count equals `ROWS.filter(r => r.category === "chords").length`, none hidden); and `index.html`'s nav has `a[href="/try"]` with text "Try it", after the Syntax link. Run `bun test tests/try-page.test.ts`. Expected: FAIL (no `try.html`).
- [ ] **Step 2: Browser tests** in `browser/site.pw.ts`, `test.describe("try it")`:
  - `typing reads at once and keeps the URL`: fill `C7b9/E` → text `C seven flat nine over E` visible; URL ends `?q=C7b9%2FE`.
  - `a shared link opens with its reading`: goto `/try?q=key%3A%20D%0A%7C%20D%20%7C%20A%20%7C` → a textarea; the chart reading shows 2 bars; the canonical `<pre>` contains `| D | A |`.
  - `the suggestion fixes the chord`: fill `H7`, click "Try B7" → box value `B7`, `B seven` visible.
  - `chips fill the box`: click `{C E G}` → `notes C, E, G` visible.
  - `a long paste does not freeze the page`: fill `"| C |\n".repeat(10_000)` → the "Too long to preview" status shows within 2 s.
  - `phone width stacks`: at 400×800 the page has no horizontal scroll (`document.documentElement.scrollWidth <= 400`).
  - every test uses the file's `watchErrors` helper: no console errors.
  Run `bun run test:browser`. Expected: the new tests FAIL.
- [ ] **Step 3: Build** the page, `TryReading` and the nav link (use the `svelte:svelte-file-editor` agent or the Svelte MCP autofixer on each `.svelte` file).
- [ ] **Step 4: Gates.** `cd site && bun test && bun run check && bun run test:browser`. Expected: all pass.
- [ ] **Step 5: Look at it.** Open `https://barmark.bench.lj.dev/try` (the dev server on 5253) at desktop and 400px; screenshot both for the PR.
- [ ] **Step 6: Commit** `feat(site): /try, read what you type`; push; open the PR with the screenshots.
