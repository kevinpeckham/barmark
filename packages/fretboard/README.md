# @barmark/fretboard

Guitar chord shapes for [barmark](https://barmark.dev) chords. Give it a
chord, or the notes of a voicing, and it answers with the frets to play in
standard tuning (E A D G B E).

It finds shapes. It draws nothing: a diagram, a tab or a ChordPro
`{define}` line is for whatever reads the shape. Standard guitar tuning is
the only tuning in 0.1.

```sh
npm install @barmark/fretboard
```

It needs `barmark`, which reads the chords.

## A named chord

```ts
import { parseChord } from "barmark";
import { shapeFor, shapeText } from "@barmark/fretboard";

const result = shapeFor(parseChord("F").value);
// { ok: true, shape: { frets: [1, 3, 3, 2, 1, 1], base: 1,
//                      barre: { fret: 1, from: 0, to: 5 } }, notes: null }
if (result.ok) shapeText(result.shape); // "133211"
```

`shapeFor(slot, voicing?)` takes a chord from barmark's `parseChord` (or a
parsed chart's slot: `slot.chord`, and `slot.voicing` when notes were
written after the name) and never throws. It answers with a `ShapeResult`:

```ts
type ShapeResult =
	| { ok: true; shape: Shape; notes: "shell" | "voicing-replaced" | null }
	| { ok: false; reason: "single-note" | "not-playable" };
```

- `notes: null`: the shape is the chord, or the notes you wrote.
- `notes: "shell"`: the chord is an altered one (`C7alt`), and the shape is
  its root, third and flat seventh only. The grammar leaves the altered
  fifth and ninth to the player, so the shape does not pick them:
  `shapeFor` gives `x323xx` for `C7alt`.
- `notes: "voicing-replaced"`: you wrote a voicing that no hand can play in
  standard tuning, so the shape is the chord's own. Below, `Cmaj7` written
  as `{E3 G3 B3 C4}` gets `x32000`.
- `reason: "single-note"`: one pitch (`{E}`, `{E1}`) is a note, not a
  chord shape.
- `reason: "not-playable"`: nothing fits: a note below the guitar, more
  than six notes, or a chord that no shape in the limits sounds.

From a chart:

```ts
import { parseChart } from "barmark";

const { bars } = parseChart("time: 4/4\n| C | Am7{G3 C4 E4} |\n");
for (const bar of bars)
	for (const slot of bar.slots)
		if (slot.kind === "chord") {
			const r = shapeFor(slot.chord, slot.voicing);
			console.log(r.ok ? shapeText(r.shape) : r.reason);
		}
// x32010
// xxx010
```

`?`, `N.C.`, `--` and `/` slots are not chords: skip them. A note set
that a chart writes alone is a slot's `chord` too, so `shapeFor` takes it
the same way. (A note set sung on a voice line is melody; leave it out.)

## Notes you wrote

A note set is exact: each note goes on its own string, in written order,
low to high, and a string between them may be muted. Octaves are sounding
pitch.

```ts
import { parseNoteSet } from "barmark";

shapeFor(parseNoteSet("{C3 G3 E4}").value);
// { ok: true, shape: { frets: [-1, 3, -1, 0, -1, 0], base: 1 }, notes: null }
// shapeText: "x3x0x0"
```

A voicing is a chord name with notes after it. If the notes fit, the shape
is the notes:

```ts
const dm7 = parseChord("Dm7").value;
shapeFor(dm7, parseNoteSet("{F3 C4 E4}").value);
// shape "xx3x10" (frets [-1, -1, 3, -1, 1, 0]), notes: null
```

If they do not fit, `notes` says so and the shape is the name's:

```ts
shapeFor(parseChord("Cmaj7").value, parseNoteSet("{E3 G3 B3 C4}").value);
// shape "x32000", notes: "voicing-replaced"
```

Notes written without octaves (`{C E F# B}`) are placed in written order
with the octaves free (`{C E G}` is `x320xx`). The grammar does not let a
set mix the two.

Octaves are sounding pitch (grammar 4.1). Guitar is written an octave
above where it sounds, so a guitar part written at guitar pitch comes out
an octave off: the low E string sounds E2, so a part that writes it as E3
needs `{E2}` here. A note below or above what six strings reach is
`not-playable`.

## Other shapes: `shapesFor`

```ts
import { shapesFor, shapeText } from "@barmark/fretboard";

shapesFor(parseChord("Am7").value).map(shapeText).slice(0, 3);
// ["x02010", "x0201x", "x02013"]
```

`shapesFor(slot)` is the ranked alternatives for a named chord: the
first is `shapeFor`'s, with no repeats. It is `[]` for a note set.

## Checking a shape: `soundsChord`

```ts
import { soundsChord } from "@barmark/fretboard";

const am = shapeFor(parseChord("Am").value);
if (am.ok) {
	soundsChord(am.shape, parseChord("Am").value); // true
	soundsChord(am.shape, parseChord("A").value); // false
}
```

`soundsChord(shape, chord, tuning?)` is true when the lowest note is the
chord's bass, every tone the chord needs sounds, and nothing outside the
chord does. `sounding(shape, tuning?)` lists the shape's MIDI notes, low
string first.

## The `Shape` type

```ts
type Shape = { frets: number[]; base: number; barre?: Barre };
type Barre = { fret: number; from: number; to: number };
```

- `frets` are absolute, low string first: `-1` is muted, `0` is open.
- `base` is the first fret a diagram draws: 1 when every fret is 5 or
  under, else the lowest fretted fret (`C#` is `x46664`, `base: 4`).
- `barre` is one finger across strings `from` to `to` (indexes, low
  string 0) at `fret`. `Bm` is `x24432`, with
  `barre: { fret: 2, from: 1, to: 5 }`.

`shapeText(shape)` writes frets as characters (`x32010`; spaces between
frets when one is 10 or more: `x 10 12 12 11 10`), `shapeOf(text)` reads
six characters back (it throws on anything else), `shapeFrom(frets)` makes
a shape from frets, and `GUITAR` is the tuning. Its `Tuning` type is
`{ name: "guitar"; strings: readonly number[] }`, MIDI notes low to high.

## The limits

A shape for a named chord stays inside what one hand plays:

- at most a 3-fret span between fretted notes;
- at most four fingers, and a barre counts as one finger only at the lowest
  fret. The ninth chord `x32333`, played with a third-finger barre, is
  not used; `C9` is `x3233x`;
- frets 0 to 15, and a moved shape never starts above the seventh fret;
- at least three strings sound (two for a power chord);
- no muted string inside the shape. `D/F#` is `200232`, not `2x0232`;
- the bass is the lowest sounding note, and a slash bass included. An open
  string can sound below a fretted lower string, so it is the pitch that
  counts, not the string.

A note set you wrote is not held to the last two: it may mute a string
inside, since you said which notes.

## What a chord leaves out

A diagram must not add a note the name does not have, and may drop one a
player drops too:

- the fifth, in a chord of four or more tones;
- the ninth and eleventh, under a thirteenth;
- an altered chord (`7alt`) is a shell: root, third and flat seventh.
  `notes: "shell"` says so;
- a power chord (`5`, `5(7)`) is two or three strings, root lowest.

Every other tone sounds, and nothing outside the chord does.

## Where the shapes come from

The shapes are our own. The table of open and movable shapes was written
from the instrument (the open strings, and each fret a semitone) and
checked by machine: every row must sound its name. A finder answers for
every chord the table does not hold, and it checks the same way. The code
and the table are MIT. Nothing was copied from a chord book, a chord
database or another library.

## Licence

MIT.
