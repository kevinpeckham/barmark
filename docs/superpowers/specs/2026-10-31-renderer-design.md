# `@barmark/render` — design

Status: draft for Kevin's review, 2026-10-31. Decisions marked *(Claude's
call)* were made by Claude where the conversation left a gap; everything
else Kevin chose, mostly from mockups (kept in `.superpowers/brainstorm/`,
not committed).

## Intent

barmark charts are plain text. The renderer turns a parsed chart into the
**clean, evenly spaced bar grid** that BRIEF.md calls the site's "quiet
showpiece": what a bandmate sees on a phone at rehearsal, or a visitor on
barmark.dev. It is also how barmark charts get embedded in other people's
pages, so it must look identical wherever it lands, be themeable on
purpose, and be readable by everyone, including screen-reader users.

## Goals

1. Render any chart the parser accepts as an HTML bar grid, following the
   layout and notation decisions below.
2. Embed safely: page CSS cannot break the rendering by accident; the page
   can restyle it deliberately through a small documented surface.
3. Light and dark themes, text scaling and zoom, WCAG AA contrast, and
   spoken names so screen readers read a chart as music, not as markup.
4. Two ways to use it in the first release: a pure function (HTML out, no
   browser JavaScript needed) and a `<barmark-chart>` web component.
5. Ship from this repository as a second package in a Bun workspace,
   through the same CI, Fallow, Swamp and release process as `barmark`.

## Non-goals (first release)

- A column-aligned plain-text output. The canonical printer covers text;
  an aligned text view can come later, perhaps via `@barmark/cli`.
  *(Claude's call)*
- The site itself, the Try it page's editor, and the CLI.
- Audio, playback, transposition, or editing in the rendered view.
- Vertical (stacked) note sets, polychords, chord diagrams.

## Anti-goals

- **Never change the music.** The rendering must show exactly the bars,
  slots and repeats the parser produced. Layout is free; meaning is not.
- **No guessing.** The renderer never infers what the grammar does not say:
  it does not decide which words of a lyric fall in which bar, never names
  a note set, never reads meaning into heading text.
- **No fragile embedding.** A chart that looks right on our site and broken
  on someone's blog is a failure, even if every unit test passes.
- **No colour coding of sections.** Colour belongs to the host
  (stem-shovel's stems already use it).

## Constraints

- Spec authority: `docs/grammar-v0.1-draft.md`. A renderer need that the
  grammar does not cover is surfaced to Kevin, not decided in code.
- Repo conventions (CLAUDE.md): Bun, TypeScript strict, Biome (tabs),
  test first, parsers and renderers never throw on user input,
  CHANGELOG/FINDINGS entries, conventional commits with no AI trailer,
  `bun run fallow` clean (no new complexity beyond the baseline).
- Zero runtime dependencies besides `barmark`. ESM only, Node 20+, current
  evergreen browsers (Declarative Shadow DOM is required: Chrome 111,
  Safari 16.4, Firefox 123 and later).
- Fonts are SIL OFL; redistribution must follow the OFL (see "Font").

## Layout (Kevin's decisions)

- **Rows are the author's bar lines.** One rendered row per bar line in
  the source; the renderer never reflows bars between rows.
- **Columns are sized per section, like a table.** Within a section, each
  column is as wide as its widest bar, so every row in the section is the
  same length. A busy bar widens only its own column in its own section.
  Sections may differ in width. Rows with fewer bars than their section's
  widest row leave the remaining columns empty. *(Claude's call)*
- **Slots within a bar are spread evenly**, so beat positions line up down a
  section. *(Claude's call)*
- **Narrow screens and high zoom:** a row that does not fit wraps onto a
  second line; type is never shrunk and the page never scrolls sideways.
  *(Claude's call, satisfies WCAG 1.4.10 reflow)*

## Notation (Kevin's decisions)

| Source | Rendered |
|---|---|
| chord names | **canonical form, never the author's spelling** (Kevin): `Cø`, `C-7`, `CΔ`, `C7b9` render as Cm⁷(♭5), Cm⁷, C^maj7, C⁷(♭9). One unit; ♯ and ♭ glyphs; quality and extensions as superscripts (G⁷, A⁷ˢᵘˢ⁴, F^maj7, F♯m^7(♭5)). Built from the parsed chord's parts, never by re-reading a chord string. A jazz-symbol style (Δ, ø, °) may come later as an option. |
| slash chord `C/E` | inline, as written: C/E, Am⁷/G |
| single note `{E}` | the note name in a thin ring, so it never reads as the E major chord; octave as a small subscript (E₁) |
| note set `{D E! G}` | inline in faint braces, low to high, octaves as subscripts, marked root underlined; rows keep one height |
| group `D_E_F#m` | the chords side by side under a tuplet bracket carrying the count (3, or 2, 4, 5…) |
| hold `/` | a muted slash in its slot |
| `%` | **the previous bar's contents drawn again, at full weight** (no fading, no simile sign) |
| `N.C.` | N.C. in small caps *(Claude's call)* |
| `--` silence | a rest-like mark distinct from N.C. *(Claude's call; exact glyph decided in implementation, must be tested for clarity against N.C.)* |
| `?` | a muted question mark in the slot *(Claude's call)* |
| `...` cell | a fermata glyph (as the grammar requires) |
| `[2/4]` one-bar meter | a small stacked time signature at the start of its bar |
| pushes `/_G` | as a group (tuplet bracket of 2) — the grammar writes pushes as groups |

## The chart as a whole (Kevin's decisions)

- **Header:** the title, then one line: key, meter, tempo (♩ = 145), and
  the feel when stated (`swing`, `shuffle`…).
- **Section headings:** the author's text exactly as written. No badges, no
  parsing of numerals or anything else.
- **Bar numbers** at the start of every row: the play-order number of the
  row's first bar on its first pass. A repeated row shows only that number,
  so the next row jumps (Intro `x2` of 4 bars is bar 1; the Verse after it
  starts at 9). After an open repeat (`x ...`) the count is unknown, so
  numbering stops for the rest of the chart. Optional, on by default.
  *(Claude's call, as shown in the mockups Kevin approved)*
- **Rehearsal letters:** boxed A, B, C… mark **position**, one per section
  occurrence in play order; a replay gets its own new letter (that is the
  difference from `form`, which marks identity). A section before the first
  heading gets a letter only if it has bars. Optional, off by default.
  *(Claude's call, following the rehearsal-letter / form-letter
  distinction agreed with Kevin)*
- **Row repeats (`x2`, `|: … :|`):** the row(s) shown once, with repeat bar
  lines (‖: :‖) and the count (×2). An open repeat shows "× as needed"
  *(wording Claude's call)*. A `|: … :|` spanning several rows draws the
  repeat bar lines at its first and last bar.
- **Section repeats (`## Chorus x2`):** the section drawn once with ×2 in its
  heading, consistent with row repeats. *(Claude's call)*
- **Replayed sections** (a heading with no bars) are **drawn in full** under
  their heading, because a replay plays the written section.
  - **Text lines in a replay (Kevin):** if the replay has its own text
    lines (verse 2's words under `## Verse`), they **replace** the written
    section's text lines in order: the replay's first text line goes where
    the written section's first text line was, the second where the second
    was, and any extra lines go after the last row. A replay with no text
    lines of its own shows the written section's text lines.
  - Directive lines inside the written section (`feel: swing` before a row)
    show again in the replay where they fall, because they apply each time
    the section is played.
- **Elision** (`## Chorus ->`): the replay is drawn in full and the cut bar
  is **marked in place** (a dashed outline and a small "cut" label; spoken
  as "cut on this pass"), rather than removed. This one treatment covers
  every case: a plain last row, a last row marked `x2` or closing `|: :|`
  (only the last pass is cut), and `## Chorus x2 ->`. Which bar is cut is
  the parser's decision (it already records `elided` and the bars played);
  the renderer marks the bar the parser cut, and never cuts a fermata
  unless the parser does. *(Claude's call)*
- **Text lines** (lyrics, notes) appear **between rows exactly where
  written**, all in one plain style. `###` lines are text per the grammar;
  the renderer sets them slightly smaller and bold so authors can make a
  note stand out. *(Claude's call)*
- **Mid-chart directives** (`key:`, `time:`, `tempo:`, `feel:` after the
  header) show as small markers where they fall, before the next row.
- **Lines with errors** (any line a diagnostic of severity error points at)
  are shown as their source text in a monospace face with a wavy
  underline, and their diagnostic message is available to sighted
  (tooltip) and screen-reader users. Valid lines around them render
  normally. The renderer takes source text (see "Input"), so it has every
  line's raw text by line number. *(Claude's call: the Try it page needs
  this.)*
- **Warnings** (such as `?`) do not change the rendering; an option lists
  the chart's diagnostics below it. *(Claude's call)*

## Typeface

- **Edwin** (MuseScore, SIL OFL 1.1, "Edwin" is a Reserved Font Name) is the
  default. It has ♯ ♭ ♮ ø ° and true superscript figures.
- It is registered once on the host page (some browsers ignore `@font-face`
  inside a shadow root) under the family name **"barmark Edwin"**, so it
  cannot collide with a page's own fonts.
- **Delivery.** The package ships the font file and exports its path
  (`@barmark/render/fonts/…`). The web component registers the font itself
  (it can find the file next to its own module). The pure function takes a
  `fontUrl` option and, when given, emits one `@font-face` rule in a
  `<style>` before the chart; a helper (`fontFaceCss(url)`) returns that
  rule for hosts that load it once per page instead. With no `fontUrl` the
  chart falls back to the `--barmark-font` stack (a serif). No base64
  inlining. *(Claude's call)*
- **OFL obligations:** the Reserved Font Name means a *modified* version
  (including a subset or a format conversion such as WOFF2) may not be
  called "Edwin". So the package ships the **unmodified** `Edwin-Roman.otf`
  with its OFL text and copyright notice, and no subsetting or conversion
  step exists. Using a different CSS family name for the unmodified file
  is allowed. *(Claude's reading of the OFL and its FAQ.)*
- The font is replaceable through `--barmark-font`.

## Embedding, theming and the web component

**Isolation.** The rendering lives in a shadow root. Page selectors cannot
reach inside; `:host { all: initial }` stops inherited styles at the
boundary.

**Input.** `renderChart(text, options)` takes the chart's **source text**
and parses it with `barmark`'s `parseChart`, so it has both the parse and
the raw text of every line (for lines with errors). It never throws.
*(Claude's call)*

**Pure function (no browser JavaScript needed).** `renderChart` returns:

```html
<barmark-chart>
  <template shadowrootmode="open"><style>…</style><div class="bm-chart">…</div></template>
</barmark-chart>
```

**Unwrapped mode** returns the bare HTML with `bm-`-prefixed classes plus a
stylesheet, for pages that control their own CSS (barmark.dev).

**Web component (`@barmark/render/element`, first release).** Registers
`<barmark-chart>`, which renders itself from a `src` URL or from inline
chart text, and re-renders when the source changes (the Try it page needs
live updates). It uses the same rendering function. *(How inline text is
supplied without the HTML parser mangling whitespace or `<` is the
builder's choice, e.g. a `<script type="text/barmark">` child.)*

**Deliberate styling (the public surface; changes to it are semver-major):**

- CSS custom properties: `--barmark-font`, `--barmark-size` (base size;
  everything scales from it), `--barmark-ink`, `--barmark-paper`,
  `--barmark-muted`, `--barmark-rule` (bar lines), `--barmark-accent`.
- `::part()` names: `title`, `meta`, `heading`, `bar`, `chord`, `text`,
  `bar-number`, `rehearsal`.
- Attributes (also JS properties) for behaviour: `src`,
  `theme="auto | light | dark"`, `bar-numbers="off"`, `rehearsal-letters`.
- The same options are arguments to `renderChart`.

## Light and dark

- `theme="auto"` (default) follows `prefers-color-scheme`; both palettes are
  built in. `light` and `dark` force one. The colour variables override
  either.
- Printing uses the light palette.
- `forced-colors` (Windows High Contrast) keeps bar lines, rings, brackets
  and repeat marks visible in system colours.

## Accessibility

- Sizes in rem/em from `--barmark-size`, so browser text size and zoom
  work. Reflow at 400% zoom without horizontal scrolling.
- Contrast at least 4.5:1 for all text, including holds and bar numbers,
  in both themes (the mockups' pale greys fail this; the real palette must
  pass a test).
- **Spoken names (first release).** Every chord, note, note set and group
  has an accessible name built from the parsed structure, and the visual
  pieces are hidden from assistive technology:
  - `A7sus4` → "A seven sus four"; `F#m7(b5)` → "F sharp minor seven flat
    five"; `C/E` → "C over E"; `{E}` → "note E"; `{E1}` → "note E one"
    *(octave wording Claude's call)*; `{D E! G}` → "notes D, E (root), G";
    a group → "triplet: D, E, F sharp minor"; `N.C.` → "no chord"; `--` →
    "stop"; `?` → "unknown chord"; `/` → "hold".
  - Sections and bars are announced in order: "Verse, bar 9: D".
  - A pronunciation table covers all of Appendix A's vocabulary and every
    alias's canonical form, with a conformance test per row.
- Lines with errors expose their message to screen readers.

## Workspace and packaging

- The repo becomes a Bun workspace: `packages/barmark` (the existing
  package, moved, published name unchanged) and `packages/render`
  (`@barmark/render`, depending on `barmark` through the workspace).
  Shared root config: Biome, TypeScript base config, Fallow, CI, Swamp.
- `@barmark/render` exports `renderChart` (and the unwrapped variant and
  stylesheet); `@barmark/render/element` registers the web component. The
  font ships inside `@barmark/render` with its licence.
- CI runs both packages' checks; the package check runs per package on
  Node 20/22/24. The `@barmark` npm organization already exists (Kevin).
- Release: each package is versioned and tagged separately
  (`barmark@x.y.z` style tags or `v…`/`render-v…` — builder's choice,
  documented in RELEASING.md). The release workflow publishes the package
  the tag names. `@barmark/render` needs its own npm trusted publisher
  (Kevin configures it on npmjs.com, environment `npm`). The `v*` tag
  ruleset must cover the new tag pattern.
- `docs/grammar-v0.1-draft.md`, `examples/`, BRIEF.md and the records
  (CHANGELOG per package, one FINDINGS.md) stay at the repo root.
  *(Claude's call: CHANGELOG per package, since versions diverge)*

## Parser additions (in `barmark`)

- Each `SectionOccurrence` gains **`form: number`**: 0 for the first
  distinct section in the chart, 1 for the next, and the same number for
  every replay of the same written section (identity is `replayOf ?? line`,
  numbered in first-appearance order). Hosts derive form letters
  (`"ABCD"[form]`) or other labels from it. This is a minor version of
  `barmark` and a CHANGELOG entry. Stem-shovel's timeline will use it for
  section labels (letters only, no colour); a short note to the stem-shovel
  agent goes with the release.
- Each parsed chord (`ChordRecord`) gains **`parts: ChordParts | null`**:
  the canonical root, quality, extension, sus, sorted tones and bass the
  canonical spelling is built from (`null` for note sets, which keep their
  `pitches`). `ChordParts` already exists and is exported as a type; this
  puts it on every record so the renderer sets superscripts and spoken
  names from structure. Same minor version and CHANGELOG entry as `form`.
- `examples/peaceful-dreams.chart.md` drops its roman numerals for plain
  names (`## Intro`, `## Verse`, `## Verse (Triads)`…), Kevin agreed.

## Testing

- Rendered HTML for every grammar feature, checked structurally (not by
  brittle string snapshots alone).
- The renderer never throws: the parser's existing fuzz corpora render
  without exceptions.
- Spoken names: one test per Appendix A row and alias.
- Browser tests (Playwright in CI): the same chart on a plain page and on a
  page with hostile CSS (`* { margin: 2em !important; font-family: … }`,
  a `sup` reset, a dark background) must render identically (screenshot
  comparison); theme switching; contrast ratios in both themes; reflow at
  400% zoom; the web component's live update.
- Peaceful Dreams and the spec's "At a glance" chart render without
  errors.

## Left to the builder

- Internal module structure, the HTML element structure and class names
  beyond the public surface above.
- The CSS grid technique for per-section columns and wrapping.
- Exact palette values (subject to the contrast test), spacing, the
  silence glyph, the elision mark.
- How the web component takes inline text; whether `src` fetches are
  cached.
- Tag naming for per-package releases.
