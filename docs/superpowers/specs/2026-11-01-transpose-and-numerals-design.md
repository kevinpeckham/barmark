# Transposition and numerals: design

**Status:** for Kevin's approval (2026-11-01). Kevin approved the direction:
transposition is a library tool, numerals are a renderer view, and neither
is grammar. This settles how they behave. Items marked *(my call)* are
recommendations; Kevin decides.

## Why

People search barmark.dev for "transpose" and "Nashville numbers". Charts
already name their key (`key:`) and spell their roots, so barmark can
answer both without new syntax. Stem Shovel wants both: a band changes a
song's key for a singer, and players read numbers.

## One musical core, in `barmark`

`@barmark/render` never decides anything musical, so both features rest
on two functions in `barmark`. They build on the interval arithmetic it
already has (`transpose(root, interval)` and `intervalBetween(from, to)`
in `src/chords/intervals.ts`), which keeps letter names: D to E♭ is a
minor second, so F♯ becomes G and C becomes D♭.

- `transposeChart(text, by)` returns `{ text, diagnostics }`.
- `degreeOf(root, key)` returns a chord's scale degree in its key, for
  the renderer to format.

## Transposition

```ts
transposeChart(text: string, by: { to: string } | { semitones: number }): {
	text: string;
	diagnostics: ChartDiagnostic[];
};
```

| Question | Recommendation |
|---|---|
| What you give it | A target key (`{ to: "Eb" }`), or a number of semitones (`{ semitones: -2 }`). A target key needs a `key:` in the chart; without one it's an error diagnostic and the text comes back unchanged. |
| What moves | Every chord root, slash bass, note in a note set, and every `key:` line (a modulation moves with the song). Text lines never change: barmark never reads chords in text. |
| Spelling | By interval, from the first key to the new one, so every chord keeps its relation to the key: in D, C is ♭7; in E♭ it becomes D♭, never C♯. |
| Choosing the new key's spelling from semitones *(my call)* | The key signature with fewer accidentals: D♭ not C♯, E♭ not D♯. For the tie, F♯ over G♭. Minor keys use their own signatures (B♭m, not A♯m). |
| A chart with no `key:` *(my call)* | Each root on its own, by a fixed table: C C♯ D E♭ E F F♯ G A♭ A B♭ B. |
| Double sharps and flats *(my call)* | Respelled to the plain note (an F𝄪 becomes G), because chord charts don't use them. |
| Octaves in note sets | They move with the pitch: `{B3}` up a semitone is `{C4}`. A note pushed past octave 0 or 8 stays put, with a warning. |
| Lines with errors | Printed as written, as the printer already does, with a warning "not transposed: this line has an error", so nothing is silently left in the old key. |
| Output | Canonical text, as `printChart` writes it. Transposing up and back down returns the canonical chart. |

## Numerals view

`@barmark/render` gets one new option, `numerals: "nashville" | "roman"`
(the `numerals` attribute on the element). It's off by default.

| Question | Recommendation |
|---|---|
| Which key | Each bar's own key, from the parser, so a modulation renumbers from its next bar. A bar with no key shows chord names. |
| Numbers relative to | The key's tonic, measured against the major scale. That's the same rule for every key and mode: in A mixolydian, G is ♭7. |
| Minor keys *(my call)* | 1 is the minor tonic, because `key: Am` names A: Am is 1m, C is ♭3, G is ♭7. The other Nashville school counts from the relative major (Am as 6m), but that contradicts the chart's own `key:`. |
| Nashville form | The degree, with ♭ or ♯ if chromatic, then the chord's quality and extension as the renderer already sets them, superscript included. D7sus4 in D is 1⁷ˢᵘˢ⁴, Bm7 is 6m⁷, D/F♯ is 1/3. |
| Roman form | Case shows major or minor: I, ii, iii, IV, V, vi, vii°, ♭VII, with extensions in superscript (V⁷, ii⁷). In minor keys: i, ♭III, ♭VII. |
| Things that aren't chords | Note sets, N.C., `?` and `--` look as they do now. |
| Screen readers *(my call)* | Both the numeral and the name: "bar 5: five, A seven". The numeral is the view, and the name is what is played. |
| What doesn't change | The music, bar numbers and the chart's text. It's a view only. |

## Releases

- `barmark` 0.6.0: `transposeChart`, `degreeOf`.
- `@barmark/render` 0.4.0: the numerals option, plus the row gap already
  on main (#31).
- barmark.dev: the transpose row in the guide changes from "not yet" to
  how to use it. A transpose control and a numerals switch in the
  playground are optional extras, for Kevin to ask for.

## Out of scope

- A capo option, numerals as input, and ChordPro import (decided
  2026-11-01: not syntax).
- Transposing the words in text lines.
