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
grammar is [docs/grammar-v0.1-draft.md](docs/grammar-v0.1-draft.md)
(draft v0.1, for review), and [examples/](examples/) has a full chart.

## Install

```
npm install barmark
```

ESM only, Node 20 or later (or Bun, Deno and browsers), with TypeScript
declarations included and no runtime dependencies.

## Use

```ts
import { parseChart, printChart, parseChord, harteToBarmark } from "barmark";

const chart = parseChart(text);
chart.title; // "Example Song"
chart.bars; // every bar in play order: slots, section, key, meter, tempo, feel
chart.sections; // each section as played, with its first and last bar
chart.diagnostics; // errors and warnings, each with a line number

printChart(text); // the chart in canonical form (same meaning, standard spelling)

const chord = parseChord("Bm7(b5)");
if (chord.ok) chord.value.pitches; // ["B", "D", "F", "A"]
if (chord.ok) chord.value.harte; // "B:hdim7"

harteToBarmark("A:sus4(b7,9)"); // "A9sus4"
```

- **`parseChart`** never throws. A line with an error is left out of the
  play order and reported, and the rest of the chart still reads.
- **`printChart`** changes spelling and layout only: lines with errors and
  lyrics print exactly as written.
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
[RELEASING.md](RELEASING.md); changes are in [CHANGELOG.md](CHANGELOG.md),
and lessons learned along the way are in [FINDINGS.md](FINDINGS.md). The
project's founding brief, prior art and roadmap are in
[BRIEF.md](BRIEF.md).

## License

The code is MIT ([LICENSE](LICENSE)). The grammar specification will be
published under CC-BY 4.0.
