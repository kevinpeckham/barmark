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
