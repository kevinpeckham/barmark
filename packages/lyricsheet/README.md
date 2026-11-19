# @barmark/lyricsheet

Exports a barmark chart as a lyric sheet: chords over the words, with the song's title, credits, key, time and tempo. The text it writes is ChordPro, and it says what ChordPro could not carry.

```ts
import { exportLyricsheet } from "@barmark/lyricsheet";

const r = exportLyricsheet(chartText, { part: "Vocals" });
if (r.ok) console.log(r.text, r.losses);
```

## What it writes

Each section that sings words is a ChordPro lyric environment (`{start_of_verse}`, `{start_of_chorus}` or `{start_of_bridge}`, by the heading's first word; the label is the heading as written), in the order the chart plays: a repeat whose passes sing verses 1 and 2 is written twice (a repeat singing the same words again stays in one environment, its lines written again), a `D.S.` is unfolded, and a replayed chorus that sings what the chorus before it sang is `{chorus}`. Each written bar line is one lyric line, each chord written before the syllable it lands on (`[C]riv`), and a chord that lands on no syllable standing alone in its place (`waiting [D] for`). `N.C.`, a stop, `?`, a note set, words on a bar, a rehearsal mark and a fermata are annotations (`[*N.C.]`), printed as text and never read as chords. Key, time and tempo changes are written where they happen, each with a comment a reader sees (`{comment: Key: D}`); a rit., an accel., a swing feel and text lines are comments. A sheet always has a title line: the chart's title, else `title`, else `{title: }`. A lyric sheet keeps the order of chords and words, not their timing: where in its bar a chord falls is not written.

Each section with no words is a ChordPro grid, the one ChordPro construct with bars: `{start_of_grid: label="Intro" shape="1+4x4+1"}`, one grid line per written bar line, a cell per beat of the bar's own meter (a 6/8 bar has two, its beat the dotted quarter), and a margin cell on each side. In a cell, `.` holds the chord before, `/` plays the same chord again, chords that share a beat are joined by `~` (`C~G`), and `%` repeats the bar before where the chart wrote `%` and that bar is the measure before it in the line, in the same meter. `N.C.`, `*Stop`, `*?` and a note set's notes (`*C,E,G`) are cells printed as text; a fermata is a measure of its own, `*…`; words on a bar are right-margin text (in double quotes when they read as a count, `"x3"`) and a rehearsal mark left-margin text (`@B`) at the start of a line of its own, unless its line has `x N` (then it is written at the line's start). A section played straight through keeps its repeat signs (`|:`, `:|`, voltas `|1` and `|2`, and `x3` in the right margin); one cut short by a jump or `->`, or repeated by its heading, is written bar by bar as played, and an open repeat is followed by `{comment: repeat ad lib.}` inside the grid. The grid's shape is its widest line's, so each section occurrence is one grid. No line ends in a backslash (ChordPro would join the next line to it): a final `\` is written `/`.

## Losses

Each loss is reported once per code, at its lowest bar, naming the bars (`in 3 bars: 2, 5, 9`).

| Code | What is lost, and why |
|---|---|
| `key-mode` | A church mode other than ionian and aeolian: ChordPro's `{key}` names a major or minor key only. |
| `other-parts` | Parts other than the one written: ChordPro has one chord line per lyric line. |
| `other-lines` | Only the part's chords and the sung words are written: its other lines (a melody's notes, a second staff) are not. |
| `stacked-verses` | Verses stacked on the same bars (not one verse per pass of a repeat) are written one pass per verse, each with its chords: ChordPro has no stacking. |
| `chord-moved` | A chord between two syllables of one word is written before the word's next syllable, since standing alone would split the word. |
| `text-changed` | Titles, labels, lyrics, words and text holding `[`, `]`, `{` or `}`, or a `<` with a `>` after it (written as parentheses), or a lyric line starting with `#` (written after a space): ChordPro has no escape, and would read them as chords, directives, markup or a comment. A `<` or `>` alone stays. Also a tab (written as a space), a backslash ending a line (written `/`), a heading's backslash-n (a word joiner, drawn as nothing, keeps the label on one line) and grid margin words that read as a count (quoted). |
| `chord-names` | A chord name ChordPro's chord parser does not know (for example `F#m(b6)`), written as barmark spells it; readers may show it as text. |
| `note-sets` | A note set, written as its notes' names as text (joined by commas in a grid cell), not a chord; its octaves and root mark are lost. |
| `voicing` | A voicing's exact notes: only the chord's name is written. |
| `marks` | Pushes, accents, hits and pedal marks: the chord is written unmarked. |
| `bar-meter` | A one-bar meter: lyric lines do not show a bar's own meter. |
| `mark-moved` | A rehearsal mark inside a grid line with `x N`, written at the line's start: the count is the whole line's, so the line is not split at the mark. |
| `fermata` | A fermata, written as the annotation `*…` (ChordPro has none): a reader sees an ellipsis over the words, or in a grid's cell, not a fermata sign. |

## Known limits

In ChordPro's reference PDF, two long chord names sharing one grid cell (`Cmaj7~Dm7b5`) overprint each other, since every cell has the same width.
