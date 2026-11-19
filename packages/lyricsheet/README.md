# @barmark/lyricsheet

Export a [barmark](https://barmark.dev) chord chart as a lyric sheet: chords over the words, with the song's title, credits, key, time and tempo, in the text format [ChordPro](https://www.chordpro.org) reads, so any ChordPro reader can show, print or transpose it. It says what ChordPro could not carry, and with `diagrams: "guitar"` it writes a guitar shape for every chord (a `{define}` line), from `@barmark/fretboard`.

```sh
npm install @barmark/lyricsheet
```

It needs `barmark`, which reads the chart, and `@barmark/fretboard`, which finds the shapes. ChordPro is a separate project: this package only writes text for it and does not include or call it.

## API

```ts
import { exportLyricsheet } from "@barmark/lyricsheet";

const r = exportLyricsheet(chartText, { part: "Vocals", diagrams: "guitar" });
if (r.ok) save("song.cho", r.text);
else console.error(r.diagnostics);
```

```ts
function exportLyricsheet(chart: string, options?: LyricsheetOptions): LyricsheetResult;

type LyricsheetOptions = {
	/** Write this part's lines: the part's label, as `extractPart` takes it. */
	part?: string;
	/** The title, when the chart has none. */
	title?: string;
	/** Add guitar chord diagrams: a `{define}` for every chord the sheet writes. */
	diagrams?: "guitar";
};

type LyricsheetResult =
	| { ok: true; text: string; diagnostics: ChartDiagnostic[]; losses: LyricsheetLoss[] }
	| { ok: false; diagnostics: ChartDiagnostic[] };

type LyricsheetLoss = {
	code: LyricsheetLossCode; // the table below
	message: string;
	bar?: number; // the played bar's position, as `PlayedBar.index`
	written?: number; // that bar's written number (0 is the pickup)
};
```

`exportLyricsheet` never throws. A chart with an error, an unknown `part` or no bars returns `{ ok: false, diagnostics }` and no text; otherwise `text` is the sheet (one final newline, no tab, no trailing space), `diagnostics` the chart's warnings and `losses` what the sheet could not carry. With no `part`, the part written is the first declared one that writes a chord symbol, with the words the singer sings.

## An example

```
# Ferry Lights
composer: Our Band
key: G, time: 4/4, tempo: 96

## Verse
| G | Cm | G | D |
lyrics: | Down / by the | riv- er | wait- ing | / |

## Bridge
| Em | C | G D | G |
```

The sheet:

```
{title: Ferry Lights}
{composer: Our Band}
{key: G}
{time: 4/4}
{tempo: 96}

{start_of_verse: label="Verse"}
[G]Down by the [Cm]river [G]waiting [D]
{end_of_verse}

{start_of_grid: label="Bridge" shape="1+4x4+1"}
| Em . . . | C . . . | G . D . | G . . . |
{end_of_grid}
```

With `diagrams: "guitar"`, the same sheet has a block of defines between the header and the first section:

```
{title: Ferry Lights}
{composer: Our Band}
{key: G}
{time: 4/4}
{tempo: 96}

{define: G base-fret 1 frets 3 2 0 0 0 3}
{define: Cm base-fret 3 frets x 1 3 3 2 1}
{define: D base-fret 1 frets x x 0 2 3 2}
{define: Em base-fret 1 frets 0 2 2 0 0 0}
{define: C base-fret 1 frets x 3 2 0 1 0}

{start_of_verse: label="Verse"}
[G]Down by the [Cm]river [G]waiting [D]
{end_of_verse}

{start_of_grid: label="Bridge" shape="1+4x4+1"}
| Em . . . | C . . . | G . D . | G . . . |
{end_of_grid}
```

## Guitar diagrams

With `diagrams: "guitar"` the sheet defines every chord name its body writes (in lyric lines and in grid cells), once each, in the order the sheet first writes them, in a block after the header's directives and before the first section. A define is `{define: Am base-fret 1 frets x 0 2 2 1 0}`: frets from the lowest string, `x` a muted string, `0` an open one, every other fret counted from `base-fret`. A diagram is four frets tall, so a shape that reaches the fifth fret starts at its lowest fretted one (`Cm` is `base-fret 3 frets x 1 3 3 2 1`). Barres are not written.

- ChordPro keeps one shape per name. A voicing written after a chord (`Cmaj7{E3 G3 B3}`) is that name's shape when every use of the name in the sheet writes the same voicing and a hand can play it; otherwise the name's own shape is written, and the voicing is a `voicing` loss.
- A chord with no playable shape gets no define and one `no-shape` loss naming it. An altered chord (`C7alt`) is defined as a shell and one `shell-shape` loss says its altered tones are not in the shape.
- `N.C.`, `?`, stops, note sets and fermatas are annotations, not chords, and have no define.
- The chart's chord names are the ones defined, as the sheet writes them (`Am7b5` for `Am7(b5)`).

## What it writes

Each section that sings words is a ChordPro lyric environment (`{start_of_verse}`, `{start_of_chorus}` or `{start_of_bridge}`, by the heading's first word; the label is the heading as written), in the order the chart plays: a repeat whose passes sing verses 1 and 2 is written twice (a repeat singing the same words again stays in one environment, its lines written again), a `D.S.` is unfolded, and a replayed chorus that sings what the chorus before it sang is `{chorus}`. Each written bar line is one lyric line, each chord written before the syllable it lands on (`[C]riv`), and a chord that lands on no syllable standing alone in its place (`waiting [D] for`). `N.C.`, a stop, `?`, a note set, words on a bar, a rehearsal mark and a fermata are annotations (`[*N.C.]`), printed as text and never read as chords. Key, time and tempo changes are written where they happen, each with a comment a reader sees (`{comment: Key: D}`); a rit., an accel., a swing feel and text lines are comments. A sheet always has a title line: the chart's title, else `title`, else `{title: }`. A lyric sheet keeps the order of chords and words, not their timing: where in its bar a chord falls is not written.

Each section with no words is a ChordPro grid, the one ChordPro construct with bars: `{start_of_grid: label="Intro" shape="1+4x4+1"}`, one grid line per written bar line, a cell per beat of the bar's own meter (a 6/8 bar has two, its beat the dotted quarter), and a margin cell on each side. In a cell, `.` holds the chord before, `/` plays the same chord again, chords that share a beat are joined by `~` (`C~G`), and `%` repeats the bar before where the chart wrote `%` and that bar is the measure before it in the line, in the same meter. `N.C.`, `*Stop`, `*?` and a note set's notes (`*C,E,G`) are cells printed as text; a fermata is a measure of its own, `*…`; words on a bar are right-margin text (in double quotes when they read as a count, `"x3"`) and a rehearsal mark left-margin text (`@B`) at the start of a line of its own, unless its line has `x N` (then it is written at the line's start). A section played straight through keeps its repeat signs (`|:`, `:|`, voltas `|1` and `|2`, and `x3` in the right margin); one cut short by a jump or `->`, or repeated by its heading, is written bar by bar as played, and an open repeat is followed by `{comment: repeat ad lib.}` inside the grid. The grid's shape is its widest line's, so each section occurrence is one grid. No line ends in a backslash (ChordPro would join the next line to it): a final `\` is written `/`.

## What is not a loss

A lyric sheet keeps the order of chords and words, not their timing: a chord is written before the syllable it lands on, and where in its bar it falls, how long it lasts and the rhythm of the words are not written. A grid keeps a cell for each beat. That is the form of a lyric sheet, not a loss, and is not reported.

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
| `chord-names` | A chord name ChordPro's chord parser does not know (for example `F#m(b6)`), written as barmark spells it; readers may show it as text. With `diagrams: "guitar"` it is reported only when it has no shape: a name the sheet defines is drawn from its definition. |
| `note-sets` | A note set, written as its notes' names as text (joined by commas in a grid cell), not a chord; its octaves and root mark are lost. |
| `voicing` | A voicing's exact notes: only the chord's name is written. With `diagrams: "guitar"`, a voicing every use of its chord writes, and a hand can play, is the chord's diagram and not a loss; otherwise the diagram is the chord's own shape, since ChordPro keeps one shape per name. |
| `marks` | Pushes, accents, hits and pedal marks: the chord is written unmarked. |
| `bar-meter` | A one-bar meter: lyric lines do not show a bar's own meter. |
| `mark-moved` | A rehearsal mark inside a grid line with `x N`, written at the line's start: the count is the whole line's, so the line is not split at the mark. |
| `fermata` | A fermata, written as the annotation `*…` (ChordPro has none): a reader sees an ellipsis over the words, or in a grid's cell, not a fermata sign. |
| `no-shape` | With `diagrams: "guitar"`: a chord with no playable guitar shape (a note below the guitar, more tones than strings, a chord no shape in a hand's limits sounds), so no diagram is written for it. Listed by name, ten at most. |
| `shell-shape` | With `diagrams: "guitar"`: an altered chord (`7alt`) has only a shell for a shape, its root, third and flat seventh: its altered tones are not in the diagram. Listed by name. |


## Known gaps

ChordPro's own chord parser rejects some chord names barmark reads. The export writes such a chord in another spelling barmark reads as the same chord when the parser takes one (`C7(b9)` as `C7b9`, `C(9)` as `Cadd9`, an alteration after an extension without its parentheses) and otherwise as barmark spells it (`C(6)`, `F#m(b6)`, `Cb`): a gap. A reader may show a gap as text, and reports it as a `chord-names` loss. With `diagrams: "guitar"` each gap that has a shape is defined, and a defined name draws as a diagram, so it is no longer a loss.

## Known limits

- Two long chord names sharing one grid cell (`Cmaj7~Dm7b5`) overprint each other in ChordPro's own renderer, since every cell has the same width.
- Verses stacked on the same bars are written one pass per verse, each with its chords (the `stacked-verses` loss): ChordPro has no stacking.
- A section repeated by its heading's count is written pass by pass, not as a repeat.
- A sheet writes one part's chords; the others are left out (`other-parts`).

## How it is checked

- Golden files: every fixture chart under `tests/fixtures` has the sheet the export must write for it, byte for byte, with and without diagrams.
- A played yardstick: a test-only reader reads each sheet back into the chords and words in play order, and compares them with what the chart plays, so a sheet that lost a chord or a word fails.
- ChordPro's own tool, on the maintainer's machine only: every golden sheet is run through ChordPro's reference `chordpro` with `--strict` (`bun scripts/chordpro-check.ts`), and the warnings it may give are exactly those the chart's gaps and key predict.
- Scale tests (a 1,000-bar chart exports in time linear in its length, a 2,000-name define block is not quadratic) and a test that walks the whole corpus.

## License

MIT
