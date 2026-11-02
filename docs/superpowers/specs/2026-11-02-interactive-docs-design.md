# barmark.dev interactive docs (stage 2, part 1)

Status: draft for Kevin's approval, 2026-11-02. Builds on
`2026-10-31-barmark-dev-design.md`, which names this as stage 2:
"one search box; type a chord symbol or a snippet and see at once how
barmark reads it (canonical spelling, spoken name, Harte label, the
render, any error with its message)." Prior art: UnoCSS's interactive
docs, <https://unocss.dev/interactive/>.

## Why

The guide says what you can write; this page says what barmark makes of
what *you* wrote. A newcomer types `Cø` and sees it is Cm⁷(♭5), "C minor
seven flat five", `C:hdim7`. A machine-minded reader pastes a Harte label
from a dataset and gets barmark back. Someone whose chord is rejected
reads why, and the suggestion. Everything shown comes from the published
packages, so the page is also an honest test of them.

## Goals, non-goals, anti-goals

**Goals**

- One box. Whatever is typed is read at once (on input, no button) and
  the reading shown below it, with the guide rows that match underneath.
- The query lives in the URL (`?q=…`), so a reading can be linked.
- Works on a phone; usable by keyboard and screen reader.

**Non-goals**

- A key field, numerals or transposition controls. They fit here later
  (they're on the backlog as playground extras), but not in this part.
- The tutorial (stage 2, part 2: its own design).
- Anything stored; any server. The page is prerendered like the rest.

**Anti-goals (would make it a failure even if it works)**

- The page saying something about a chord that the packages don't. No
  music theory is computed in the site.
- A second, different explanation of the syntax: matching guide rows are
  the guide's own rows, shown as the guide shows them.

## The page

Route `/try`, nav label "Try it", between Syntax and GitHub *(Claude's
call: short, says what you do there; UnoCSS uses "interactive")*. Top to
bottom: a one-line intro, the box, the reading, the matching guide rows.

**The box** is a single-line input that grows to a textarea when the text
has a newline (pasting a chart works) *(Claude's call)*, labelled for
screen readers, with a few example chips under it (`Cø`, `C7b9/E`,
`{C E G}`, `C:maj7`, `| D | % | x2`) that fill it. Empty box: the chips
and the whole guide, as `/syntax` shows it.

**What the input is** is decided in this order, first match wins:

1. **A chart snippet:** it has a newline or a `|`, starts with `#`, or
   starts with one of `DIRECTIVE_NAMES` (`key`, `time`, `tempo`, `feel`)
   and a colon, so `key: D` is a snippet and `C:maj7` is not *(Claude's
   call)*. Shown: the render
   (`<barmark-chart>`, as on the home page), the canonical text
   (`printChart`), and each diagnostic with its line and message.
2. **A note set:** starts with `{`. Read with `parseNoteSet`.
3. **A Harte label:** it has a colon and `harteToBarmark` returns a
   spelling. The colon matters: `harteToBarmark("C")` returns `"C"`, and
   a bare root is a chord symbol, not a Harte label *(Claude's call)*. Shown: "Harte
   label → barmark", then the chord reading of that spelling.
4. **A chord symbol:** anything else, read with `parseChord`.

**The chord reading** (from the `ChordRecord`; warnings shown too):

| Field | From |
|-------|------|
| as drawn | the render of `\| <canonical> \|`, one bar, bar numbers off |
| canonical spelling | `record.canonical` (with a note when it differs from what was typed: "you wrote `Cø`") |
| spoken | `speakChord(record)` from `@barmark/render` (see Packages) |
| Harte label | `record.harte` |
| notes | `record.pitches`, with `record.intervals` as degrees (1 ♭3 ♭5 ♭7) |
| bass | when it isn't the root |

**An error** shows the parser's message and, when there is one, its
suggestion as a button that puts the suggestion in the box
(`H7` → "write B" → `B7`).

**Matching guide rows** use the guide's own `matches` and its table
component, filtered by the same text. What is filtered *(Claude's
calls)*:

- a chord symbol, note set or Harte label: the chords rows (the text
  rarely matches a row);
- a chart snippet: no rows, and a link to `/syntax` (a pasted chart
  matches nothing);
- anything that reads as none of these, or a single word like `repeat`:
  rows matching the text, as `/syntax` filters them.

`/try` has its own `?q=` only; it reuses `query.ts`'s matching but not its
`cat`/`sort` parameters, and `/syntax`'s URL is unchanged.

**JavaScript off / prerender:** the page prerenders with the first chip's
reading (`Cø`), its drawing included (the site's `ChartRender`, which
prerenders the chart as declarative shadow DOM, as on the home page), and
the chords rows below; the box works once hydrated. A
`?q=` link opened with JavaScript off shows that default *(accepted
limit: prerendered pages can't read the query)*.

## Packages

The spoken name exists only inside `@barmark/render`'s private markup.
Rather than scrape it, **`@barmark/render` 0.5.0 exports `speakChord`**
(and its `Key` parameter is already the parser's type). A minor release,
with a CHANGELOG entry and a README line; Kevin approves the publish as
usual.

**Order:** (1) PR #37 merges (the site moves to barmark 0.6.0 and render
0.4.0; already open). (2) A render PR adds the export and releases 0.5.0.
(3) Kevin publishes it. (4) The site PR bumps render to 0.5.0 and builds
`/try`. Step 4 can't start until 0.5.0 is on npm.

No `barmark` change is needed: `parseChord`, `parseNoteSet`,
`harteToBarmark`, `parseChart`, `printChart` and the record fields are
all public.

## Tests

- Site unit tests for the classifier (the order above, one case per
  branch, plus empty and whitespace-only input) and the reading's fields
  for `Cø`, `C7b9/E`, `{C E G}`, `C:maj7`, `H7`.
- A test that every example chip reads without error, except any chip
  chosen to show one.
- Browser tests: typing updates the reading and the URL; a `?q=` link
  opens with that reading; the suggestion button replaces the text; the
  render shows; the page has no console errors; narrow width stacks.
- The render export: a test in `packages/render` that `speakChord` is
  exported and speaks `Cm7(b5)` as the chart does.

## Left to the builder

Layout within Stem Shovel's look (UnoCSS, as `/syntax`), the debounce for
long pasted charts (reuse `ChartRender`'s limits), and the exact intro
sentence (Kevin may edit it).
