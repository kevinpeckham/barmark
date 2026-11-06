# barmark

Markdown-inspired plain-text notation for chord charts: the bar grid
musicians already write (`| D | A |`), specified precisely enough for
machines.

```
# Example Song
key: D, time: 4/4, tempo: 145

## Verse
|: D | A | Bm | G :|
| Em | / | A | A7 |

## Chorus
| G / D / | A | Bm / / A | G |

## Verse
## Chorus x2
```

A barmark file is a markdown file, with the extension `.chart.md`. The
grammar is [docs/grammar-v0.1-draft.md](https://github.com/kevinpeckham/barmark/blob/main/docs/grammar-v0.1-draft.md)
(draft v0.1, for review), and [examples/](https://github.com/kevinpeckham/barmark/tree/main/examples) has a full chart.

## Install

```
npm install barmark
```

ESM only, Node 20 or later (or Bun, Deno and browsers), with TypeScript
declarations included and no runtime dependencies.

## Use

```ts
import {
	degreeOf,
	extractPart,
	harteToBarmark,
	parseChart,
	parseChord,
	printChart,
	printParsed,
	printPart,
	projectPart,
	transposeChart,
} from "barmark";

const chart = parseChart(text);
chart.title; // "Example Song"
chart.parts; // [{ label: "Gtr", name: "Electric Guitar 1" }] from part: Gtr = Electric Guitar 1, in score order
chart.credits; // { composer: ["Kevin Peckham"], lyricist: [], arranger: [], copyright: [] } from composer: Kevin Peckham
chart.bars; // every bar in play order: its number as written, slots, section, key, meter, tempo, feel (and swingPercent)
chart.sections; // each section as played, with its first and last bar
chart.diagnostics; // errors and warnings, each with a line number

printChart(text); // the chart in canonical form (same meaning, standard spelling)
printParsed(text, chart); // the same, from a parse you already have

transposeChart("key: D\n| D | A | Bm | G |", { to: "Eb" }).text; // "key: Eb\n| Eb | Bb | Cm | Ab |\n"
transposeChart(text, { semitones: -2 }); // { text, diagnostics }

degreeOf("C", { tonic: "D", mode: "major" }); // { degree: 7, alter: -1 }: C is b7 in D

const chord = parseChord("Bm7(b5)");
if (chord.ok) chord.value.pitches; // ["B", "D", "F", "A"]
if (chord.ok) chord.value.harte; // "B:hdim7"

harteToBarmark("A:sus4(b7,9)"); // "A9sus4"
```

### Several parts

```
part: Gtr = Electric Guitar 1
part: Pno = Piano

Gtr | G   | C | G  | D |
Pno | G/B | C | Em | D |
| C | G | D | G |
```

A chart with several `part:` lines writes **systems** (grammar 7.4):
labelled lines that share bars, one per part. A part missing from a
system is tacet there; an unlabelled line is tutti, played by every part.

```ts
const chart = parseChart(text);
chart.bars[0].parts; // [{ line, slots, words? }, …] per part, in score order; null where tacet
chart.bars[0].slots; // the first part's slots (N.C., with tacet: true, where it is tacet)

extractPart(text, "Pno"); // one part as a single-part ChartParse, or null
printPart(text, "Pno"); // the same as text: tacet bars written N.C.
projectPart(chart.lines, chart.parts, "Pno"); // one part's lines
```

A part can also write up to four **lines** that play together, a
pianist's two hands (grammar 7.6), and name its instrument and clef
(7.3):

```
part: Pno = Piano, instrument: piano
part: Bs = Bass, instrument: electric bass

Pno.RH | +G{B3 D4 G4} | *C{C4 E4 G4} |
Pno.LH | {G2}._{D3} / | {C3}         |
Bs     | {G1}         | {C2}         |
```

The first line in a system carries the chord symbols, the others note
sets only. `+` presses the sustain pedal and `*` lifts it (2.9);
`{G2}._{D3}` is a dotted eighth and a sixteenth (2.2).

```ts
chart.bars[0].parts[0].lines; // [{ name: "RH", line, slots }, { name: "LH", … }]
extractPart(text, "Pno", "LH"); // one line alone, resting where it isn't written
pedalStates(chart.bars); // whether the pedal is down after each slot
```

`printChart` sorts a system into score order and lines up its pipes.
`chart.part` still gives the one part of a single-part chart, and is
deprecated in favour of `parts`.

### Voice and lyrics

```
part: Vox = Voice, instrument: voice

Vox       | [1/4] N.C.    | G                           | G          / G7       |
Vox.Mel   | [1/4] {D4}:A- | {G4}:maz- / {B4}:ing_{G4}:/ | {B4}:grace / {A4}:how |
lyrics 2: | 'Twas         | grace / that                | taught / my           |
```

A lead sheet puts the chords on the voice part's bare line and its melody
on a second line, `Vox.Mel` (grammar 7.6). A syllable follows a note
after a colon (`{G4}:maz-`; a trailing `-` continues the word, `~` joins
elided syllables, `:/` holds the syllable over a new note). A **lyric
row** (`lyrics:`, or `lyrics N:` for verse N; grammar 7.7) writes later
verses under a system, one cell per bar. `---` on a line of its own
separates blocks, and a text line that starts with `\` is text.

```ts
chart.bars[0].lyrics; // a PlayedLyrics per verse the bar sings: { verse, part?, syllables }
chart.parts[0].sings; // true for the part whose melody carries the words
```

Verses come out in play order: inside a repeat, verse N is pass N.

- **`parseChart`** never throws. A line with an error is left out of the
  play order and reported, and the rest of the chart still reads.
- **`printChart`** changes spelling and layout only: lines with errors and
  lyrics print exactly as written. **`printParsed`** does the same from an
  existing `parseChart` result, for a caller that needs both.
- **`transposeChart`** moves every chord root, slash bass, note set and
  `key:` line, and never the words. Chords are spelled by their interval
  from the chart's first key, so each keeps its place in the key: C in D
  becomes Db in Eb, not C#. Given semitones, the new key takes the
  signature with fewer accidentals (Eb, not D#; F# wins the tie with Gb).
  A chart with no `key:` spells roots C C# D Eb E F F# G Ab A Bb B. Lines
  with errors stay as written, with a warning. The output is canonical.
- **`degreeOf`** gives a root's degree above a key's tonic, against the
  major scale for every mode: in A minor, C is b3.
- **Harte labels** ([Harte et al., 2005](https://ismir2005.ismir.net/proceedings/1080.pdf))
  convert both ways. Every label in the McGill Billboard and Isophonics
  Beatles datasets converts to barmark with exactly the same notes.

## Develop

```
bun install
bun test                 # the test suite
bun run check            # Biome and the TypeScript typecheck
bun run fallow           # dead code, duplication and complexity (Fallow)
bun run verify:package   # build, check the npm package, import it in Node
```

CI runs these on every push and pull request. Releases follow
[RELEASING.md](https://github.com/kevinpeckham/barmark/blob/main/RELEASING.md); changes are in [CHANGELOG.md](CHANGELOG.md),
and lessons learned along the way are in [FINDINGS.md](https://github.com/kevinpeckham/barmark/blob/main/FINDINGS.md). The
project's founding brief, prior art and roadmap are in
[BRIEF.md](https://github.com/kevinpeckham/barmark/blob/main/BRIEF.md).

## License

The code is MIT ([LICENSE](LICENSE)). The grammar specification will be
published under CC-BY 4.0.
