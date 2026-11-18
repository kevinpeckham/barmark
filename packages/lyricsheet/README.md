# @barmark/lyricsheet

Exports a barmark chart as a lyric sheet: chords over the words, with the song's title, credits, key, time and tempo. The text it writes is ChordPro, and it says what ChordPro could not carry.

```ts
import { exportLyricsheet } from "@barmark/lyricsheet";

const r = exportLyricsheet(chartText, { part: "Vocals" });
if (r.ok) console.log(r.text, r.losses);
```

## What it writes

Each section that sings words is a ChordPro lyric environment (`{start_of_verse}`, `{start_of_chorus}` or `{start_of_bridge}`, by the heading's first word; the label is the heading as written), in the order the chart plays: a repeat whose passes sing verses 1 and 2 is written twice, a `D.S.` is unfolded, and a replayed chorus that sings what the chorus before it sang is `{chorus}`. Each written bar line is one lyric line, each chord written before the syllable it lands on (`[C]riv`), and a chord that lands on no syllable standing alone in its place (`waiting [D] for`). `N.C.`, a stop, `?`, a note set, words on a bar, a rehearsal mark and a fermata are annotations (`[*N.C.]`), printed as text and never read as chords. Key, time and tempo changes are written where they happen; a rit., an accel., a swing feel and text lines are comments.

## Losses

Each loss is reported once per code, at its lowest bar, naming the bars (`in 3 bars: 2, 5, 9`).

| Code | What is lost, and why |
|---|---|
| `key-mode` | A church mode other than ionian and aeolian: ChordPro's `{key}` names a major or minor key only. |
| `other-parts` | Parts other than the one written: ChordPro has one chord line per lyric line. |
| `other-lines` | The written part's lines other than its first (a melody, a second hand); only their words are sung. |
| `stacked-verses` | Verses stacked on bars that play once are written one pass per verse, each with its chords: ChordPro has no stacking. |
| `chord-moved` | A chord between two syllables of one word is written before the word's next syllable, since standing alone would split the word. |
| `text-changed` | Lyrics, words and text holding `[`, `]`, `{` or `}` (written as parentheses), or a lyric line starting with `#` (written after a space): ChordPro has no escape, and would read them as chords, directives or a comment. |
| `chord-names` | A chord name ChordPro's chord parser does not know (for example `F#m(b6)`), written as barmark spells it; readers may show it as text. |
| `chord-timing` | Where in its bar each chord falls: lyric lines keep the chords' order with the words, not their timing. |
| `stop` | A stop (`--`), written as the text `*Stop`. |
| `note-sets` | A note set, written as its notes' names as text, not a chord; its octaves and root mark are lost. |
| `voicing` | A voicing's exact notes: only the chord's name is written. |
| `marks` | Pushes, accents, hits and pedal marks: the chord is written unmarked. |
| `bar-meter` | A one-bar meter: lyric lines do not show a bar's own meter. |
| `fermata` | A fermata, written as the text `*…`: its hold has no length. |
