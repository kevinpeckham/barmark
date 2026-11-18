# @barmark/lyricsheet

Exports a barmark chart as a lyric sheet: chords over the words, with the song's title, credits, key, time and tempo. The text it writes is ChordPro, and it says what ChordPro could not carry.

```ts
import { exportLyricsheet } from "@barmark/lyricsheet";

const r = exportLyricsheet(chartText, { part: "Vocals" });
if (r.ok) console.log(r.text, r.losses);
```
