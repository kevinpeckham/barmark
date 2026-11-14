# The flat sixth, `add` before any tone, and `Δ9`: design

Status: decided by Kevin, 2026-11-13 and 2026-11-14. A grammar change:
`docs/grammar-v0.1-draft.md` changes in the same commit as the parser.

## 1. Intent

A user wrote `F#m(♭6)`, `F#maddb6` and `F#maddb13`, and barmark refused all
three with no suggestion; only `F#m(b13)` read. The notes they meant are a
minor triad with a flat sixth: F♯ A C♯ D. Musicians write that chord with
a 6 at least as often as with a 13, and barmark already keeps `(6)` and
`(13)` (and `(2)`/`(9)`, `(4)`/`(11)`) as distinct written forms. Checking
a second chord from the same user (`F#m7b13`, `Dmaj9/F#`: both read)
turned up `DΔ9/F#`, refused though `Δ` and `Δ7` read.

Goal: these spellings read, print in one canonical form each, and anything
still refused says what to write instead. No chart that reads today
changes meaning.

## 2. Decisions

1. **`b6` is a tone a parenthesis can add** (Kevin, 2026-11-13). Its own
   canonical spelling: `F#m(b6)` is 1 ♭3 5 ♭6 and prints `F#m(b6)`; it is
   not rewritten to `(b13)`, and `(b13)` is not rewritten to it. It adds:
   the fifth stays (`(#5)` is the spelling that replaces the fifth).
2. **`add` before any tone a parenthesis can add** (Kevin, 2026-11-14),
   bare or inside the parentheses, alone or in a list: `addN` and
   `(addN)` are aliases of `(N)` for every tone in the list (`2 4 6 7 9
   11 13 b5 #5 b6 b9 #9 #11 b13`). This supersedes the 2026-11-02 decision
   that kept `add13` and `add#11` errors. So `F#maddb6` and `F#m(addb6)`
   are `F#m(b6)`; `F#maddb13` is `F#m(b13)`; `Cadd13` is `C(13)`;
   `Cadd#11` is `C(#11)`.
3. **`(b2)`, `(#2)` and `(#4)` stay refused, with a suggestion** (Kevin,
   2026-11-14): `(b9)`, `(#9)`, `(#11)`. Not tones: no user has asked, and
   the suggestion costs nothing.
4. **`Δ9` and `Δ13` are `maj9` and `maj13`** (Kevin, 2026-11-14), with
   whatever follows (`CΔ9(#11)`, `DΔ9/F#`). `Δ11` stays refused: `maj11`
   is not a barmark chord, so there is nothing for it to be an alias of.

## 3. What follows from the existing rules (design calls)

These are consequences, written down so the tests can hold them.

- **Replace or add.** The parentheses rule is unchanged: a tone with an
  accidental replaces the natural tone of the same number if the chord
  has one, otherwise it adds. `b6` has an accidental, so on a sixth chord
  it replaces the 6 (`C6(b6)` is C E G A♭, as `C9(b9)` is C E G B♭ D♭);
  on any other chord it adds. A 13 is another number and stays
  (`C13(b6)` keeps its A).
- **`b6` and `b13` are the same note.** Written together (`C(b6,b13)`)
  the second warns "already contains", as `C7(7)` does.
- **Order in the parentheses** is by number, flat before natural before
  sharp, as now: `C(b6,9)`, `C(#5,b6)`, `Cm7(b6,11)`.
- **Without parentheses, after an extension**, as `b13` is: `Cm7b6` is
  `Cm7(b6)`. After a bare quality it stays an error, as `Cmb13` is
  (`Cb6` is the C♭ sixth chord), now with the suggestion `Cm(b6)`.
- **Run together** (`D6(omit5addb6)`, `C(omit5add13)`): one list, with
  the stacked-spelling warning, as `D6(omit5add9)` is.
- **Naming a set of notes** (`nameNotes`: MIDI import, detections) does
  not change: where it wrote `(b13)` it still does. `b6` is a plain tone
  for naming, as `2`, `4` and `6` are beside `9`, `11` and `13`.
- **Harte.** `F#m(b6)` is `F#:min(b6)`. A Harte label with `b6`
  (`C:min(b6)`) now converts to `Cm(b6)`; before it could only become
  `Cm(b13)`. Labels with `b13` are unchanged. MusicXML import follows:
  a `<degree>` of 6 flattened is `(b6)`, of 13 flattened `(b13)`.
- **Suggestions.** A suggestion is offered only when it reads. In a list,
  every refused tone that has one is replaced (`C7(b2,#4)` suggests
  `C7(b9,#11)`). Also `(b7)` suggests `(7)` (tone `7` is the flat
  seventh), and an alteration straight after a quality with no extension
  (`Cmb6`, `Cmb13`, `Cmb9`) suggests the parenthesised form.

## 4. Not in this change

- `(b2)`, `(#2)`, `(#4)` as tones; `maj11` and `Δ11`.
- Minor-major and other delta spellings (`CmΔ`, `C-Δ`, `CMaj9`, `Cma9`,
  the triangle `△`): asked of Kevin on 2026-11-14, not decided. If
  decided before the release they join it as more alias rows.

## 5. Where it lands

- `packages/barmark`: the tone list, the aliases, the suggestions, the
  grammar draft (section 3's parentheses rule and alterations, Appendix
  A.1, A.5, A.6, the decisions log), CHANGELOG. A minor release.
- The packages that read chords generically (render's speech and
  typesetting, MusicXML export and import, the fretboard's shapes, MIDI)
  need no code; each gets a test that says so, and MusicXML's CHANGELOG
  says what import now reads.
- Releases: barmark minor, then the caret dependants' patches (fretboard,
  render, musicxml, sync, midi, score, listen), the CLI, songs, and the
  site's guide rows.

## 6. Testing

The table of spellings in the plan is the test: each input with its
canonical form, pitches, Harte label and warnings; each refused input
with its message and suggestion; the 2026-11-02 tests that held `add13`
and `add#11` refused are turned over on purpose. `nameNotes` over every
three- and four-note set is unchanged (the existing exhaustive tests),
and the Billboard round trip keeps its shares. The suffix table grows by
about a quarter: the exhaustive tests must stay inside their timeouts.
