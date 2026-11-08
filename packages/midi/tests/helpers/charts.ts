import { AT_A_GLANCE } from "../../../barmark/tests/chart/fixtures.js";
import { corpus, examples } from "../../../musicxml/tests/charts.js";
import { jumpChart } from "../../../musicxml/tests/import/jump-charts.js";

/** Every chart the export is checked on: the grammar's example, the examples, the corpus and the jump charts. */
export const CHARTS: [string, string][] = [
	["at a glance", AT_A_GLANCE],
	...examples,
	...corpus(),
	...Array.from({ length: 300 }, (_, i) => i + 1).flatMap((seed): [string, string][] => {
		const text = jumpChart(seed);
		return text === null ? [] : [[`jump chart ${seed}`, text]];
	}),
];

/**
 * Charts in the form sync's builder writes (sync spec 6.3–6.5), each
 * `printChart`-canonical: four bars a line, a heading or directive line
 * starting a line, a pickup as an extra first cell, the first slot after a
 * heading named, `time:` and `tempo:` always written. The import gives
 * each back exactly.
 */
export const GENERATOR_FORM: [string, string][] = [
	[
		"sections",
		"key: D, time: 4/4, tempo: 120\n\n## Verse\n| D | / | G A | Bm |\n\n## Chorus\n| G | A | D | / |\n",
	],
	["a pickup in 3/4", "key: G, time: 3/4, tempo: 90\n| [1/4] D | G | C | D | G |\n| C | D | G |\n"],
	[
		"6/8 and a key change",
		"key: C, time: 6/8, tempo: 60\n| C | F | G | C |\nkey: A\n| A | D | E | A |\n",
	],
	["simile", "time: 4/4, tempo: 120\n| C G | % |\n"],
	["a time change", "time: 4/4, tempo: 120\n| C | F | G | C |\ntime: 3/4\n| F | G | C |\n"],
];
