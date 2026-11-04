# Pedal, voices, dotted figures and clefs — design

Status: approved (Kevin, 2026-11-04: "proceed with grammar enhancements
as proposed in 140"). A grammar change; the decisions are gathered at the
end. It builds on the part lines and instruments
design (#131, approved), whose `part:` line, lines and staves it uses,
and the two are planned and built together.

## Intent

Four gaps found while making MusicXML read like an engraver's chart
(#138), mostly for piano:

1. **Sustain pedal.** There is no way to write pedalling.
2. **Two rhythms on one staff.** A held note under moving notes in the
   same hand can't be written.
3. **Dotted figures.** A dotted eighth and a sixteenth is spelled by
   subdividing the beat, `{C4}_/_/_{D4}`.
4. **Clefs.** The MusicXML export picks a part's clef (by instrument, or
   by its bars); a chart can't say which it wants.

## Goals

- Each gap closed with the smallest syntax that reads naturally to a
  musician, or with none where the grammar already says it.
- Nothing that reads today changes meaning.

## Non-goals

- Other pedals (soft, sostenuto), half-pedalling, dynamics, 8va lines.
- Swing as written figures: `feel:` already says it (below).

## Anti-goals

- **Marks that look like chords.** Every new symbol must stay apart from
  chord names, `N.C.` and its accepted spellings.

## 1. Sustain pedal (proposed grammar 2.9)

A mark before a chord or a note set, as accents and pushes are (2.7, 2.8):

```
Pno.RH | +G{B3 D4 G4} / +C{C4 E4 G4} / | +D{D4 F#4 A4} / / / | *G{B3 D4 G4} |
Pno.LH | {G2}          / {C3}          / | {D3}          / / / | {G2}          |
```

| Mark | Meaning |
|---|---|
| `+X` | **pedal**: press the pedal at X, or change it (lift and press again) if it is down |
| `*X` | **release**: lift the pedal at X, which then plays without it |

- The pedal stays down across bar lines until a `*`, a `--`, a tacet
  bar, or the end of the chart, each of which lifts it.
- `+` and `*` go on a chord or a note set, before an accent or a push
  (`+>G`, `+<G`). On `/`, `N.C.`, `--` or `?` they are **errors**. A `*`
  with the pedal up is a **warning**.
- On a part with lines (#131) the marks belong to the part and are
  written on its first line; on another line they are **errors**.
- Neither character is used today: `*` and `+` start no chord name
  (`C+` is augmented, after the root, never before it).
- Renderer: a small "Ped." and "✱" under the slot. MusicXML:
  `<pedal type="start|change|stop"/>` under the part's lowest staff;
  playback holds notes while the pedal is down.

## 2. Two rhythms on one staff: no new syntax

The part lines design (#131) already covers it: a part's third and
fourth lines become second voices on its staves. A right hand that holds
D4 under a moving line is:

```
part: Pno = Piano, instrument: piano
Pno.RH  | {G4}_{A4}_{B4}_{C5} {B4} {A4} {G4} |
Pno.LH  | {G2}                / / /          |
Pno.RH2 | {D4}                / / /          |
```

The third line written (`Pno.RH2`) is the upper staff's second voice
(stems down); a fourth would be the lower staff's. Recommendation: no
new syntax; a guide example shows it.

## 3. Dotted figures (proposed grammar 2.2 addition)

A dot after a member of a **two-member group** dots it: it takes three
quarters of the slot, and its partner one quarter.

| Cell | Meaning (4/4) |
|---|---|
| `\| {C4}._{D4} {E4} {F4} {G4} \|` | a dotted eighth and a sixteenth on beat 1 |
| `\| C._D / / \|` | the same rhythm in chords |
| `\| {C4}_{D4}. / / / \|` | a sixteenth then a dotted eighth (a Scotch snap) |

- Read the member whole first: `N.C.` is no-chord, undotted; `N.C..` is
  a dotted no-chord. So `N.C._G` keeps its meaning, as does every chart
  today.
- A dot in a group of three or more, on a lone slot, or on both members
  is an **error** suggesting `/` holds.
- The canonical form keeps the dot; `{C4}_/_/_{D4}` stays as written
  (the two mean the same, so they print as written).
- **Swing needs nothing new:** `feel: swing 75%` (7.1) already plays
  every eighth pair as a dotted eighth and sixteenth, and a jazz chart
  writes straight eighths under a swing feel.

## 4. Clefs (proposed grammar 7.3 addition)

```
part: Bs = Bass, instrument: electric bass
part: Vox = Lead Vocal, clef: treble 8vb
part: Ld = Lead, clef: bass
```

- **`clef:` on the `part:` line**, after the name (and after
  `instrument:`), as `instrument:` is: `treble`, `bass`, `treble 8vb`
  or `alto`.
- It fixes a one-staff part's clef for the whole part: converters write
  no clef changes there. It overrides the instrument's clef and the
  choice by bars.
- On a two-staff instrument (a keyboard) it is an **error**: its staves
  are treble and bass.
- **No octave hint:** note sets carry their octaves (4.1), and an
  instrument's written octave comes from `instrument:`. A chart that
  wants a passage shown 8va is a renderer's concern, left for later.
- Renderer: unchanged (the bar grid has no staff).

## Machine output (A.7)

- A slot gains `pedal: "press" | "release"` when marked.
- A group member gains `dotted: true` (its length already reflects it).
- A part gains `clef` when written.

## Testing

Parser: each mark and its errors, pedal state across bars and lifts,
dotted groups (both directions, `N.C.` cases, the errors), `clef:` values
and the keyboard error; the canonical form round trips. Render: the
pedal marks. MusicXML: `<pedal>` start, change and stop on the lower
staff; dotted values; a fixed clef with no changes; playback unchanged
except where the pedal now sustains. Dorico: Kevin imports a pedalled
piano chart.

## Release

With #131: a grammar minor for `barmark`, minors for `@barmark/render`
and `@barmark/musicxml`, the CLI, the guide (2.2, 2.9, 7.3, 7.6) and
songs.

## Decisions (Kevin, 2026-11-04)

Kevin took every recommendation:

1. **Pedal marks `+X` and `*X`** on the slot.
2. **Two rhythms on one staff through #131's lines**, with no new syntax.
3. **A dot in a two-member group** (`C._D`, `C_D.`) for dotted figures.
4. **`clef:` on the `part:` line**, fixed for the part.
