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
