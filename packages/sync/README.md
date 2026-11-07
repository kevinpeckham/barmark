# @barmark/sync

Sync a [barmark](https://barmark.dev) chord chart with a recording. This
first release holds the **timing map**: a small JSON format that says
when each played bar of a chart starts in a recording, a checker for it
and the two lookups a player needs.

```sh
npm install @barmark/sync
```

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
	/** In recording order. */
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

- Starts strictly increase; `end` is after the last start.
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
