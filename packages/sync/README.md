# @barmark/sync

Sync a [barmark](https://barmark.dev) chord chart with a recording. It
holds two things: a **builder** that turns a chord detector's output
(bar grid, chord runs, key, meter) into a chart, and the **timing map**,
a small JSON format that says when each played bar of a chart starts in a
recording, with a checker for it and the two lookups a player needs.

```sh
npm install @barmark/sync
```

It requires `barmark` 0.19.0 or later (its key and spelling exports).

```ts
import { barAt, checkTimingMap, secondsAtBar } from "@barmark/sync/timing";

const { map, diagnostics } = checkTimingMap(JSON.parse(json), { text: chartText });
if (map) {
	barAt(map, 12.4); // { entry: 5, bar: 6, fraction: 0.31 }
	secondsAtBar(map, 6); // where bar 6 first starts
}
```

`@barmark/sync/timing` is the same code as the package's main entry; it
is there so a reader that only follows a map imports nothing else.

## Build a chart

`chartFromDetections` turns a detector's bar grid and chord runs into a
chart and a timing map for it.

```ts
import { chartFromDetections } from "@barmark/sync";

const { chart, timing, diagnostics } = chartFromDetections({
	grid: { bars: [0, 2, 4, 6, 8] }, // bar starts in seconds, one more than bars
	meter: "4/4",
	chords: {
		runs: [
			{ start: 0, end: 4, label: "C:maj" },
			{ start: 4, end: 6, label: "G:maj" },
			{ start: 6, end: 8, label: "A:min" },
		],
	},
});
// chart: "time: 4/4, tempo: 120\n| C | / | G | Am |\n"
// timing: bar 1 at 0 s, bar 2 at 2 s ... ends at 8 s, source "detected"
```

Each slot takes the chord that covers most of it, `?` where under half is
covered; a slot that repeats the one before is `/`, and a repeated
multi-chord bar is `%` (`simile: false` writes it out; a bar with a `?`
is always written out). `barsPerLine`
sets bars per line (default 4). Problems come back in `diagnostics`; an
unusable grid gives an empty chart and a `null` timing map.

Beyond the grid and the chords, the input can carry a `title`, `sections`
(`{ name, start }`, each snapped to the nearest bar and written out in
full), `changes` (`key`, `meter` and `tempo` mid-chart, written as
directive lines before their bar), a `tempo` (beats per minute in grammar 2.1's
beat: the bottom number in simple meters, the dotted quarter in compound
ones, so 6/8 at 120 eighths a minute is `tempo: 40`; a tempo `change` counts
the same beat; omitted, it is taken from the grid, and `null` writes none; one far from
the grid's warns with `tempo-grid-disagree`) and a `pickup: { start }`
for the bar before bar 1. The timing map counts a pickup as bar 1.

A few things the builder settles for you:

- A derived tempo is the median beat of the grid, rounded. Before the
  median, a bar under 0.6 times the plain median counts as half a bar and
  one over 1.6 times as two, so a grid that marks half-length bars still
  gives the song's tempo.
- A run that crosses a key change is cut at the change's bar, after
  overlapping runs are settled, and each piece is spelled in the key in
  force where it starts. A chord held across the change is written again
  after the `key:` line.
- A section name is checked against the parser so it reads back as one
  plain section: repeat and elision marks are removed (`section-marks-stripped`).
- Chords outside the grid are dropped (`outside-bars`, which ignores unknown time); the builder never
  guesses at bars the grid doesn't have.

### Limits

A label or symbol over 64 characters, or a note set of more than 16
notes, is not read: it is written `?` with `label-unknown`. Section names
are cut to 200 characters, and a build parses section names at most
2,000 times (names of plain letters need none); past that, a name that
would need a parse is dropped whole with `section-unnamed`, never renamed. They keep the work and the chart
linear in the input.

### Diagnostics

Every problem is a `BuildDiagnostic` `{ severity, code, message, path?,
at?, bar? }`; the builder never throws. Only an unusable grid is an
error, and it gives an empty chart.

| Code | Severity | Meaning |
| --- | --- | --- |
| `grid-unusable` | error | Fewer than two usable bar starts; no chart. |
| `grid-unsorted` | warning | Bar starts were unsorted, duplicated or not numbers; mended. |
| `meter-assumed` | info | No meter given; 4/4 assumed. |
| `meter-unreadable` | warning | The meter isn't understood; 4/4 assumed. |
| `key-unreadable` | warning | The key isn't understood; none written. |
| `key-respelled` | info | The key is written under an enharmonic name the chart can spell. |
| `tempo-unreadable` | warning | The tempo isn't 1 to 999; none written. |
| `tempo-grid-disagree` | warning | The given tempo is over 15% from the grid's; written as given. |
| `run-invalid` | warning | A chord run, or `frameSec`, is unusable; dropped. |
| `run-overlap` | warning | Runs overlap; the later onset wins. |
| `label-unknown` | warning | A label or symbol isn't understood; written as `?`. |
| `no-chord-detected` | warning | Nothing covers a slot; written as `?`. |
| `outside-bars` | warning | Chords (not `N.C.` or `?` time) before the first bar or after the last were dropped. |
| `pickup-ignored` | info | The pickup isn't one to a few beats before bar 1; ignored. |
| `section-unnamed` | warning | A section has no name or no usable start; dropped. |
| `section-marks-stripped` | warning | A section name was changed so it reads as a plain heading. |
| `section-collision` | warning | Two sections land on one bar; the later one is kept. |
| `after-last-bar` | warning | A section or change starts at the grid's end; dropped. |
| `change-collision` | warning | Two changes of one kind land on one bar; the later one is kept. |
| `change-unreadable` | warning | A change isn't understood; dropped. |

### What it doesn't do

It does not detect anything: audio, beats, bar lines and chords come from
your detector. It does not guess at sections, repeats or a key it wasn't
given. It does not time beats inside a bar, so the timing map has bar
starts only. Tempo changes are written as the
input gives them, not found. The output is a first draft for a person to
correct, and the confidence record says where to look first.

## The confidence record (experimental)

`chartFromDetections` also returns `confidence`, a `ConfidenceRecord`
(`null` exactly when the chart is empty). It has one entry per played bar,
keyed by the bar's `PlayedBar.index` like the timing map, whose `slots`
line up with that bar's slots. A slot's value is agreement times detector
confidence: the share of the slot's time covered by runs of the symbol
written (a hold counts as the chord it holds), times those runs' mean
`confidence` (1 where not given); a `?` slot is 0. A bar's value is the
mean of its slots. `key`, `meter`, `tempo` and `sections` carry the
confidence of their `{ value, confidence }` wrappers, and are left out
for bare values. The shape is experimental and may change.

## The timing map

```ts
type Seconds = number;

type TimingMap = {
	format: "barmark-timing";
	version: 1;
	/** The chart it was made for: its played-bar count, its hash, and a reference the host may set. */
	chart: { bars: number; hash: string; ref?: string };
	recording?: { id?: string; duration?: Seconds };
	/** How it was made: "detected", "aligned", "tapped", "tempo", or the host's word. */
	source?: string;
	/** In recording order; never empty. */
	bars: TimedBar[];
	/** Where the last entry ends. */
	end: Seconds;
};

type TimedBar = {
	/** `PlayedBar.index` of the chart. */
	bar: number;
	start: Seconds;
	/** Where the bar stops sounding, when a pause or fermata follows it. */
	end?: Seconds;
	/** Onsets of the bar's grammar 2.1 beats after `start`, when known. */
	beats?: Seconds[];
};
```

`chart.hash` is FNV-1a 64 over the UTF-8 bytes of the chart's
`printChart` output, as 16 lowercase hex digits. `chart.ref` is opaque
to barmark: a host's revision id, since a hash can't be looked up.

The rules, which `checkTimingMap` enforces:

- `bars` names at least one bar. Starts strictly increase; `end` is after the last start.
- An entry runs from its `start` to its own `end` when given, else to the
  next entry's start (or the map's `end`). An entry's `end` is after its
  start and no later than the next start; the gap between is a pause, and
  no bar sounds in it.
- `bar` is 1 to `chart.bars`. Entries need not run 1, 2, 3: a bar may
  recur (an open repeat, `x ...`, plays once in `ChartParse.bars` but many
  times in a recording, so its passes map back to the same indices), and
  bars may be missing (a recording that cuts a section). A map made from
  a chart alone runs 1 to N.
- With a pickup, the pickup is played bar 1, so grid bar k is map bar k+1.
- `beats`, when present, are the onsets after `start`: they increase, are
  after `start` and before the entry ends, and, checked against a chart,
  number `beatsOf` the bar's meter minus one (a 4/4 bar has three; a 6/8
  bar, counted in dotted quarters, has one). No float equality is needed
  anywhere.
- Unknown fields are kept and ignored by v1 readers.

### Versioning

Adding an optional field keeps the version. Anything a v1 reader would
misread bumps it. Readers reject a version they don't know:
`checkTimingMap` gives an error naming it. The map is a format of this
package for now; a reviewed spec and a JSON Schema are planned once a
second reader (the renderer's playback cursor) uses it.

## API (`@barmark/sync/timing`)

- `checkTimingMap(value, chart?)` returns `{ map, diagnostics }`. It never
  throws, and collects every problem, each with a `path` such as
  `bars[2].beats`. `map` is `value` itself, typed, whenever there is no
  error (warnings don't null it), else `null`. With `chart: { text, parse? }`
  it also checks the hash (`code: "chart-hash-mismatch"`: re-align or drop
  the map), that `chart.bars` is the chart's played-bar count, the beat
  counts, and, as a warning, any played bar the map never names.
- `chartHash(text, parse?)` is the hash a map records, over the chart's
  canonical print (pass `parse` if you already have `parseChart(text)`).
- `barAt(map, t)` returns the entry sounding at `t`:
  `{ entry, bar, fraction, paused? }`, where `entry` is the index into
  `map.bars` and `fraction` runs 0 to 1. A time equal to an entry's start
  belongs to that entry. In a pause after an entry's `end` it is that
  entry with fraction 1 and `paused: true`. It is `null` before the first
  start, at or after `map.end`, and for a time that isn't finite.
- `secondsAtBar(map, bar, pass = 1)` is where the `pass`th playing (from 1)
  of a played bar starts, or `null`.
- The types `TimingMap`, `TimedBar`, `TimingDiagnostic` and `Seconds`.

MIT licensed.
