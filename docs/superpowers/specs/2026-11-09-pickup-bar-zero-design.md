# A pickup is bar 0: design

**Status:** approved by Kevin, 2026-11-09 ("Yes, I agree with Fable's
recommendation"), after a scoping study and an independent review of the
approach. Kevin decides grammar; this records his decisions.

## Why

A chart can open with a short bar (`time: 4/4` then `| [1/4] G | C |`).
Notation calls it a pickup (anacrusis) and does not count it: bar 1 is the
first full bar. barmark has numbered it 1. Since `@barmark/musicxml` 0.7.2
the MusicXML export writes it as measure 0 `implicit="yes"`, so Dorico,
MuseScore and Verovio number it 0, and barmark.dev's Grid / Score switch
shows the same chart numbered two ways. Kevin decided barmark numbers it 0
everywhere a person sees a bar number.

## Decisions

1. **What a pickup is (grammar 2.4).** The chart's first written bar is a
   pickup when it is in a one-bar meter whose length is shorter than the
   meter of the bar after it, compared by value (so `| [1/4] G | [4/4] C |`
   in 4/4 has one), where "the meter of the bar after it" is the meter in
   force at that next written bar (so `[1/4]` then a `time: 3/4` line then
   the first full bar is a pickup into 3/4, the shape the MusicXML import
   writes). Not a pickup: a first bar followed by `%` (`| [2/4] G | % |`
   is two 2/4 bars), two short bars in a row, a chart that is only one
   short bar, a short bar after `...` or at a later section, or any bar but
   the first written bar. A pickup inside `|:` is allowed. A pickup in 6/8
   such as `[1/4]` is a pickup (its export keeps its own `<time>`, below).
2. **Numbering.** In a chart with a pickup, the pickup's written number is
   0 and the bars after it are numbered from 1; a D.C., D.S. or replay
   that plays the pickup again still shows 0. Charts without a pickup are
   numbered exactly as before. Charts cannot refer to bars by number, so no
   chart changes meaning.
3. **`written` changes; `index` does not.** A played bar's `written` (the
   number a band reads; renderer numbers, MusicXML measure `text`, lyric
   rows, the import's self-check) follows rule 2. `index` (the 1-based play
   position, unique across repeats and replays) is unchanged, and so are
   `chartHash` and every `@barmark/sync` timing map and confidence record,
   which key on `index`: saved maps stay valid, no migration, no map
   version bump. Docs call `index` "the play position", never a measure or
   bar number (fix `packages/barmark/src/.../types.ts` wording and the
   README's advice to hosts).
4. **The parser says so.** `ChartParse.pickup: boolean` (grammar A.7
   machine output). The MusicXML export (`opensWithPickup`,
   `pickupMeter`) and the import's self-check read it instead of
   re-deriving the rule; the export's own written-bar counters
   (`measures.ts`, `lyric-staff.ts`) and the self-check's
   `written[bar.written - 1]` are moved onto the parser's numbers. A chart
   that is only one short bar stops exporting a lone measure 0.
5. **Renderer.** `@barmark/render`'s row model keeps `barNumber: 0` for the
   pickup (hosts reading the model or `written` see 0); the HTML leaves the
   gutter number blank on a row that starts with the pickup, and the
   spoken label says "pickup", not "bar 0".
6. **MusicXML export.** The pickup is measure `number="0"`; measure `text`
   follows `written`. In a meter where `implicit="yes"` would read back as
   another meter (`[1/4]` in 6/8 reads back as `[2/8]`), it is `number="0"`
   without `implicit` and keeps its own `<time>`, as 0.7.2 does.
7. **Messages and fields.** Human-facing "bar N" follows `written`:
   - `@barmark/midi`: `MidiLoss` keeps `bar` (the play position: a loss in
     a D.C. replay happens once, on that pass) and gains `written`; the
     CLI prints `written`. MIDI import diagnostics (a grid, linear) use
     written numbers, the pickup 0.
   - `@barmark/sync`: builder diagnostics (`BuildDiagnostic.bar`) use
     written numbers and the `+= 1` shift goes away; `checkTimingMap`'s
     messages describe map entries and stay on `index`, worded "map bar N".
   - Doc comments that say "a pickup is bar 1" (midi import `grid.ts`,
     `build.ts`; sync README) are corrected.
8. **Grammar.** 2.4 gains the definition (rule 1) and the numbering (rule
   2); 5.1, 5.2, 7.4 and A.7 are checked for bar-number wording; a
   decisions-log row "Decided by Kevin (2026-11-09): …. Before, the pickup
   was bar 1 …. Rejected: …" (rejected: renumbering `index` too, which
   would silently shift every saved timing map; a literal "0" in the
   gutter). Same commit as the code that implements it.

## Releases

barmark 0.22.0 (grammar, `ChartParse.pickup`, `written`); then
`@barmark/render` 0.18.0 and `@barmark/musicxml` 0.8.0 (documented numbers
change: minors); `@barmark/sync` 0.3.0, then `@barmark/midi` 0.3.0 (it
carets sync); `@barmark/score` a patch ("Requires …"); `@barmark/cli` a
minor; then `kevinpeckham/songs` (no chart there has a pickup) and
barmark.dev. Stem Shovel's follow-up is the handoff
`~/projects/_handoffs/2026-11-09-barmark-pickup-bar-zero-for-stem-shovel.md`:
its ruler, transport and draft details show `index` as bar numbers and
must map to `written`.

## Not in scope

Renumbering `index`; a timing-map version; Stem Shovel's code; bar
numbers written into charts (the grammar has none).

## Tests that must exist

The definition's every case (rule 1, each "not a pickup" case, the
following-bar meter, value comparison, inside `|:`, 6/8); `written` across
a D.C. and a replay; `index` and `chartHash` unchanged on a pickup chart
(compare with the 0.21 numbers); a saved timing map from before still
answers the same seconds; render's model keeps 0, the HTML gutter blank,
speech "pickup"; MusicXML measure 0 and `text="0"`, lyric rows aligned,
the import self-check quiet on pickup scores (the MuseScore fixtures);
MIDI loss `written` vs `bar` across a D.C.; sync builder diagnostics on a
pickup recording; the CLI's printed bar numbers.

The scoping study and the review it rests on are recorded in the plan.
