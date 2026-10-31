import { readDocument } from "./document.js";
import { expand, flattenBars } from "./expand.js";
import type { ChartParse } from "./types.js";

export { parseBarLine } from "./barLine.js";
export { beatsOf, DIRECTIVE_NAMES, parseDirectiveLine, parseMeter } from "./directives.js";
export { readDocument } from "./document.js";
export { expand, flattenBars, MAX_EXPANDED_BARS } from "./expand.js";
export { printCell, printChart, printLine, printSlot, reduceSlots } from "./print.js";
export type * from "./types.js";

/** Read a whole barmark chart: the document as written and the bars in play order. Never throws. */
export function parseChart(text: string): ChartParse {
	const doc = readDocument(text);
	const played = expand(doc.lines);
	const rank = { error: 0, warning: 1 };
	const diagnostics = [...doc.diagnostics, ...played.diagnostics].sort(
		(a, b) => a.line - b.line || rank[a.severity] - rank[b.severity],
	);
	return {
		title: doc.title,
		lines: doc.lines,
		events: played.events,
		bars: flattenBars(played.events),
		sections: played.sections,
		diagnostics,
	};
}
