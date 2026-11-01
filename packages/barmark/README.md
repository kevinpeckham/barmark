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
import { degreeOf, harteToBarmark, parseChart, parseChord, printChart, transposeChart } from "barmark";

const chart = parseChart(text);
chart.title; // "Example Song"
chart.bars; // every bar in play order: slots, section, key, meter, tempo, feel
chart.sections; // each section as played, with its first and last bar
chart.diagnostics; // errors and warnings, each with a line number

printChart(text); // the chart in canonical form (same meaning, standard spelling)

transposeChart("key: D\n| D | A | Bm | G |", { to: "Eb" }).text; // "key: Eb\n| Eb | Bb | Cm | Ab |\n"
transposeChart(text, { semitones: -2 }); // { text, diagnostics }

degreeOf("C", { tonic: "D", mode: "major" }); // { degree: 7, alter: -1 }: C is b7 in D

const chord = parseChord("Bm7(b5)");
if (chord.ok) chord.value.pitches; // ["B", "D", "F", "A"]
if (chord.ok) chord.value.harte; // "B:hdim7"

harteToBarmark("A:sus4(b7,9)"); // "A9sus4"
```

- **`parseChart`** never throws. A line with an error is left out of the
  play order and reported, and the rest of the chart still reads.
- **`printChart`** changes spelling and layout only: lines with errors and
  lyrics print exactly as written.
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
