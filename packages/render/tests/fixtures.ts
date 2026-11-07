import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The invented song from the design mockups: every feature, in four sections. */
export const EXAMPLE = `# Example Song
key: D, time: 4/4, tempo: 145, feel: swing

## Intro
| D | % | G | A | x2

## Verse
| D | A | Bm | G |
Morning comes in slow, the kettle's on
| Em | % | A | [2/4] A7 |
Every road I know leads back to you

## Chorus
| G / D / | A | Bm / / A | G |
### Watch Kevin for the cutoff
| Em7 | A7sus4 / A7 / | D_E_F#m / G/B / | D |

## Verse
## Chorus

key: E, tempo: 120
## Outro
| E | % | A | B | x ...
| E | ... |
`;

export const PEACEFUL_DREAMS = readFileSync(
	join(import.meta.dir, "../../../examples/peaceful-dreams.chart.md"),
	"utf8",
);

/** The spec's lead sheet (section 1): chords on the bare line, the melody on `Vox.Mel`, a second verse under it. */
export const AMAZING_GRACE = `# Amazing Grace
part: Vox = Voice, instrument: voice
key: G, time: 3/4

## Verse
Vox       | [1/4] N.C.    | G                           | G          / G7       | C            / /      | G              |
Vox.Mel   | [1/4] {D4}:A- | {G4}:maz- / {B4}:ing_{G4}:/ | {B4}:grace / {A4}:how | {G4}:sweet / {E4}:the | {D4}:sound / / |
lyrics 2: | 'Twas         | grace / that                | taught / my           | heart / to            | fear / /       |
`;
